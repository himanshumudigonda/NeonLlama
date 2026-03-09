import { CreateWebWorkerMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

/* -- System Prompt ------------------------------------------ */
const SYSTEM_PROMPT = "You are LlamaChat, a helpful and concise AI assistant running 100% privately in the user's browser. Be friendly and accurate.";

/* -- Model Registry ----------------------------------------- */
const MODELS = [
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "\u26A1 Light \u2014 Llama 3.2 1B  by Meta       (~0.7 GB)",
    brand: "Meta",
    brandIcon: "\uD83E\uDD99",
    botLabel: "\uD83E\uDD99 Llama",
    minRAM: 0,
    note: "Silent. Instant. Works on any device.",
    sizeMB: 700,
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    label: "\u2696\uFE0F Balanced \u2014 Phi 3.5 Mini  by Microsoft  (~2.2 GB)",
    brand: "Microsoft",
    brandIcon: "\u25C6",
    botLabel: "\u25C6 Phi",
    minRAM: 4,
    note: "Smart & silent. Best for most laptops.",
    sizeMB: 2200,
  },
  {
    id: "Llama-3.1-8B-Instruct-q4f32_1-MLC",
    label: "\uD83E\uDDE0 Powerful \u2014 Llama 3.1 8B  by Meta       (~4.5 GB)",
    brand: "Meta",
    brandIcon: "\uD83E\uDD99",
    botLabel: "\uD83E\uDD99 Llama",
    minRAM: 8,
    note: "GPT-level quality. Needs good hardware.",
    sizeMB: 4500,
  },
];

/* -- App State ---------------------------------------------- */
const state = {
  hardware: { ram: 4, cores: 4, gpu: "Unknown", webgpu: false },
  selectedModel: null,
  loadedModel: null,
  isLoading: false,
  isGenerating: false,
  messages: [],
  streamBuffer: "",
};

let engine = null;
let currentWorker = null;

/* -- DOM References (cached once on init) ------------------- */
const _q = (sel) => document.querySelector(sel);
const dom = {};

function cacheDom() {
  dom.overlay = _q("#loading-overlay");
  dom.overlayTitle = _q("#overlay-title");
  dom.overlaySubtitle = _q("#overlay-subtitle");
  dom.overlayPercent = _q("#overlay-percent");
  dom.progressBarFill = _q("#progress-bar-fill");
  dom.overlayStatus = _q("#overlay-status");
  dom.overlayStats = _q("#overlay-stats");
  dom.overlayCacheNote = _q("#overlay-cache-note");
  dom.overlayError = _q("#overlay-error");
  dom.overlayErrorText = _q("#overlay-error-text");
  dom.overlayRetryBtn = _q("#overlay-retry-btn");
  dom.overlayFallbackBtn = _q("#overlay-fallback-btn");
  dom.webgpuError = _q("#webgpu-error");
  dom.chatContainer = _q("#chat-container");
  dom.messagesArea = _q("#messages-area");
  dom.welcomeCard = _q("#welcome-card");
  dom.welcomeBrand = _q("#welcome-brand");
  dom.inputArea = _q("#input-area");
  dom.modelSelect = _q("#model-select");
  dom.chatInput = _q("#chat-input");
  dom.sendBtn = _q("#send-btn");
  dom.sendBtnText = _q("#send-btn-text");
  dom.deviceInfo = _q("#device-info");
  dom.loadModelBtn = _q("#load-model-btn");
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
      } catch (_) {
        resolve("Unknown GPU");
      }
    });

  const checkWebGPU = () =>
    new Promise((resolve) => {
      if (!navigator.gpu) { resolve(false); return; }
      navigator.gpu.requestAdapter()
        .then((adapter) => resolve(!!adapter))
        .catch(() => resolve(false));
    });

  const [ram, cores, gpuInfo, webgpuSupported] = await Promise.all([
    Promise.resolve(navigator.deviceMemory || 4),
    Promise.resolve(navigator.hardwareConcurrency || 4),
    getGPUInfo(),
    checkWebGPU(),
  ]);

  state.hardware = { ram, cores, gpu: gpuInfo, webgpu: webgpuSupported };
  console.log("[Hardware] RAM:", ram, "GB, Cores:", cores, ", GPU:", gpuInfo, ", WebGPU:", webgpuSupported, "in", (performance.now() - t0).toFixed(1), "ms");
  return state.hardware;
}

