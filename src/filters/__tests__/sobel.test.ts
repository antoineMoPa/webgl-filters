import { describe, it, expect } from "vitest";
import { sobel } from "../sobel.js";
import { applyFilters } from "../../renderer.js";
import { createContext, solidImage, pixel } from "./helpers.js";
import type { ImageData } from "../../types.js";

describe("sobel", () => {
  const gl = createContext();

  it("returns near-zero for a solid image", () => {
    const img = solidImage(8, 8, 100, 100, 100);
    const result = applyFilters(gl, img, [sobel()]);
    const [r, g, b] = pixel(result, 4, 4);
    expect(r).toBeLessThan(5);
    expect(g).toBeLessThan(5);
    expect(b).toBeLessThan(5);
  });

  it("detects a vertical edge", () => {
    // Left half black, right half white
    const w = 16, h = 8;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const v = x < w / 2 ? 0 : 255;
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
      }
    }
    const img: ImageData = { data, width: w, height: h };
    const result = applyFilters(gl, img, [sobel()]);
    // Pixel on the edge should have high magnitude
    const [r] = pixel(result, w / 2, h / 2);
    expect(r).toBeGreaterThan(100);
  });

  it("preserves alpha", () => {
    const img = solidImage(8, 8, 100, 100, 100, 64);
    const result = applyFilters(gl, img, [sobel()]);
    expect(pixel(result, 4, 4)[3]).toBeCloseTo(64, -1);
  });
});
