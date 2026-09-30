/* One scrolling paper website, with supplemental material in native dialogs. */
"use strict";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function setPressed(selector, predicate) {
  $$(selector).forEach((button) => button.setAttribute("aria-pressed", String(predicate(button))));
}

function initBenchmark() {
  if (!$("#results-body")) return;
  const state = { split: "indoor", allBaselines: false };

  let resultsData;
  function makeCell(value, best, score = false) {
    const cell = document.createElement("td");
    if (!value) {
      cell.textContent = "—";
      cell.setAttribute("aria-label", "Not supported");
      return cell;
    }
    cell.className = `${score ? "overall-cell " : ""}${best ? "best-value" : ""}`;
    const number = document.createElement("span");
    number.className = "mean";
    number.textContent = value.mean.toFixed(1);
    cell.append(number);
    const spread = document.createElement("span");
    spread.className = "std";
    spread.textContent = ` ± ${value.std.toFixed(1)}`;
    cell.append(spread);
    return cell;
  }
  
  function renderResults() {
    if (!resultsData) return;
    const metrics = ["validity", "reconstruction", "appearance", "overall"];
    const rows = resultsData.models.filter((row) => state.allBaselines || row.group === "Coding agents");
    const maxima = Object.fromEntries(metrics.map((metric) => [
      metric, Math.max(...rows.map((row) => row[state.split]?.[metric]?.mean ?? -1)),
    ]));
    const fragment = document.createDocumentFragment();
    let group = "";
    for (const model of rows) {
      if (state.allBaselines && group !== model.group) {
        group = model.group;
        const heading = document.createElement("tr");
        heading.className = "group-row";
        const label = document.createElement("th");
        label.colSpan = 5;
        label.scope = "rowgroup";
        label.textContent = group;
        heading.append(label);
        fragment.append(heading);
      }
      const row = document.createElement("tr");
      if (model.name === "GPT-6-astra") row.className = "leading-row";
      const label = document.createElement("th");
      label.scope = "row";
      label.textContent = model.name;
      if (model.group === "Coding agents") {
        const harness = document.createElement("span");
        harness.className = "harness";
        harness.textContent = " + Codex";
        label.append(harness);
      }
      row.append(label);
      metrics.forEach((metric) => {
        const value = model[state.split]?.[metric];
        row.append(makeCell(value, value?.mean === maxima[metric], metric === "overall"));
      });
      fragment.append(row);
    }
    $("#results-body").replaceChildren(fragment);
    $("#results-caption").textContent = `LEGO-Bench ${state.split} results. Mean and standard deviation over three runs.`;
    $("#results-note").textContent = state.split === "indoor"
      ? "GPT-6-astra reaches 53.4% overall indoors."
      : "GPT-6-astra reaches 39.6% overall outdoors.";
  }
  
  async function loadResults() {
    try {
      const response = await fetch("assets/results.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      resultsData = await response.json();
      renderResults();
    } catch {
      $("#results-body").replaceChildren();
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.textContent = "The results table could not load. ";
      const link = document.createElement("a");
      link.href = "https://arxiv.org/abs/2609.36380";
      link.textContent = "View the full results in the paper.";
      cell.append(link);
      row.append(cell);
      $("#results-body").append(row);
    }
  }
  loadResults();
  $$("[data-split]").forEach((button) => {
    button.addEventListener("click", () => {
      state.split = button.dataset.split;
      setPressed("[data-split]", (item) => item === button);
      renderResults();
    });
  });
  $("#baseline-toggle").addEventListener("click", () => {
    state.allBaselines = !state.allBaselines;
    $("#baseline-toggle").setAttribute("aria-expanded", String(state.allBaselines));
    $("#baseline-toggle").textContent = state.allBaselines ? "Show coding agents only ↑" : "Show all baselines ↓";
    renderResults();
  });
}

function initFindings() {
  const dialog = $("#findings-dialog");
  if (!dialog) return;
  const panels = $$(".finding-panel");
  const tabs = $$("[data-finding]");
  const viewport = $(".findings-viewport");
  const previous = $("#finding-prev");
  const next = $("#finding-next");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let current = 0;

  function show(index, { focusTab = false, animate = true } = {}) {
    const target = Math.max(0, Math.min(panels.length - 1, index));
    const direction = target >= current ? 1 : -1;
    const changed = target !== current;
    const restorePanelFocus = changed && panels[current].contains(document.activeElement);
    current = target;
    panels.forEach((panel, i) => {
      panel.getAnimations().forEach(animation => animation.cancel());
      panel.hidden = i !== current;
    });
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === current));
      tab.tabIndex = i === current ? 0 : -1;
    });
    previous.setAttribute("aria-disabled", String(current === 0));
    next.setAttribute("aria-disabled", String(current === panels.length - 1));
    $("#finding-position").textContent = `Findings ${current + 1} of ${panels.length}`;
    dialog.dataset.finding = String(current + 1);
    viewport.scrollTop = 0;
    if (focusTab) tabs[current].focus({ preventScroll: true });
    else if (restorePanelFocus) panels[current].focus({ preventScroll: true });
    if (changed && animate && !reducedMotion.matches) {
      panels[current].animate([
        { opacity: 0.4, transform: `translateX(${direction * 20}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ], { duration: 220, easing: "ease-out" });
    }
  }
  previous.addEventListener("click", () => { if (current > 0) show(current - 1); });
  next.addEventListener("click", () => { if (current < panels.length - 1) show(current + 1); });
  tabs.forEach(tab => tab.addEventListener("click", () => show(Number(tab.dataset.finding), { focusTab: true })));
  dialog.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey ||
        event.target.closest("input, textarea, select, .results-table-wrap")) return;
    const onTab = event.target.matches("[data-finding]");
    let target;
    if (event.key === "ArrowLeft") target = current - 1;
    else if (event.key === "ArrowRight") target = current + 1;
    else if (onTab && event.key === "Home") target = 0;
    else if (onTab && event.key === "End") target = panels.length - 1;
    else return;
    event.preventDefault();
    show(target, { focusTab: onTab });
  });
  $$('[data-open-dialog="findings-dialog"]').forEach(button =>
    button.addEventListener("click", () => show(0, { animate: false })));
  show(0, { animate: false });
}

function initPlugin() {
  if (!$("#plugin-output")) return;
  const pluginScenes = {
    reception: { prefix: "reception_l2", title: "Reception", baseline: "14.7", plugin: "32.5" },
    "copy-room": { prefix: "copy_room_l3", title: "Copy room", baseline: "10.9", plugin: "27.8" },
  };
  $$("[data-plugin]").forEach((button) => {
    button.addEventListener("click", () => {
      const scene = pluginScenes[button.dataset.plugin];
      [
        ["#plugin-reference", "reference", "reference image"],
        ["#plugin-base", "base", "reconstructed without LEGO-Plugin"],
        ["#plugin-output", "plugin", "reconstructed with LEGO-Plugin"],
      ].forEach(([selector, suffix, description]) => {
        $(selector).src = `assets/plugin_examples/${scene.prefix}_${suffix}.webp`;
        $(selector).alt = `${scene.title} ${description}`;
      });
      $("#plugin-base-score").textContent = scene.baseline;
      $("#plugin-output-score").textContent = scene.plugin;
      setPressed("[data-plugin]", (item) => item === button);
    });
  });
}

function initCitation() {
  if (!$("#copy-citation")) return;
  $("#copy-citation").addEventListener("click", async () => {
    const text = $("#bibtex").textContent;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      $("#copy-citation span").textContent = "Copied!";
      $("#copy-status").textContent = "BibTeX copied to clipboard.";
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents($("#bibtex"));
      selection.removeAllRanges();
      selection.addRange(range);
      $("#copy-status").textContent = "Citation selected. Press Ctrl+C or ⌘C to copy.";
    }
  });
}

function initExplorer() {
  const dialog = $("#explorer-dialog");
  const frame = $("#explorer-frame");
  const loading = $("#explorer-loading");
  function showRequestedView() {
    frame.contentWindow.postMessage({
      type: "lego-explorer-open", view: frame.dataset.requestedView,
    }, location.origin);
  }
  frame.addEventListener("load", () => {
    if (!frame.hasAttribute("src")) return;
    loading.hidden = true;
    frame.dataset.ready = "true";
    showRequestedView();
  });
  $$("[data-explorer-view]").forEach(button => button.addEventListener("click", () => {
    const view = button.dataset.explorerView;
    frame.dataset.requestedView = view;
    if (!frame.hasAttribute("src")) {
      loading.hidden = false;
      frame.src = `explorer-viewer.html#${view}/ex01/${view === "metrics" ? "geometry" : "gpt6_astra"}`;
    } else if (frame.dataset.ready === "true") showRequestedView();
  }));
  window.addEventListener("message", event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || !dialog.open) return;
    if (event.data?.type === "lego-explorer-close") dialog.close();
  });
}

