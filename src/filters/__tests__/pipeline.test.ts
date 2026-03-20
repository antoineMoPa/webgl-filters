import { describe, it, expect } from "vitest";
import { glFilters } from "../../pipeline.js";
import { brightness } from "../brightness.js";
import { invert } from "../invert.js";
import { contrast } from "../contrast.js";
import { applyFilters } from "../../renderer.js";
import { createContext, solidImage, pixel } from "./helpers.js";

describe("glFilters", () => {
  const gl = createContext();

  it("applies filters in order", () => {
    const img = solidImage(2, 2, 100, 100, 100);
    const result = glFilters(gl)
      .addFilter(brightness({ amount: 0.1 }))
      .addFilter(invert())
      .apply(img);
    // brightness +0.1 on 100/255 ≈ 0.492 → ~0.592 → inverted: ~0.408 → ~104
    const [r] = pixel(result, 0);
    expect(r).toBeGreaterThan(80);
    expect(r).toBeLessThan(130);
  });

  it("returns unchanged image with no filters", () => {
    const img = solidImage(2, 2, 100, 150, 200);
    const result = glFilters(gl).apply(img);
    const [r, g, b] = pixel(result, 0);
    expect(r).toBeCloseTo(100, -1);
    expect(g).toBeCloseTo(150, -1);
    expect(b).toBeCloseTo(200, -1);
  });

  it("chains multiple filters", () => {
    const img = solidImage(2, 2, 128, 128, 128);
    const result = glFilters(gl)
      .addFilter(contrast({ factor: 1.0 }))
      .addFilter(brightness({ amount: 0.0 }))
      .addFilter(invert())
      .addFilter(invert())
      .apply(img);
    // identity contrast + identity brightness + double invert = original
    const [r] = pixel(result, 0);
    expect(r).toBeCloseTo(128, -1);
  });
});
