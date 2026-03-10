import * as webllm from "https://esm.run/@mlc-ai/web-llm";

/* -- System Prompt ------------------------------------------ */
const SYSTEM_PROMPT = "You are LlamaChat, a helpful and concise AI assistant running 100% privately in the user's browser. Be friendly and accurate.";

/* -- Model Registry (Rule 3 — exact IDs) ------------------- */
const MODELS = [
  {
    id:    "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "\u26A1 Light \u2014 Llama 3.2 1B  by Meta       (~0.7 GB)",
    brand: "Meta",
    botLabel: "\uD83E\uDD99 Llama",
    minRAM: 0,
    note:  "Silent. Instant. Works on any device.",
    sizeMB: 700,
  },
  {
    id:    "Phi-3.5-mini-instruct-q4f16_1-MLC",
    label: "\u2696\uFE0F Balanced \u2014 Phi 3.5 Mini  by Microsoft  (~2.2 GB)",
    brand: "Microsoft",
    botLabel: "\u25C6 Phi",
    minRAM: 4,
    note:  "Smart & silent. Best for most laptops.",
    sizeMB: 2200,
  },
  {
    id:    "Llama-3.1-8B-Instruct-q4f32_1-MLC",
    label: "\uD83E\uDDE0 Powerful \u2014 Llama 3.1 8B  by Meta       (~4.5 GB)",
    brand: "Meta",
    botLabel: "\uD83E\uDD99 Llama",
    minRAM: 8,
    note:  "GPT-level quality. Needs good hardware.",
    sizeMB: 4500,
  },
];

/* Phase 1 is always the lightest model (index 0) */
const PHASE1_MODEL = MODELS[0];

/* -- App State ---------------------------------------------- */
const state = {
  hardware:       { ram: 4, cores: 4, gpu: "Unknown", webgpu: false },
  selectedModel:  null,
  loadedModel:    null,
  phase2Model:    null,   // the recommended upgrade target
  phase2Ready:    false,  // phase 2 weights are cached
  isSleeping:     false,  // model auto-unloaded after idle
  isLoading:      false,
  isGenerating:   false,
  messages:       [],
  streamBuffer:   "",
};

let engine = null;
let currentWorker = null;
let idleTimer = null;
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/* -- DOM References ----------------------------------------- */
const _q = (sel) => document.querySelector(sel);
const dom = {};

function cacheDom() {
  dom.overlay          = _q("#loading-overlay");
  dom.overlayTitle     = _q("#overlay-title");
  dom.overlaySubtitle  = _q("#overlay-subtitle");
  dom.overlayPercent   = _q("#overlay-percent");
  dom.progressBarFill  = _q("#progress-bar-fill");
  dom.overlayStatus    = _q("#overlay-status");
  dom.overlayStats     = _q("#overlay-stats");
  dom.overlayCacheNote = _q("#overlay-cache-note");
  dom.overlayError     = _q("#overlay-error");
  dom.overlayErrorText = _q("#overlay-error-text");
  dom.overlayRetryBtn  = _q("#overlay-retry-btn");
  dom.overlayFallbackBtn = _q("#overlay-fallback-btn");
  dom.webgpuError      = _q("#webgpu-error");
  dom.chatContainer    = _q("#chat-container");
  dom.messagesArea     = _q("#messages-area");
  dom.welcomeCard      = _q("#welcome-card");
  dom.welcomeBrand     = _q("#welcome-brand");
  dom.inputArea        = _q("#input-area");
  dom.modelSelect      = _q("#model-select");
  dom.chatInput        = _q("#chat-input");
  dom.sendBtn          = _q("#send-btn");
  dom.sendBtnText      = _q("#send-btn-text");
  dom.deviceInfo       = _q("#device-info");
  dom.upgradeBanner    = _q("#upgrade-banner");
  dom.upgradeBannerText = _q("#upgrade-banner-text");
  dom.upgradeYesBtn    = _q("#upgrade-yes-btn");
  dom.upgradeNoBtn     = _q("#upgrade-no-btn");
  dom.sleepBanner      = _q("#sleep-banner");
}

