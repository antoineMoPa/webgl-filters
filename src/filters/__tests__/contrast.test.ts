import { describe, it, expect } from "vitest";
import { contrast } from "../contrast.js";
import { applyFilters } from "../../renderer.js";
import { createContext, solidImage, pixel } from "./helpers.js";

describe("contrast", () => {
  const gl = createContext();

  it("returns unchanged image with factor 1.0", () => {
    const img = solidImage(2, 2, 100, 150, 200);
    const result = applyFilters(gl, img, [contrast({ factor: 1.0 })]);
    const [r, g, b] = pixel(result, 0);
    expect(r).toBeCloseTo(100, -1);
    expect(g).toBeCloseTo(150, -1);
    expect(b).toBeCloseTo(200, -1);
  });

  it("flattens to grey with factor 0", () => {
    const img = solidImage(2, 2, 100, 200, 50);
    const result = applyFilters(gl, img, [contrast({ factor: 0 })]);
    const [r, g, b] = pixel(result, 0);
    expect(r).toBeCloseTo(128, -1);
    expect(g).toBeCloseTo(128, -1);
    expect(b).toBeCloseTo(128, -1);
  });

  it("increases contrast", () => {
    const img = solidImage(2, 2, 200, 200, 200);
    const result = applyFilters(gl, img, [contrast({ factor: 2.0 })]);
    const [r] = pixel(result, 0);
    // 200 is above midpoint, so contrast pushes it higher
    expect(r).toBeGreaterThan(200);
  });
});
