import type { Filter } from "../types.js";

export interface AlphaUnderParams {
  /** Red channel (0–255). */
  r: number;
  /** Green channel (0–255). */
  g: number;
  /** Blue channel (0–255). */
  b: number;
  /** Alpha channel (0–255). Default 255. */
  a?: number;
}

/** Composites the image over a solid background color using alpha blending. */
export function alphaUnder(params: AlphaUnderParams): Filter {
  const { r, g, b, a = 255 } = params;
  return {
    fragmentSource: `
uniform float u_bgR;
uniform float u_bgG;
uniform float u_bgB;
uniform float u_bgA;
void main() {
  vec4 fg = texture2D(u_texture, v_texCoord);
  vec3 bg = vec3(u_bgR, u_bgG, u_bgB);
  gl_FragColor = vec4(mix(bg, fg.rgb, fg.a), mix(u_bgA, 1.0, fg.a));
}
`,
    uniforms: { u_bgR: r / 255, u_bgG: g / 255, u_bgB: b / 255, u_bgA: a / 255 },
    _debugLabel: `alphaUnder(${JSON.stringify({ r, g, b, a })})`,
  };
}
