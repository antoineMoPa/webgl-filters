import type { Filter, ImageSource } from "./types.js";

/**
 * Convert an ImageSource to a data URI by drawing it onto an offscreen canvas.
 */
export function imageSourceToDataURI(source: ImageSource): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to create 2d context");

  if ("data" in source && source.data instanceof Uint8ClampedArray) {
    // ImageData
    canvas.width = source.width;
    canvas.height = source.height;
    const id = new globalThis.ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
    ctx.putImageData(id, 0, 0);
  } else {
    // HTMLImageElement, HTMLCanvasElement, ImageBitmap
    const el = source as HTMLImageElement | HTMLCanvasElement | ImageBitmap;
    canvas.width = el.width;
    canvas.height = el.height;
    ctx.drawImage(el as CanvasImageSource, 0, 0);
  }

  return canvas.toDataURL("image/png");
}

/**
 * Generate initial editable JS code that uses the high-level filter API.
 * Uses _debugLabel metadata when available, falls back to raw filter objects.
 */
function generateInitialCode(filters: Filter[]): string {
  const lines: string[] = [];
  lines.push("const chain = glFilters();");

  for (const f of filters) {
    if (f._debugLabel) {
      lines.push(`chain.addFilter(${f._debugLabel});`);
    } else {
      // Fallback for filters without debug labels
      const src = f.fragmentSource.trim();
      const uniformsStr = Object.keys(f.uniforms).length > 0
        ? JSON.stringify(f.uniforms)
        : "{}";
      lines.push(`chain.addFilter({ fragmentSource: \`${src}\`, uniforms: ${uniformsStr} });`);
    }
  }

  lines.push("return chain;");
  return lines.join("\n");
}

/**
 * Generate a self-contained HTML debug page that visualizes each filter step.
 */
