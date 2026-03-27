import type { ConvolutionOptions, Filter } from "../types.js";

/**
 * Applies a 5x5 convolution kernel via a GPU shader.
 * Kernel values are baked into the shader source as constants
 * (WebGL 1 doesn't allow dynamic uniform array indexing).
 */
export function convolve(options: ConvolutionOptions): Filter {
  const { kernel, bias = 0 } = options;
  const kernelSum = kernel.reduce((a, b) => a + b, 0);
  const divisor = options.divisor ?? (kernelSum === 0 ? 1 : kernelSum);

  // Generate 25 sample+accumulate lines
  const lines: string[] = [];
  for (let ky = -2; ky <= 2; ky++) {
    for (let kx = -2; kx <= 2; kx++) {
      const ki = (ky + 2) * 5 + (kx + 2);
      const w = kernel[ki];
      if (w === 0) continue;
      lines.push(
        `  sum += texture2D(u_texture, v_texCoord + vec2(${kx}.0, ${ky}.0) * u_texelSize) * ${w.toFixed(6)};`
      );
    }
  }

  return {
    fragmentSource: `
void main() {
  vec4 sum = vec4(0.0);
${lines.join("\n")}
  vec4 color = sum / ${divisor.toFixed(6)} + ${bias.toFixed(6)};
  color.a = texture2D(u_texture, v_texCoord).a;
  gl_FragColor = clamp(color, 0.0, 1.0);
}
`,
    uniforms: {},
    _debugLabel: `convolve({\n  kernel: [\n${[0,1,2,3,4].map(r => "    " + kernel.slice(r*5, r*5+5).join(", ")).join(",\n")},\n  ]${options.divisor != null ? `,\n  divisor: ${options.divisor}` : ""}${bias !== 0 ? `,\n  bias: ${bias}` : ""}\n})`,
  };
}
