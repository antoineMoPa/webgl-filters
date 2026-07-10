/** RGBA pixel data */
export interface ImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * A filter descriptor: a GLSL fragment shader + uniforms.
 *
 * The renderer prepends a standard header with:
 *   precision mediump float;
 *   uniform sampler2D u_texture;
 *   uniform vec2 u_resolution;
 *   uniform vec2 u_texelSize;
 *   varying vec2 v_texCoord;
 *
 * Your fragmentSource should declare any additional uniforms and provide main().
 */
export interface Filter {
  fragmentSource: string;
  uniforms: Record<string, number | number[]>;
  textures?: Record<string, TextureUniformValue>;
  /** Debug metadata: records the factory call that created this filter. */
  _debugLabel?: string;
}

/** A 5x5 convolution kernel (25 elements, row-major) */
export type Kernel5x5 = [
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
];

/** Any source that `gl.texImage2D` accepts natively. */
export type TextureSource =
  | ImageData
  | HTMLVideoElement
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap;

/** A GPU-resident texture created by `FilterContext`. */
export interface TextureHandle {
  readonly width: number;
  readonly height: number;
  readonly __webglFiltersTextureHandle: true;
}

/**
 * Any image source accepted by the one-shot `apply()` methods.
 * This is `TextureSource` without `HTMLVideoElement` — use `.compile()` for video.
 */
export type ImageSource =
  | ImageData
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap;

export type TextureUniformValue =
  | string
  | ImageSource
  | TextureHandle;

export interface ConvolutionOptions {
  kernel: Kernel5x5;
  /** Divisor applied after summing. Defaults to 1. */
  divisor?: number;
  /** Value added after division (in 0-1 range). Defaults to 0. */
  bias?: number;
}