/* -- Hardware Detection ------------------------------------- */
async function detectHardware() {
  const t0 = performance.now();

  const getGPUInfo = () =>
    new Promise((resolve) => {
      try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        if (gl) {
          const ext = gl.getExtension("WEBGL_debug_renderer_info");
          if (ext) {
            resolve(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "Unknown GPU");
            return;
          }
        }
        resolve("Unknown GPU");
      } catch (_) { resolve("Unknown GPU"); }
    });

  const checkWebGPU = () =>
    new Promise((resolve) => {
      if (!navigator.gpu) { resolve(false); return; }
      navigator.gpu.requestAdapter()
        .then((a) => resolve(!!a))
        .catch(() => resolve(false));
    });

  const [ram, cores, gpuInfo, webgpuSupported] = await Promise.all([
    Promise.resolve(navigator.deviceMemory || 4),
    Promise.resolve(navigator.hardwareConcurrency || 4),
    getGPUInfo(),
    checkWebGPU(),
  ]);

  state.hardware = { ram, cores, gpu: gpuInfo, webgpu: webgpuSupported };
  console.log("[HW]", ram, "GB RAM,", cores, "cores,", gpuInfo, "WebGPU:", webgpuSupported,
    "(" + (performance.now() - t0).toFixed(0) + "ms)");
  return state.hardware;
}

/* -- Model Auto-Selection (Phase 2 target) ------------------ */
function getPhase2Model(ram) {
  if (ram >= 8) return MODELS[2];
  if (ram >= 4) return MODELS[1];
  return null; // low RAM — Phase 1 is all we can do
}

/* -- Progress Tracking -------------------------------------- */
let downloadStartTime = 0;
let lastProgressTime  = 0;
let lastProgressLoaded = 0;

function parseProgressReport(report) {
  const result = {
    progress: 0, text: report.text || "",
    loaded_mb: 0, total_mb: 0, speed_mbps: 0, eta_seconds: 0,
  };

  if (report.progress !== undefined) {
    result.progress = Math.min(1, Math.max(0, report.progress));
  }

  const mbMatch = report.text?.match(/([\d.]+)\s*MB\s*\/\s*([\d.]+)\s*MB/i);
  const gbMatch = report.text?.match(/([\d.]+)\s*GB\s*\/\s*([\d.]+)\s*GB/i);
  if (gbMatch) {
    result.loaded_mb = parseFloat(gbMatch[1]) * 1024;
    result.total_mb  = parseFloat(gbMatch[2]) * 1024;
  } else if (mbMatch) {
    result.loaded_mb = parseFloat(mbMatch[1]);
    result.total_mb  = parseFloat(mbMatch[2]);
  } else if (result.progress > 0) {
    result.loaded_mb = result.progress * 100;
    result.total_mb  = 100;
  }

  const now = performance.now();
  const elapsed = (now - downloadStartTime) / 1000;
  if (elapsed > 0.5 && result.loaded_mb > 0) {
    const dt = (now - lastProgressTime) / 1000;
    const dd = result.loaded_mb - lastProgressLoaded;
    if (dt > 0.1 && dd > 0) result.speed_mbps = dd / dt;
    else if (elapsed > 0) result.speed_mbps = result.loaded_mb / elapsed;
    if (result.speed_mbps > 0 && result.total_mb > result.loaded_mb) {
      result.eta_seconds = (result.total_mb - result.loaded_mb) / result.speed_mbps;
    }
  }
  lastProgressTime   = now;
  lastProgressLoaded = result.loaded_mb;
  return result;
}

/* -- Overlay Progress UI ------------------------------------ */
function handleLoadProgress(p) {
  const pct = Math.round(p.progress * 100);
  dom.overlayPercent.textContent  = pct + "%";
  dom.progressBarFill.style.width = pct + "%";
  dom.sendBtnText.textContent     = "Loading... " + pct + "%";

  let statusText = p.text || "Loading model...";
  if (statusText.length > 60) {
    if (statusText.includes("Fetching")) statusText = "Downloading weights...";
    else if (statusText.includes("Loading")) statusText = "Loading model into GPU...";
    else statusText = statusText.substring(0, 57) + "...";
  }
  dom.overlayStatus.textContent = statusText;

  let statsText = "";
  if (p.total_mb > 0) {
    const ld = p.loaded_mb >= 1024 ? (p.loaded_mb / 1024).toFixed(2) + " GB" : Math.round(p.loaded_mb) + " MB";
    const tt = p.total_mb  >= 1024 ? (p.total_mb / 1024).toFixed(1) + " GB" : Math.round(p.total_mb) + " MB";
    statsText += ld + " / " + tt;
  }
  if (p.speed_mbps > 0.5) statsText += "  \u2193 " + Math.round(p.speed_mbps) + " MB/s";
  if (p.eta_seconds > 1 && p.eta_seconds < 3600) {
    const s = Math.round(p.eta_seconds);
    statsText += s >= 60 ? "  ~" + Math.ceil(s / 60) + " min left" : "  ~" + s + "s left";
  }
  dom.overlayStats.textContent = statsText;

  if (pct > 5) {
    dom.overlayCacheNote.textContent = "\u2713 Cached locally \u2014 instant next visit";
    dom.overlayCacheNote.style.opacity = "1";
  }
}

