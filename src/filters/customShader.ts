import type { Filter } from "../types.js";

/**
 * Create a filter from user-provided GLSL.
 *
 * The `source` is inserted as the body of main(). You have access to:
 *   - u_texture (sampler2D) — the input image
 *   - v_texCoord (vec2) — current texture coordinate
 *   - u_resolution (vec2) — image dimensions in pixels
 *   - u_texelSize (vec2) — 1.0 / u_resolution
 *   - any uniforms you declare via the `uniforms` parameter
 *
 * Write your result to gl_FragColor.
 *
 * Example:
 *   customShader({
 *     source: `
 *       vec4 color = texture2D(u_texture, v_texCoord);
 *       gl_FragColor = vec4(color.r, 0.0, 0.0, color.a);
 *     `,
 *     uniforms: {},
 *   })
 */
export function customShader(options: {
  source: string;
  uniforms?: Record<string, number | number[]>;
}): Filter {
  const { source, uniforms = {} } = options;

  // Generate uniform declarations for user-provided uniforms
  const declarations = Object.entries(uniforms)
    .map(([name, value]) => {
      if (typeof value === "number") return `uniform float ${name};`;
      return `uniform float ${name}[${value.length}];`;
    })
    .join("\n");

  return {
    fragmentSource: `
${declarations}
void main() {
${source}
}
`,
    uniforms,
    _debugLabel: `customShader(${JSON.stringify(options)})`,
  };
}
