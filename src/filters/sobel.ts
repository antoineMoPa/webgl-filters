import type { Filter } from "../types.js";

/**
 * Sobel edge detection filter.
 *
 * Computes the gradient magnitude from horizontal and vertical
 * Sobel 3x3 kernels in a single pass.
 */
export function sobel(): Filter {
  return {
    fragmentSource: `
void main() {
  vec4 tl = texture2D(u_texture, v_texCoord + vec2(-1.0, -1.0) * u_texelSize);
  vec4 tc = texture2D(u_texture, v_texCoord + vec2( 0.0, -1.0) * u_texelSize);
  vec4 tr = texture2D(u_texture, v_texCoord + vec2( 1.0, -1.0) * u_texelSize);
  vec4 ml = texture2D(u_texture, v_texCoord + vec2(-1.0,  0.0) * u_texelSize);
  vec4 mr = texture2D(u_texture, v_texCoord + vec2( 1.0,  0.0) * u_texelSize);
  vec4 bl = texture2D(u_texture, v_texCoord + vec2(-1.0,  1.0) * u_texelSize);
  vec4 bc = texture2D(u_texture, v_texCoord + vec2( 0.0,  1.0) * u_texelSize);
  vec4 br = texture2D(u_texture, v_texCoord + vec2( 1.0,  1.0) * u_texelSize);

  vec3 gx = -tl.rgb - 2.0 * ml.rgb - bl.rgb + tr.rgb + 2.0 * mr.rgb + br.rgb;
  vec3 gy = -tl.rgb - 2.0 * tc.rgb - tr.rgb + bl.rgb + 2.0 * bc.rgb + br.rgb;
  vec3 mag = sqrt(gx * gx + gy * gy);

  vec4 orig = texture2D(u_texture, v_texCoord);
  gl_FragColor = vec4(mag, orig.a);
}
`,
    uniforms: {},
    _debugLabel: "sobel()",
  };
}
