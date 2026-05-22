import {
  glFilters,
  applyFilters,
  brightness,
  contrast,
  saturate,
  invert,
  blur,
  sharpen,
  convolve,
  threshold,
  dilate,
  erode,
  alphaUnder,
  sobel,
  customShader,
  loadImage,
} from "../../src/index.js";
import { generateDebugHTML, imageSourceToDataURI } from "../../src/debug.js";
import type { ImageData as FilterImageData, Filter, Kernel5x5 } from "../../src/types.js";

// ─── WebGL context (shared) ──────────────────────────────────────────────
const offscreen = document.createElement("canvas");
const gl = offscreen.getContext("webgl", { preserveDrawingBuffer: true })!;
if (!gl) {
  document.body.innerHTML = "<h1>WebGL not supported in this browser.</h1>";
  throw new Error("No WebGL");
}

(window as unknown as {
  webglFiltersDebugLib: Record<string, unknown>;
}).webglFiltersDebugLib = {
  glFilters,
  applyFilters,
  brightness,
  contrast,
  saturate,
  invert,
  blur,
  sharpen,
  convolve,
  threshold,
  dilate,
  erode,
  alphaUnder,
  sobel,
  customShader,
  loadImage,
};

// ─── Source image ────────────────────────────────────────────────────────
let sourceImage: FilterImageData;
let sourceWidth = 320;
let sourceHeight = 240;

function generateTestPattern(w: number, h: number): FilterImageData {
  // Draw gradient + circles onto a temp canvas, then read pixels
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#1a1a2e");
  grad.addColorStop(0.5, "#e94560");
  grad.addColorStop(1, "#0f3460");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Bordered circles at various sizes for edge-detection visibility
  const circles = [
    { x: w * 0.25, y: h * 0.35, r: Math.min(w, h) * 0.18, fill: "#16213e", stroke: "#e94560" },
    { x: w * 0.65, y: h * 0.3, r: Math.min(w, h) * 0.12, fill: "#e94560", stroke: "#ffffff" },
    { x: w * 0.5, y: h * 0.7, r: Math.min(w, h) * 0.22, fill: "#0f3460", stroke: "#53d8fb" },
    { x: w * 0.82, y: h * 0.65, r: Math.min(w, h) * 0.1, fill: "#ffffff", stroke: "#1a1a2e" },
  ];
  for (const { x, y, r, fill, stroke } of circles) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  const imageData = ctx.getImageData(0, 0, w, h);
  return { data: new Uint8ClampedArray(imageData.data), width: w, height: h };
}

function drawToCanvas(canvas: HTMLCanvasElement, img: FilterImageData) {
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  const imageData = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  ctx.putImageData(imageData, 0, 0);
}

function timed(fn: () => FilterImageData): { result: FilterImageData; ms: number } {
  const t0 = performance.now();
  const result = fn();
  const ms = performance.now() - t0;
  return { result, ms };
}

// ─── Filter definitions ──────────────────────────────────────────────────
interface FilterDef {
  name: string;
  create: () => Filter;
  controls?: (container: HTMLElement, onChange: () => void) => void;
}

