import {
  createFilterContext,
  brightness,
  contrast,
  saturate,
  invert,
  blur,
  sharpen,
  convolve,
  customShader,
} from "../../src/index.js";
import type { FilterContext } from "../../src/index.js";
import type { Filter, Kernel5x5 } from "../../src/types.js";

// ─── Elements ────────────────────────────────────────────────────────────
const video = document.getElementById("source-video") as HTMLVideoElement;
const outputContainer = document.getElementById("output-container")!;
const btnWebcam = document.getElementById("btn-webcam") as HTMLButtonElement;
const btnUpload = document.getElementById("btn-upload") as HTMLButtonElement;
const btnStop = document.getElementById("btn-stop") as HTMLButtonElement;
const btnApply = document.getElementById("btn-apply") as HTMLButtonElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const filterChecks = document.getElementById("filter-checks")!;
const filterSliders = document.getElementById("filter-sliders")!;
const customShaderSection = document.getElementById("custom-shader-section")!;
const convolveSection = document.getElementById("convolve-section")!;
const kernelGrid = document.getElementById("kernel-grid")!;
const statsEl = document.getElementById("stats")!;

// ─── Filter definitions ──────────────────────────────────────────────────
interface FilterDef {
  name: string;
  id: string;
  create: () => Filter;
  sliders?: { label: string; id: string; min: number; max: number; step: number; value: number }[];
}

const filterDefs: FilterDef[] = [
  {
    name: "Brightness", id: "brightness",
    create: () => brightness({ amount: sliderVal("brightness-amount") }),
    sliders: [{ label: "Amount", id: "brightness-amount", min: -0.5, max: 0.5, step: 0.01, value: 0.1 }],
  },
  {
    name: "Contrast", id: "contrast",
    create: () => contrast({ factor: sliderVal("contrast-factor") }),
    sliders: [{ label: "Factor", id: "contrast-factor", min: 0, max: 3, step: 0.05, value: 1.5 }],
  },
  {
    name: "Saturate", id: "saturate",
    create: () => saturate({ factor: sliderVal("saturate-factor") }),
    sliders: [{ label: "Factor", id: "saturate-factor", min: 0, max: 3, step: 0.05, value: 1.5 }],
  },
  { name: "Invert", id: "invert", create: () => invert() },
  {
    name: "Blur", id: "blur",
    create: () => blur({ radius: sliderVal("blur-radius"), strength: sliderVal("blur-strength") }),
    sliders: [
      { label: "Radius", id: "blur-radius", min: 1, max: 10, step: 1, value: 2 },
      { label: "Strength", id: "blur-strength", min: 0, max: 1, step: 0.05, value: 1 },
    ],
  },
  { name: "Sharpen", id: "sharpen", create: () => sharpen() },
  {
    name: "Convolve (5x5)", id: "convolve",
    create: () => {
      const inputs = document.querySelectorAll<HTMLInputElement>(".kernel-input");
      const kernel = Array.from(inputs).map(i => parseFloat(i.value) || 0) as unknown as Kernel5x5;
      return convolve({ kernel });
    },
  },
  {
    name: "Custom Shader", id: "custom",
    create: () => {
      const src = (document.getElementById("custom-glsl") as HTMLTextAreaElement).value;
      return customShader({ source: src });
    },
  },
];

function sliderVal(id: string): number {
  return parseFloat((document.getElementById(`slider-${id}`) as HTMLInputElement).value);
}

// ─── Build filter UI ─────────────────────────────────────────────────────
for (const def of filterDefs) {
  const label = document.createElement("label");
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.dataset.filter = def.id;
  cb.addEventListener("change", () => {
    updateSliderVisibility();
  });
  label.appendChild(cb);
  label.append(` ${def.name}`);
  filterChecks.appendChild(label);
}

function buildSliders() {
  filterSliders.innerHTML = "";
  for (const def of filterDefs) {
    if (!def.sliders) continue;
    const container = document.createElement("div");
    container.dataset.filterSliders = def.id;
    container.style.display = "none";
    for (const s of def.sliders) {
      const row = document.createElement("div");
      row.className = "slider-row";
      row.innerHTML = `<label>${s.label}</label><input type="range" id="slider-${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}"><span class="value">${s.value}</span>`;
      const input = row.querySelector("input")!;
      const display = row.querySelector(".value")!;
      input.addEventListener("input", () => {
        display.textContent = parseFloat(input.value).toFixed(2);
      });
      container.appendChild(row);
    }
    filterSliders.appendChild(container);
  }
}
buildSliders();

// Kernel grid for convolve (emboss preset)
const embossKernel = [
  0,  0,  0,  0, 0,
  0,  0, -1,  0, 0,
  0, -1,  1,  1, 0,
  0,  0,  1,  0, 0,
  0,  0,  0,  0, 0,
];
for (const v of embossKernel) {
  const inp = document.createElement("input");
  inp.type = "number";
  inp.className = "kernel-input";
  inp.value = String(v);
  kernelGrid.appendChild(inp);
}

