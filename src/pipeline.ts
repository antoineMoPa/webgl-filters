import type { Filter, ImageData } from "./types.js";
import { applyFilters, GLRenderer, getSourceDimensions } from "./renderer.js";

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
   * Apply filters to an image and return the result as ImageData.
   */
  apply(source: ImageData): ImageData;
  /**
   * Apply filters to a video element and return a canvas that updates each frame.
   * Call `.stop()` to pause the animation loop, `.dispose()` to clean up.
   */
  apply(source: HTMLVideoElement): HTMLCanvasElement;
  apply(source: ImageData | HTMLVideoElement): ImageData | HTMLCanvasElement {
    if (this.disposed) throw new Error("CompiledFilter has been disposed");

    // Video path
    if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
      return this.applyVideo(source);
    }

    // Image path
    return this.applyImage(source as ImageData);
  }

  private applyImage(source: ImageData): ImageData {
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

  /** Run all filters as GPU passes and return the result. */
  apply(input: ImageData): ImageData {
    const gl = this.gl ?? createOffscreenGL();
    return applyFilters(gl, input, this.filters);
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
