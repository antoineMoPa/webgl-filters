import type { Filter } from "../types.js";

export interface BrightnessParams {
  /** Brightness offset in 0-1 range. E.g. 0.1 adds ~25 to each channel. */
  amount: number;
}

/** Adjusts brightness by adding a value to each RGB channel. */
export function brightness(params: BrightnessParams = { amount: 0 }): Filter {
  return {
    fragmentSource: `
uniform float u_amount;
void main() {
  vec4 color = texture2D(u_texture, v_texCoord);
  color.rgb += u_amount;
  gl_FragColor = clamp(color, 0.0, 1.0);
}
`,
    uniforms: { u_amount: params.amount },
    _debugLabel: `brightness(${JSON.stringify(params)})`,
  };
}
