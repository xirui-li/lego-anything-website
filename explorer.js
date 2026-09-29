/* Static appendix gallery and recorded metric viewer.
 * Point projection follows metric_explorer's shared camera-frame display mapping.
 * Interaction never evaluates geometry or image similarity.
 */
"use strict";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const CASES = [
  { id: "ex01", name: "Havana rum shop street", setting: "Outdoor", difficulty: "Easy", metrics: true },
  { id: "ex02", name: "NYC East Village", setting: "Outdoor", difficulty: "Easy" },
  { id: "ex03", name: "House bedroom", setting: "Indoor", difficulty: "Easy" },
  { id: "ex04", name: "House kitchen", setting: "Indoor", difficulty: "Hard" },
  { id: "ex05", name: "Office open-plan", setting: "Indoor", difficulty: "Hard", metrics: true },
  { id: "ex06", name: "Warehouse", setting: "Indoor", difficulty: "Medium" },
];
const MODELS = [
  ["gpt56_luna", "GPT-5.6-luna"], ["gpt56_terra", "GPT-5.6-terra"],
  ["gpt56_sol", "GPT-5.6-sol"], ["gpt6_luna", "GPT-6-luna"],
  ["gpt6_sol", "GPT-6-sol"], ["gpt6_astra", "GPT-6-astra"],
];
const state = { tab: "examples", caseId: "ex01", model: "gpt6_astra", detail: "geometry", appearance: "render" };
const cache = new Map();
let metricData = null;
let requestVersion = 0;
const caseInfo = () => CASES.find(item => item.id === state.caseId);
const asset = (id, model = "ref") => `assets/appendix_c_examples/${id}_${model}.webp`;
const metricBase = () => `assets/explorer/${state.caseId}/`;
const percent = value => `${(value * 100).toFixed(1)}%`;

function writeHash() {
  const tail = state.tab === "metrics" ? state.detail : state.model;
  history.replaceState(null, "", `#${state.tab}/${state.caseId}/${tail}`);
}

function selectTabs(attribute, selected) {
  $$(`[${attribute}]`).forEach(button => {
    const active = button.getAttribute(attribute) === selected;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
}

function wireTabs(attribute, onSelect) {
  const buttons = $$(`[${attribute}]`);
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => onSelect(button.getAttribute(attribute)));
    button.addEventListener("keydown", event => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % buttons.length;
      if (event.key === "ArrowLeft") next = (index + buttons.length - 1) % buttons.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = buttons.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      buttons[next].focus();
      onSelect(buttons[next].getAttribute(attribute));
    });
  });
}

