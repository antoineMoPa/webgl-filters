import { describe, it, expect } from "vitest";
import { brightness } from "../brightness.js";
import { applyFilters } from "../../renderer.js";
import { createContext, solidImage, pixel } from "./helpers.js";

describe("brightness", () => {
  const gl = createContext();

  it("returns unchanged image with amount 0", () => {
    const img = solidImage(2, 2, 100, 150, 200);
    const result = applyFilters(gl, img, [brightness({ amount: 0 })]);
    const [r, g, b, a] = pixel(result, 0);
    expect(r).toBeCloseTo(100, -1);
    expect(g).toBeCloseTo(150, -1);
    expect(b).toBeCloseTo(200, -1);
    expect(a).toBe(255);
  });

  it("increases brightness", () => {
    const img = solidImage(2, 2, 100, 100, 100);
    const result = applyFilters(gl, img, [brightness({ amount: 0.2 })]);
    const [r] = pixel(result, 0);
    expect(r).toBeGreaterThan(140);
  });

  it("decreases brightness", () => {
    const img = solidImage(2, 2, 200, 200, 200);
    const result = applyFilters(gl, img, [brightness({ amount: -0.3 })]);
    const [r] = pixel(result, 0);
    expect(r).toBeLessThan(130);
  });

  it("clamps to 0-255", () => {
    const img = solidImage(2, 2, 250, 10, 128);
    const result = applyFilters(gl, img, [brightness({ amount: 0.5 })]);
    const [r] = pixel(result, 0);
    expect(r).toBe(255);
  });
});