/* -- Load Complete → Fade Overlay → Unlock Chat ------------- */
function handleLoadComplete(modelId) {
  state.isLoading  = false;
  state.isSleeping = false;
  state.loadedModel = MODELS.find((m) => m.id === modelId) || state.selectedModel;

  dom.overlayPercent.textContent  = "100%";
  dom.progressBarFill.style.width = "100%";
  dom.overlayStatus.textContent   = "Model ready!";
  dom.overlayStats.textContent    = "";

  setTimeout(() => {
    dom.overlay.style.transition = "opacity 0.6s ease";
    dom.overlay.style.opacity    = "0";
    setTimeout(() => {
      dom.overlay.style.display    = "none";
      dom.overlay.style.opacity    = "1";
      dom.overlay.style.transition = "";
    }, 600);
  }, 400);

  updateUIReady();
  updateWelcomeCard();
  hideSleepBanner();
  resetIdleTimer();
}

/* ============================================================
   PHASE 1 + PHASE 2 — AirLLM loading strategy
   ============================================================ */

/* -- Load a model (generic) --------------------------------- */
async function loadModel(modelId, showOverlay, _retried = false) {
  const model = MODELS.find(m => m.id === modelId);
  if (!model) {
    console.error("Invalid model ID:", modelId);
    return false;
  }

  state.isLoading    = true;
  state.selectedModel = model;

  if (showOverlay) {
    updateUILoading();
    dom.overlay.style.display = "flex";
    dom.overlay.style.opacity = "1";
    dom.overlayPercent.textContent  = "0%";
    dom.progressBarFill.style.width = "0%";
    dom.overlayStatus.textContent   = "Initializing engine...";
    dom.overlayStats.textContent    = "";
    dom.overlayCacheNote.textContent = "";
    dom.overlayError.style.display  = "none";
  }

  downloadStartTime  = performance.now();
  lastProgressTime   = downloadStartTime;
  lastProgressLoaded = 0;

  const initProgressCallback = (report) => {
    try {
      const norm = typeof report === "string" ? { text: report, progress: 0 } : report;
      const p = parseProgressReport(norm);
      if (showOverlay) handleLoadProgress(p);
    } catch (_) {}
  };

  try {
    /* AirLLM principle: always unload current model first */
    if (engine) {
      try { await engine.unload(); } catch (_) {}
      engine = null;
    }
    if (currentWorker) {
      try { currentWorker.terminate(); } catch (_) {}
      currentWorker = null;
    }

    /* Small pause to let GPU memory settle */
    await new Promise(r => setTimeout(r, 300));

    currentWorker = new Worker("./worker.js", { type: "module" });

    /* Catch worker-level errors (e.g. failed ESM import inside worker) */
    currentWorker.onerror = (e) => {
      console.error("[Worker Error]", e.message, e);
    };

    engine = await webllm.CreateWebWorkerMLCEngine(
      currentWorker,
      modelId,
      { initProgressCallback },
    );

    if (showOverlay) handleLoadComplete(modelId);
    else {
      state.isLoading  = false;
      state.loadedModel = model;
      resetIdleTimer();
    }

    populateModelSelect();
    updateDeviceInfo();
    return true;
  } catch (err) {
    engine = null;
    if (currentWorker) {
      try { currentWorker.terminate(); } catch (_) {}
      currentWorker = null;
    }

    /* Auto-retry: if Cache API failed (stale/corrupt cache), clear all caches and try once */
    const isCacheError = err.message?.includes("Cache") || err.message?.includes("cache") || err.message?.includes("NetworkError");
    if (isCacheError && !_retried) {
      console.warn("[loadModel] Cache/network error — clearing caches and retrying...");
      if (showOverlay) {
        dom.overlayStatus.textContent = "Cache error — clearing & retrying...";
        dom.overlayPercent.textContent = "0%";
        dom.progressBarFill.style.width = "0%";
      }
      try {
        const keys = await caches.keys();
        for (const key of keys) await caches.delete(key);
        console.log("[loadModel] Cleared", keys.length, "cache(s)");
      } catch (_) {}
      await new Promise(r => setTimeout(r, 500));
      state.isLoading = false;
      return loadModel(modelId, showOverlay, true);
    }

    state.isLoading = false;
    const isOOM = err.message?.includes("memory") || err.message?.includes("OOM") || err.message?.includes("allocation");
    const errMsg = err.message || err.toString() || "Unknown error loading model";
    console.error("[loadModel Error]", errMsg, err);
    if (showOverlay) {
      handleError(errMsg, true, isOOM);
    } else {
      console.error("[Phase2 bg load failed]", err.message);
    }
    return false;
  }
}

