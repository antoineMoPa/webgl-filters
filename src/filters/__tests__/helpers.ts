import createGL from "gl";
import { afterAll } from "vitest";
import type { ImageData } from "../../types.js";

type DestroyContextExtension = { destroy(): void };

const contexts = new Set<WebGLRenderingContext>();

/** Create a headless WebGL context for testing. */
export function createContext(width: number = 64, height: number = 64): WebGLRenderingContext {
  const glContext = createGL(width, height, { preserveDrawingBuffer: true });
  if (!glContext) throw new Error("Failed to create headless GL context");
  const context = glContext as unknown as WebGLRenderingContext;
  contexts.add(context);
  return context;
}

afterAll(() => {
  for (const gl of contexts) {
    const getExtension = gl.getExtension as unknown as (extensionName: "STACKGL_destroy_context") => DestroyContextExtension | null;
    getExtension("STACKGL_destroy_context")?.destroy();
  }
  contexts.clear();
});

/** Create a solid-color test image. */
export function solidImage(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a: number = 255,
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { data, width, height };
}

/** Read pixel at (x, y) from image as [r, g, b, a]. */
export function pixel(img: ImageData, x: number, y: number = 0): [number, number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}