/* -- Model Auto-Selection ----------------------------------- */
function autoSelectModel(ram) {
  if (ram >= 8) return MODELS[2];
  if (ram >= 4) return MODELS[1];
  return MODELS[0];
}

/* -- Progress Tracking -------------------------------------- */
let downloadStartTime = 0;
let lastProgressTime = 0;
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
    result.total_mb = parseFloat(gbMatch[2]) * 1024;
  } else if (mbMatch) {
    result.loaded_mb = parseFloat(mbMatch[1]);
    result.total_mb = parseFloat(mbMatch[2]);
  } else if (result.progress > 0) {
    result.loaded_mb = result.progress * 100;
    result.total_mb = 100;
  }

  const now = performance.now();
  const elapsedSinceStart = (now - downloadStartTime) / 1000;
  if (elapsedSinceStart > 0.5 && result.loaded_mb > 0) {
    const timeDelta = (now - lastProgressTime) / 1000;
    const dataDelta = result.loaded_mb - lastProgressLoaded;
    if (timeDelta > 0.1 && dataDelta > 0) {
      result.speed_mbps = dataDelta / timeDelta;
    } else if (elapsedSinceStart > 0) {
      result.speed_mbps = result.loaded_mb / elapsedSinceStart;
    }
    if (result.speed_mbps > 0 && result.total_mb > result.loaded_mb) {
      result.eta_seconds = (result.total_mb - result.loaded_mb) / result.speed_mbps;
    }
  }
  lastProgressTime = now;
  lastProgressLoaded = result.loaded_mb;
  return result;
}

/* -- Load Progress Handler ---------------------------------- */
function handleLoadProgress(p) {
  const pct = Math.round(p.progress * 100);
  dom.overlayPercent.textContent = pct + "%";
  dom.progressBarFill.style.width = pct + "%";
  dom.sendBtnText.textContent = "Loading... " + pct + "%";

  let statusText = p.text || "Loading model...";
  if (statusText.length > 60) {
    if (statusText.includes("Fetching")) statusText = "Downloading weights...";
    else if (statusText.includes("Loading")) statusText = "Loading model into GPU...";
    else statusText = statusText.substring(0, 57) + "...";
  }
  dom.overlayStatus.textContent = statusText;

  let statsText = "";
  if (p.total_mb > 0) {
    const loadedStr = p.loaded_mb >= 1024
      ? (p.loaded_mb / 1024).toFixed(2) + " GB" : Math.round(p.loaded_mb) + " MB";
    const totalStr = p.total_mb >= 1024
      ? (p.total_mb / 1024).toFixed(1) + " GB" : Math.round(p.total_mb) + " MB";
    statsText += loadedStr + " / " + totalStr;
  }
  if (p.speed_mbps > 0.5) {
    statsText += "  \u2193 " + Math.round(p.speed_mbps) + " MB/s";
  }
  if (p.eta_seconds > 1 && p.eta_seconds < 3600) {
    const eta = Math.round(p.eta_seconds);
    statsText += eta >= 60 ? "  ~" + Math.ceil(eta / 60) + " min remaining" : "  ~" + eta + "s left";
  }
  dom.overlayStats.textContent = statsText;

  if (pct > 5) {
    dom.overlayCacheNote.textContent = "\u2713 Cached locally \u2014 instant next visit";
    dom.overlayCacheNote.style.opacity = "1";
  }
}

/* -- Load Complete Handler ---------------------------------- */
function handleLoadComplete({ modelId }) {
  state.isLoading = false;
  state.loadedModel = MODELS.find((m) => m.id === modelId) || state.selectedModel;

  dom.overlayPercent.textContent = "100%";
  dom.progressBarFill.style.width = "100%";
  dom.overlayStatus.textContent = "Model ready!";
  dom.overlayStats.textContent = "";

  setTimeout(() => {
    dom.overlay.classList.add("fade-out");
    setTimeout(() => {
      dom.overlay.style.display = "none";
      dom.overlay.classList.remove("fade-out");
    }, 500);
  }, 400);

  updateUIReady();
  updateWelcomeCard();
}