function initDialogs() {
  function openDialog(dialog) {
    dialog.showModal();
    document.body.classList.add("dialog-open");
  }
  $$("[data-open-dialog]").forEach((button) => {
    button.addEventListener("click", () => openDialog($(`#${button.dataset.openDialog}`)));
  });
  $$("[data-zoom], [data-zoom-current]").forEach((button) => {
    button.addEventListener("click", () => {
      const image = button.querySelector("img");
      $("#dialog-image").src = button.dataset.zoom || image.src;
      $("#dialog-image").alt = image?.alt || button.dataset.caption;
      $("#dialog-caption").textContent = button.dataset.caption || image.alt;
      openDialog($("#figure-dialog"));
    });
  });
  $$("dialog").forEach((dialog) => {
    dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener("close", () => {
      if (!$("dialog[open]")) document.body.classList.remove("dialog-open");
    });
  });
}

function initSectionNavigation() {
  const screens = $$(".screen");
  const links = $$("[data-section-link]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let pending = false;
  function update() {
    const motionEnabled = !reducedMotion.matches;
    document.documentElement.classList.toggle("motion-ready", motionEnabled);
    const navHeight = $(".site-header").offsetHeight;
    const availableHeight = innerHeight - navHeight;
    const midpoint = innerHeight / 2;
    let current;
    screens.forEach((screen) => {
      const rect = screen.getBoundingClientRect();
      if (rect.top <= midpoint && rect.bottom > midpoint) current = screen;
      if (!motionEnabled) return;
      const visible = Math.max(0, Math.min(1,
        (Math.min(rect.bottom, innerHeight) - Math.max(rect.top, navHeight)) / availableHeight));
      // Keep the reading area fully opaque; soften only the entering/leaving screen.
      const progress = Math.max(0, Math.min(1, (visible - 0.05) / 0.6));
      const eased = progress * progress * (3 - 2 * progress);
      const shift = (rect.top > navHeight ? 18 : -12) * (1 - visible);
      screen.style.setProperty("--screen-opacity", (0.25 + 0.75 * eased).toFixed(3));
      screen.style.setProperty("--screen-shift", `${shift.toFixed(2)}px`);
      screen.style.setProperty("--screen-transition", (3 * visible * (1 - visible)).toFixed(3));
    });
    links.forEach((link) => {
      if (link.hash === `#${current?.dataset.navSection || current?.id}`) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    pending = false;
  }
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  }
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  reducedMotion.addEventListener("change", schedule);
  update();
}

const menuToggle = $(".menu-toggle");
function closeMenu() {
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open navigation");
  $(".nav-links").classList.remove("is-open");
}
menuToggle.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") !== "true";
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  $(".nav-links").classList.toggle("is-open", open);
});
$$(".nav-links a").forEach((link) => link.addEventListener("click", closeMenu));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".site-header")) closeMenu();
});

initBenchmark();
initFindings();
initPlugin();
initCitation();
initExplorer();
initDialogs();
initSectionNavigation();
