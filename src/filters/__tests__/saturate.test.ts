import { describe, it, expect } from "vitest";
import { saturate } from "../saturate.js";
import { applyFilters } from "../../renderer.js";
import { createContext, solidImage, pixel } from "./helpers.js";

describe("saturate", () => {
  const gl = createContext();

  it("returns unchanged image with factor 1.0", () => {
    const img = solidImage(2, 2, 100, 150, 200);
    const result = applyFilters(gl, img, [saturate({ factor: 1.0 })]);
    const [r, g, b] = pixel(result, 0);
    expect(r).toBeCloseTo(100, -1);
    expect(g).toBeCloseTo(150, -1);
    expect(b).toBeCloseTo(200, -1);
  });

  it("desaturates to greyscale with factor 0", () => {
    const img = solidImage(2, 2, 255, 0, 0);
    const result = applyFilters(gl, img, [saturate({ factor: 0 })]);
    const [r, g, b] = pixel(result, 0);
    // All channels should be roughly equal (luminance)
    expect(Math.abs(r - g)).toBeLessThan(3);
    expect(Math.abs(g - b)).toBeLessThan(3);
  });

  it("preserves alpha", () => {
    const img = solidImage(2, 2, 100, 150, 200, 128);
    const result = applyFilters(gl, img, [saturate({ factor: 0.5 })]);
    expect(pixel(result, 0)[3]).toBe(128);
  });
});
