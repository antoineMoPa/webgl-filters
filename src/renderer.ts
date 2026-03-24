import type { Filter, ImageData, TextureSource } from "./types.js";

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_HEADER = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_texelSize;
varying vec2 v_texCoord;
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, fragmentSource: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_HEADER + fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

function createTexture(gl: WebGLRenderingContext, width: number, height: number, data?: Uint8ClampedArray): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("Failed to create texture");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data ?? null);
  return tex;
}

interface FramebufferTarget {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
}

function createFramebufferTarget(gl: WebGLRenderingContext, width: number, height: number): FramebufferTarget {
  const texture = createTexture(gl, width, height);
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error("Failed to create framebuffer");
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { framebuffer, texture };
}

/**
 * Applies a list of filters to an image using WebGL.
 * Each filter is a GPU shader pass.
 *
 * Accepts any `TextureSource`: `ImageData`, `HTMLImageElement`,
 * `HTMLCanvasElement`, `ImageBitmap`, or `HTMLVideoElement`.
 */
export function applyFilters(
  gl: WebGLRenderingContext,
  input: TextureSource,
  filters: Filter[],
): ImageData {
  const [width, height] = getSourceDimensions(input);

  // Fullscreen quad (two triangles)
  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

  // Upload source image as texture
  const sourceTexture = createTexture(gl, width, height);
  uploadSource(gl, sourceTexture, input);

  // Ping-pong framebuffers
  const targets = [
    createFramebufferTarget(gl, width, height),
    createFramebufferTarget(gl, width, height),
  ];

  gl.viewport(0, 0, width, height);

  let readIndex = -1; // -1 means source texture

  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i];
    const writeIndex = i % 2;
    const inputTexture = readIndex === -1 ? sourceTexture : targets[readIndex].texture;

    const program = createProgram(gl, filter.fragmentSource);
    gl.useProgram(program);

    // Bind quad
    const aPosition = gl.getAttribLocation(program, "a_position");
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    // Bind input texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTexture);
    gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);

    // Built-in uniforms
    gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), width, height);
    gl.uniform2f(gl.getUniformLocation(program, "u_texelSize"), 1 / width, 1 / height);

    // Filter-specific uniforms
    for (const [name, value] of Object.entries(filter.uniforms)) {
      const loc = gl.getUniformLocation(program, name);
      if (loc === null) continue;
      if (typeof value === "number") {
        gl.uniform1f(loc, value);
      } else if (Array.isArray(value)) {
        gl.uniform1fv(loc, new Float32Array(value));
      }
    }

    // Render to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[writeIndex].framebuffer);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.deleteProgram(program);
    readIndex = writeIndex;
  }

  // Read result — use Uint8Array for readPixels (headless-gl compat), then copy
  const rawOutput = new Uint8Array(width * height * 4);

  if (filters.length === 0) {
    // No filters — just read back the source
    const passthrough = createProgram(gl, `
      void main() {
        gl_FragColor = texture2D(u_texture, v_texCoord);
      }
    `);
    gl.useProgram(passthrough);
    const aPosition = gl.getAttribLocation(passthrough, "a_position");
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(gl.getUniformLocation(passthrough, "u_texture"), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[0].framebuffer);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.deleteProgram(passthrough);
    readIndex = 0;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, targets[readIndex].framebuffer);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rawOutput);

  // Cleanup
  gl.deleteTexture(sourceTexture);
  gl.deleteTexture(targets[0].texture);
  gl.deleteTexture(targets[1].texture);
  gl.deleteFramebuffer(targets[0].framebuffer);
  gl.deleteFramebuffer(targets[1].framebuffer);
  gl.deleteBuffer(quadBuffer);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { data: new Uint8ClampedArray(rawOutput.buffer), width, height };
}

// ─── Helpers for GLRenderer ──────────────────────────────────────────────

function isImageData(source: TextureSource): source is ImageData {
  return "data" in source && "width" in source && source.data instanceof Uint8ClampedArray;
}

/** Get pixel dimensions from any texture source. */
export function getSourceDimensions(source: TextureSource): [number, number] {
  if ("videoWidth" in source && typeof source.videoWidth === "number") {
    return [source.videoWidth, source.videoHeight];
  }
  return [source.width, source.height];
}

function uploadSource(gl: WebGLRenderingContext, tex: WebGLTexture, source: TextureSource): void {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (isImageData(source)) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, source.width, source.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source.data);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
  }
}

const PASSTHROUGH_FRAGMENT = `
void main() {
  gl_FragColor = texture2D(u_texture, v_texCoord);
}
`;

const FLIP_Y_FRAGMENT = `
void main() {
  gl_FragColor = texture2D(u_texture, vec2(v_texCoord.x, 1.0 - v_texCoord.y));
}
`;

/**
 * Compiled renderer that caches shader programs for reuse across frames.
 *
 * Use this when you need to apply the same filter chain repeatedly —
 * for video processing or batch image operations.
 */
export class GLRenderer {
  private gl: WebGLRenderingContext;
  private filters: Filter[];
  private programs: WebGLProgram[];
  private flipProgram: WebGLProgram;
  private quadBuffer: WebGLBuffer;
  private sourceTexture: WebGLTexture;
  private targets: [FramebufferTarget, FramebufferTarget] | null = null;
  private currentWidth = 0;
  private currentHeight = 0;
  private disposed = false;

