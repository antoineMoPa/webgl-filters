import { describe, it, expect } from "vitest";
import { customShader } from "../customShader.js";
import { applyFilters } from "../../renderer.js";
import { createContext, solidImage, pixel } from "./helpers.js";
import { generateDebugHTML } from "../../debug.js";

describe("customShader", () => {
  it("applies a red-channel-only shader", () => {
    const gl = createContext();
    const img = solidImage(2, 2, 100, 150, 200);
    const redOnly = customShader({
      source: `
        vec4 color = texture2D(u_texture, v_texCoord);
        gl_FragColor = vec4(color.r, 0.0, 0.0, color.a);
      `,
    });
    const result = applyFilters(gl, img, [redOnly]);
    const [r, g, b, a] = pixel(result, 0);
    expect(r).toBeCloseTo(100, -1);
    expect(g).toBe(0);
    expect(b).toBe(0);
    expect(a).toBe(255);
  });

  it("supports custom uniforms", () => {
    const gl = createContext();
    const img = solidImage(2, 2, 200, 200, 200);
    const tint = customShader({
      source: `
        vec4 color = texture2D(u_texture, v_texCoord);
        gl_FragColor = vec4(color.rgb * u_multiplier, color.a);
      `,
      uniforms: { u_multiplier: 0.5 },
    });
    const result = applyFilters(gl, img, [tint]);
    const [r] = pixel(result, 0);
    expect(r).toBeCloseTo(100, -1);
  });

  it("samples an extra texture uniform", () => {
    const gl = createContext();
    const base = solidImage(2, 2, 100, 0, 0);
    const overlay = solidImage(2, 2, 0, 150, 0);
    const shader = customShader({
      source: `
        vec4 base = texture2D(u_texture, v_texCoord);
        vec4 overlay = texture2D(u_overlay, v_texCoord);
        gl_FragColor = vec4(base.r, overlay.g, 0.0, 1.0);
      `,
      textures: { u_overlay: overlay },
    });

    const result = applyFilters(gl, base, [shader]);
    const [r, g, b, a] = pixel(result, 0);
    expect(r).toBeCloseTo(100, -1);
    expect(g).toBeCloseTo(150, -1);
    expect(b).toBe(0);
    expect(a).toBe(255);
  });

  it("supports numeric uniforms and texture uniforms in the same shader", () => {
    const gl = createContext();
    const base = solidImage(2, 2, 100, 100, 100);
    const overlay = solidImage(2, 2, 200, 0, 0);
    const shader = customShader({
      source: `
        vec4 base = texture2D(u_texture, v_texCoord);
        vec4 overlay = texture2D(u_overlay, v_texCoord);
        gl_FragColor = vec4(mix(base.rgb, overlay.rgb, u_amount), 1.0);
      `,
      uniforms: { u_amount: 0.5 },
      textures: { u_overlay: overlay },
    });

    const result = applyFilters(gl, base, [shader]);
    const [r, g, b] = pixel(result, 0);
    expect(r).toBeCloseTo(150, -1);
    expect(g).toBeCloseTo(50, -1);
    expect(b).toBeCloseTo(50, -1);
  });

  it("calls helper functions declared before main() that read user uniforms", () => {
    const gl = createContext();
    const img = solidImage(2, 2, 200, 100, 50);
    const shader = customShader({
      helpers: `
        #define HALF 0.5
        vec3 scaleColor(vec3 color) { return color * HALF * u_gain; }
      `,
      source: `
        vec4 color = texture2D(u_texture, v_texCoord);
        gl_FragColor = vec4(scaleColor(color.rgb), color.a);
      `,
      uniforms: { u_gain: 1.0 },
    });

    const [r, g, b] = pixel(applyFilters(gl, img, [shader]), 0);
    expect(r).toBeCloseTo(100, -1);
    expect(g).toBeCloseTo(50, -1);
    expect(b).toBeCloseTo(25, -1);
  });

  it("compiles and renders with highp precision, guarded for GPUs without it", () => {
    const gl = createContext();
    const img = solidImage(2, 2, 100, 150, 200);
    const shader = customShader({
      source: `gl_FragColor = texture2D(u_texture, v_texCoord);`,
      precision: "highp",
    });

    expect(shader.fragmentSource).toContain("#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#endif");
    const [r, g, b] = pixel(applyFilters(gl, img, [shader]), 0);
    expect([r, g, b]).toEqual([100, 150, 200]);
  });

  it("keeps the default fragment source free of precision overrides", () => {
    const shader = customShader({ source: `gl_FragColor = texture2D(u_texture, v_texCoord);` });
    expect(shader.fragmentSource).not.toContain("precision");
  });

  it("records helpers and precision in the debug label", () => {
    const shader = customShader({
      source: "gl_FragColor = f();",
      helpers: "vec4 f() { return vec4(1.0); }",
      precision: "highp",
    });

    expect(shader._debugLabel).toBe(
      "customShader({\n" +
        "  source: `\n" +
        "gl_FragColor = f();\n" +
        "  `,\n" +
        "  helpers: `\n" +
        "vec4 f() { return vec4(1.0); }\n" +
        "  `,\n" +
        '  precision: "highp"\n' +
        "})",
    );
  });

  it("throws a clear error when apply() sees a URL texture uniform", () => {
    const gl = createContext();
    const img = solidImage(2, 2, 100, 150, 200);
    const shader = customShader({
      source: `
        gl_FragColor = texture2D(u_overlay, v_texCoord);
      `,
      textures: { u_overlay: "/overlay.png" },
    });

    expect(() => applyFilters(gl, img, [shader])).toThrow(/Use applyAsync\(\)/);
  });

  it("formats debug labels with editable multiline shader source", () => {
    const shader = customShader({
      source: "vec4 color = texture2D(u_texture, v_texCoord);\n\ngl_FragColor = color;",
      uniforms: { u_mix: 0.5 },
    });

    expect(shader._debugLabel).toBe(
      "customShader({\n" +
        "  source: `\n" +
        "vec4 color = texture2D(u_texture, v_texCoord);\n\n" +
        "gl_FragColor = color;\n" +
        "  `,\n" +
        '  uniforms: {"u_mix":0.5}\n' +
        "})",
    );
  });

  it("generates debug HTML from multiline custom shader debug labels", () => {
    const shader = customShader({
      source: "vec4 color = texture2D(u_texture, v_texCoord);\ngl_FragColor = color;",
    });

    const html = generateDebugHTML([shader], "data:image/png;base64,");

    expect(html).toContain("chain.addFilter(customShader({");
    expect(html).toContain("source: `");
    expect(html).toContain("gl_FragColor = color;");
  });

  it("has access to u_resolution and u_texelSize", () => {
    const gl = createContext();
    const img = solidImage(4, 4, 0, 0, 0);
    // Shader that writes resolution.x / 255 to red channel
    const resShader = customShader({
      source: `
        gl_FragColor = vec4(u_resolution.x / 255.0, 0.0, 0.0, 1.0);
      `,
    });
    const result = applyFilters(gl, img, [resShader]);
    const [r] = pixel(result, 0);
    // resolution.x = 4, so r = 4/255*255 ≈ 4
    expect(r).toBeCloseTo(4, -1);
  });

  it("covers luminance to alpha", () => {
    const gl = createContext();
    const img = solidImage(2, 2, 255, 255, 255);
    const shader = customShader({
      source: `
        vec4 color = texture2D(u_texture, v_texCoord);
        float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor = vec4(1.0, 1.0, 1.0, lum);
      `,
    });

    const result = applyFilters(gl, img, [shader]);
    const [, , , a] = pixel(result, 0);
    expect(a).toBe(255);
  });

  it("covers solid color through alpha matte", () => {
    const gl = createContext();
    const matte = solidImage(2, 2, 255, 255, 255);
    const shader = customShader({
      source: `
        vec4 matte = texture2D(u_texture, v_texCoord);
        float alpha = dot(matte.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor = vec4(u_colorRgb[0], u_colorRgb[1], u_colorRgb[2], alpha);
      `,
      uniforms: { u_colorRgb: [0.25, 0.5, 0.75] },
    });

    const result = applyFilters(gl, matte, [shader]);
    const [r, g, b, a] = pixel(result, 0);
    expect(r).toBeCloseTo(64, -1);
    expect(g).toBeCloseTo(128, -1);
    expect(b).toBeCloseTo(191, -1);
    expect(a).toBe(255);
  });

  it("covers image through alpha matte", () => {
    const gl = createContext();
    const img = solidImage(2, 2, 80, 120, 160, 255);
    const matte = solidImage(2, 2, 128, 128, 128, 255);
    const shader = customShader({
      source: `
        vec4 image = texture2D(u_texture, v_texCoord);
        vec4 matte = texture2D(u_matte, v_texCoord);
        float alpha = dot(matte.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor = vec4(image.rgb, image.a * alpha);
      `,
      textures: { u_matte: matte },
    });

    const result = applyFilters(gl, img, [shader]);
    const [r, g, b, a] = pixel(result, 0);
    expect(r).toBeCloseTo(80, -1);
    expect(g).toBeCloseTo(120, -1);
    expect(b).toBeCloseTo(160, -1);
    expect(a).toBeCloseTo(128, -1);
  });

  it("covers image base light/shadow blend", () => {
    const gl = createContext();
    const base = solidImage(2, 2, 128, 128, 128, 255);
    const overlay = solidImage(2, 2, 255, 255, 255, 255);
    const shader = customShader({
      source: `
        vec4 base = texture2D(u_texture, v_texCoord);
        vec4 overlay = texture2D(u_overlay, v_texCoord);
        vec3 screen = 1.0 - (1.0 - overlay.rgb * u_screenAmount) * (1.0 - base.rgb);
        vec3 blended = screen * overlay.rgb;
        vec3 rgb = blended * overlay.a + base.rgb * (1.0 - overlay.a);
        gl_FragColor = vec4(rgb, base.a);
      `,
      uniforms: { u_screenAmount: 0.25 },
      textures: { u_overlay: overlay },
    });

    const result = applyFilters(gl, base, [shader]);
    const [r, g, b, a] = pixel(result, 0);
    expect(r).toBeCloseTo(159, -1);
    expect(g).toBeCloseTo(159, -1);
    expect(b).toBeCloseTo(159, -1);
    expect(a).toBe(255);
  });

  it("covers standard alpha composite", () => {
    const gl = createContext();
    const base = solidImage(2, 2, 100, 100, 100, 255);
    const overlay = solidImage(2, 2, 200, 0, 0, 128);
    const shader = customShader({
      source: `
        vec4 base = texture2D(u_texture, v_texCoord);
        vec4 overlay = texture2D(u_overlay, v_texCoord);
        vec3 rgb = overlay.rgb * overlay.a + base.rgb * (1.0 - overlay.a);
        float alpha = overlay.a + base.a * (1.0 - overlay.a);
        gl_FragColor = vec4(rgb, alpha);
      `,
      textures: { u_overlay: overlay },
    });

    const result = applyFilters(gl, base, [shader]);
    const [r, g, b, a] = pixel(result, 0);
    expect(r).toBeCloseTo(150, -1);
    expect(g).toBeCloseTo(50, -1);
    expect(b).toBeCloseTo(50, -1);
    expect(a).toBe(255);
  });
});
