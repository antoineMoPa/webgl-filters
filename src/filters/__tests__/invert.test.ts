import { describe, it, expect } from "vitest";
import { invert } from "../invert.js";
import { applyFilters } from "../../renderer.js";
import { createContext, solidImage, pixel } from "./helpers.js";

describe("invert", () => {
  const gl = createContext();

  it("inverts RGB channels", () => {
    const img = solidImage(2, 2, 0, 128, 255);
    const result = applyFilters(gl, img, [invert()]);
    const [r, g, b] = pixel(result, 0);
    expect(r).toBeCloseTo(255, -1);
    expect(g).toBeCloseTo(127, -1);
    expect(b).toBeCloseTo(0, -1);
  });

  it("double invert returns original", () => {
    const img = solidImage(2, 2, 42, 100, 200);
    const result = applyFilters(gl, img, [invert(), invert()]);
    const [r, g, b] = pixel(result, 0);
    expect(r).toBeCloseTo(42, -1);
    expect(g).toBeCloseTo(100, -1);
    expect(b).toBeCloseTo(200, -1);
  });

  it("preserves alpha", () => {
    const img = solidImage(2, 2, 100, 100, 100, 128);
    const result = applyFilters(gl, img, [invert()]);
    expect(pixel(result, 0)[3]).toBe(128);
  });
});