/* -- Phase 2: Background pre-cache -------------------------- */
async function backgroundCachePhase2() {
  if (!state.phase2Model) return;
  if (state.phase2Model.id === PHASE1_MODEL.id) return; // same model

  console.log("[Phase2] Background-caching:", state.phase2Model.id);

  /* We create a SEPARATE worker + engine just to trigger the download,
     then immediately discard it. The weights get cached in IndexedDB/CacheAPI
     by WebLLM automatically. We do NOT keep this engine alive. */
  let bgWorker = null;
  try {
    bgWorker = new Worker("./worker.js", { type: "module" });
    const bgEngine = await webllm.CreateWebWorkerMLCEngine(
      bgWorker,
      state.phase2Model.id,
      { initProgressCallback: () => {} },
    );

    /* Weights are now cached — unload immediately to free GPU */
    await bgEngine.unload();
    bgWorker.terminate();
    bgWorker = null;

    state.phase2Ready = true;
    console.log("[Phase2] Cached successfully:", state.phase2Model.id);
    showUpgradeBanner();
  } catch (err) {
    console.warn("[Phase2] Background cache failed:", err.message);
    if (bgWorker) { try { bgWorker.terminate(); } catch (_) {} }
  }
}

/* -- Upgrade Banner ----------------------------------------- */
function showUpgradeBanner() {
  if (!dom.upgradeBanner || !state.phase2Model) return;
  const name = state.phase2Model.id.split("-q")[0];
  dom.upgradeBannerText.textContent = "\u26A1 " + name + " by " + state.phase2Model.brand + " is ready \u2014 Upgrade?";
  dom.upgradeBanner.style.display = "flex";
  dom.upgradeBanner.style.animation = "fadeIn 0.3s ease";
}

function hideUpgradeBanner() {
  if (dom.upgradeBanner) dom.upgradeBanner.style.display = "none";
}

async function handleUpgradeYes() {
  hideUpgradeBanner();
  if (!state.phase2Model) return;
  await loadModel(state.phase2Model.id, true);
}

function handleUpgradeNo() {
  hideUpgradeBanner();
}

/* ============================================================
   IDLE AUTO-SLEEP (Phase 3) — AirLLM memory management
   ============================================================ */
function resetIdleTimer() {
  clearTimeout(idleTimer);
  if (!engine || state.isGenerating || state.isLoading) return;
  idleTimer = setTimeout(async () => {
    if (state.isGenerating || state.isLoading) return;
    console.log("[Idle] 5 min idle — unloading model to save memory");
    try {
      if (engine) await engine.unload();
    } catch (_) {}
    engine = null;
    if (currentWorker) {
      try { currentWorker.terminate(); } catch (_) {}
      currentWorker = null;
    }
    state.isSleeping = true;
    state.loadedModel = null;
    showSleepBanner();
    dom.sendBtn.disabled = true;
    dom.sendBtnText.textContent = "\uD83D\uDCA4 Sleeping";
    dom.chatInput.placeholder = "Type to wake up the model...";
    dom.chatInput.disabled = false;
  }, IDLE_TIMEOUT);
}

function showSleepBanner() {
  if (dom.sleepBanner) {
    dom.sleepBanner.style.display = "block";
    dom.sleepBanner.style.animation = "fadeIn 0.3s ease";
  }
}

function hideSleepBanner() {
  if (dom.sleepBanner) dom.sleepBanner.style.display = "none";
}

