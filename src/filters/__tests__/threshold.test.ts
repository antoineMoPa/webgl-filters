import { describe, it, expect } from "vitest";
import { threshold } from "../threshold.js";
import { applyFilters } from "../../renderer.js";
import { createContext, solidImage, pixel } from "./helpers.js";

describe("threshold", () => {
  const gl = createContext();

  it("bright pixels become white", () => {
    const img = solidImage(8, 8, 200, 200, 200);
    const result = applyFilters(gl, img, [threshold({ cutoff: 0.5 })]);
    const [r, g, b] = pixel(result, 4, 4);
    expect(r).toBeCloseTo(255, -1);
    expect(g).toBeCloseTo(255, -1);
    expect(b).toBeCloseTo(255, -1);
  });

  it("dark pixels become black", () => {
    const img = solidImage(8, 8, 30, 30, 30);
    const result = applyFilters(gl, img, [threshold({ cutoff: 0.5 })]);
    const [r, g, b] = pixel(result, 4, 4);
    expect(r).toBeCloseTo(0, -1);
    expect(g).toBeCloseTo(0, -1);
    expect(b).toBeCloseTo(0, -1);
  });

  it("preserves alpha", () => {
    const img = solidImage(8, 8, 200, 200, 200, 128);
    const result = applyFilters(gl, img, [threshold()]);
    expect(pixel(result, 4, 4)[3]).toBeCloseTo(128, -1);
  });

  it("respects custom cutoff", () => {
    // luminance of (200,200,200) ≈ 0.784
    const img = solidImage(8, 8, 200, 200, 200);
    const high = applyFilters(gl, img, [threshold({ cutoff: 0.9 })]);
    const low = applyFilters(gl, img, [threshold({ cutoff: 0.5 })]);
    expect(pixel(high, 4, 4)[0]).toBeCloseTo(0, -1);   // above cutoff → black
    expect(pixel(low, 4, 4)[0]).toBeCloseTo(255, -1);   // below cutoff → white
  });
});
