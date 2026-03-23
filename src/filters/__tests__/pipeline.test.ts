import { describe, it, expect, vi } from "vitest";
import { glFilters, CompiledFilter } from "../../pipeline.js";
import { brightness } from "../brightness.js";
import { invert } from "../invert.js";
import { contrast } from "../contrast.js";
import { applyFilters } from "../../renderer.js";
import { createContext, solidImage, pixel } from "./helpers.js";

describe("glFilters", () => {
  const gl = createContext();

  it("applies filters in order", () => {
    const img = solidImage(2, 2, 100, 100, 100);
    const result = glFilters(gl)
      .addFilter(brightness({ amount: 0.1 }))
      .addFilter(invert())
      .apply(img);
    // brightness +0.1 on 100/255 ≈ 0.492 → ~0.592 → inverted: ~0.408 → ~104
    const [r] = pixel(result, 0);
    expect(r).toBeGreaterThan(80);
    expect(r).toBeLessThan(130);
  });

  it("returns unchanged image with no filters", () => {
    const img = solidImage(2, 2, 100, 150, 200);
    const result = glFilters(gl).apply(img);
    const [r, g, b] = pixel(result, 0);
    expect(r).toBeCloseTo(100, -1);
    expect(g).toBeCloseTo(150, -1);
    expect(b).toBeCloseTo(200, -1);
  });

  it("chains multiple filters", () => {
    const img = solidImage(2, 2, 128, 128, 128);
    const result = glFilters(gl)
      .addFilter(contrast({ factor: 1.0 }))
      .addFilter(brightness({ amount: 0.0 }))
      .addFilter(invert())
      .addFilter(invert())
      .apply(img);
    // identity contrast + identity brightness + double invert = original
    const [r] = pixel(result, 0);
    expect(r).toBeCloseTo(128, -1);
  });
});

describe("CompiledFilter", () => {
  it("produces same output as one-shot apply", () => {
    const gl = createContext();
    const img = solidImage(4, 4, 100, 150, 200);

    const oneShot = glFilters(gl)
      .addFilter(brightness({ amount: 0.1 }))
      .addFilter(invert())
      .apply(img);

    const gl2 = createContext();
    const compiled = glFilters(gl2)
      .addFilter(brightness({ amount: 0.1 }))
      .addFilter(invert())
      .compile();
    const result = compiled.apply(img);
    compiled.dispose();

    const [er, eg, eb] = pixel(oneShot, 0);
    const [rr, rg, rb] = pixel(result, 0);
    expect(rr).toBeCloseTo(er, -1);
    expect(rg).toBeCloseTo(eg, -1);
    expect(rb).toBeCloseTo(eb, -1);
  });

  it("reuses compiled state across multiple apply calls", () => {
    const gl = createContext();
    const spy = vi.spyOn(gl, "createProgram");

    const compiled = glFilters(gl)
      .addFilter(brightness({ amount: 0.1 }))
      .compile();

    const img = solidImage(4, 4, 100, 100, 100);
    compiled.apply(img);
    const countAfterFirst = spy.mock.calls.length;

    compiled.apply(img);
    compiled.apply(img);

    // No additional programs created after first apply
    expect(spy.mock.calls.length).toBe(countAfterFirst);
    compiled.dispose();
  });

  it("throws after dispose", () => {
    const gl = createContext();
    const compiled = glFilters(gl)
      .addFilter(brightness({ amount: 0.1 }))
      .compile();
    compiled.dispose();
    expect(() => compiled.apply(solidImage(2, 2, 0, 0, 0))).toThrow("disposed");
  });

  it("works with zero filters", () => {
    const gl = createContext();
    const compiled = glFilters(gl).compile();
    const img = solidImage(4, 4, 42, 99, 200);
    const result = compiled.apply(img);
    const [r, g, b] = pixel(result, 0);
    expect(r).toBeCloseTo(42, -1);
    expect(g).toBeCloseTo(99, -1);
    expect(b).toBeCloseTo(200, -1);
    compiled.dispose();
  });
});
