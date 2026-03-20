import type { Filter, ImageData } from "./types.js";
import { applyFilters } from "./renderer.js";

/**
 * Chainable filter chain. Collects filters, then applies them
 * as sequential GPU shader passes.
 *
 * Usage:
 *   const result = glFilters(gl)
 *     .addFilter(brightness({ amount: 20 }))
 *     .addFilter(saturate({ factor: 1.5 }))
 *     .addFilter(blur())
 *     .apply(sourceImage);
 */
export class GLFilters {
  private filters: Filter[] = [];
  private gl: WebGLRenderingContext;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
  }

  /** Append a filter to the chain. Returns `this` for chaining. */
  addFilter(filter: Filter): this {
    this.filters.push(filter);
    return this;
  }

  /** Run all filters as GPU passes and return the result. */
  apply(input: ImageData): ImageData {
    return applyFilters(this.gl, input, this.filters);
  }
}

/** Create a new filter chain bound to a WebGL context. */
export function glFilters(gl: WebGLRenderingContext): GLFilters {
  return new GLFilters(gl);
}
