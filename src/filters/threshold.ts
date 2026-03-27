import type { Filter } from "../types.js";

export interface ThresholdParams {
  /** Luminance cutoff (0–1). Pixels brighter than this become white, others black. Default 0.5. */
  cutoff?: number;
}

/** Converts an image to black and white based on a luminance threshold. */
export function threshold(params: ThresholdParams = {}): Filter {
  const { cutoff = 0.5 } = params;
  return {
    fragmentSource: `
uniform float u_cutoff;
void main() {
  vec4 c = texture2D(u_texture, v_texCoord);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float v = step(u_cutoff, lum);
  gl_FragColor = vec4(v, v, v, c.a);
}
`,
    uniforms: { u_cutoff: cutoff },
    _debugLabel: `threshold(${JSON.stringify({ cutoff })})`,
  };
}
