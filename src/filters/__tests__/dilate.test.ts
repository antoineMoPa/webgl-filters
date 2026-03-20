import { describe, it, expect } from "vitest";
import { dilate } from "../dilate.js";
import { applyFilters } from "../../renderer.js";
import { createContext, solidImage, pixel } from "./helpers.js";

describe("dilate", () => {
  const gl = createContext();

  it("preserves a solid image", () => {
    const img = solidImage(8, 8, 100, 100, 100);
    const result = applyFilters(gl, img, [dilate()]);
    const [r, g, b] = pixel(result, 4, 4);
    expect(r).toBeCloseTo(100, -1);
    expect(g).toBeCloseTo(100, -1);
    expect(b).toBeCloseTo(100, -1);
  });

  it("expands a bright pixel into neighbors", () => {
    const img = solidImage(8, 8, 0, 0, 0);
    // Place a single bright pixel
    const cx = 4, cy = 4;
    const i = (cy * 8 + cx) * 4;
    img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255;

    const result = applyFilters(gl, img, [dilate({ radius: 1 })]);
    // Neighbors should now be bright
    expect(pixel(result, cx + 1, cy)[0]).toBeCloseTo(255, -1);
    expect(pixel(result, cx, cy + 1)[0]).toBeCloseTo(255, -1);
  });

  it("preserves alpha", () => {
    const img = solidImage(8, 8, 100, 100, 100, 128);
    const result = applyFilters(gl, img, [dilate()]);
    expect(pixel(result, 4, 4)[3]).toBeCloseTo(128, -1);
  });
});