/* Wake from sleep: reload current model from cache (fast) */
async function wakeFromSleep() {
  if (!state.isSleeping || state.isLoading) return;
  hideSleepBanner();
  const modelId = state.selectedModel ? state.selectedModel.id : PHASE1_MODEL.id;
  await loadModel(modelId, true);
}

/* ============================================================
   Streaming chat — unchanged logic, extracted for reuse
   ============================================================ */
async function streamChat(msgs) {
  const startTime = performance.now();
  let tokenCount = 0;

  const chunks = await engine.chat.completions.create({
    messages: msgs,
    temperature: 0.6,   // lower = less sampling math = faster
    top_p: 1.0,         // skip nucleus sampling = faster
    max_tokens: 1024,
    stream: true,
    stream_options: { include_usage: true },
  });

  for await (const chunk of chunks) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      tokenCount++;
      state.streamBuffer += delta;
      updateBotMessage(state.streamBuffer, true);
    }
    if (chunk.usage) {
      const elapsed = performance.now() - startTime;
      finishStream({
        tokens: chunk.usage.completion_tokens || tokenCount,
        prompt_tokens: chunk.usage.prompt_tokens || 0,
        ms: Math.round(elapsed),
        tokensPerSecond: Math.round(((chunk.usage.completion_tokens || tokenCount) / elapsed) * 1000),
      });
      return;
    }
  }

  /* Fallback if no usage chunk came */
  if (state.isGenerating) {
    const elapsed = performance.now() - startTime;
    finishStream({
      tokens: tokenCount, prompt_tokens: 0,
      ms: Math.round(elapsed),
      tokensPerSecond: tokenCount > 0 ? Math.round((tokenCount / elapsed) * 1000) : 0,
    });
  }
}

function finishStream(stats) {
  state.isGenerating = false;
  const lastBotMsg = getLastBotBubble();
  if (lastBotMsg) {
    const cursor = lastBotMsg.querySelector(".cursor");
    if (cursor) cursor.remove();
    const el = document.createElement("div");
    el.className = "msg-stats";
    el.textContent = stats.tokens + " tokens \u00B7 " + (stats.ms / 1000).toFixed(1) + "s \u00B7 " + stats.tokensPerSecond + " tok/s";
    lastBotMsg.appendChild(el);
  }
  state.messages.push({ role: "assistant", content: state.streamBuffer });
  state.streamBuffer = "";
  updateUIReady();
  resetIdleTimer();
}

/* -- Error Handler ------------------------------------------ */
function handleError(message, recoverable = true, oom = false) {
  console.error("[Error]", message);
  if (state.isLoading) {
    state.isLoading = false;
    if (oom) showOverlayError("Out of memory! Try a lighter model.", true, true);
    else showOverlayError(message, recoverable);
    return;
  }
  if (state.isGenerating) {
    state.isGenerating = false;
    appendErrorBubble(message, oom);
    updateUIReady();
    return;
  }
  showOverlayError(message, recoverable);
}

function showOverlayError(msg, recoverable, showFallback = false) {
  dom.overlayError.style.display      = "block";
  dom.overlayErrorText.textContent    = msg;
  dom.overlayRetryBtn.style.display   = recoverable ? "inline-block" : "none";
  dom.overlayFallbackBtn.style.display = showFallback ? "inline-block" : "none";
  dom.overlayStatus.textContent       = "Error";
  dom.overlayStats.textContent        = "";
}

/* -- UI State Functions ------------------------------------- */
function updateUIReady() {
  dom.sendBtn.disabled = false;
  dom.sendBtnText.textContent = "Send \u2192";
  dom.chatInput.disabled = false;
  dom.chatInput.placeholder = "Type a message...";
  dom.modelSelect.disabled = false;
}

function updateUILoading() {
  dom.sendBtn.disabled = true;
  dom.sendBtnText.textContent = "Loading... 0%";
  dom.chatInput.disabled = true;
  dom.chatInput.placeholder = "Loading model...";
  dom.modelSelect.disabled = true;
}

function updateUIGenerating() {
  dom.sendBtn.disabled = true;
  dom.sendBtnText.innerHTML = '<span class="dot-pulse">\u25CF</span> Thinking';
  dom.chatInput.disabled = true;
}

function updateWelcomeCard() {
  if (!state.loadedModel) return;
  dom.welcomeBrand.textContent = "Powered by " + state.loadedModel.brand;
  dom.welcomeCard.style.display = "block";
}

