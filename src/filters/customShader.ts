import type { Filter, TextureUniformValue } from "../types.js";
import { scalarUniformDeclaration, uniformKeepAliveStatement } from "../uniforms.js";

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
 * Options beyond the main() body:
 *   - helpers: GLSL inserted after the uniform declarations and before
 *     main() — functions, #defines, consts the body can call.
 *   - precision: "highp" raises float precision for this shader where the
 *     GPU supports it (falls back to the default mediump otherwise).
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
export type CustomShaderPrecision = "mediump" | "highp";

export function customShader(options: {
  source: string;
  uniforms?: Record<string, number | number[]>;
  textures?: Record<string, TextureUniformValue>;
  helpers?: string;
  precision?: CustomShaderPrecision;
}): Filter {
  const { source, uniforms = {}, textures = {}, helpers = "", precision = "mediump" } = options;

  // Generate uniform declarations for user-provided uniforms
  const uniformDeclarations = Object.entries(uniforms)
    .map(([name, value]) => {
      if (typeof value === "number") return scalarUniformDeclaration(name);
      return `uniform float ${name}[${value.length}];`;
    })
    .join("\n");
  const textureDeclarations = Object.keys(textures)
    .map(name => `uniform sampler2D ${name};`)
    .join("\n");
  const declarations = [uniformDeclarations, textureDeclarations]
    .filter(Boolean)
    .join("\n");

  // The trailing keep-alive references every declared uniform so none
  // can be eliminated (see uniformKeepAliveStatement). It requires the
  // body to fall through to the end of main — custom sources must not
  // early-return.
  const filter: Filter = {
    fragmentSource: `${formatPrecisionStatement(precision)}
${declarations}
${helpers}
void main() {
${source}
${uniformKeepAliveStatement(uniforms)}
}
`,
    uniforms,
    _debugLabel: formatCustomShaderDebugLabel(source, uniforms, textures, helpers, precision),
  };
  if (Object.keys(textures).length > 0) filter.textures = textures;
  return filter;
}

/**
 * The renderer header already declares mediump; a later precision statement
 * overrides it. highp is optional in GLSL ES fragment shaders, hence the guard.
 */
function formatPrecisionStatement(precision: CustomShaderPrecision): string {
  if (precision === "mediump") return "";
  return `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#endif`;
}

function formatCustomShaderDebugLabel(
  source: string,
  uniforms: Record<string, number | number[]>,
  textures: Record<string, TextureUniformValue>,
  helpers: string,
  precision: CustomShaderPrecision,
): string {
  const hasUniforms = Object.keys(uniforms).length > 0;
  const uniformsLine = hasUniforms ? `,\n  uniforms: ${JSON.stringify(uniforms)}` : "";
  const stringTextures = Object.fromEntries(
    Object.entries(textures).filter(([, value]) => typeof value === "string"),
  );
  const texturesLine = Object.keys(stringTextures).length > 0
    ? `,\n  textures: ${JSON.stringify(stringTextures)}`
    : "";

  const helpersLine = helpers ? `,\n  helpers: \`\n${escapeTemplateLiteral(helpers)}\n  \`` : "";
  const precisionLine = precision !== "mediump" ? `,\n  precision: ${JSON.stringify(precision)}` : "";

  return `customShader({\n  source: \`\n${escapeTemplateLiteral(source)}\n  \`${uniformsLine}${texturesLine}${helpersLine}${precisionLine}\n})`;
}

function escapeTemplateLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}
