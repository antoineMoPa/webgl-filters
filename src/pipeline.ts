import type { Filter, ImageData } from "./types.js";
import { applyFilters } from "./renderer.js";

/**
 * Chainable filter pipeline. Collects filters, then applies them
 * as sequential GPU shader passes.
 *
 * Usage:
 *   const result = pipeline(gl)
 *     .addFilter(brightness({ amount: 20 }))
 *     .addFilter(saturate({ factor: 1.5 }))
 *     .addFilter(blur())
 *     .apply(sourceImage);
 */
export class Pipeline {
  private filters: Filter[] = [];
  private gl: WebGLRenderingContext;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
  }

  /** Append a filter to the pipeline. Returns `this` for chaining. */
  addFilter(filter: Filter): this {
    this.filters.push(filter);
    return this;
  }

  /** Run all filters as GPU passes and return the result. */
  apply(input: ImageData): ImageData {
    return applyFilters(this.gl, input, this.filters);
  }
}

/** Create a new pipeline bound to a WebGL context. */
export function pipeline(gl: WebGLRenderingContext): Pipeline {
  return new Pipeline(gl);
}