function renderCases() {
  const visible = CASES.filter(item => state.tab === "examples" || item.metrics);
  const list = $("#case-list");
  // Preserve focus when updating a pressed state; rebuild only when changing tabs.
  if (list.dataset.tab !== state.tab) {
    list.replaceChildren(...visible.map(item => {
      const button = document.createElement("button");
      button.className = "case-button";
      button.type = "button";
      button.dataset.case = item.id;
      button.setAttribute("aria-label", item.name);
      const image = document.createElement("img");
      image.src = asset(item.id);
      image.alt = "";
      image.width = 256;
      image.height = 144;
      const name = document.createElement("span");
      name.className = "case-name";
      const index = document.createElement("span");
      index.className = "case-index";
      index.textContent = item.id.slice(2);
      name.append(index, item.name);
      button.append(image, name);
      button.addEventListener("click", () => {
        if (state.caseId === item.id) return;
        state.caseId = item.id;
        render();
      });
      return button;
    }));
    list.dataset.tab = state.tab;
  }
  $$("[data-case]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.case === state.caseId)));
  $("#rail-note").textContent = state.tab === "examples"
    ? "Six scenes, six coding agents."
    : "Two recorded cases · GPT-6-astra. All six scenes are available in Examples.";
}

function renderExamples() {
  const item = caseInfo();
  const model = MODELS.find(([id]) => id === state.model)[1];
  $("#example-reference").src = asset(item.id);
  $("#example-reference").alt = `${item.name} reference image`;
  $("#example-render").src = asset(item.id, state.model);
  $("#example-render").alt = `${model} reconstruction of ${item.name}`;
  $("#example-model").textContent = model;
  $$("[data-model]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.model === state.model)));
  $("#inspect-metrics").hidden = !item.metrics;
}

function setDetail(detail) {
  state.detail = detail;
  selectTabs("data-detail", detail);
  $("#geometry-panel").hidden = detail !== "geometry";
  $("#appearance-panel").hidden = detail !== "appearance";
  if (detail === "geometry") pointViewer.schedule();
  writeHash();
}

function renderAppearance() {
  if (!metricData) return;
  const images = metricData.appearance;
  const labels = {
    render: "Evaluator reconstruction",
    error: "Maximum RGB-channel difference",
    matches: "Pixels within tolerance",
  };
  $("#metric-reference").src = metricBase() + images.reference;
  $("#metric-reference").alt = `${caseInfo().name} reference at ${images.width} × ${images.height}`;
  $("#metric-appearance").src = metricBase() + images[state.appearance];
  $("#metric-appearance").alt = `${caseInfo().name} · ${labels[state.appearance]}`;
  $("#appearance-caption").textContent = labels[state.appearance];
  $$("[data-appearance]").forEach(button =>
    button.setAttribute("aria-pressed", String(button.dataset.appearance === state.appearance)));
  const explanation = {
    render: `Recorded evaluator render · ${images.width} × ${images.height} pixels.`,
    error: "White = no error. Darker = larger maximum RGB-channel difference (0–255).",
    matches: `Blue = within tolerance; light gray = outside. ${images.hit_pixels.toLocaleString("en-US")} of ${images.total_pixels.toLocaleString("en-US")} pixels match.`,
  };
  $("#appearance-key").textContent = explanation[state.appearance];
}

function selectSurface() {
  if (!metricData) return;
  const id = $("#object-select").value;
  const isScene = id === "all";
  const surface = isScene ? metricData.geometry.scene : metricData.geometry.objects.find(object => object.id === id);
  $("#matches-control").hidden = isScene;
  $("#match-legend").hidden = isScene || !$("#show-matches").checked;
  $(".point-controls").classList.toggle("is-matches", !isScene && $("#show-matches").checked);
  $("#point-label").textContent = isScene ? "Whole visible scene · Companion diagnostic" : `${surface.label} · 5% depth tolerance`;
  const labels = ["Precision", "Recall", isScene ? "Scene F1 · Diagnostic" : "Object F1"];
  $("#object-scores").replaceChildren(...["precision", "recall", "fscore"].map((key, index) => {
    const cell = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = labels[index];
    dd.textContent = percent(surface.metrics[key]);
    cell.append(dt, dd);
    return cell;
  }));
  pointViewer.setSurface(surface);
}

async function loadMetrics() {
  const version = ++requestVersion;
  const id = state.caseId;
  metricData = null;
  $("#metric-content").hidden = true;
  $("#metric-retry").hidden = true;
  $("#metric-status").textContent = "Loading recorded scene data…";
  $("#metrics-panel").setAttribute("aria-busy", "true");
  try {
    if (!cache.has(id)) {
      cache.set(id, fetch(`assets/explorer/${id}/metrics.json`).then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }).catch(error => {
        cache.delete(id);
        throw error;
      }));
    }
    const data = await cache.get(id);
    if (version !== requestVersion || state.tab !== "metrics") return;
    if (data.schema !== "lego_anything_static_metrics_v1" || data.id !== id) throw new Error("Unexpected scene data");
    metricData = data;
    for (const [key, value] of Object.entries(data.scores)) {
      const cell = $(`#score-${key}`);
      const unit = document.createElement("span");
      unit.textContent = "%";
      cell.replaceChildren((value * 100).toFixed(1), unit);
    }
    const selector = $("#object-select");
    selector.replaceChildren(new Option("Whole visible scene", "all"),
      ...data.geometry.objects.map(object => new Option(object.label, object.id)));
    $("#show-target").checked = true;
    $("#show-prediction").checked = true;
    $("#show-matches").checked = false;
    $("#download-metrics").href = metricBase() + "metrics.json";
    $("#download-metrics").download = `lego-bench-${id}-gpt6-astra.json`;
    $("#metric-status").textContent = "";
    $("#metric-content").hidden = false;
    selectSurface();
    renderAppearance();
    setDetail(state.detail);
  } catch {
    if (version !== requestVersion || state.tab !== "metrics") return;
    $("#metric-status").textContent = "This scene’s recorded data could not load. Please try again.";
    $("#metric-retry").hidden = false;
  } finally {
    if (version === requestVersion) $("#metrics-panel").setAttribute("aria-busy", "false");
  }
}

