/* ============================================================
   worker.js - WebLLM Worker Thread
   Official WebWorkerMLCEngineHandler pattern.
   The heavy model loading + inference runs here automatically.
   Main thread communicates via CreateWebWorkerMLCEngine.
   ============================================================ */
import { WebWorkerMLCEngineHandler } from "https://esm.run/@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => {
  handler.onmessage(msg);
};
