import { describe, it, expect } from "vitest";
import { erode } from "../erode.js";
import { applyFilters } from "../../renderer.js";
import { createContext, solidImage, pixel } from "./helpers.js";

describe("erode", () => {
  const gl = createContext();

  it("preserves a solid image", () => {
    const img = solidImage(8, 8, 100, 100, 100);
    const result = applyFilters(gl, img, [erode()]);
    const [r, g, b] = pixel(result, 4, 4);
    expect(r).toBeCloseTo(100, -1);
    expect(g).toBeCloseTo(100, -1);
    expect(b).toBeCloseTo(100, -1);
  });

  it("shrinks a bright region by darkening edges", () => {
    // All white with a single dark pixel
    const img = solidImage(8, 8, 255, 255, 255);
    const cx = 4, cy = 4;
    const i = (cy * 8 + cx) * 4;
    img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0;

    const result = applyFilters(gl, img, [erode({ radius: 1 })]);
    // Neighbors of the dark pixel should now be dark
    expect(pixel(result, cx + 1, cy)[0]).toBeCloseTo(0, -1);
    expect(pixel(result, cx, cy + 1)[0]).toBeCloseTo(0, -1);
  });

  it("preserves alpha", () => {
    const img = solidImage(8, 8, 100, 100, 100, 128);
    const result = applyFilters(gl, img, [erode()]);
    expect(pixel(result, 4, 4)[3]).toBeCloseTo(128, -1);
  });
});