const filterDefs: FilterDef[] = [
  {
    name: "Brightness",
    create() { return brightness({ amount: parseFloat((document.getElementById("ctrl-brightness") as HTMLInputElement)?.value ?? "0.1") }); },
    controls(el, onChange) {
      el.innerHTML = `<label>Amount</label><input type="range" id="ctrl-brightness" min="-0.5" max="0.5" step="0.01" value="0.1"><span class="value">0.10</span>`;
      setupSlider(el, onChange);
    },
  },
  {
    name: "Contrast",
    create() { return contrast({ factor: parseFloat((document.getElementById("ctrl-contrast") as HTMLInputElement)?.value ?? "1.5") }); },
    controls(el, onChange) {
      el.innerHTML = `<label>Factor</label><input type="range" id="ctrl-contrast" min="0" max="3" step="0.05" value="1.5"><span class="value">1.50</span>`;
      setupSlider(el, onChange);
    },
  },
  {
    name: "Saturate",
    create() { return saturate({ factor: parseFloat((document.getElementById("ctrl-saturate") as HTMLInputElement)?.value ?? "1.5") }); },
    controls(el, onChange) {
      el.innerHTML = `<label>Factor</label><input type="range" id="ctrl-saturate" min="0" max="3" step="0.05" value="1.5"><span class="value">1.50</span>`;
      setupSlider(el, onChange);
    },
  },
  {
    name: "Invert",
    create() { return invert(); },
  },
  {
    name: "Blur",
    create() {
      const radius = parseFloat((document.getElementById("ctrl-blur-radius") as HTMLInputElement)?.value ?? "2");
      const strength = parseFloat((document.getElementById("ctrl-blur-strength") as HTMLInputElement)?.value ?? "1");
      return blur({ radius, strength });
    },
    controls(el, onChange) {
      el.innerHTML = `
        <label>Radius</label><input type="range" id="ctrl-blur-radius" min="1" max="10" step="1" value="2"><span class="value">2</span>
        <label>Strength</label><input type="range" id="ctrl-blur-strength" min="0" max="1" step="0.05" value="1"><span class="value">1</span>`;
      for (const slider of el.querySelectorAll<HTMLInputElement>("input[type=range]")) {
        const display = slider.nextElementSibling as HTMLElement;
        slider.addEventListener("input", () => {
          display.textContent = slider.value;
          onChange();
        });
      }
    },
  },
  {
    name: "Sharpen (5x5)",
    create() { return sharpen(); },
  },
  {
    name: "Convolve (5x5 custom kernel)",
    create() {
      const inputs = document.querySelectorAll<HTMLInputElement>(".kernel-input");
      const kernel = Array.from(inputs).map(i => parseFloat(i.value) || 0) as unknown as Kernel5x5;
      const divisor = parseFloat((document.getElementById("ctrl-convolve-divisor") as HTMLInputElement)?.value ?? "1");
      const bias = parseFloat((document.getElementById("ctrl-convolve-bias") as HTMLInputElement)?.value ?? "0");
      return convolve({ kernel, divisor, bias });
    },
    controls(el, onChange) {
      const emboss = [
        0,  0,  0,  0, 0,
        0,  0, -1,  0, 0,
        0, -1,  1,  1, 0,
        0,  0,  1,  0, 0,
        0,  0,  0,  0, 0,
      ];
      const grid = document.createElement("div");
      grid.className = "kernel-grid";
      emboss.forEach(v => {
        const inp = document.createElement("input");
        inp.type = "number";
        inp.className = "kernel-input";
        inp.value = String(v);
        inp.addEventListener("input", onChange);
        grid.appendChild(inp);
      });
      el.appendChild(grid);
      const params = document.createElement("div");
      params.className = "convolve-params";
      params.innerHTML = `
        <label>Divisor</label><input type="number" id="ctrl-convolve-divisor" step="0.1" value="1">
        <label>Bias</label><input type="number" id="ctrl-convolve-bias" step="0.01" value="0">`;
      for (const input of params.querySelectorAll<HTMLInputElement>("input")) {
        input.addEventListener("input", onChange);
      }
      el.appendChild(params);
    },
  },
  {
    name: "Custom Shader",
    create() {
      const src = (document.getElementById("custom-glsl") as HTMLTextAreaElement)?.value ?? "";
      return customShader({ source: src });
    },
    controls(el, onChange) {
      const ta = document.createElement("textarea");
      ta.id = "custom-glsl";
      ta.value = `// Sepia tone\nvec4 color = texture2D(u_texture, v_texCoord);\nfloat grey = dot(color.rgb, vec3(0.299, 0.587, 0.114));\ngl_FragColor = vec4(\n  clamp(grey + 0.2, 0.0, 1.0),\n  clamp(grey + 0.05, 0.0, 1.0),\n  clamp(grey - 0.15, 0.0, 1.0),\n  color.a\n);`;
      ta.addEventListener("input", onChange);
      el.appendChild(ta);
    },
  },
];

function setupSlider(container: HTMLElement, onChange: () => void) {
  const slider = container.querySelector("input[type=range]") as HTMLInputElement;
  const display = container.querySelector(".value") as HTMLElement;
  slider.addEventListener("input", () => {
    display.textContent = parseFloat(slider.value).toFixed(2);
    onChange();
  });
}

// ─── Debug helper ─────────────────────────────────────────────────────────
function openDebug(filters: Filter[]) {
  const dataURI = imageSourceToDataURI(sourceImage);
  const html = generateDebugHTML(filters, dataURI);
  const blob = new Blob([html], { type: "text/html" });
  window.open(URL.createObjectURL(blob), "_blank");
}

// ─── Build the UI ────────────────────────────────────────────────────────
const grid = document.getElementById("filter-grid")!;
const cards: { def: FilterDef; canvas: HTMLCanvasElement; timing: HTMLElement }[] = [];

for (const def of filterDefs) {
  const card = document.createElement("div");
  card.className = "card";

  const header = document.createElement("div");
  header.className = "card-header";
  const h3 = document.createElement("h3");
  h3.textContent = def.name;
  header.appendChild(h3);
  const debugBtn = document.createElement("button");
  debugBtn.className = "debug-btn";
  debugBtn.textContent = "Debug";
  debugBtn.addEventListener("click", () => openDebug([def.create()]));
  header.appendChild(debugBtn);
  card.appendChild(header);

  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  card.appendChild(canvas);

  const timing = document.createElement("div");
  timing.className = "timing";
  card.appendChild(timing);

  const entry = { def, canvas, timing };
  cards.push(entry);

  if (def.controls) {
    const controlsDiv = document.createElement("div");
    controlsDiv.className = "controls";
    def.controls(controlsDiv, () => renderCard(entry));
    card.appendChild(controlsDiv);
  }

  grid.appendChild(card);
}