/* -- Stream Chunk Handler ----------------------------------- */
function handleStreamChunk({ delta }) {
  state.streamBuffer += delta;
  updateBotMessage(state.streamBuffer, true);
}

/* -- Stream Done Handler ------------------------------------ */
function handleStreamDone({ stats }) {
  state.isGenerating = false;

  const lastBotMsg = getLastBotBubble();
  if (lastBotMsg) {
    const cursor = lastBotMsg.querySelector(".cursor");
    if (cursor) cursor.remove();

    const statsEl = document.createElement("div");
    statsEl.className = "msg-stats";
    const tps = stats.tokensPerSecond || 0;
    const secs = (stats.ms / 1000).toFixed(1);
    statsEl.textContent = stats.tokens + " tokens \u00B7 " + secs + "s \u00B7 " + tps + " tok/s";
    lastBotMsg.appendChild(statsEl);
  }

  state.messages.push({ role: "assistant", content: state.streamBuffer });
  state.streamBuffer = "";
  updateUIReady();
}

/* -- Error Handler ------------------------------------------ */
function handleError(message, recoverable = true, oom = false) {
  console.error("[Error]", message);

  if (state.isLoading) {
    state.isLoading = false;
    if (oom) {
      showOverlayError("Out of memory! Try a lighter model.", true, true);
    } else {
      showOverlayError(message, recoverable);
    }
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

/* -- Overlay Error Display ---------------------------------- */
function showOverlayError(msg, recoverable, showFallback = false) {
  dom.overlayError.style.display = "block";
  dom.overlayErrorText.textContent = msg;
  dom.overlayRetryBtn.style.display = recoverable ? "inline-block" : "none";
  dom.overlayFallbackBtn.style.display = showFallback ? "inline-block" : "none";
  dom.overlayStatus.textContent = "Error";
  dom.overlayStats.textContent = "";
}

/* -- Cache Check -------------------------------------------- */
async function checkAllCaches() {
  try {
    if ("caches" in self) {
      const cacheNames = await caches.keys();
      return cacheNames.some(
        (name) => name.includes("webllm") || name.includes("mlc") || name.includes("wasm")
      );
    }
  } catch (_) {}
  return false;
}

/* -- UI Update Functions ------------------------------------ */
function updateUIReady() {
  dom.sendBtn.disabled = false;
  dom.sendBtnText.textContent = "Send \u2192";
  dom.chatInput.disabled = false;
  dom.chatInput.placeholder = "Type a message...";
  dom.modelSelect.disabled = false;
  if (dom.loadModelBtn) dom.loadModelBtn.disabled = false;
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
  const gpuStatus = hw.webgpu ? "WebGPU \u2713" : "WebGPU \u2717";
  const modelName = state.selectedModel ? state.selectedModel.id.split("-q")[0] : "None";
  const brand = state.selectedModel ? state.selectedModel.brand : "";
  dom.deviceInfo.textContent =
    "Detected: " + hw.ram + " GB RAM \u00B7 " + gpuStatus + " \u00B7 Recommended: " + modelName + " by " + brand;
}

/* -- Populate Model Selector -------------------------------- */
function populateModelSelect() {
  dom.modelSelect.innerHTML = "";
  MODELS.forEach((m, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = m.label;
    if (m.minRAM > state.hardware.ram) {
      opt.textContent += " (may be slow)";
    }
    dom.modelSelect.appendChild(opt);
  });
  const selectedIdx = MODELS.indexOf(state.selectedModel);
  if (selectedIdx >= 0) dom.modelSelect.value = selectedIdx;
}

/* -- Chat Rendering ----------------------------------------- */
function clearChat() {
  const msgs = dom.messagesArea.querySelectorAll(".msg-bubble");
  msgs.forEach((el) => el.remove());
  dom.welcomeCard.style.display = "block";
}

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
  const contentEl = bubble.querySelector(".msg-content");
  const rendered = renderMarkdownLight(fullText);
  contentEl.innerHTML = rendered + (streaming ? '<span class="cursor">\u258B</span>' : "");
  scrollToBottom();
}

function appendErrorBubble(message, oom) {
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble msg-error";
  let html = '<div class="msg-content">\u26A0\uFE0F ' + escapeHtml(message) + '</div>';
  if (oom) {
    html += '<button class="retry-lighter-btn" onclick="window.__switchToLighter()">Switch to lighter model</button>';
  }
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
  const area = dom.messagesArea;
  requestAnimationFrame(() => {
    area.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "end" });
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

/* -- Load Model --------------------------------------------- */
async function loadSelectedModel() {
  if (!state.selectedModel || state.isLoading) return;

  state.isLoading = true;
  updateUILoading();

  dom.overlay.style.display = "flex";
  dom.overlay.classList.remove("fade-out");
  dom.overlayPercent.textContent = "0%";
  dom.progressBarFill.style.width = "0%";
  dom.overlayStatus.textContent = "Initializing engine...";
  dom.overlayStats.textContent = "";
  dom.overlayCacheNote.textContent = "";
  dom.overlayError.style.display = "none";

  const modelId = state.selectedModel.id;

  // Validate model ID (prevents .find() crash)
  if (!MODELS.find(m => m.id === modelId)) {
    console.error("Invalid model ID — must match prebuiltAppConfig exactly:", modelId);
    handleError("Invalid model ID: " + modelId, false);
    return;
  }

  downloadStartTime = performance.now();
  lastProgressTime = downloadStartTime;
  lastProgressLoaded = 0;

  const initProgressCallback = (report) => {
    try {
      const normalized = typeof report === "string"
        ? { text: report, progress: 0 } : report;
      const parsed = parseProgressReport(normalized);
      handleLoadProgress(parsed);
    } catch (_) {}
  };

  try {
    if (currentWorker) {
      try { currentWorker.terminate(); } catch (_) {}
      currentWorker = null;
      engine = null;
    }

    currentWorker = new Worker("./worker.js", { type: "module" });

    engine = await CreateWebWorkerMLCEngine(
      currentWorker,
      modelId,
      { initProgressCallback: initProgressCallback },
    );

    handleLoadComplete({ modelId });
  } catch (err) {
    engine = null;
    if (currentWorker) {
      try { currentWorker.terminate(); } catch (_) {}
      currentWorker = null;
    }
    const isOOM = err.message?.includes("memory") || err.message?.includes("OOM") || err.message?.includes("allocation");
    handleError(err.message || "Failed to load model", true, isOOM);
  }
}

/* -- Send Message ------------------------------------------- */
async function sendMessage() {
  const text = dom.chatInput.value.trim();
  if (!text || state.isGenerating || !engine) return;

  state.messages.push({ role: "user", content: text });
  appendUserBubble(text);
  dom.chatInput.value = "";
  dom.chatInput.style.height = "auto";

  state.isGenerating = true;
  state.streamBuffer = "";
  updateUIGenerating();
  appendBotBubble();

  try {
    const fullMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...state.messages,
    ];

    const startTime = performance.now();
    let tokenCount = 0;

    const chunks = await engine.chat.completions.create({
      messages: fullMessages,
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 1024,
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of chunks) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        tokenCount++;
        handleStreamChunk({ delta });
      }

      if (chunk.usage) {
        const elapsed = performance.now() - startTime;
        handleStreamDone({
          stats: {
            tokens: chunk.usage.completion_tokens || tokenCount,
            prompt_tokens: chunk.usage.prompt_tokens || 0,
            ms: Math.round(elapsed),
            tokensPerSecond: Math.round(
              ((chunk.usage.completion_tokens || tokenCount) / elapsed) * 1000
            ),
          },
        });
        return;
      }
    }

    if (state.isGenerating) {
      const elapsed = performance.now() - startTime;
      handleStreamDone({
        stats: {
          tokens: tokenCount,
          prompt_tokens: 0,
          ms: Math.round(elapsed),
          tokensPerSecond: tokenCount > 0 ? Math.round((tokenCount / elapsed) * 1000) : 0,
        },
      });
    }
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
  });

  dom.chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  dom.sendBtn.addEventListener("click", sendMessage);

  dom.modelSelect.addEventListener("change", () => {
    const idx = parseInt(dom.modelSelect.value, 10);
    state.selectedModel = MODELS[idx];
    updateDeviceInfo();
    loadSelectedModel();
  });

  if (dom.loadModelBtn) {
    dom.loadModelBtn.addEventListener("click", () => {
      loadSelectedModel();
    });
  }

  dom.overlayRetryBtn.addEventListener("click", () => {
    dom.overlayError.style.display = "none";
    loadSelectedModel();
  });

  dom.overlayFallbackBtn.addEventListener("click", () => {
    dom.overlayError.style.display = "none";
    state.selectedModel = MODELS[0];
    populateModelSelect();
    loadSelectedModel();
  });
}

