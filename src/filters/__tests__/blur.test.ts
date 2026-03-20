import { describe, it, expect } from "vitest";
import { blur } from "../blur.js";
import { applyFilters } from "../../renderer.js";
import { createContext, solidImage, pixel } from "./helpers.js";

describe("blur", () => {
  const gl = createContext();

  it("preserves a solid image", () => {
    const img = solidImage(8, 8, 120, 120, 120);
    const result = applyFilters(gl, img, [blur()]);
    const [r, g, b] = pixel(result, 4, 4);
    expect(r).toBeCloseTo(120, -1);
    expect(g).toBeCloseTo(120, -1);
    expect(b).toBeCloseTo(120, -1);
  });

  it("preserves alpha", () => {
    const img = solidImage(8, 8, 100, 100, 100, 128);
    const result = applyFilters(gl, img, [blur()]);
    expect(pixel(result, 4, 4)[3]).toBeCloseTo(128, -1);
  });
});
