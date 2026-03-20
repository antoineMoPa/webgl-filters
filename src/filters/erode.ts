import type { Filter } from "../types.js";

export interface ErodeParams {
  /** Radius in pixels. Default 1. */
  radius?: number;
}

/** Morphological erosion — shrinks bright regions by taking the min of neighboring pixels. */
export function erode(params: ErodeParams = {}): Filter {
  const { radius = 1 } = params;
  const r = Math.max(1, Math.round(radius));

  const lines: string[] = [];
  for (let ky = -r; ky <= r; ky++) {
    for (let kx = -r; kx <= r; kx++) {
      lines.push(
        `  mn = min(mn, texture2D(u_texture, v_texCoord + vec2(${kx}.0, ${ky}.0) * u_texelSize).rgb);`
      );
    }
  }

  return {
    fragmentSource: `
void main() {
  vec4 c = texture2D(u_texture, v_texCoord);
  vec3 mn = c.rgb;
${lines.join("\n")}
  gl_FragColor = vec4(mn, c.a);
}
`,
    uniforms: {},
  };
}
