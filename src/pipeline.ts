import type { Filter, ImageData, ImageSource, TextureUniformValue } from "./types.js";
import { applyFilters, GLRenderer, getSourceDimensions } from "./renderer.js";
import { generateDebugHTML, imageSourceToDataURI } from "./debug.js";

/**
 * Compiled filter chain. Caches shader programs for efficient reuse
 * across multiple frames or images.
 *
 * Created by calling `.compile()` on a `GLFilters` instance.
 */
export class CompiledFilter {
  private filters: Filter[];
  private defaultGl: WebGLRenderingContext | null;
  private renderer: GLRenderer | null = null;
  private videoEntries: Map<
    HTMLVideoElement,
    { renderer: GLRenderer; canvas: HTMLCanvasElement; rafId: number }
  > = new Map();
  private disposed = false;

  /** @internal */
  constructor(filters: Filter[], gl: WebGLRenderingContext | null) {
    this.filters = filters;
    this.defaultGl = gl;
  }

  /**
   * Apply filters to an image source and return the result as ImageData.
   * Accepts `ImageData`, `HTMLImageElement`, `HTMLCanvasElement`, or `ImageBitmap`.
   */
  apply(source: ImageSource): ImageData;
  /**
   * Apply filters to a video element and return a canvas that updates each frame.
   * Call `.stop()` to pause the animation loop, `.dispose()` to clean up.
   */
  apply(source: HTMLVideoElement): HTMLCanvasElement;
  apply(source: ImageSource | HTMLVideoElement): ImageData | HTMLCanvasElement {
    if (this.disposed) throw new Error("CompiledFilter has been disposed");

    // Video path
    if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
      return this.applyVideo(source);
    }

    // Image path
    return this.applyImage(source as ImageSource);
  }

  /**
   * Load an image from a URL and apply filters.
   * Returns a Promise that resolves to the filtered `ImageData`.
   */
  async applyAsync(source: string | ImageSource): Promise<ImageData> {
    if (this.disposed) throw new Error("CompiledFilter has been disposed");
    const img = typeof source === "string" ? await loadImage(source) : source;
    const filters = await resolveFilterTextures(this.filters);
    return this.applyImage(img, filters);
  }

  /** Apply filters and draw the result into an existing canvas. */
  applyToCanvas(source: ImageSource, targetCanvas: HTMLCanvasElement): HTMLCanvasElement {
    drawImageDataToCanvas(this.applyImage(source), targetCanvas);
    return targetCanvas;
  }

  /** Load URL inputs if needed, apply filters, and draw into an existing canvas. */
  async applyToCanvasAsync(source: string | ImageSource, targetCanvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
    drawImageDataToCanvas(await this.applyAsync(source), targetCanvas);
    return targetCanvas;
  }

  private applyImage(source: ImageSource, filters: Filter[] = this.filters): ImageData {
    if (filters !== this.filters) {
      const gl = this.defaultGl ?? createOffscreenGL();
      const renderer = new GLRenderer(gl, filters);
      try {
        renderer.render(source, false);
        return renderer.readPixels();
      } finally {
        renderer.dispose();
      }
    }

    if (!this.renderer) {
      const gl = this.defaultGl ?? createOffscreenGL();
      this.renderer = new GLRenderer(gl, this.filters);
    }
    this.renderer.render(source, false);
    return this.renderer.readPixels();
  }

  private applyVideo(video: HTMLVideoElement): HTMLCanvasElement {
    // Reuse existing entry if same video
    const existing = this.videoEntries.get(video);
    if (existing) return existing.canvas;

    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: false });
    if (!gl) throw new Error("Failed to create WebGL context for video");

    const renderer = new GLRenderer(gl, this.filters);

    const loop = () => {
      if (!video.paused && !video.ended && video.readyState >= 2) {
        const [w, h] = getSourceDimensions(video);
        if (w > 0 && h > 0) {
          renderer.render(video, true);
        }
      }
      const rafId = requestAnimationFrame(loop);
      entry.rafId = rafId;
    };

    const entry = { renderer, canvas, rafId: 0 };
    this.videoEntries.set(video, entry);
    entry.rafId = requestAnimationFrame(loop);

    return canvas;
  }

  /** Stop all video animation loops. Keeps compiled state for reuse. */
  stop(): void {
    for (const entry of this.videoEntries.values()) {
      cancelAnimationFrame(entry.rafId);
    }
  }

  /** Stop all loops and release all GPU resources. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.renderer?.dispose();
    this.renderer = null;
    for (const entry of this.videoEntries.values()) {
      entry.renderer.dispose();
    }
    this.videoEntries.clear();
  }
}

/**
 * Chainable filter chain. Collects filters, then applies them
 * as sequential GPU shader passes.
 *
 * @example
 * ```ts
 * const result = glFilters(gl)
 *   .addFilter(brightness({ amount: 20 }))
 *   .addFilter(saturate({ factor: 1.5 }))
 *   .addFilter(blur())
 *   .apply(sourceImage);
 * ```
 */
