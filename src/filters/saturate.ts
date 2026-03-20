import type { Filter } from "../types.js";

export interface SaturateParams {
  /** Saturation factor. 1.0 = no change, 0 = grayscale, >1 = more saturated. */
  factor: number;
}

/** Adjusts saturation by interpolating between luminance and original color. */
export function saturate(params: SaturateParams = { factor: 1.0 }): Filter {
  return {
    fragmentSource: `
uniform float u_factor;
void main() {
  vec4 color = texture2D(u_texture, v_texCoord);
  float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(vec3(lum), color.rgb, u_factor);
  gl_FragColor = clamp(color, 0.0, 1.0);
}
`,
    uniforms: { u_factor: params.factor },
  };
}
