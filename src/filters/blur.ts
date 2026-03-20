import type { Filter } from "../types.js";

export interface BlurParams {
  /** Blur radius in pixels. Controls kernel size: (2r+1)×(2r+1). Default 2. */
  radius?: number;
  /** Blur strength from 0 (no blur) to 1 (full blur). Default 1. */
  strength?: number;
}

/** Build a 1D Gaussian weight array for the given radius. */
function gaussianWeights(radius: number): number[] {
  const sigma = radius / 2;
  const weights: number[] = [];
  for (let i = -radius; i <= radius; i++) {
    weights.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  }
  return weights;
}

/** Generate a blur fragment shader for an arbitrary radius and strength. */
function blurShader(radius: number, strength: number): string {
  const weights1d = gaussianWeights(radius);

  // Build 2D kernel from outer product of 1D weights
  const lines: string[] = [];
  let kernelSum = 0;
  for (let ky = -radius; ky <= radius; ky++) {
    for (let kx = -radius; kx <= radius; kx++) {
      const w = weights1d[ky + radius] * weights1d[kx + radius];
      if (w < 1e-6) continue;
      kernelSum += w;
      lines.push(
        `  sum += texture2D(u_texture, v_texCoord + vec2(${kx}.0, ${ky}.0) * u_texelSize) * ${w.toFixed(6)};`
      );
    }
  }

  return `
void main() {
  vec4 original = texture2D(u_texture, v_texCoord);
  vec4 sum = vec4(0.0);
${lines.join("\n")}
  vec4 blurred = sum / ${kernelSum.toFixed(6)};
  vec4 color = mix(original, blurred, ${strength.toFixed(6)});
  color.a = original.a;
  gl_FragColor = clamp(color, 0.0, 1.0);
}
`;
}

/**
 * Applies a Gaussian blur.
 *
 * `radius` controls the kernel size — radius 2 gives a 5×5 kernel (default),
 * radius 4 gives 9×9, etc.
 *
 * `strength` controls how much blur is applied — 0 leaves the image unchanged,
 * 1 applies the full blur (default).
 */
export function blur(params: BlurParams = {}): Filter {
  const { radius = 2, strength = 1 } = params;
  const r = Math.max(1, Math.round(radius));
  const s = Math.max(0, Math.min(1, strength));

  return { fragmentSource: blurShader(r, s), uniforms: {} };
}
