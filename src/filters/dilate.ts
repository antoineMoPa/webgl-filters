import type { Filter } from "../types.js";

export interface DilateParams {
  /** Radius in pixels. Default 1. */
  radius?: number;
}

/** Morphological dilation — expands bright regions by taking the max of neighboring pixels. */
export function dilate(params: DilateParams = {}): Filter {
  const { radius = 1 } = params;
  const r = Math.max(1, Math.round(radius));

  const lines: string[] = [];
  for (let ky = -r; ky <= r; ky++) {
    for (let kx = -r; kx <= r; kx++) {
      lines.push(
        `  mx = max(mx, texture2D(u_texture, v_texCoord + vec2(${kx}.0, ${ky}.0) * u_texelSize).rgb);`
      );
    }
  }

  return {
    fragmentSource: `
void main() {
  vec4 c = texture2D(u_texture, v_texCoord);
  vec3 mx = c.rgb;
${lines.join("\n")}
  gl_FragColor = vec4(mx, c.a);
}
`,
    uniforms: {},
  };
}