/* -- Global helpers for inline onclick ---------------------- */
window.__retryLastMessage = function () {
  if (state.messages.length > 0 && !state.isGenerating) {
    const lastUserIdx = state.messages.map((m) => m.role).lastIndexOf("user");
    if (lastUserIdx >= 0) {
      state.isGenerating = true;
      state.streamBuffer = "";
      updateUIGenerating();
      appendBotBubble();
      sendMessageFromHistory(state.messages.slice(0, lastUserIdx + 1));
    }
  }
};

window.__switchToLighter = function () {
  const currentIdx = MODELS.indexOf(state.selectedModel);
  if (currentIdx > 0) {
    state.selectedModel = MODELS[currentIdx - 1];
    populateModelSelect();
    state.loadedModel = null;
    loadSelectedModel();
  }
};

async function sendMessageFromHistory(msgs) {
  try {
    const fullMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...msgs,
    ];
    const startTime = performance.now();
    let tokenCount = 0;

    const chunks = await engine.chat.completions.create({
      messages: fullMessages,
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 1024,
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of chunks) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        tokenCount++;
        handleStreamChunk({ delta });
      }
      if (chunk.usage) {
        const elapsed = performance.now() - startTime;
        handleStreamDone({
          stats: {
            tokens: chunk.usage.completion_tokens || tokenCount,
            prompt_tokens: chunk.usage.prompt_tokens || 0,
            ms: Math.round(elapsed),
            tokensPerSecond: Math.round(
              ((chunk.usage.completion_tokens || tokenCount) / elapsed) * 1000
            ),
          },
        });
        return;
      }
    }

    if (state.isGenerating) {
      const elapsed = performance.now() - startTime;
      handleStreamDone({
        stats: {
          tokens: tokenCount,
          prompt_tokens: 0,
          ms: Math.round(elapsed),
          tokensPerSecond: tokenCount > 0 ? Math.round((tokenCount / elapsed) * 1000) : 0,
        },
      });
    }
  } catch (err) {
    state.isGenerating = false;
    appendErrorBubble(err.message || "Generation failed", false);
    updateUIReady();
  }
}

/* -- Network Status ----------------------------------------- */
function setupNetworkStatus() {
  window.addEventListener("offline", () => {
    if (!state.loadedModel) {
      appendErrorBubble("You are offline and no model is cached. Connect to the internet to download a model.", false);
    }
  });
  window.addEventListener("online", () => {
    console.log("[Network] Back online");
  });
}

/* -- Global Error Handler ----------------------------------- */
window.onerror = (msg) => {
  if (typeof msg === "string" && (msg.includes("memory") || msg.includes("Out of"))) {
    handleError("Out of memory — try switching to the \u26A1 Light model", true, true);
  }
};

/* -- Boot Sequence ------------------------------------------ */
async function boot() {
  cacheDom();

  const [hardware] = await Promise.all([detectHardware(), checkAllCaches()]);

  if (!hardware.webgpu) {
    dom.overlay.style.display = "none";
    dom.webgpuError.style.display = "flex";
    return;
  }

  state.selectedModel = autoSelectModel(hardware.ram);
  populateModelSelect();
  updateDeviceInfo();
  setupInput();
  setupNetworkStatus();
  loadSelectedModel();
}

/* -- DOMContentLoaded --------------------------------------- */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
