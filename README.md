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

// Browser: get GL context from a canvas
const gl = canvas.getContext("webgl");

// Node: install the `gl` package for headless WebGL
// npm install gl
import createGL from "gl";
const gl = createGL(width, height, { preserveDrawingBuffer: true });

// Build a filter chain and apply it
const result = glFilters(gl)
  .addFilter(brightness({ amount: 0.1 }))
  .addFilter(saturate({ factor: 1.5 }))
  .addFilter(blur())
  .apply(imageData);
// result is { data: Uint8ClampedArray, width, height }
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
