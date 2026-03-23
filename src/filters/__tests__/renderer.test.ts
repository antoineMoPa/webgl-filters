import { describe, it, expect, vi } from "vitest";
import { GLRenderer, getSourceDimensions } from "../../renderer.js";
import { brightness } from "../brightness.js";
import { invert } from "../invert.js";
import { createContext, solidImage, pixel } from "./helpers.js";
import { applyFilters } from "../../renderer.js";

describe("GLRenderer", () => {
  it("produces same output as applyFilters", () => {
    const gl = createContext();
    const img = solidImage(4, 4, 100, 150, 200);
    const filters = [brightness({ amount: 0.1 })];

    const expected = applyFilters(gl, img, filters);

    const gl2 = createContext();
    const renderer = new GLRenderer(gl2, filters);
    renderer.render(img, false);
    const result = renderer.readPixels();
    renderer.dispose();

    const [er, eg, eb] = pixel(expected, 0);
    const [rr, rg, rb] = pixel(result, 0);
    expect(rr).toBeCloseTo(er, -1);
    expect(rg).toBeCloseTo(eg, -1);
    expect(rb).toBeCloseTo(eb, -1);
  });

  it("compiles programs only once across multiple renders", () => {
    const gl = createContext();
    const spy = vi.spyOn(gl, "createProgram");

    const filters = [brightness({ amount: 0.1 }), invert()];
    const renderer = new GLRenderer(gl, filters);
    const compileCount = spy.mock.calls.length;

    const img = solidImage(4, 4, 100, 150, 200);
    renderer.render(img, false);
    renderer.render(img, false);
    renderer.render(img, false);

    // No additional programs created after construction
    expect(spy.mock.calls.length).toBe(compileCount);
    renderer.dispose();
  });

  it("handles dimension changes", () => {
    const gl = createContext(128, 128);
    const filters = [brightness({ amount: 0.0 })];
    const renderer = new GLRenderer(gl, filters);

    const small = solidImage(4, 4, 100, 100, 100);
    renderer.render(small, false);
    const r1 = renderer.readPixels();
    expect(r1.width).toBe(4);
    expect(r1.height).toBe(4);

    const big = solidImage(8, 8, 200, 200, 200);
    renderer.render(big, false);
    const r2 = renderer.readPixels();
    expect(r2.width).toBe(8);
    expect(r2.height).toBe(8);

    const [r] = pixel(r2, 0);
    expect(r).toBeCloseTo(200, -1);

    renderer.dispose();
  });

  it("works with zero filters (passthrough)", () => {
    const gl = createContext();
    const renderer = new GLRenderer(gl, []);
    const img = solidImage(4, 4, 42, 99, 200);
    renderer.render(img, false);
    const result = renderer.readPixels();
    const [r, g, b] = pixel(result, 0);
    expect(r).toBeCloseTo(42, -1);
    expect(g).toBeCloseTo(99, -1);
    expect(b).toBeCloseTo(200, -1);
    renderer.dispose();
  });

  it("throws after dispose", () => {
    const gl = createContext();
    const renderer = new GLRenderer(gl, []);
    renderer.dispose();
    expect(() => renderer.render(solidImage(2, 2, 0, 0, 0), false)).toThrow("disposed");
  });

  it("dispose is idempotent", () => {
    const gl = createContext();
    const renderer = new GLRenderer(gl, []);
    renderer.dispose();
    expect(() => renderer.dispose()).not.toThrow();
  });
});

describe("getSourceDimensions", () => {
  it("returns width/height for ImageData-like objects", () => {
    expect(getSourceDimensions(solidImage(10, 20, 0, 0, 0))).toEqual([10, 20]);
  });

  it("returns videoWidth/videoHeight for video-like objects", () => {
    const fakeVideo = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
    expect(getSourceDimensions(fakeVideo)).toEqual([640, 480]);
  });
});
