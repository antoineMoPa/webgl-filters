import type { Filter, TextureUniformValue } from "../types.js";

/**
 * Create a filter from user-provided GLSL.
 *
 * The `source` is inserted as the body of main(). You have access to:
 *   - u_texture (sampler2D) — the input image
 *   - v_texCoord (vec2) — current texture coordinate
 *   - u_resolution (vec2) — image dimensions in pixels
 *   - u_texelSize (vec2) — 1.0 / u_resolution
 *   - any uniforms you declare via the `uniforms` parameter
 *   - any sampler2D uniforms you declare via the `textures` parameter
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
  textures?: Record<string, TextureUniformValue>;
}): Filter {
  const { source, uniforms = {}, textures = {} } = options;

  // Generate uniform declarations for user-provided uniforms
  const uniformDeclarations = Object.entries(uniforms)
    .map(([name, value]) => {
      if (typeof value === "number") return `uniform float ${name};`;
      return `uniform float ${name}[${value.length}];`;
    })
    .join("\n");
  const textureDeclarations = Object.keys(textures)
    .map(name => `uniform sampler2D ${name};`)
    .join("\n");
  const declarations = [uniformDeclarations, textureDeclarations]
    .filter(Boolean)
    .join("\n");

  const filter: Filter = {
    fragmentSource: `
${declarations}
void main() {
${source}
}
`,
    uniforms,
    _debugLabel: formatCustomShaderDebugLabel(source, uniforms, textures),
  };
  if (Object.keys(textures).length > 0) filter.textures = textures;
  return filter;
}

function formatCustomShaderDebugLabel(
  source: string,
  uniforms: Record<string, number | number[]>,
  textures: Record<string, TextureUniformValue>,
): string {
  const hasUniforms = Object.keys(uniforms).length > 0;
  const uniformsLine = hasUniforms ? `,\n  uniforms: ${JSON.stringify(uniforms)}` : "";
  const stringTextures = Object.fromEntries(
    Object.entries(textures).filter(([, value]) => typeof value === "string"),
  );
  const texturesLine = Object.keys(stringTextures).length > 0
    ? `,\n  textures: ${JSON.stringify(stringTextures)}`
    : "";

  return `customShader({\n  source: \`\n${escapeTemplateLiteral(source)}\n  \`${uniformsLine}${texturesLine}\n})`;
}

function escapeTemplateLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}
