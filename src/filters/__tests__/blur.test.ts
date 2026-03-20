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

  it("always returns a single Filter", () => {
    expect(Array.isArray(blur())).toBe(false);
    expect(Array.isArray(blur({ radius: 5, strength: 0.5 }))).toBe(false);
  });

  it("respects custom radius", () => {
    const img = solidImage(8, 8, 100, 150, 200);
    const result = applyFilters(gl, img, [blur({ radius: 1 })]);
    const [r, g, b] = pixel(result, 4, 4);
    expect(r).toBeCloseTo(100, -1);
    expect(g).toBeCloseTo(150, -1);
    expect(b).toBeCloseTo(200, -1);
  });

  it("larger radius produces stronger blur", () => {
    const size = 32;
    const img = solidImage(size, size, 0, 0, 0);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size / 2; x++) {
        const i = (y * size + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
      }
    }

    const small = applyFilters(gl, img, [blur({ radius: 1 })]);
    const large = applyFilters(gl, img, [blur({ radius: 4 })]);

    const smallR = pixel(small, size / 2, size / 2)[0];
    const largeR = pixel(large, size / 2, size / 2)[0];

    expect(Math.abs(largeR - 127)).toBeLessThan(Math.abs(smallR - 127));
  });

  it("strength 0 leaves image unchanged", () => {
    const img = solidImage(8, 8, 100, 150, 200);
    // Put a bright pixel in the middle to ensure blur would change things
    const cx = 4, cy = 4;
    const i = (cy * 8 + cx) * 4;
    img.data[i] = 255; img.data[i + 1] = 0; img.data[i + 2] = 0;

    const result = applyFilters(gl, img, [blur({ strength: 0 })]);
    const [r, g, b] = pixel(result, cx, cy);
    expect(r).toBeCloseTo(255, -1);
    expect(g).toBeCloseTo(0, -1);
    expect(b).toBeCloseTo(0, -1);
  });

  it("partial strength blends between original and blurred", () => {
    const size = 32;
    const img = solidImage(size, size, 0, 0, 0);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size / 2; x++) {
        const i = (y * size + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
      }
    }

    const full = applyFilters(gl, img, [blur({ strength: 1 })]);
    const half = applyFilters(gl, img, [blur({ strength: 0.5 })]);

    // Near the edge, half-strength should be between the original edge and full blur
    const fullR = pixel(full, size / 2, size / 2)[0];
    const halfR = pixel(half, size / 2, size / 2)[0];

    // half-strength result should be further from midpoint than full
    expect(Math.abs(halfR - 127)).toBeGreaterThan(Math.abs(fullR - 127));
  });
});