function updateDeviceInfo() {
  const hw = state.hardware;
  const gStatus = hw.webgpu ? "WebGPU \u2713" : "WebGPU \u2717";
  const active = state.loadedModel || state.selectedModel;
  const mName = active ? active.id.split("-q")[0] + " by " + active.brand : "None";
  dom.deviceInfo.textContent = "Detected: " + hw.ram + " GB RAM \u00B7 " + gStatus + " \u00B7 Active: " + mName;
}

/* -- Populate Model Selector -------------------------------- */
function populateModelSelect() {
  dom.modelSelect.innerHTML = "";
  MODELS.forEach((m, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = m.label;
    if (m.minRAM > state.hardware.ram) opt.textContent += " (may be slow)";
    dom.modelSelect.appendChild(opt);
  });
  const idx = MODELS.indexOf(state.selectedModel);
  if (idx >= 0) dom.modelSelect.value = idx;
}

/* -- Chat Rendering ----------------------------------------- */
function appendUserBubble(text) {
  dom.welcomeCard.style.display = "none";
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble msg-user";
  bubble.innerHTML = '<div class="msg-label">You</div><div class="msg-content">' + escapeHtml(text) + '</div>';
  dom.messagesArea.appendChild(bubble);
  scrollToBottom();
}

function appendBotBubble() {
  const model = state.loadedModel || state.selectedModel || MODELS[0];
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble msg-bot";
  bubble.setAttribute("data-active", "true");
  bubble.innerHTML = '<div class="msg-label">' + model.botLabel + '</div><div class="msg-content"><span class="cursor">\u258B</span></div>';
  dom.messagesArea.appendChild(bubble);
  scrollToBottom();
}

function updateBotMessage(fullText, streaming) {
  const bubble = getLastBotBubble();
  if (!bubble) return;
  const c = bubble.querySelector(".msg-content");
  c.innerHTML = renderMarkdownLight(fullText) + (streaming ? '<span class="cursor">\u258B</span>' : "");
  scrollToBottom();
}

function appendErrorBubble(message, oom) {
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble msg-error";
  let html = '<div class="msg-content">\u26A0\uFE0F ' + escapeHtml(message) + '</div>';
  if (oom) html += '<button class="retry-lighter-btn" onclick="window.__switchToLighter()">Switch to lighter model</button>';
  html += '<button class="retry-btn" onclick="window.__retryLastMessage()">Retry</button>';
  bubble.innerHTML = html;
  dom.messagesArea.appendChild(bubble);
  scrollToBottom();
}

function getLastBotBubble() {
  const all = dom.messagesArea.querySelectorAll('.msg-bubble.msg-bot[data-active="true"]');
  return all.length > 0 ? all[all.length - 1] : null;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    dom.messagesArea.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "end" });
  });
}

/* -- Lightweight Markdown ----------------------------------- */
function renderMarkdownLight(text) {
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/\n/g, "<br>");
  return html;
}

function escapeHtml(str) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}

/* -- Send Message ------------------------------------------- */
async function sendMessage() {
  const text = dom.chatInput.value.trim();
  if (!text) return;

  /* If sleeping, wake first then send */
  if (state.isSleeping) {
    dom.chatInput.value = text; // preserve
    await wakeFromSleep();
    // after wake, engine is ready — fall through
  }

  if (state.isGenerating || !engine) return;

  resetIdleTimer();
  state.messages.push({ role: "user", content: text });
  appendUserBubble(text);
  dom.chatInput.value = "";
  dom.chatInput.style.height = "auto";

  state.isGenerating  = true;
  state.streamBuffer  = "";
  updateUIGenerating();
  appendBotBubble();

  try {
    await streamChat([
      { role: "system", content: SYSTEM_PROMPT },
      ...state.messages,
    ]);
  } catch (err) {
    state.isGenerating = false;
    const isOOM = err.message?.includes("memory") || err.message?.includes("OOM") || err.message?.includes("allocation");
    appendErrorBubble(err.message || "Generation failed", isOOM);
    updateUIReady();
  }
}