  constructor(gl: WebGLRenderingContext, filters: Filter[]) {
    this.gl = gl;
    this.filters = filters;

    // Compile all programs up front
    this.programs = filters.length > 0
      ? filters.map(f => createProgram(gl, f.fragmentSource))
      : [createProgram(gl, PASSTHROUGH_FRAGMENT)];

    // Compiled flip-Y blit for rendering to canvas
    this.flipProgram = createProgram(gl, FLIP_Y_FRAGMENT);

    // Fullscreen quad
    const buf = gl.createBuffer();
    if (!buf) throw new Error("Failed to create buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    this.quadBuffer = buf;

    // Source texture (placeholder — will be uploaded on render)
    const tex = gl.createTexture();
    if (!tex) throw new Error("Failed to create texture");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.sourceTexture = tex;
  }

  private ensureTargets(width: number, height: number): void {
    if (this.targets && this.currentWidth === width && this.currentHeight === height) return;

    // Clean up old targets
    if (this.targets) {
      const gl = this.gl;
      gl.deleteTexture(this.targets[0].texture);
      gl.deleteTexture(this.targets[1].texture);
      gl.deleteFramebuffer(this.targets[0].framebuffer);
      gl.deleteFramebuffer(this.targets[1].framebuffer);
    }

    this.targets = [
      createFramebufferTarget(this.gl, width, height),
      createFramebufferTarget(this.gl, width, height),
    ];
    this.currentWidth = width;
    this.currentHeight = height;
  }

  /**
   * Render the filter chain.
   * @param source - Input texture source (ImageData, HTMLVideoElement, etc.)
   * @param toCanvas - If true, final pass renders to the default framebuffer (canvas).
   *                   If false, final pass renders to a ping-pong framebuffer (for readPixels).
   */
  render(source: TextureSource, toCanvas: boolean): void {
    if (this.disposed) throw new Error("GLRenderer has been disposed");
    const gl = this.gl;
    const [width, height] = getSourceDimensions(source);
    this.ensureTargets(width, height);

    // Upload source
    uploadSource(gl, this.sourceTexture, source);

    // Resize canvas if rendering to it
    if (toCanvas && gl.canvas) {
      gl.canvas.width = width;
      gl.canvas.height = height;
    }

    gl.viewport(0, 0, width, height);

    const programs = this.programs;
    const filters = this.filters;
    const targets = this.targets!;
    const hasFilters = filters.length > 0;
    const passCount = hasFilters ? filters.length : 1;

    let readIndex = -1; // -1 = source texture

    for (let i = 0; i < passCount; i++) {
      const program = programs[i];
      const writeIndex = i % 2;
      const inputTexture = readIndex === -1 ? this.sourceTexture : targets[readIndex].texture;

      gl.useProgram(program);

      // Bind quad
      const aPosition = gl.getAttribLocation(program, "a_position");
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

      // Bind input texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTexture);
      gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);

      // Built-in uniforms
      gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), width, height);
      gl.uniform2f(gl.getUniformLocation(program, "u_texelSize"), 1 / width, 1 / height);

      // Filter-specific uniforms
      if (hasFilters) {
        for (const [name, value] of Object.entries(filters[i].uniforms)) {
          const loc = gl.getUniformLocation(program, name);
          if (loc === null) continue;
          if (typeof value === "number") {
            gl.uniform1f(loc, value);
          } else if (Array.isArray(value)) {
            gl.uniform1fv(loc, new Float32Array(value));
          }
        }
      }

      // All filter passes render to framebuffers
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets[writeIndex].framebuffer);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      readIndex = writeIndex;
    }

    // Final blit to canvas with Y-flip (GL is bottom-up, canvas is top-down)
    if (toCanvas) {
      const flip = this.flipProgram;
      gl.useProgram(flip);

      const aPosition = gl.getAttribLocation(flip, "a_position");
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targets[readIndex].texture);
      gl.uniform1i(gl.getUniformLocation(flip, "u_texture"), 0);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    this.lastReadIndex = readIndex;
  }

  private lastReadIndex = 0;

  /** Read pixels from the last framebuffer target. Only valid after render(source, false). */
  readPixels(): ImageData {
    if (this.disposed) throw new Error("GLRenderer has been disposed");
    const gl = this.gl;
    const width = this.currentWidth;
    const height = this.currentHeight;
    const rawOutput = new Uint8Array(width * height * 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets![this.lastReadIndex].framebuffer);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rawOutput);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { data: new Uint8ClampedArray(rawOutput.buffer), width, height };
  }

  /** Release all GPU resources. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;

    for (const program of this.programs) gl.deleteProgram(program);
    gl.deleteProgram(this.flipProgram);
    gl.deleteTexture(this.sourceTexture);
    gl.deleteBuffer(this.quadBuffer);

    if (this.targets) {
      gl.deleteTexture(this.targets[0].texture);
      gl.deleteTexture(this.targets[1].texture);
      gl.deleteFramebuffer(this.targets[0].framebuffer);
      gl.deleteFramebuffer(this.targets[1].framebuffer);
    }
  }
}
