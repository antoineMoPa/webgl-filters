# glFilters

GPU-accelerated image filters using WebGL shaders. Every filter runs as a fragment shader — no CPU pixel loops.

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
| `convolve({ kernel, divisor?, bias? })` | `kernel`: 25-element array | Custom 5×5 convolution |
| `customShader({ source, uniforms? })` | GLSL source + uniforms | User-defined shader |

## Custom Shaders

Write GLSL that runs per-pixel. You get these built-in uniforms for free:

- `u_texture` — input image (sampler2D)
- `v_texCoord` — current pixel's texture coordinate (vec2)
- `u_resolution` — image size in pixels (vec2)
- `u_texelSize` — `1.0 / u_resolution` (vec2)

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

## License

MIT