export class GLFilters {
  private filters: Filter[] = [];
  private gl: WebGLRenderingContext | null;

  constructor(gl?: WebGLRenderingContext | null) {
    this.gl = gl ?? null;
  }

  /** Append a filter to the chain. Returns `this` for chaining. */
  addFilter(filter: Filter): this {
    this.filters.push(filter);
    return this;
  }

  /** Returns a copy of the current filter list. */
  getFilters(): Filter[] {
    return [...this.filters];
  }

  /**
   * Run all filters as GPU passes and return the result.
   * Accepts `ImageData`, `HTMLImageElement`, `HTMLCanvasElement`, or `ImageBitmap`.
   */
  apply(input: ImageSource): ImageData {
    const gl = this.gl ?? createOffscreenGL();
    return applyFilters(gl, input, this.filters);
  }

  /**
   * Load an image from a URL and apply filters.
   * Returns a Promise that resolves to the filtered `ImageData`.
   */
  async applyAsync(source: string | ImageSource): Promise<ImageData> {
    const img = typeof source === "string" ? await loadImage(source) : source;
    const filters = await resolveFilterTextures(this.filters);
    const gl = this.gl ?? createOffscreenGL();
    return applyFilters(gl, img, filters);
  }

  /** Apply filters and draw the result into an existing canvas. */
  applyToCanvas(input: ImageSource, targetCanvas: HTMLCanvasElement): HTMLCanvasElement {
    drawImageDataToCanvas(this.apply(input), targetCanvas);
    return targetCanvas;
  }

  /** Load URL inputs if needed, apply filters, and draw the result into an existing canvas. */
  async applyToCanvasAsync(input: string | ImageSource, targetCanvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
    drawImageDataToCanvas(await this.applyAsync(input), targetCanvas);
    return targetCanvas;
  }

  /**
   * Generate a self-contained debug HTML page that visualizes each filter step.
   * Logs a data URI to the console that can be opened in a browser.
   */
  debug(input: ImageSource): void {
    const dataURI = imageSourceToDataURI(input);
    const html = generateDebugHTML(this.filters, dataURI);
    const bytes = new TextEncoder().encode(html);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    console.log(`data:text/html;base64,${base64}`);
  }

  /**
   * Compile the filter chain for efficient reuse.
   * Returns a `CompiledFilter` that caches shader programs.
   *
   * @example
   * ```ts
   * const filter = glFilters()
   *   .addFilter(brightness({ amount: 0.1 }))
   *   .compile();
   *
   * // Reuse for multiple images
   * const r1 = filter.apply(image1);
   * const r2 = filter.apply(image2);
   *
   * // Or apply to a video element
   * const canvas = filter.apply(videoElement);
   * document.body.appendChild(canvas);
   *
   * filter.dispose();
   * ```
   */
  compile(): CompiledFilter {
    return new CompiledFilter([...this.filters], this.gl);
  }
}

/** Create a hidden offscreen WebGL context. */
function createOffscreenGL(): WebGLRenderingContext {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("Failed to create WebGL context");
  return gl;
}

/** Create a new filter chain, optionally bound to a WebGL context. */
export function glFilters(gl?: WebGLRenderingContext | null): GLFilters {
  return new GLFilters(gl);
}

/**
 * Load an image from a URL or data URI.
 * Returns a Promise that resolves to the loaded `HTMLImageElement`.
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

async function resolveFilterTextures(filters: Filter[]): Promise<Filter[]> {
  let changed = false;
  const resolved = await Promise.all(filters.map(async filter => {
    if (!filter.textures) return filter;

    const entries = await Promise.all(Object.entries(filter.textures).map(async ([name, value]) => {
      if (typeof value !== "string") return [name, value] as const;
      changed = true;
      return [name, await loadImage(value)] as const;
    }));

    if (!changed) return filter;
    return {
      ...filter,
      textures: Object.fromEntries(entries) as Record<string, TextureUniformValue>,
    };
  }));

  return changed ? resolved : filters;
}

function drawImageDataToCanvas(image: ImageData, targetCanvas: HTMLCanvasElement): void {
  targetCanvas.width = image.width;
  targetCanvas.height = image.height;

  const ctx = targetCanvas.getContext("2d");
  if (!ctx) throw new Error("Failed to create 2d context");

  const browserImageData = typeof globalThis.ImageData === "function"
    ? new globalThis.ImageData(new Uint8ClampedArray(image.data), image.width, image.height)
    : ctx.createImageData(image.width, image.height);

  if (!("data" in browserImageData)) {
    throw new Error("Failed to create ImageData for canvas output");
  }

  if (browserImageData.data !== image.data) {
    browserImageData.data.set(image.data);
  }
  ctx.putImageData(browserImageData, 0, 0);
}