export function generateDebugHTML(
  filters: Filter[],
  imageDataURI: string,
): string {
  const initialCode = generateInitialCode(filters);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>webgl-filters debug</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0; display: flex; height: 100vh; }
  #main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .header-bar { padding: 8px 16px; background: #0f3460; font-size: 13px; color: #888; border-bottom: 1px solid #333; }
  #steps { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-wrap: wrap; gap: 16px; align-content: flex-start; }
  #sidebar { width: 480px; border-left: 1px solid #333; display: flex; flex-direction: column; background: #16213e; }
  .sidebar-section { padding: 12px 16px; }
  .sidebar-section h3 { margin-bottom: 8px; color: #4cc9f0; font-size: 13px; }
  #code-editor { flex: 1; display: flex; flex-direction: column; border-bottom: 1px solid #333; }
  #code-editor textarea {
    flex: 1; width: 100%; background: #0a0e1a; color: #e0e0e0; border: none; padding: 12px;
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace; font-size: 12px;
    resize: none; outline: none; tab-size: 2; line-height: 1.5;
  }
  #error-bar { padding: 6px 12px; font-size: 11px; color: #f85149; background: #2d1215; display: none; }
  .add-step { border: 2px dashed #30363d; border-radius: 6px; padding: 6px; background: #16213e; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .add-step:hover { border-color: #4cc9f0; }
  .add-step-box { display: flex; align-items: center; justify-content: center; max-width: 300px; max-height: 300px; width: 300px; aspect-ratio: 4/3; }
  .add-step-plus { font-size: 64px; color: #30363d; line-height: 1; user-select: none; }
  .add-step:hover .add-step-plus { color: #4cc9f0; }
  .add-step-label { font-size: 12px; margin-top: 4px; color: #aaa; }
  #filter-menu {
    display: none; flex-basis: 100%; background: #0f3460; border: 1px solid #333; border-radius: 6px;
    padding: 8px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  #filter-menu.open { display: flex; flex-wrap: wrap; gap: 2px; padding: 8px; }
  #filter-menu button {
    background: #16213e; border: 1px solid #333; color: #e0e0e0; border-radius: 4px;
    padding: 6px 12px; font-size: 12px; cursor: pointer; font-family: monospace;
  }
  #filter-menu button:hover { background: #1a3a6e; border-color: #4cc9f0; }
  #shader-panel { max-height: 40%; overflow-y: auto; }
  #shader-panel pre {
    background: #0f3460; padding: 12px; border-radius: 4px; font-size: 11px;
    white-space: pre-wrap; word-break: break-all; overflow-x: auto; margin-bottom: 8px;
  }
  .uniforms { font-size: 11px; color: #aaa; }
  .step { cursor: pointer; border: 2px solid transparent; border-radius: 6px; padding: 6px; background: #16213e; position: relative; }
  .step.active { border-color: #4cc9f0; }
  .step canvas { display: block; max-width: 300px; max-height: 300px; background: #000; }
  .step-label { font-size: 12px; margin-top: 4px; color: #aaa; }
  .step-delete {
    position: absolute; top: 4px; right: 4px; width: 20px; height: 20px;
    background: rgba(200,30,30,0.7); color: #fff; border: none; border-radius: 50%;
    font-size: 13px; line-height: 20px; text-align: center; cursor: pointer;
    opacity: 0; transition: opacity 0.15s;
  }
  .step:hover .step-delete { opacity: 1; }
  .step-delete:hover { background: rgba(240,50,50,0.9); }
</style>
</head>
<body>
<div id="main">
  <div class="header-bar" id="header-bar">webgl-filters debug</div>
  <div id="steps"></div>
</div>
<div id="sidebar">
  <div id="code-editor">
    <div class="sidebar-section" style="padding-bottom:4px;flex:none;">
      <h3>Pipeline Code</h3>
    </div>
    <textarea id="code-input" spellcheck="false">${escapeHTML(initialCode)}</textarea>
    <div id="error-bar"></div>
  </div>
  <div id="shader-panel" class="sidebar-section">
    <h3 id="shader-title">Generated GLSL</h3>
    <pre id="shader-source">Click a step to view its compiled shader.</pre>
    <div class="uniforms" id="shader-uniforms"></div>
  </div>
</div>

<script type="module">
import * as lib from "https://unpkg.com/webgl-filters/dist/index.js";

const FRAGMENT_HEADER = \`precision mediump float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_texelSize;
varying vec2 v_texCoord;\`;

const IMAGE_SRC = ${JSON.stringify(imageDataURI)};

const stepsEl = document.getElementById("steps");
const headerBar = document.getElementById("header-bar");
const codeInput = document.getElementById("code-input");
const errorBar = document.getElementById("error-bar");
const shaderTitleEl = document.getElementById("shader-title");
const shaderSourceEl = document.getElementById("shader-source");
const shaderUniformsEl = document.getElementById("shader-uniforms");

let img;
let currentFilters = [];
let selectedStepIndex = -1;

// Load image, then do initial render
const imgEl = new Image();
imgEl.onload = () => {
  img = imgEl;
  runCode();
};
imgEl.src = IMAGE_SRC;

// Shim glFilters() that collects filters for extraction
function makeChain() {
  const filters = [];
  return {
    addFilter(f) { filters.push(f); return this; },
    _filters: filters,
  };
}

// Evaluate user code — code has access to all filter functions + glFilters
function evalCode(code) {
  const fn = new Function(
    "glFilters",
    "brightness", "contrast", "saturate", "invert", "blur", "sharpen",
    "threshold", "dilate", "erode", "alphaUnder", "convolve", "sobel", "customShader",
    code
  );
  return fn(
    makeChain,
    lib.brightness, lib.contrast, lib.saturate, lib.invert, lib.blur, lib.sharpen,
    lib.threshold, lib.dilate, lib.erode, lib.alphaUnder, lib.convolve, lib.sobel, lib.customShader,
  );
}

function runCode() {
  if (!img) return;
  try {
    const result = evalCode(codeInput.value);
    if (result && result._filters) {
      currentFilters = result._filters;
    } else if (Array.isArray(result)) {
      currentFilters = result;
    } else {
      throw new Error("Code must return a glFilters() chain or a Filter array");
    }
    errorBar.style.display = "none";
    renderSteps();
  } catch (e) {
    errorBar.textContent = e.message;
    errorBar.style.display = "block";
  }
}

function regenerateCode(filters) {
  const lines = ["const chain = glFilters();"];
  for (const f of filters) {
    if (f._debugLabel) {
      lines.push("chain.addFilter(" + f._debugLabel + ");");
    } else {
      const u = Object.keys(f.uniforms).length > 0 ? JSON.stringify(f.uniforms) : "{}";
      lines.push("chain.addFilter({ fragmentSource: \`" + f.fragmentSource.trim() + "\`, uniforms: " + u + " });");
    }
  }
  lines.push("return chain;");
  return lines.join("\\n");
}

function deleteFilter(filterIndex) {
  currentFilters.splice(filterIndex, 1);
  codeInput.value = regenerateCode(currentFilters);
  if (selectedStepIndex > filterIndex) selectedStepIndex--;
  else if (selectedStepIndex === filterIndex + 1) selectedStepIndex = -1;
  runCode();
}

function renderSteps() {
  stepsEl.innerHTML = "";
  headerBar.textContent = "webgl-filters debug \\u2014 " + currentFilters.length + " filter step" + (currentFilters.length !== 1 ? "s" : "");

  // Step 0: input
  addStep(0, "Input", img, null);

  // Steps 1..N
  for (let i = 0; i < currentFilters.length; i++) {
    try {
      const chain = lib.glFilters();
      for (let j = 0; j <= i; j++) chain.addFilter(currentFilters[j]);
      const result = chain.apply(img);
      const c = document.createElement("canvas");
      c.width = result.width;
      c.height = result.height;
      const ctx = c.getContext("2d");
      ctx.putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
      addStep(i + 1, "Step " + (i + 1), c, currentFilters[i]);
    } catch (e) {
      const div = document.createElement("div");
      div.className = "step";
      div.innerHTML = '<div class="step-label" style="color:#f85149;">Step ' + (i + 1) + ": " + e.message + "</div>";
      stepsEl.appendChild(div);
    }
  }

  // "+" card and filter menu
  stepsEl.appendChild(addCard);
  stepsEl.appendChild(filterMenu);
}

function addStep(index, label, source, filter) {
  const div = document.createElement("div");
  div.className = "step" + (index === selectedStepIndex ? " active" : "");

  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext("2d").drawImage(source, 0, 0);
  div.appendChild(canvas);

  // Delete button (only on filter steps, not the input)
  if (index > 0) {
    const del = document.createElement("button");
    del.className = "step-delete";
    del.textContent = "\\u00d7";
    del.title = "Remove this filter";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteFilter(index - 1);
    });
    div.appendChild(del);
  }

  const labelEl = document.createElement("div");
  labelEl.className = "step-label";
  labelEl.textContent = label;
  div.appendChild(labelEl);

  div.addEventListener("click", () => {
    selectedStepIndex = index;
    document.querySelectorAll(".step").forEach(s => s.classList.remove("active"));
    div.classList.add("active");
    if (filter) {
      shaderTitleEl.textContent = label + " \\u2014 Generated GLSL";
      shaderSourceEl.textContent = FRAGMENT_HEADER + "\\n" + filter.fragmentSource;
      const u = Object.entries(filter.uniforms);
      shaderUniformsEl.textContent = u.length > 0
        ? "Uniforms: " + u.map(([k, v]) => k + " = " + JSON.stringify(v)).join(", ")
        : "No custom uniforms";
    } else {
      shaderTitleEl.textContent = "Input";
      shaderSourceEl.textContent = "Original input image (no shader)";
      shaderUniformsEl.textContent = "";
    }
  });

  stepsEl.appendChild(div);
}

// Debounced live update
let timer;
codeInput.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(runCode, 300);
});

// Tab key inserts spaces instead of switching focus
codeInput.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const start = codeInput.selectionStart;
    const end = codeInput.selectionEnd;
    codeInput.value = codeInput.value.substring(0, start) + "  " + codeInput.value.substring(end);
    codeInput.selectionStart = codeInput.selectionEnd = start + 2;
    clearTimeout(timer);
    timer = setTimeout(runCode, 300);
  }
});

// ─── Add Filter card + menu ──────────────────────────────────────────────
const FILTER_SNIPPETS = [
  { label: "brightness",   code: "chain.addFilter(brightness({ amount: 0.1 }));" },
  { label: "contrast",     code: "chain.addFilter(contrast({ factor: 1.5 }));" },
  { label: "saturate",     code: "chain.addFilter(saturate({ factor: 1.5 }));" },
  { label: "invert",       code: "chain.addFilter(invert());" },
  { label: "blur",         code: "chain.addFilter(blur({ radius: 2, strength: 1 }));" },
  { label: "sharpen",      code: "chain.addFilter(sharpen());" },
  { label: "threshold",    code: "chain.addFilter(threshold({ cutoff: 0.5 }));" },
  { label: "dilate",       code: "chain.addFilter(dilate({ radius: 1 }));" },
  { label: "erode",        code: "chain.addFilter(erode({ radius: 1 }));" },
  { label: "sobel",        code: "chain.addFilter(sobel());" },
  { label: "alphaUnder",   code: "chain.addFilter(alphaUnder({ r: 255, g: 255, b: 255 }));" },
  { label: "convolve",     code: "chain.addFilter(convolve({\\n  kernel: [\\n    0, 0, 0, 0, 0,\\n    0, 0,-1, 0, 0,\\n    0,-1, 4,-1, 0,\\n    0, 0,-1, 0, 0,\\n    0, 0, 0, 0, 0,\\n  ]\\n}));" },
  { label: "customShader", code: "chain.addFilter(customShader({\\n  source: \`\\n    vec4 color = texture2D(u_texture, v_texCoord);\\n    gl_FragColor = color;\\n  \`\\n}));" },
];

// Build the "+" card (lives in the steps grid, re-appended on each render)
const addCard = document.createElement("div");
addCard.className = "add-step";
addCard.innerHTML = '<div class="add-step-box"><span class="add-step-plus">+</span></div><div class="add-step-label">Add filter</div>';

const filterMenu = document.createElement("div");
filterMenu.id = "filter-menu";

for (const snippet of FILTER_SNIPPETS) {
  const btn = document.createElement("button");
  btn.textContent = snippet.label;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    insertFilterCode(snippet.code);
    filterMenu.classList.remove("open");
  });
  filterMenu.appendChild(btn);
}

addCard.addEventListener("click", (e) => {
  e.stopPropagation();
  filterMenu.classList.toggle("open");
});

document.addEventListener("click", () => filterMenu.classList.remove("open"));

function insertFilterCode(snippet) {
  const code = codeInput.value;
  const returnIdx = code.lastIndexOf("return chain;");
  if (returnIdx !== -1) {
    codeInput.value = code.slice(0, returnIdx) + snippet + "\\n" + code.slice(returnIdx);
  } else {
    codeInput.value = code + "\\n" + snippet;
  }
  runCode();
  codeInput.scrollTop = codeInput.scrollHeight;
}
<\/script>
</body>
</html>`;
}

function escapeHTML(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