function render() {
  if (state.tab === "metrics" && !caseInfo().metrics) state.caseId = "ex01";
  selectTabs("data-tab", state.tab);
  $("#examples-panel").hidden = state.tab !== "examples";
  $("#metrics-panel").hidden = state.tab !== "metrics";
  renderCases();
  $("#case-title").textContent = caseInfo().name;
  $("#case-meta").textContent = `${caseInfo().setting} · ${caseInfo().difficulty} · Run 01`;
  if (state.tab === "examples") {
    ++requestVersion;
    $("#metrics-panel").setAttribute("aria-busy", "false");
    renderExamples();
  } else loadMetrics();
  writeHash();
}

class PointViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.points = [];
    this.frame = null;
    this.drag = null;
    this.reset();
    new ResizeObserver(() => this.schedule()).observe(canvas);
    canvas.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      this.drag = { x: event.clientX, y: event.clientY, yaw: this.yaw, pitch: this.pitch };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", event => {
      if (!this.drag) return;
      this.yaw = this.drag.yaw + (event.clientX - this.drag.x) * .007;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.drag.pitch + (event.clientY - this.drag.y) * .007));
      this.schedule();
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
      canvas.addEventListener(name, () => { this.drag = null; });
    }
    canvas.addEventListener("wheel", event => {
      // Page scrolling remains available unless the visitor deliberately focuses the viewer.
      if (document.activeElement !== canvas) return;
      event.preventDefault();
      this.zoom = Math.max(.4, Math.min(4, this.zoom * Math.exp(-event.deltaY * .001)));
      this.schedule();
    }, { passive: false });
    canvas.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "0"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "ArrowLeft") this.yaw -= .12;
      if (event.key === "ArrowRight") this.yaw += .12;
      if (event.key === "ArrowUp") this.pitch = Math.max(-1.4, this.pitch - .12);
      if (event.key === "ArrowDown") this.pitch = Math.min(1.4, this.pitch + .12);
      if (event.key === "+" || event.key === "=") this.zoom = Math.min(4, this.zoom * 1.15);
      if (event.key === "-") this.zoom = Math.max(.4, this.zoom / 1.15);
      if (event.key === "0") this.reset();
      this.schedule();
    });
  }
  reset() {
    this.yaw = -.22;
    this.pitch = .14;
    this.zoom = 1;
    this.schedule();
  }
  setSurface(surface) {
    const all = [...surface.target, ...surface.prediction];
    const low = [0, 1, 2].map(axis => Math.min(...all.map(point => point[axis])));
    const high = [0, 1, 2].map(axis => Math.max(...all.map(point => point[axis])));
    const center = low.map((value, axis) => (value + high[axis]) / 2);
    const scale = 2 / Math.max(...high.map((value, axis) => value - low[axis]), .001);
    const transform = point => [
      -(point[1] - center[1]) * scale,
      (point[2] - center[2]) * scale,
      -(point[0] - center[0]) * scale,
    ];
    // Both clouds receive one shared display transform. Recorded coordinates and scores stay intact.
    this.points = ["target", "prediction"].flatMap(side => surface[side].map((point, index) => ({
      p: transform(point), side, match: surface[`${side}_matches`]?.[index],
    })));
    const cy = Math.cos(-.22), sy = Math.sin(-.22), cp = Math.cos(.14), sp = Math.sin(.14);
    const initial = this.points.map(({ p: [x, y, z] }) =>
      [cy * x + sy * z, cp * y - sp * (-sy * x + cy * z)]);
    this.fitExtents = [0, 1].map(axis => Math.max(.02, ...initial.map(p => Math.abs(p[axis]))));
    this.canvas.dataset.surface = surface.id || "all";
    this.reset();
  }
  schedule() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.draw(); });
  }
  draw() {
    const canvas = this.canvas;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height || !this.context) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const context = this.context;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const extent = this.fitExtents || [1, 1];
    const magnification = Math.min((width / 2 - 32) / extent[0], (height / 2 - 38) / extent[1]) * this.zoom;
    const project = ([x, y, z]) => {
      const rx = cy * x + sy * z, rz = -sy * x + cy * z;
      return [width / 2 + rx * magnification, height / 2 - (cp * y - sp * rz) * magnification, sp * y + cp * rz];
    };
    const showTarget = $("#show-target").checked, showPrediction = $("#show-prediction").checked;
    const matches = !$("#matches-control").hidden && $("#show-matches").checked;
    const points = this.points
      .filter(point => point.side === "target" ? showTarget : showPrediction)
      .map(point => ({ ...point, screen: project(point.p) }))
      .sort((a, b) => a.screen[2] - b.screen[2]);
    const radius = this.points.length > 2000 ? 1.6 : 2.5;
    context.globalAlpha = .82;
    for (const point of points) {
      context.fillStyle = (matches ? point.match : point.side === "target") ? "#526f91" : "#bf8661";
      context.beginPath();
      context.arc(point.screen[0], point.screen[1], radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    canvas.dataset.view = `${this.yaw.toFixed(3)},${this.pitch.toFixed(3)},${this.zoom.toFixed(3)}`;
    canvas.dataset.visiblePoints = String(points.length);
  }
}

