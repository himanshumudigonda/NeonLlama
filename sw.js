/* ============================================================
   NeonLlama — Download Accelerator Service Worker
   
   HOW IT WORKS:
   WebLLM fetches model shards one by one from HuggingFace.
   This SW intercepts those fetch requests and uses HTTP Range
   requests to download each shard in 4 parallel chunks,
   then reassembles them — like a download manager (IDM).
   
   Result: 3-4x faster download on most connections.
   ============================================================ */

const SW_VERSION = "v2";
const PARALLEL_CHUNKS = 4; // download each shard in 4 parallel pieces
const MIN_SIZE_FOR_PARALLEL = 10 * 1024 * 1024; // only parallelize files > 10MB

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

/* Intercept all fetch requests */
self.addEventListener("fetch", (e) => {
  const url = e.request.url;

  /* Only accelerate HuggingFace model shard downloads */
  const isHFShard = (
    url.includes("huggingface.co") ||
    url.includes("hf.co")
  ) && (
    url.includes(".bin") ||
    url.includes(".safetensors") ||
    url.includes("params_shard") ||
    url.includes("ndarray-cache")
  );

  if (isHFShard && e.request.method === "GET") {
    e.respondWith(parallelFetch(e.request));
    return;
  }

  /* All other requests — pass through normally */
  e.respondWith(fetch(e.request));
});

/* ── Parallel Chunk Downloader ─────────────────────────────── */
async function parallelFetch(request) {
  try {
    /* Step 1: HEAD request to get file size */
    const head = await fetch(request.url, {
      method: "HEAD",
      mode: "cors",
      credentials: "omit",
    });

    const contentLength = parseInt(head.headers.get("content-length") || "0");
    const acceptsRanges = head.headers.get("accept-ranges") === "bytes";

    /* If server doesn't support range requests or file is small → normal fetch */
    if (!acceptsRanges || contentLength < MIN_SIZE_FOR_PARALLEL) {
      return fetch(request);
    }

    /* Step 2: Split file into N parallel chunks */
    const chunkSize = Math.ceil(contentLength / PARALLEL_CHUNKS);
    const ranges = [];

    for (let i = 0; i < PARALLEL_CHUNKS; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize - 1, contentLength - 1);
      ranges.push({ start, end });
    }

    /* Step 3: Fetch all chunks simultaneously */
    const chunkPromises = ranges.map(({ start, end }) =>
      fetch(request.url, {
        method: "GET",
        headers: { "Range": `bytes=${start}-${end}` },
        mode: "cors",
        credentials: "omit",
      }).then(r => r.arrayBuffer())
    );

    const chunks = await Promise.all(chunkPromises);

    /* Step 4: Reassemble chunks in order */
    const totalSize = chunks.reduce((acc, c) => acc + c.byteLength, 0);
    const assembled = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      assembled.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    /* Step 5: Return as a proper Response */
    return new Response(assembled.buffer, {
      status: 200,
      headers: {
        "Content-Type": head.headers.get("content-type") || "application/octet-stream",
        "Content-Length": String(totalSize),
      },
    });

  } catch (err) {
    /* Any failure → fall back to normal fetch silently */
    console.warn("[SW] Parallel fetch failed, falling back:", err.message);
    return fetch(request);
  }
}
