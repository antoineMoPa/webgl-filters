import { describe, it, expect } from "vitest";
import { alphaUnder } from "../alphaUnder.js";
import { applyFilters } from "../../renderer.js";
import { createContext, solidImage, pixel } from "./helpers.js";

describe("alphaUnder", () => {
  const gl = createContext();

  it("fully opaque image hides the background", () => {
    const img = solidImage(8, 8, 200, 100, 50, 255);
    const result = applyFilters(gl, img, [alphaUnder({ r: 0, g: 0, b: 0 })]);
    const [r, g, b] = pixel(result, 4, 4);
    expect(r).toBeCloseTo(200, -1);
    expect(g).toBeCloseTo(100, -1);
    expect(b).toBeCloseTo(50, -1);
  });

  it("fully transparent image shows the background", () => {
    const img = solidImage(8, 8, 200, 100, 50, 0);
    const result = applyFilters(gl, img, [alphaUnder({ r: 255, g: 128, b: 0 })]);
    const [r, g, b] = pixel(result, 4, 4);
    expect(r).toBeCloseTo(255, -1);
    expect(g).toBeCloseTo(128, -1);
    expect(b).toBeCloseTo(0, -1);
  });

  it("half-transparent image blends foreground and background", () => {
    const img = solidImage(8, 8, 255, 0, 0, 128);
    const result = applyFilters(gl, img, [alphaUnder({ r: 0, g: 0, b: 255 })]);
    const [r, g, b] = pixel(result, 4, 4);
    // ~50% red + ~50% blue
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(160);
    expect(b).toBeGreaterThan(100);
    expect(b).toBeLessThan(160);
    expect(g).toBeLessThan(30);
  });

  it("output is fully opaque when background alpha is 255", () => {
    const img = solidImage(8, 8, 100, 100, 100, 0);
    const result = applyFilters(gl, img, [alphaUnder({ r: 50, g: 50, b: 50 })]);
    const [, , , a] = pixel(result, 4, 4);
    expect(a).toBeCloseTo(255, -1);
  });
});
