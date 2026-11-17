# glFilters

GPU-accelerated image filters using WebGL shaders. Every filter runs as a fragment shader.

[API Docs](https://antoinemopa.github.io/webgl-filters/api/)

## Install

```bash
npm install webgl-filters
```

## Usage

```ts
import { glFilters, brightness, saturate, blur, invert, customShader } from "webgl-filters";

// Build a filter chain and apply it to an image
const result = glFilters()
  .addFilter(brightness({ amount: 0.1 }))
  .addFilter(saturate({ factor: 1.5 }))
  .addFilter(blur())
  .apply(imageData);
// result is { data: Uint8ClampedArray, width, height }
```

### Direct image/canvas input

`apply()` accepts `ImageData`, `HTMLImageElement`, `HTMLCanvasElement`, or `ImageBitmap` directly:

```ts
// From an <img> element
const img = document.querySelector("img");
const result = glFilters()
  .addFilter(brightness({ amount: 0.1 }))
  .apply(img);

// From a <canvas> element
const canvas = document.querySelector("canvas");
const result = glFilters()
  .addFilter(blur())
  .apply(canvas);
```

### Filtering from a URL

Use `applyAsync()` to load an image from a URL and apply filters in one step:

```ts
const result = await glFilters()
  .addFilter(brightness({ amount: 0.1 }))
  .addFilter(saturate({ factor: 1.5 }))
  .applyAsync("/photo.jpg");
```

A standalone `loadImage()` helper is also exported:

```ts
import { loadImage } from "webgl-filters";
const img = await loadImage("/photo.jpg");
```

### Video filtering

Use `.compile()` to cache shader programs, then `.apply()` a `<video>` element. This renders to a canvas at full frame rate with no CPU readback. Video processing is not supported server-side, but you can manually apply filters to video frames if desired.

```ts
import { glFilters, brightness, blur } from "webgl-filters";

const filter = glFilters()
  .addFilter(brightness({ amount: 0.1 }))
  .addFilter(blur())
  .compile();

const video = document.getElementById("my-video") as HTMLVideoElement;
const canvas = filter.apply(video); // returns a <canvas> with a rAF loop
document.body.appendChild(canvas);

// Later: stop the loop and release GPU resources
filter.stop();
filter.dispose();
```

`.compile()` also speeds up batch image processing by reusing compiled shaders:

```ts
const filter = glFilters()
  .addFilter(brightness({ amount: 0.1 }))
  .compile();

const r1 = filter.apply(image1);
const r2 = filter.apply(image2);
filter.dispose();
```

### Providing your own WebGL context

The `gl` parameter is optional. If omitted, a canvas and context are created automatically. You can still pass one explicitly:

```ts
const gl = canvas.getContext("webgl");
const result = glFilters(gl)
  .addFilter(brightness({ amount: 0.1 }))
  .apply(imageData);
```

For Node.js (headless), install the `gl` package:

```ts
import createGL from "gl";
const gl = createGL(width, height, { preserveDrawingBuffer: true });
```

### GPU-resident multi-pass pipelines

Use `createFilterContext()` when chaining filter pipelines without reading pixels
back to the CPU between passes. Outputs are `TextureHandle`s that can be reused
as later inputs or custom shader texture uniforms.

```ts
import { createFilterContext, blur, customShader } from "webgl-filters";

const ctx = createFilterContext(gl);

const source = ctx.upload(imageData);
const blurred = ctx.run([blur({ radius: 4 })], source);

const composited = ctx.run([
  customShader({
    source: `
      vec4 base = texture2D(u_texture, v_texCoord);
      vec4 glow = texture2D(u_glow, v_texCoord);
      gl_FragColor = vec4(base.rgb + glow.rgb * 0.35, base.a);
    `,
    textures: { u_glow: blurred },
  }),
], source);

ctx.present(composited, canvas);

ctx.release(source);
ctx.release(blurred);
ctx.release(composited);
ctx.dispose();
```

`FilterContext` methods:

- `ctx.upload(source, { filter?: "linear" | "nearest" })` uploads an image, canvas, bitmap, or video frame to a GPU texture.
- `ctx.run(filters, input)` runs a filter chain and returns a new `TextureHandle` without `readPixels`.
- `ctx.present(handle, canvas)` draws a handle to a canvas with the same Y-flip used by the renderer.
- `ctx.readPixels(handle)` explicitly reads a handle back to `{ data, width, height }` when needed.
- `ctx.release(handle)` frees a texture handle; `ctx.dispose()` frees all remaining handles and cached programs.

Texture handles are tied to the context that created them. Passing a handle from
one `FilterContext` into another context throws instead of silently re-uploading.

## Filters

| Filter | Parameters | Description |
|--------|-----------|-------------|
| `alphaUnder({ r, g, b, a? })` | RGBA 0–255 (a defaults to 255) | Composites image over a solid background color |
| `brightness({ amount })` | `amount`: float (0 = no change) | Adds to RGB channels |
| `contrast({ factor })` | `factor`: float (1.0 = no change) | Scales around midpoint |
| `saturate({ factor })` | `factor`: float (1.0 = no change, 0 = grayscale) | Adjusts color saturation |
| `invert()` | — | Inverts RGB channels |
| `blur({ radius?, strength? })` | `radius`: px (default 2), `strength`: 0–1 (default 1) | Gaussian blur — radius sets kernel size, strength blends with original |
| `threshold({ cutoff? })` | `cutoff`: 0–1 (default 0.5) | Binary black/white based on luminance |
| `dilate({ radius? })` | `radius`: px (default 1) | Morphological dilation — expands bright regions |
| `erode({ radius? })` | `radius`: px (default 1) | Morphological erosion — shrinks bright regions |
| `sharpen()` | — | 5×5 sharpening |
| `convolve({ kernel, divisor?, bias? })` | `kernel`: 25-element array, `divisor`: float (default 1), `bias`: float (default 0) | Custom 5×5 convolution |
| `customShader({ source, uniforms?, textures?, helpers?, precision? })` | GLSL main() body + uniforms + sampler2D inputs, optional helper functions before main() and `"highp"` precision | User-defined shader |

## Custom Shaders

Write GLSL that runs per-pixel. You get these built-in uniforms for free:

- `u_texture` — input image (sampler2D)
- `v_texCoord` — current pixel's texture coordinate (vec2)
- `u_resolution` — image size in pixels (vec2)
- `u_texelSize` — `1.0 / u_resolution` (vec2)

Pass additional image inputs with `textures`. Each key becomes a `sampler2D`
uniform sampled in the same normalized coordinate space as `u_texture`.
Texture values can be URLs with `applyAsync()`, or preloaded
`HTMLImageElement`, `HTMLCanvasElement`, `ImageBitmap`, or `ImageData` values
with either `apply()` or `applyAsync()`.
`TextureHandle` values from `createFilterContext()` are also accepted and bind
directly as GPU textures with no upload.

```ts
const sepia = customShader({
  source: `
    vec4 color = texture2D(u_texture, v_texCoord);
    float grey = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    gl_FragColor = vec4(
      grey + u_tone * 0.2,
      grey + u_tone * 0.05,
      grey - u_tone * 0.15,
      color.a
    );
  `,
  uniforms: { u_tone: 1.0 },
});
```

```ts
const composite = await glFilters()
  .addFilter(customShader({
    source: `
      vec4 base = texture2D(u_texture, v_texCoord);
      vec4 overlay = texture2D(u_overlay, v_texCoord);
      vec3 rgb = overlay.rgb * overlay.a + base.rgb * (1.0 - overlay.a);
      gl_FragColor = vec4(rgb, base.a);
    `,
    textures: { u_overlay: "/overlay.png" },
  }))
  .applyAsync("/base.png");
```

To continue in a canvas workflow without writing a pixel loop:

```ts
await glFilters()
  .addFilter(compositeFilter)
  .applyToCanvasAsync("/base.png", targetCanvas);
```

## License

MIT