/* -- Input Handling ----------------------------------------- */
function setupInput() {
  dom.chatInput.addEventListener("input", () => {
    dom.chatInput.style.height = "auto";
    dom.chatInput.style.height = Math.min(dom.chatInput.scrollHeight, 120) + "px";
    resetIdleTimer();
  });

  dom.chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  dom.sendBtn.addEventListener("click", sendMessage);

  dom.modelSelect.addEventListener("change", async () => {
    const idx = parseInt(dom.modelSelect.value, 10);
    const target = MODELS[idx];
    if (target.id === state.loadedModel?.id) return; // already loaded
    hideUpgradeBanner();
    await loadModel(target.id, true);
  });

  dom.overlayRetryBtn.addEventListener("click", async () => {
    dom.overlayError.style.display = "none";
    /* Clear caches before manual retry in case of stale/corrupt data */
    try {
      const keys = await caches.keys();
      for (const key of keys) await caches.delete(key);
    } catch (_) {}
    const id = state.selectedModel ? state.selectedModel.id : PHASE1_MODEL.id;
    loadModel(id, true);
  });

  dom.overlayFallbackBtn.addEventListener("click", async () => {
    dom.overlayError.style.display = "none";
    try {
      const keys = await caches.keys();
      for (const key of keys) await caches.delete(key);
    } catch (_) {}
    loadModel(PHASE1_MODEL.id, true);
  });

  if (dom.upgradeYesBtn) dom.upgradeYesBtn.addEventListener("click", handleUpgradeYes);
  if (dom.upgradeNoBtn)  dom.upgradeNoBtn.addEventListener("click", handleUpgradeNo);
}

/* -- Global helpers for inline onclick ---------------------- */
window.__retryLastMessage = function () {
  if (state.messages.length === 0 || state.isGenerating) return;
  const lastUserIdx = state.messages.map(m => m.role).lastIndexOf("user");
  if (lastUserIdx < 0) return;
  state.isGenerating = true;
  state.streamBuffer = "";
  updateUIGenerating();
  appendBotBubble();
  streamChat([
    { role: "system", content: SYSTEM_PROMPT },
    ...state.messages.slice(0, lastUserIdx + 1),
  ]).catch((err) => {
    state.isGenerating = false;
    appendErrorBubble(err.message || "Retry failed", false);
    updateUIReady();
  });
};

window.__switchToLighter = function () {
  const currentIdx = MODELS.indexOf(state.selectedModel);
  if (currentIdx > 0) {
    hideUpgradeBanner();
    loadModel(MODELS[currentIdx - 1].id, true);
  }
};

/* -- Network Status ----------------------------------------- */
function setupNetworkStatus() {
  window.addEventListener("offline", () => {
    if (!state.loadedModel) {
      appendErrorBubble("You are offline and no model is cached. Connect to the internet to download a model.", false);
    }
  });
}

/* -- Global Error Handler ----------------------------------- */
window.onerror = (msg) => {
  if (typeof msg === "string" && (msg.includes("memory") || msg.includes("Out of"))) {
    handleError("Out of memory \u2014 try switching to the \u26A1 Light model", true, true);
  }
};

/* ============================================================
   BOOT SEQUENCE — The GTA Loading Experience
   ============================================================
   1. Detect hardware (50ms)
   2. Phase 1: Load Llama 1B (0.7 GB) with GTA progress bar
   3. Chat unlocked — user starts talking
   4. Phase 2: Background-cache the recommended bigger model
   5. Show upgrade banner when Phase 2 is ready
   ============================================================ */
async function boot() {
  cacheDom();

  /* ── Register Download Accelerator Service Worker ── */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js")
      .then(reg => console.log("[SW] Download accelerator registered:", reg.scope))
      .catch(err => console.warn("[SW] Registration failed (non-critical):", err.message));
  }

  const hardware = await detectHardware();

  if (!hardware.webgpu) {
    dom.overlay.style.display = "none";
    dom.webgpuError.style.display = "flex";
    return;
  }

  /* Determine Phase 2 target based on RAM */
  state.phase2Model = getPhase2Model(hardware.ram);

  /* Phase 1: Always start with the lightest model for instant start */
  state.selectedModel = PHASE1_MODEL;
  populateModelSelect();
  updateDeviceInfo();
  setupInput();
  setupNetworkStatus();

  console.log("[Boot] Phase 1 \u2192 Loading", PHASE1_MODEL.id);
  const ok = await loadModel(PHASE1_MODEL.id, true);

  /* Phase 2: Silently background-cache the bigger model */
  if (ok && state.phase2Model && state.phase2Model.id !== PHASE1_MODEL.id) {
    console.log("[Boot] Phase 2 \u2192 Background caching", state.phase2Model.id);
    // backgroundCachePhase2(); — disabled
  }
}

/* -- DOMContentLoaded --------------------------------------- */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}