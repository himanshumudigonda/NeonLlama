/* ============================================================
   worker.js — WebLLM Engine Thread
   Owns 100% of AI engine lifecycle. Main thread never imports WebLLM.
   ============================================================ */

let engine = null;
let currentModelId = null;

const SYSTEM_PROMPT = `You are NeonLlama, a helpful, fast, and concise AI assistant running 100% privately in the user's browser on their own device. Powered by Meta Llama or Microsoft Phi depending on the selected model. Be friendly, accurate, and to the point. Never mention that you are running locally unless the user asks. Format responses cleanly.`;

/* ── Model records with FULL model_lib URLs ────────────────── */
// Base URL for pre-compiled WASM model libraries (matches WebLLM v0.2.80+ prebuilt config)
const MODEL_LIB_BASE =
  "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/";

const OUR_MODEL_RECORDS = [
  {
    model: "https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC",
    model_id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    model_lib: MODEL_LIB_BASE + "Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 879,
    low_resource_required: true,
    required_features: ["shader-f16"],
    overrides: { context_window_size: 4096 },
  },
  {
    model: "https://huggingface.co/mlc-ai/Phi-3.5-mini-instruct-q4f16_1-MLC",
    model_id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    model_lib: MODEL_LIB_BASE + "Phi-3.5-mini-instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 3672,
    low_resource_required: false,
    overrides: { context_window_size: 4096 },
  },
  {
    model: "https://huggingface.co/mlc-ai/Llama-3.1-8B-Instruct-q4f16_1-MLC",
    model_id: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
    // Note: WebLLM uses "Llama-3_1" (underscore) in WASM filename, not "Llama-3.1" (dot)
    model_lib: MODEL_LIB_BASE + "Llama-3_1-8B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 5001,
    low_resource_required: false,
    overrides: { context_window_size: 4096 },
  },
];

/* ── Dynamic import WebLLM from CDN ────────────────────────── */
let webllm = null;

async function loadWebLLM() {
  if (webllm) return webllm;

  const urls = [
    "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm",
    "https://esm.run/@mlc-ai/web-llm",
  ];

  for (const url of urls) {
    try {
      const mod = await import(url);
      if (mod.CreateMLCEngine || mod.MLCEngine) {
        webllm = mod;
        console.log("[Worker] WebLLM loaded from:", url);
        console.log("[Worker] Has CreateMLCEngine:", !!mod.CreateMLCEngine);
        console.log("[Worker] Has MLCEngine:", !!mod.MLCEngine);
        console.log("[Worker] Has prebuiltAppConfig:", !!mod.prebuiltAppConfig);
        console.log("[Worker] prebuiltAppConfig.model_list:", mod.prebuiltAppConfig?.model_list?.length ?? "N/A");
        return webllm;
      }
    } catch (e) {
      console.warn("[Worker] CDN failed:", url, e.message);
    }
  }

  throw new Error("Failed to load WebLLM library. Check your internet connection.");
}

/* ── Build appConfig with our models injected ─────────────── */
function buildAppConfig(lib) {
  // Start from prebuilt config if available, otherwise empty
  let modelList;
  if (lib.prebuiltAppConfig && Array.isArray(lib.prebuiltAppConfig.model_list)) {
    modelList = [...lib.prebuiltAppConfig.model_list];
    console.log("[Worker] Using prebuilt config with", modelList.length, "models");
  } else {
    modelList = [];
    console.log("[Worker] No prebuilt config, building from scratch");
  }

  // Ensure our models are in the list
  const existingIds = new Set(modelList.map((m) => m.model_id));
  for (const record of OUR_MODEL_RECORDS) {
    if (!existingIds.has(record.model_id)) {
      modelList.push(record);
      console.log("[Worker] Injected model:", record.model_id);
    }
  }

  return { model_list: modelList, useIndexedDBCache: true };
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
    send("PRELOAD_READY", { ready: true, availableModels: OUR_MODEL_RECORDS.map((m) => m.model_id) });
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
      try {
        const normalized = typeof report === "string"
          ? { text: report, progress: 0 }
          : report;
        const parsed = parseProgressReport(normalized);
        send("LOAD_PROGRESS", parsed);
      } catch (_) {}
    };

    // Build a guaranteed-valid appConfig with model_list
    const appConfig = buildAppConfig(lib);

    // Verify the requested model is in our config
    const found = appConfig.model_list.find((m) => m.model_id === modelId);
    if (!found) {
      throw new Error(`Model "${modelId}" not found in config. Available: ${appConfig.model_list.map(m => m.model_id).slice(0, 5).join(", ")}...`);
    }
    console.log("[Worker] Loading model:", modelId, "| model_lib:", found.model_lib?.substring(0, 80));

    // Strategy 1: CreateMLCEngine (standard API)
    if (lib.CreateMLCEngine) {
      try {
        engine = await lib.CreateMLCEngine(modelId, {
          initProgressCallback: progressCallback,
          appConfig: appConfig,
        });
        currentModelId = modelId;
        send("LOAD_COMPLETE", { modelId, cached: false });
        return;
      } catch (err) {
        console.warn("[Worker] CreateMLCEngine failed:", err.message);
        // If the error is about .find() or model_list, try Strategy 2
        if (!lib.MLCEngine) throw err;
        console.log("[Worker] Falling back to direct MLCEngine approach...");
      }
    }

    // Strategy 2: Direct MLCEngine construction + reload
    if (lib.MLCEngine) {
      const eng = new lib.MLCEngine({ appConfig: appConfig });
      if (eng.setInitProgressCallback) {
        eng.setInitProgressCallback(progressCallback);
      }
      await eng.reload(modelId);
      engine = eng;
      currentModelId = modelId;
      send("LOAD_COMPLETE", { modelId, cached: false });
      return;
    }

    throw new Error("WebLLM library loaded but no engine constructor available.");
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
