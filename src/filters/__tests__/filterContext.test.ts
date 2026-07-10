import { describe, expect, it, vi } from "vitest";
import { createFilterContext } from "../../pipeline.js";
import { applyFilters } from "../../renderer.js";
import { brightness } from "../brightness.js";
import { customShader } from "../customShader.js";
import { invert } from "../invert.js";
import { createContext, pixel, solidImage } from "./helpers.js";

describe("FilterContext", () => {
  it("run() is pixel-identical to applyFilters", () => {
    const img = solidImage(4, 4, 100, 150, 200);
    const filters = [brightness({ amount: 0.1 }), invert()];

    const expected = applyFilters(createContext(), img, filters);
    const ctx = createFilterContext(createContext());
    const handle = ctx.run(filters, img);
    const result = ctx.readPixels(handle);

    expect([...result.data]).toEqual([...expected.data]);
    ctx.dispose();
  });

  it("composes two chains through a texture uniform without intermediate readback", () => {
    const gl = createContext();
    const readSpy = vi.spyOn(gl, "readPixels");
    const ctx = createFilterContext(gl);
    const img = solidImage(4, 4, 100, 100, 100);

    const bright = ctx.run([brightness({ amount: 0.1 })], img);
    const composed = ctx.run([
      customShader({
        source: `
          vec4 current = texture2D(u_texture, v_texCoord);
          vec4 previous = texture2D(u_previous, v_texCoord);
          gl_FragColor = vec4((current.rgb + previous.rgb) * 0.5, current.a);
        `,
        textures: { u_previous: bright },
      }),
    ], img);

    expect(readSpy).not.toHaveBeenCalled();
    const result = ctx.readPixels(composed);
    expect(readSpy).toHaveBeenCalledTimes(1);

    const [r, g, b] = pixel(result, 0);
    expect(r).toBeGreaterThan(110);
    expect(g).toBeGreaterThan(110);
    expect(b).toBeGreaterThan(110);
    ctx.dispose();
  });

  it("compiles each fragment source once across runs", () => {
    const gl = createContext();
    const createProgramSpy = vi.spyOn(gl, "createProgram");
    const ctx = createFilterContext(gl);
    const img = solidImage(4, 4, 100, 100, 100);
    const filters = [brightness({ amount: 0.1 })];

    ctx.run(filters, img);
    const countAfterFirstRun = createProgramSpy.mock.calls.length;
    ctx.run(filters, img);
    ctx.run(filters, img);

    expect(createProgramSpy.mock.calls.length).toBe(countAfterFirstRun);
    ctx.dispose();
  });

  it("keeps output handles stable after later runs", () => {
    const ctx = createFilterContext(createContext());
    const first = ctx.run([brightness({ amount: 0.0 })], solidImage(4, 4, 20, 40, 60));
    ctx.run([brightness({ amount: 0.0 })], solidImage(4, 4, 200, 210, 220));

    const result = ctx.readPixels(first);
    const [r, g, b] = pixel(result, 0);
    expect(r).toBeCloseTo(20, -1);
    expect(g).toBeCloseTo(40, -1);
    expect(b).toBeCloseTo(60, -1);
    ctx.dispose();
  });

  it("throws when a texture uniform handle comes from another context", () => {
    const ctx1 = createFilterContext(createContext());
    const ctx2 = createFilterContext(createContext());
    const handle = ctx1.upload(solidImage(2, 2, 255, 0, 0));

    expect(() => ctx2.run([
      customShader({
        source: `gl_FragColor = texture2D(u_other, v_texCoord);`,
        textures: { u_other: handle },
      }),
    ], solidImage(2, 2, 0, 0, 0))).toThrow("different FilterContext");

    ctx1.dispose();
    ctx2.dispose();
  });
});
