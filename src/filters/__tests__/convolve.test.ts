import { describe, it, expect } from "vitest";
import { convolve } from "../convolve.js";
import { applyFilters } from "../../renderer.js";
import type { Kernel5x5 } from "../../types.js";
import { createContext, solidImage, pixel } from "./helpers.js";

describe("convolve", () => {
  const gl = createContext();

  it("identity kernel preserves pixel values", () => {
    const identity: Kernel5x5 = [
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
    ];
    const img = solidImage(8, 8, 100, 150, 200);
    const result = applyFilters(gl, img, [convolve({ kernel: identity })]);
    const [r, g, b] = pixel(result, 4, 4);
    expect(r).toBeCloseTo(100, -1);
    expect(g).toBeCloseTo(150, -1);
    expect(b).toBeCloseTo(200, -1);
  });

  it("uniform kernel on solid image returns same color", () => {
    const allOnes: Kernel5x5 = Array(25).fill(1) as Kernel5x5;
    const img = solidImage(8, 8, 80, 80, 80);
    const result = applyFilters(gl, img, [convolve({ kernel: allOnes })]);
    const [r, g, b] = pixel(result, 4, 4);
    expect(r).toBeCloseTo(80, -1);
    expect(g).toBeCloseTo(80, -1);
    expect(b).toBeCloseTo(80, -1);
  });

  it("preserves alpha", () => {
    const identity: Kernel5x5 = [
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
    ];
    const img = solidImage(8, 8, 100, 100, 100, 128);
    const result = applyFilters(gl, img, [convolve({ kernel: identity })]);
    expect(pixel(result, 4, 4)[3]).toBeCloseTo(128, -1);
  });
});
