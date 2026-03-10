/* ═══════════════════════════════════════════════════════════
   NeonLlama Service Worker
   • PWA offline caching for app shell
   • Download accelerator for HuggingFace model shards
═══════════════════════════════════════════════════════════ */

const CACHE_NAME  = 'neonllama-v2';
const APP_SHELL   = [
  './',
  './index.html',
  './app.js',
  './worker.js',
  './manifest.json',
];

/* ── Install: cache app shell ─────────────────────────── */
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(APP_SHELL)).catch(() => {})
  );
});

/* ── Activate: clean old caches ──────────────────────── */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: serve shell from cache, accelerate HF downloads ── */
self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  /* App shell: cache-first */
  if (APP_SHELL.some(p => url.endsWith(p.replace('./', '/'))) || url === self.location.origin + '/') {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request))
    );
    return;
  }

  /* HuggingFace model shards: parallel chunk accelerator */
  if (url.includes('huggingface.co') && url.includes('.bin') ||
      url.includes('huggingface.co') && url.includes('.safetensors') ||
      url.includes('huggingface.co') && (url.includes('-shard') || url.includes('.gguf'))) {
    e.respondWith(acceleratedFetch(e.request));
    return;
  }
});

/* ── Parallel chunk downloader (4x speed) ────────────── */
async function acceleratedFetch(request) {
  try {
    /* 1. HEAD request to get file size */
    const head = await fetch(request.url, { method: 'HEAD' });
    const total = parseInt(head.headers.get('content-length') || '0');
    const acceptRanges = head.headers.get('accept-ranges');

    /* If range requests not supported or file < 2 MB, fall back */
    if (!acceptRanges || acceptRanges === 'none' || total < 2 * 1024 * 1024) {
      return fetch(request);
    }

    const CHUNKS = 4;
    const chunkSize = Math.ceil(total / CHUNKS);
    const ranges = Array.from({ length: CHUNKS }, (_, i) => {
      const start = i * chunkSize;
      const end   = Math.min(start + chunkSize - 1, total - 1);
      return { start, end };
    });

    /* 2. Fetch all chunks in parallel */
    const buffers = await Promise.all(
      ranges.map(({ start, end }) =>
        fetch(request.url, {
          headers: { Range: `bytes=${start}-${end}` }
        }).then(r => r.arrayBuffer())
      )
    );

    /* 3. Reassemble */
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const buf of buffers) {
      merged.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }

    return new Response(merged.buffer, {
      status: 200,
      headers: {
        'Content-Type':   head.headers.get('content-type') || 'application/octet-stream',
        'Content-Length': String(total),
      }
    });

  } catch {
    /* Safe fallback: normal fetch */
    return fetch(request);
  }
}