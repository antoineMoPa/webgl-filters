/**
 * Scalar and vec2 uniforms are declared as float ARRAYS and read
 * through a #define.
 *
 * Mesa >= 24 llvmpipe (as hit under headless-gl over GLX) corrupts
 * every non-array uniform when a shader declares more than one:
 * separate floats all read back the first float's value, vec2/vec3
 * components land in rotated slots, and even multiple vec4s collapse
 * into the first one. Float ARRAY uniforms are the one shape delivered
 * intact — any length (including 1), any count per shader, alone or
 * mixed with samplers. So every scalar is declared `float name_arr[1]`
 * and every built-in vec2 as `float name_arr[2]`, aliased back to the
 * plain name so shader bodies stay unchanged.
 */

const ARRAY_SUFFIX = "_asArr";

/** vec2 uniforms the fragment header declares on every program. */
export const BUILTIN_VEC2_UNIFORMS = ["u_resolution", "u_texelSize"] as const;

/** GLSL declaration for a scalar uniform, carried as a 1-element array. */
export function scalarUniformDeclaration(name: string): string {
  return `uniform float ${name}${ARRAY_SUFFIX}[1];\n#define ${name} ${name}${ARRAY_SUFFIX}[0]`;
}

/** GLSL declaration for a vec2 uniform, carried as a 2-element array. */
export function vec2UniformDeclaration(name: string): string {
  return (
    `uniform float ${name}${ARRAY_SUFFIX}[2];\n` +
    `#define ${name} vec2(${name}${ARRAY_SUFFIX}[0], ${name}${ARRAY_SUFFIX}[1])`
  );
}

/**
 * GLSL statement referencing every declared uniform so none can be
 * eliminated. Mesa >= 24 llvmpipe scrambles the surviving uniform
 * locations whenever the linker eliminates an unused uniform. The sum
 * is scaled by 1e-7 — far below 8-bit output quantization (1/255), so
 * rendered pixels are unaffected. Built from the filter's own uniforms
 * record plus the header builtins.
 */
export function uniformKeepAliveStatement(
  uniforms: Record<string, number | number[]>,
): string {
  const terms = BUILTIN_VEC2_UNIFORMS.map(name => `${name}${ARRAY_SUFFIX}[0]`);
  for (const [name, value] of Object.entries(uniforms)) {
    terms.push(typeof value === "number" ? `${name}${ARRAY_SUFFIX}[0]` : `${name}[0]`);
  }
  return `gl_FragColor.a += (${terms.join(" + ")}) * 0.0000001;`;
}

// Scratch buffers so per-pass uniform writes never allocate — these
// setters run on every draw, including per-frame video/animation paths.
const scratch1 = new Float32Array(1);
const scratch2 = new Float32Array(2);

/** Set an array-carried vec2 uniform (e.g. u_resolution, u_texelSize). */
export function setVec2Uniform(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  name: string,
  x: number,
  y: number,
): void {
  const location = gl.getUniformLocation(program, `${name}${ARRAY_SUFFIX}[0]`);
  if (location === null) return;
  scratch2[0] = x;
  scratch2[1] = y;
  gl.uniform1fv(location, scratch2);
}

/**
 * Set a filter's uniforms. Numbers target the array-carried declaration
 * (falling back to a plain float uniform for hand-written filter
 * sources that declare their own), arrays stay float arrays.
 */
export function setFilterUniforms(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  uniforms: Record<string, number | number[]>,
): void {
  for (const [name, value] of Object.entries(uniforms)) {
    if (typeof value === "number") {
      const arrayCarriedLocation = gl.getUniformLocation(program, `${name}${ARRAY_SUFFIX}[0]`);
      if (arrayCarriedLocation !== null) {
        scratch1[0] = value;
        gl.uniform1fv(arrayCarriedLocation, scratch1);
        continue;
      }
      const location = gl.getUniformLocation(program, name);
      if (location === null) continue;
      gl.uniform1f(location, value);
    } else if (Array.isArray(value)) {
      const arrayLocation =
        gl.getUniformLocation(program, `${name}[0]`) ?? gl.getUniformLocation(program, name);
      if (arrayLocation === null) continue;
      gl.uniform1fv(arrayLocation, new Float32Array(value));
    }
  }
}