// ─── Pipeline UI ─────────────────────────────────────────────────────────
const pipelineChecks = document.getElementById("pipeline-checks")!;
const pipelineCanvas = document.getElementById("pipeline-canvas") as HTMLCanvasElement;
const pipelineTiming = document.getElementById("pipeline-timing")!;

document.getElementById("pipeline-debug-btn")!.addEventListener("click", () => openDebug(getPipelineFilters()));

const simpleFilters = ["Brightness", "Contrast", "Saturate", "Invert", "Blur", "Sharpen (5x5)"];
for (const name of simpleFilters) {
  const label = document.createElement("label");
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.dataset.filter = name;
  cb.addEventListener("change", renderPipeline);
  label.appendChild(cb);
  label.append(" " + name);
  pipelineChecks.appendChild(label);
}

function getPipelineFilters(): Filter[] {
  const checked = pipelineChecks.querySelectorAll<HTMLInputElement>("input:checked");
  const filters: Filter[] = [];
  for (const cb of checked) {
    const def = filterDefs.find(d => d.name === cb.dataset.filter);
    if (def) filters.push(def.create());
  }
  return filters;
}

function renderPipeline() {
  const filters = getPipelineFilters();
  const p = glFilters(gl);
  for (const f of filters) p.addFilter(f);
  const { result, ms } = timed(() => p.apply(sourceImage));
  drawToCanvas(pipelineCanvas, result);
  pipelineTiming.textContent = `${ms.toFixed(2)} ms (${filters.length} filter${filters.length !== 1 ? "s" : ""})`;
}

// ─── Multi-input custom shader UI ────────────────────────────────────────
const multiMode = document.getElementById("multi-mode") as HTMLSelectElement;
const multiAmount = document.getElementById("multi-amount") as HTMLInputElement;
const multiAmountValue = document.getElementById("multi-amount-value")!;
const multiPrimaryCanvas = document.getElementById("multi-primary-canvas") as HTMLCanvasElement;
const multiExtraCanvas = document.getElementById("multi-extra-canvas") as HTMLCanvasElement;
const multiOutputCanvas = document.getElementById("multi-output-canvas") as HTMLCanvasElement;
const multiExtraLabel = document.getElementById("multi-extra-label")!;
const multiTiming = document.getElementById("multi-timing")!;
let multiRenderId = 0;

document.getElementById("multi-debug-btn")!.addEventListener("click", () => {
  drawToCanvas(multiPrimaryCanvas, sourceImage);
  drawMultiExtraTexture(multiExtraCanvas);
  void canvasToObjectURL(multiExtraCanvas).then(url => {
    openDebug([createMultiInputFilter(url)]);
  });
});
multiMode.addEventListener("change", () => { void renderMultiInput(); });
multiAmount.addEventListener("input", () => {
  multiAmountValue.textContent = Number(multiAmount.value).toFixed(2);
  void renderMultiInput();
});

function createMultiInputFilter(extraTexture: HTMLCanvasElement | string = multiExtraCanvas): Filter {
  const amount = Number(multiAmount.value);

  if (multiMode.value === "imageThroughMatte") {
    return customShader({
      source: `
        vec4 image = texture2D(u_texture, v_texCoord);
        vec4 matte = texture2D(u_matte, v_texCoord);
        float alpha = dot(matte.rgb, vec3(0.299, 0.587, 0.114)) * u_amount;
        gl_FragColor = vec4(image.rgb, image.a * alpha);
      `,
      uniforms: { u_amount: amount },
      textures: { u_matte: extraTexture },
    });
  }

  if (multiMode.value === "lightShadowBlend") {
    return customShader({
      source: `
        vec4 base = texture2D(u_texture, v_texCoord);
        vec4 overlay = texture2D(u_overlay, v_texCoord);
        vec3 screen = 1.0 - (1.0 - overlay.rgb * u_amount) * (1.0 - base.rgb);
        vec3 blended = screen * overlay.rgb;
        vec3 rgb = blended * overlay.a + base.rgb * (1.0 - overlay.a);
        gl_FragColor = vec4(rgb, base.a);
      `,
      uniforms: { u_amount: amount },
      textures: { u_overlay: extraTexture },
    });
  }

  return customShader({
    source: `
      vec4 base = texture2D(u_texture, v_texCoord);
      vec4 overlay = texture2D(u_overlay, v_texCoord);
      float overlayAlpha = overlay.a * u_amount;
      vec3 rgb = overlay.rgb * overlayAlpha + base.rgb * (1.0 - overlayAlpha);
      float alpha = overlayAlpha + base.a * (1.0 - overlayAlpha);
      gl_FragColor = vec4(rgb, alpha);
    `,
    uniforms: { u_amount: amount },
    textures: { u_overlay: extraTexture },
  });
}