const pointViewer = new PointViewer($("#point-viewer"));
for (const [id, name] of MODELS) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.model = id;
  button.textContent = name;
  button.addEventListener("click", () => {
    state.model = id;
    renderExamples();
    writeHash();
  });
  $("#model-picker").append(button);
}
wireTabs("data-tab", tab => {
  if (state.tab === tab) return;
  state.tab = tab;
  render();
});
wireTabs("data-detail", setDetail);
$("#inspect-metrics").addEventListener("click", () => {
  state.tab = "metrics";
  render();
  $("#metrics-tab").focus({ preventScroll: true });
});
$("#metric-retry").addEventListener("click", loadMetrics);
$("#object-select").addEventListener("change", selectSurface);
$("#reset-view").addEventListener("click", () => pointViewer.reset());
$("#zoom-in").addEventListener("click", () => {
  pointViewer.zoom = Math.min(4, pointViewer.zoom * 1.2);
  pointViewer.schedule();
});
$("#zoom-out").addEventListener("click", () => {
  pointViewer.zoom = Math.max(.4, pointViewer.zoom / 1.2);
  pointViewer.schedule();
});
for (const id of ["show-target", "show-prediction", "show-matches"]) {
  $(`#${id}`).addEventListener("change", () => {
    $("#match-legend").hidden = $("#matches-control").hidden || !$("#show-matches").checked;
    $(".point-controls").classList.toggle("is-matches", !$("#match-legend").hidden);
    pointViewer.schedule();
  });
}
$$("[data-appearance]").forEach(button => button.addEventListener("click", () => {
  state.appearance = button.dataset.appearance;
  renderAppearance();
}));

const lightbox = $("#image-dialog");
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !lightbox.open && window.parent !== window) {
    event.preventDefault();
    window.parent.postMessage({ type: "lego-explorer-close" }, location.origin);
  }
});
$$(".image-zoom").forEach(button => button.addEventListener("click", () => {
  const image = button.querySelector("img");
  if (!image.naturalWidth) return;
  $("#lightbox-image").src = image.src;
  $("#lightbox-image").alt = image.alt;
  $("#lightbox-caption").textContent = image.alt;
  lightbox.showModal();
  document.body.classList.add("dialog-open");
}));
$(".lightbox-close").addEventListener("click", () => lightbox.close());
lightbox.addEventListener("click", event => {
  if (event.target !== lightbox) return;
  const rect = lightbox.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) lightbox.close();
});
lightbox.addEventListener("close", () => document.body.classList.remove("dialog-open"));

function readHash() {
  const [tab, id, tail] = location.hash.slice(1).split("/");
  state.tab = tab === "metrics" ? "metrics" : "examples";
  state.caseId = CASES.some(item => item.id === id) ? id : "ex01";
  if (state.tab === "examples" && MODELS.some(([model]) => model === tail)) state.model = tail;
  if (state.tab === "metrics") state.detail = tail === "appearance" ? "appearance" : "geometry";
  render();
}
window.addEventListener("message", event => {
  if (event.source !== window.parent || event.origin !== location.origin ||
      event.data?.type !== "lego-explorer-open" || !["examples", "metrics"].includes(event.data.view)) return;
  state.tab = event.data.view;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
});
window.addEventListener("hashchange", () => {
  if (/^#(examples|metrics)(\/|$)/.test(location.hash)) readHash();
});
readHash();
