import type { Filter, ImageData } from "./types.js";

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_HEADER = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_texelSize;
varying vec2 v_texCoord;
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, fragmentSource: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_HEADER + fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

function createTexture(gl: WebGLRenderingContext, width: number, height: number, data?: Uint8ClampedArray): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("Failed to create texture");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data ?? null);
  return tex;
}

interface FramebufferTarget {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
}

function createFramebufferTarget(gl: WebGLRenderingContext, width: number, height: number): FramebufferTarget {
  const texture = createTexture(gl, width, height);
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error("Failed to create framebuffer");
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { framebuffer, texture };
}

/**
 * Applies a list of filters to an image using WebGL.
 * Each filter is a GPU shader pass — no CPU pixel loops.
 */
export function applyFilters(
  gl: WebGLRenderingContext,
  input: ImageData,
  filters: Filter[],
): ImageData {
  const { width, height } = input;

  // Fullscreen quad (two triangles)
  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

  // Upload source image as texture
  const sourceTexture = createTexture(gl, width, height, input.data);

  // Ping-pong framebuffers
  const targets = [
    createFramebufferTarget(gl, width, height),
    createFramebufferTarget(gl, width, height),
  ];

  gl.viewport(0, 0, width, height);

  let readIndex = -1; // -1 means source texture

  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i];
    const writeIndex = i % 2;
    const inputTexture = readIndex === -1 ? sourceTexture : targets[readIndex].texture;

    const program = createProgram(gl, filter.fragmentSource);
    gl.useProgram(program);

    // Bind quad
    const aPosition = gl.getAttribLocation(program, "a_position");
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    // Bind input texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTexture);
    gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);

    // Built-in uniforms
    gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), width, height);
    gl.uniform2f(gl.getUniformLocation(program, "u_texelSize"), 1 / width, 1 / height);

    // Filter-specific uniforms
    for (const [name, value] of Object.entries(filter.uniforms)) {
      const loc = gl.getUniformLocation(program, name);
      if (loc === null) continue;
      if (typeof value === "number") {
        gl.uniform1f(loc, value);
      } else if (Array.isArray(value)) {
        gl.uniform1fv(loc, new Float32Array(value));
      }
    }

    // Render to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[writeIndex].framebuffer);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.deleteProgram(program);
    readIndex = writeIndex;
  }

  // Read result — use Uint8Array for readPixels (headless-gl compat), then copy
  const rawOutput = new Uint8Array(width * height * 4);

  if (filters.length === 0) {
    // No filters — just read back the source
    const passthrough = createProgram(gl, `
      void main() {
        gl_FragColor = texture2D(u_texture, v_texCoord);
      }
    `);
    gl.useProgram(passthrough);
    const aPosition = gl.getAttribLocation(passthrough, "a_position");
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(gl.getUniformLocation(passthrough, "u_texture"), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[0].framebuffer);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.deleteProgram(passthrough);
    readIndex = 0;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, targets[readIndex].framebuffer);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rawOutput);

  // Cleanup
  gl.deleteTexture(sourceTexture);
  gl.deleteTexture(targets[0].texture);
  gl.deleteTexture(targets[1].texture);
  gl.deleteFramebuffer(targets[0].framebuffer);
  gl.deleteFramebuffer(targets[1].framebuffer);
  gl.deleteBuffer(quadBuffer);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { data: new Uint8ClampedArray(rawOutput.buffer), width, height };
}