function drawMultiExtraTexture(canvas: HTMLCanvasElement) {
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (multiMode.value === "imageThroughMatte") {
    multiExtraLabel.textContent = "Matte canvas texture";
    const grad = ctx.createRadialGradient(
      sourceWidth * 0.48,
      sourceHeight * 0.48,
      sourceHeight * 0.08,
      sourceWidth * 0.5,
      sourceHeight * 0.5,
      sourceHeight * 0.52,
    );
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.62, "#d0d0d0");
    grad.addColorStop(1, "#000000");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, sourceWidth, sourceHeight);
    return;
  }

  multiExtraLabel.textContent = "Overlay canvas texture";
  const overlay = ctx.createLinearGradient(0, 0, sourceWidth, sourceHeight);
  overlay.addColorStop(0, "rgba(255,255,255,0.9)");
  overlay.addColorStop(0.45, "rgba(88,166,255,0.55)");
  overlay.addColorStop(1, "rgba(248,81,73,0.8)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, sourceWidth, sourceHeight);

  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.ellipse(sourceWidth * 0.58, sourceHeight * 0.5, sourceWidth * 0.34, sourceHeight * 0.26, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

function canvasToObjectURL(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("Failed to create texture blob"));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}

async function renderMultiInput() {
  const renderId = ++multiRenderId;
  drawToCanvas(multiPrimaryCanvas, sourceImage);
  drawMultiExtraTexture(multiExtraCanvas);

  const chain = glFilters(gl).addFilter(createMultiInputFilter());
  const t0 = performance.now();

  try {
    await chain.applyToCanvasAsync(multiPrimaryCanvas, multiOutputCanvas);
    if (renderId !== multiRenderId) return;
    multiTiming.textContent = `${(performance.now() - t0).toFixed(2)} ms`;
    multiTiming.style.color = "#3fb950";
  } catch (e) {
    if (renderId !== multiRenderId) return;
    multiTiming.textContent = `Error: ${(e as Error).message}`;
    multiTiming.style.color = "#f85149";
  }
}

// ─── Render ──────────────────────────────────────────────────────────────
function renderCard(entry: (typeof cards)[0]) {
  try {
    const filter = entry.def.create();
    const { result, ms } = timed(() => applyFilters(gl, sourceImage, [filter]));
    drawToCanvas(entry.canvas, result);
    entry.timing.textContent = `${ms.toFixed(2)} ms`;
    entry.timing.style.color = "#3fb950";
  } catch (e) {
    entry.timing.textContent = `Error: ${(e as Error).message}`;
    entry.timing.style.color = "#f85149";
  }
}

function renderAll() {
  for (const entry of cards) renderCard(entry);
  renderPipeline();
  void renderMultiInput();
}

// ─── Image loading ───────────────────────────────────────────────────────
function loadFromFile(src: string | File) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  img.onload = () => {
    const maxDim = 512;
    let w = img.width;
    let h = img.height;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = w;
    tmpCanvas.height = h;
    const ctx = tmpCanvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    sourceImage = { data: new Uint8ClampedArray(imageData.data), width: w, height: h };
    sourceWidth = w;
    sourceHeight = h;
    if (typeof src !== "string") URL.revokeObjectURL(url);
    renderAll();
  };
  img.src = url;
}

// URL loading — demonstrates loadImage() + apply(canvas)
const urlInput = document.getElementById("url-input") as HTMLInputElement;
const urlBtn = document.getElementById("url-load-btn") as HTMLButtonElement;
if (urlBtn) {
  urlBtn.addEventListener("click", async () => {
    const url = urlInput?.value.trim();
    if (!url) return;
    try {
      const img = await loadImage(url);
      const maxDim = 512;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = w;
      tmpCanvas.height = h;
      tmpCanvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      // Demonstrate: apply() now accepts a canvas directly (no getImageData needed)
      sourceImage = glFilters(gl).apply(tmpCanvas);
      sourceWidth = sourceImage.width;
      sourceHeight = sourceImage.height;
      renderAll();
    } catch (e) {
      alert(`Failed to load image: ${(e as Error).message}`);
    }
  });
}

// Drag & drop / file input
const dropZone = document.getElementById("drop-zone")!;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer?.files[0];
  if (file) loadFromFile(file);
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) loadFromFile(file);
});

// Start with test pattern
sourceImage = generateTestPattern(sourceWidth, sourceHeight);
renderAll();
