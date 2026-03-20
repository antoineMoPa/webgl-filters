import { describe, it, expect } from "vitest";
import { sharpen } from "../sharpen.js";
import { applyFilters } from "../../renderer.js";
import { createContext, solidImage, pixel } from "./helpers.js";

describe("sharpen", () => {
  const gl = createContext();

  it("preserves a solid image", () => {
    const img = solidImage(8, 8, 100, 100, 100);
    const result = applyFilters(gl, img, [sharpen()]);
    const [r, g, b] = pixel(result, 4, 4);
    expect(r).toBeCloseTo(100, -1);
    expect(g).toBeCloseTo(100, -1);
    expect(b).toBeCloseTo(100, -1);
  });

  it("preserves alpha", () => {
    const img = solidImage(8, 8, 100, 100, 100, 64);
    const result = applyFilters(gl, img, [sharpen()]);
    expect(pixel(result, 4, 4)[3]).toBeCloseTo(64, -1);
  });
});
