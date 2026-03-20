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
  customShader,
} from "../../src/index.js";
import type { ImageData as FilterImageData, Filter, Kernel5x5 } from "../../src/types.js";

// ─── WebGL context (shared) ──────────────────────────────────────────────
const offscreen = document.createElement("canvas");
const gl = offscreen.getContext("webgl", { preserveDrawingBuffer: true })!;
if (!gl) {
  document.body.innerHTML = "<h1>WebGL not supported in this browser.</h1>";
  throw new Error("No WebGL");
}

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
    name: "Blur (5x5 Gaussian)",
    create() { return blur(); },
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
      return convolve({ kernel });
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

// ─── Build the UI ────────────────────────────────────────────────────────
const grid = document.getElementById("filter-grid")!;
const cards: { def: FilterDef; canvas: HTMLCanvasElement; timing: HTMLElement }[] = [];

for (const def of filterDefs) {
  const card = document.createElement("div");
  card.className = "card";

  const h3 = document.createElement("h3");
  h3.textContent = def.name;
  card.appendChild(h3);

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

const simpleFilters = ["Brightness", "Contrast", "Saturate", "Invert", "Blur (5x5 Gaussian)", "Sharpen (5x5)"];
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

function renderPipeline() {
  const checked = pipelineChecks.querySelectorAll<HTMLInputElement>("input:checked");
  const p = glFilters(gl);
  for (const cb of checked) {
    const def = filterDefs.find(d => d.name === cb.dataset.filter);
    if (def) p.addFilter(def.create());
  }
  const { result, ms } = timed(() => p.apply(sourceImage));
  drawToCanvas(pipelineCanvas, result);
  pipelineTiming.textContent = `${ms.toFixed(2)} ms (${checked.length} filter${checked.length !== 1 ? "s" : ""})`;
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
}

// ─── Image loading ───────────────────────────────────────────────────────
function loadImage(src: string | File) {
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
  if (file) loadImage(file);
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) loadImage(file);
});

// Start with test pattern
sourceImage = generateTestPattern(sourceWidth, sourceHeight);
renderAll();