function updateSliderVisibility() {
  const checked = new Set(
    Array.from(filterChecks.querySelectorAll<HTMLInputElement>("input:checked")).map(cb => cb.dataset.filter)
  );
  for (const el of filterSliders.querySelectorAll<HTMLElement>("[data-filter-sliders]")) {
    el.style.display = checked.has(el.dataset.filterSliders!) ? "block" : "none";
  }
  convolveSection.style.display = checked.has("convolve") ? "block" : "none";
  customShaderSection.style.display = checked.has("custom") ? "block" : "none";
}

// ─── State ───────────────────────────────────────────────────────────────
let currentContext: FilterContext | null = null;
let outputCanvas: HTMLCanvasElement | null = null;
let mediaStream: MediaStream | null = null;
let frameCount = 0;
let fpsInterval: number | null = null;
let animationFrameId: number | null = null;

function getSelectedFilters(): Filter[] {
  const filters: Filter[] = [];
  const checked = filterChecks.querySelectorAll<HTMLInputElement>("input:checked");
  for (const cb of checked) {
    const def = filterDefs.find(d => d.id === cb.dataset.filter);
    if (def) filters.push(def.create());
  }
  return filters;
}

function applyFiltersToVideo() {
  // Clean up previous
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (currentContext) {
    currentContext.dispose();
    currentContext = null;
  }
  if (outputCanvas) {
    outputCanvas.remove();
    outputCanvas = null;
  }

  const filters = getSelectedFilters();
  outputCanvas = document.createElement("canvas");
  const gl = outputCanvas.getContext("webgl", { preserveDrawingBuffer: false });
  if (!gl) throw new Error("Failed to create WebGL context for video");
  currentContext = createFilterContext(gl);
  outputCanvas.style.width = "100%";
  outputCanvas.style.maxWidth = "640px";
  outputCanvas.style.borderRadius = "6px";
  outputCanvas.style.background = "#000";
  outputContainer.innerHTML = "";
  outputContainer.appendChild(outputCanvas);

  statsEl.textContent = `${filters.length} filter${filters.length !== 1 ? "s" : ""} active`;

  const renderFrame = () => {
    if (!currentContext || !outputCanvas || video.paused || video.ended) return;
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      let output = null;
      try {
        output = currentContext.run(filters, video);
        currentContext.present(output, outputCanvas);
        frameCount++;
      } catch (err) {
        statsEl.textContent = `Render error: ${(err as Error).message}`;
        return;
      } finally {
        if (output) currentContext.release(output);
      }
    }
    animationFrameId = requestAnimationFrame(renderFrame);
  };
  animationFrameId = requestAnimationFrame(renderFrame);

  // FPS counter
  frameCount = 0;
  if (fpsInterval) clearInterval(fpsInterval);
  fpsInterval = window.setInterval(() => {
    statsEl.textContent = `${filters.length} filter${filters.length !== 1 ? "s" : ""} active — ${frameCount} fps, GPU-resident`;
    frameCount = 0;
  }, 1000);
}

// ─── Video sources ───────────────────────────────────────────────────────
async function startWebcam() {
  stopVideo();
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    video.srcObject = mediaStream;
    await video.play();
    btnStop.disabled = false;
    btnWebcam.classList.add("active");
    applyFiltersToVideo();
  } catch (err) {
    statsEl.textContent = `Webcam error: ${(err as Error).message}`;
  }
}

function loadVideoFile(file: File) {
  stopVideo();
  const url = URL.createObjectURL(file);
  video.src = url;
  video.loop = true;
  video.onloadeddata = () => {
    video.play();
    btnStop.disabled = false;
    btnUpload.classList.add("active");
    applyFiltersToVideo();
  };
}

function stopVideo() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (currentContext) {
    currentContext.dispose();
    currentContext = null;
  }
  if (outputCanvas) {
    outputCanvas.remove();
    outputCanvas = null;
  }
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) track.stop();
    mediaStream = null;
  }
  if (fpsInterval) {
    clearInterval(fpsInterval);
    fpsInterval = null;
  }
  video.pause();
  video.srcObject = null;
  video.removeAttribute("src");
  btnStop.disabled = true;
  btnWebcam.classList.remove("active");
  btnUpload.classList.remove("active");
  outputContainer.innerHTML = "";
  statsEl.textContent = "";
}

// ─── Event listeners ─────────────────────────────────────────────────────
btnWebcam.addEventListener("click", startWebcam);
btnUpload.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) loadVideoFile(file);
});
btnStop.addEventListener("click", stopVideo);
btnApply.addEventListener("click", () => {
  if (!video.paused) applyFiltersToVideo();
});
