/* ============================================================
   worker.js — WebLLM Engine Thread
   Owns 100% of AI engine lifecycle. Main thread never imports WebLLM.
   ============================================================ */

let engine = null;
let currentModelId = null;

const SYSTEM_PROMPT = `You are LlamaChat, a helpful, fast, and concise AI assistant running 100% privately in the user's browser on their own device. Powered by Meta Llama or Microsoft Phi depending on the selected model. Be friendly, accurate, and to the point. Never mention that you are running locally unless the user asks. Format responses cleanly.`;

/* ── Dynamic import WebLLM from CDN ────────────────────────── */
let webllm = null;

async function loadWebLLM() {
  if (webllm) return webllm;
  try {
    webllm = await import("https://esm.run/@mlc-ai/web-llm");
  } catch (_) {
    // Primary CDN failed, try fallbacks
  }
  if (!webllm) {
    webllm = await import("https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm").catch(() => null);
  }
  if (!webllm) {
    webllm = await import("https://esm.run/web-llm").catch(() => null);
  }
  if (!webllm) {
    throw new Error("Failed to load WebLLM library. Check your internet connection.");
  }
  return webllm;
}

/* ── Progress tracking state ──────────────────────────────── */
let downloadStartTime = 0;
let lastProgressTime = 0;
let lastProgressLoaded = 0;

function parseProgressReport(report) {
  const result = {
    progress: 0,
    text: report.text || "",
    loaded_mb: 0,
    total_mb: 0,
    speed_mbps: 0,
    eta_seconds: 0,
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

/* ── Message handler ──────────────────────────────────────── */
self.onmessage = async function (e) {
  const { type, payload } = e.data;

  switch (type) {
    case "PRELOAD_CHECK":
      await handlePreload();
      break;
    case "LOAD_MODEL":
      await handleLoadModel(payload);
      break;
    case "GENERATE":
      await handleGenerate(payload);
      break;
    case "RESET_CHAT":
      await handleResetChat();
      break;
    default:
      send("ERROR", { message: `Unknown message type: ${type}`, recoverable: true });
  }
};

/* ── PRELOAD: Warm up worker, import WebLLM ───────────────── */
async function handlePreload() {
  try {
    await loadWebLLM();
    send("PRELOAD_READY", { ready: true });
  } catch (err) {
    send("ERROR", { message: err.message, recoverable: true });
  }
}

/* ── LOAD MODEL: Create MLC engine with progress ──────────── */
async function handleLoadModel({ modelId }) {
  try {
    if (engine && currentModelId === modelId) {
      send("LOAD_COMPLETE", { modelId, cached: true });
      return;
    }

    if (engine) {
      try { engine.unload(); } catch (_) {}
      engine = null;
      currentModelId = null;
    }

    const lib = await loadWebLLM();
    downloadStartTime = performance.now();
    lastProgressTime = downloadStartTime;
    lastProgressLoaded = 0;

    const progressCallback = (report) => {
      const parsed = parseProgressReport(report);
      send("LOAD_PROGRESS", parsed);
    };

    engine = await lib.CreateMLCEngine(modelId, {
      initProgressCallback: progressCallback,
      appConfig: {
        useIndexedDBCache: true,
      },
    });

    currentModelId = modelId;
    send("LOAD_COMPLETE", { modelId, cached: false });
  } catch (err) {
    engine = null;
    currentModelId = null;
    const isOOM =
      err.message?.includes("memory") ||
      err.message?.includes("OOM") ||
      err.message?.includes("allocation");
    send("ERROR", {
      message: err.message || "Model failed to load",
      recoverable: true,
      oom: isOOM,
    });
  }
}

/* ── GENERATE: Stream chat completions ────────────────────── */
async function handleGenerate({ messages }) {
  if (!engine) {
    send("ERROR", { message: "No model loaded", recoverable: true });
    return;
  }

  try {
    const fullMessages = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

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
        send("STREAM_CHUNK", { delta });
      }

      if (chunk.usage) {
        const elapsed = performance.now() - startTime;
        send("STREAM_DONE", {
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

    const elapsed = performance.now() - startTime;
    send("STREAM_DONE", {
      stats: {
        tokens: tokenCount,
        prompt_tokens: 0,
        ms: Math.round(elapsed),
        tokensPerSecond: tokenCount > 0 ? Math.round((tokenCount / elapsed) * 1000) : 0,
      },
    });
  } catch (err) {
    const isOOM =
      err.message?.includes("memory") ||
      err.message?.includes("OOM") ||
      err.message?.includes("allocation");
    send("ERROR", {
      message: err.message || "Generation failed",
      recoverable: true,
      oom: isOOM,
    });
  }
}

/* ── RESET CHAT: Clear conversation context ───────────────── */
async function handleResetChat() {
  if (engine) {
    try {
      await engine.resetChat();
    } catch (_) {}
  }
  send("CHAT_RESET", {});
}

/* ── Typed message sender ─────────────────────────────────── */
function send(type, payload) {
  self.postMessage({ type, payload });
}
