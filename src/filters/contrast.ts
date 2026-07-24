import type { Filter } from "../types.js";
import { customShader } from "./customShader.js";

export interface ContrastParams {
  /** Contrast factor. 1.0 = no change, 0 = flat grey, >1 = more contrast. */
  factor: number;
}

/** Adjusts contrast by scaling each channel around the midpoint (0.5). */
export function contrast(params: ContrastParams = { factor: 1.0 }): Filter {
  return {
    ...customShader({
      source: `
  vec4 color = texture2D(u_texture, v_texCoord);
  color.rgb = (color.rgb - 0.5) * u_factor + 0.5;
  gl_FragColor = clamp(color, 0.0, 1.0);
`,
      uniforms: { u_factor: params.factor },
    }),
    _debugLabel: `contrast(${JSON.stringify(params)})`,
  };
}
