<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Rajdhani&weight=700&size=60&duration=2000&pause=99999&color=C8F000&background=0A0A0A00&center=true&vCenter=true&width=600&height=100&lines=⚡+NeonLlama" alt="NeonLlama" />

### The AI that lives in your browser. No server. No subscription. No surveillance.

<br/>

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-Try_It_Now-c8f000?style=for-the-badge&logoColor=black)](https://neonllama.netlify.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-ffffff?style=for-the-badge)](LICENSE)
[![WebGPU](https://img.shields.io/badge/Powered_By-WebGPU-00ff88?style=for-the-badge)](https://caniuse.com/webgpu)
[![Models](https://img.shields.io/badge/Models_By-Meta_×_Microsoft-0078d4?style=for-the-badge)](https://mlc.ai/web-llm)

<br/>

<img src="https://readme-typing-svg.demolab.com?font=Inter&weight=500&size=18&duration=3000&pause=1000&color=888888&center=true&vCenter=true&width=600&lines=No+API+keys.+No+cloud.+No+data+collection.;Llama+3.1+%C3%97+Phi+3.5+%C3%97+WebGPU+%3D+Private+AI;Download+once.+Chat+forever.+Even+offline." alt="Taglines" />

<br/><br/>

> **NeonLlama runs Meta's Llama and Microsoft's Phi AI models entirely inside your Chrome tab.**  
> Your messages never leave your device. Not even for a millisecond.

<br/>

---

</div>

## 🧠 What Is This?

**NeonLlama** is a free, open-source web app that lets you chat with powerful AI models — **without sending a single byte to any server.**

It works the same way GTA Vice City runs in a browser: the engine downloads once, caches locally, and runs entirely on your hardware using your GPU. After the first load it works completely offline, forever.

Think of it as **ChatGPT, but:**
- 🔒 100% private — your conversations never leave your device
- 💸 Completely free — no subscription, no API key, no credit card
- 📶 Works offline — once downloaded, no internet needed
- 🏎️ Runs on your GPU — powered by WebGPU, not a cloud server

---

## 🚀 Try It Right Now

**[→ Open NeonLlama in your browser](https://neonllama.netlify.app)**

Works in **Chrome 113+** or **Edge 113+**. That's the only requirement.

> First visit downloads the model (~0.7 GB for the fast model). After that — instant load every time, even offline.

---

## ⚡ How It Works

```
You open the site
       ↓
NeonLlama detects your hardware (RAM, GPU, WebGPU support)
       ↓
Automatically picks the best model for your device
       ↓
Downloads it once → stores in your browser's cache
       ↓
AI runs 100% on your GPU via WebGPU
       ↓
Every visit after: loads in ~5 seconds from cache
       ↓
Works completely offline ✅
```

No servers involved in inference. Ever.

---

## 🤖 Available Models

| Model | By | Size | Speed | Best For |
|---|---|:---:|:---:|---|
| ⚡ **Llama 3.2 1B** | Meta | ~0.7 GB | Instant | Any device, silent fans |
| ⚖️ **Phi 3.5 Mini** | Microsoft | ~2.2 GB | Fast | Most laptops, smart answers |
| 🧠 **Llama 3.1 8B** | Meta | ~4.5 GB | Medium | Best quality, 8GB+ RAM |

NeonLlama **auto-detects your RAM** on page load and recommends the right model. You can always switch manually via the dropdown.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🔒 **100% Private** | AI runs on your device. Zero telemetry. Zero logging. |
| ⚡ **WebGPU Accelerated** | Uses your GPU for fast inference — not your CPU |
| 💾 **Smart Caching** | Downloads once, loads in ~5s every visit after |
| 📶 **Works Offline** | Disconnect after first load — keep chatting |
| 🎮 **GTA-Style Loading** | Neon segmented progress bar with live MB/s and ETA |
| 🔄 **Streaming Responses** | Tokens appear as they generate, word by word |
| 💬 **Multi-turn Memory** | Remembers the full conversation context |
| 🖥️ **Hardware Detection** | Auto-picks the best model for your device in 50ms |
| 🌙 **Dark Neon Theme** | GTA-inspired electric lime on deep black |
| 🆓 **Completely Free** | MIT licensed. No paywalls. No ads. Forever. |

---

## 🛠️ Run It Yourself

### Option 1 — Just use the hosted version
**[https://neonllama.netlify.app](https://neonllama.netlify.app)** — open and go. Nothing to install.

### Option 2 — Run locally
```bash
# Clone the repo
git clone https://github.com/himanshumudigonda/NeonLlama.git
cd NeonLlama

# Serve it (must use a server — cannot open index.html directly)
npx serve .

# Open in Chrome or Edge
# → http://localhost:3000
```

> ⚠️ Must use a local server. WebGPU requires a proper origin — `file://` won't work.

### Option 3 — Deploy your own copy (free, 30 seconds)
1. **Fork** this repo on GitHub
2. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from GitHub**
3. Select your fork → set publish directory to `.`
4. Click **Deploy** → live in 30 seconds at `yourname.netlify.app`

---

## 💻 Requirements

| | Minimum | Recommended |
|---|---|---|
| **Browser** | Chrome 113+ / Edge 113+ | Latest Chrome |
| **RAM** | 4 GB | 8 GB+ |
| **GPU** | Any WebGPU-compatible | Dedicated GPU |
| **Storage** | 1 GB free | 5 GB free |
| **OS** | Windows / macOS / Linux / ChromeOS | Any |

> Firefox and Safari don't support WebGPU yet. NeonLlama shows a clear error message if your browser isn't compatible.

---

## 🏗️ Tech Stack

```
┌───────────────────────────────────────────┐
│              Your Browser Tab             │
│                                           │
│  index.html → app.js (main thread)        │
│                    │                      │
│                    ↓ postMessage          │
│               worker.js                  │
│           (Web Worker thread)             │
│                    │                      │
│                    ↓                      │
│          @mlc-ai/web-llm engine           │
│                    │                      │
│                    ↓                      │
│           Your GPU via WebGPU             │
│                                           │
│  Model weights: cached in IndexedDB ✅    │
│  Your messages sent to server: Never ✅   │
└───────────────────────────────────────────┘
```

| Layer | Technology |
|---|---|
| AI Engine | [@mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) |
| GPU Acceleration | WebGPU API |
| Threading | Web Workers (UI never freezes) |
| Model Cache | Browser IndexedDB |
| Models | Meta Llama 3.1 / 3.2 · Microsoft Phi 3.5 |
| Code | Vanilla JS — zero frameworks, zero node_modules |
| Hosting | Netlify (static, zero-config) |

---

## ❓ FAQ

<details>
<summary><b>Is this really free? What's the catch?</b></summary>
<br/>
No catch. No hidden costs, no premium tier, no ads, no data collection. MIT licensed. The compute cost is zero because your GPU does all the work — there's no server to pay for.
</details>

<details>
<summary><b>Does it send my messages anywhere?</b></summary>
<br/>
No. The AI runs entirely in your browser tab on your own GPU. Your messages, responses, and conversation history never leave your device. You can verify this yourself: open DevTools → Network tab → watch zero requests during a conversation.
</details>

<details>
<summary><b>Why does the first load take a while?</b></summary>
<br/>
The AI model weights need to download once. The fast model is ~0.7 GB — similar to downloading a game. After the first visit, NeonLlama loads from your browser's cache in about 5 seconds, even offline.
</details>

<details>
<summary><b>Will it slow down or overheat my laptop?</b></summary>
<br/>
NeonLlama auto-selects the lightest model (Llama 3.2 1B) for devices with less than 8 GB RAM. This model runs nearly silently — minimal heat, near-zero CPU usage, no fan spin-up. The heavier models are optional and only shown for devices that can handle them.
</details>

<details>
<summary><b>How is this different from Ollama?</b></summary>
<br/>
Ollama requires installing software, opening a terminal, and running a local server. NeonLlama requires nothing except a browser URL. It's the difference between installing a desktop app and visiting a website.
</details>

<details>
<summary><b>Can I use it offline?</b></summary>
<br/>
Yes. Once the model is downloaded and cached, disconnect your WiFi — NeonLlama keeps working perfectly. It's a fully offline app after the first load.
</details>

---

## 🗺️ Roadmap

- [ ] Chat history export (JSON / Markdown)
- [ ] Custom system prompt editor
- [ ] More models (Gemma 3, Qwen 2.5)
- [ ] Voice input via Web Speech API
- [ ] Multiple conversation threads
- [ ] Install as PWA (offline desktop app)

Want to build one of these? PRs are very welcome.

---

## 🤝 Contributing

```bash
git clone https://github.com/himanshumudigonda/NeonLlama.git
cd NeonLlama
# Edit index.html, app.js, or worker.js
npx serve .   # test locally
# Submit a PR
```

No build step. No bundler. No `npm install`. Pure HTML + JS — anyone can contribute in minutes.

---

## 📄 License

MIT — free to use, modify, fork, and deploy. Attribution appreciated but not required.

---

<div align="center">

<br/>

**Built with WebGPU · Powered by Meta Llama & Microsoft Phi · Zero cloud · Zero cost**

<br/>

If NeonLlama impressed you or saved you money — a ⭐ on GitHub helps others discover it.

<br/>

**[⭐ Star this repo](https://github.com/himanshumudigonda/NeonLlama)** &nbsp;·&nbsp; **[🚀 Try the live demo](https://neonllama.netlify.app)** &nbsp;·&nbsp; **[🐛 Report a bug](https://github.com/himanshumudigonda/NeonLlama/issues)**

<br/>

Made by [Himanshu Mudigonda](https://github.com/himanshumudigonda)

</div>