import type { Filter } from "../types.js";

/** Inverts all RGB channels. Alpha is unchanged. */
export function invert(): Filter {
  return {
    fragmentSource: `
void main() {
  vec4 color = texture2D(u_texture, v_texCoord);
  gl_FragColor = vec4(1.0 - color.rgb, color.a);
}
`,
    uniforms: {},
  };
}
