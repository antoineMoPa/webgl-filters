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
});
