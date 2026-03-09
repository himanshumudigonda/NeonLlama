# 🦙 LlamaChat — Private AI Chat in Your Browser

> **Run Meta Llama & Microsoft Phi models 100% in your browser. No servers. No API keys. No data ever leaves your device.**

![LlamaChat Banner](https://img.shields.io/badge/LlamaChat-Private_AI-c8f000?style=for-the-badge&logo=meta&logoColor=black)
![WebGPU](https://img.shields.io/badge/WebGPU-Powered-00ff88?style=for-the-badge)
![Zero Backend](https://img.shields.io/badge/Backend-None_Required-ff4444?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

---

## ⚡ What is LlamaChat?

LlamaChat is a **fully client-side AI chatbot** that runs large language models directly in your browser using **WebGPU**. Everything — the model weights, the inference engine, your conversations — stays on YOUR device. 

- **Zero backend** — no servers, no cloud, no API keys
- **Zero cost** — completely free to run, forever
- **Zero data collection** — your chats never leave your browser
- **Works offline** — once the model is downloaded, no internet needed

---

## 🤖 Available Models

| Model | Size | Best For | Provider |
|-------|------|----------|----------|
| ⚡ **Llama 3.2 1B** | ~0.7 GB | Any device, instant responses | Meta |
| ⚖️ **Phi 3.5 Mini** | ~2.2 GB | Most laptops, smart & balanced | Microsoft |
| 🧠 **Llama 3.1 8B** | ~4.5 GB | Powerful hardware, GPT-level quality | Meta |

The app **auto-detects your hardware** and recommends the best model for your device.

---

## 🚀 Try It Now

### Option 1: Use the Live Demo
👉 **[Launch LlamaChat](#)** *(add your Netlify URL here after deploying)*

### Option 2: Run Locally (No Install Needed)

You need a simple static file server because WebGPU requires specific HTTP headers.

**Using Python (already installed on most systems):**
```bash
git clone https://github.com/YOUR_USERNAME/llamachat.git
cd llamachat
python -m http.server 8080
```
> ⚠️ Note: Python's simple server doesn't set CORS headers. For full functionality, use one of the methods below.

**Using Node.js `serve` (recommended for local testing):**
```bash
npx serve -p 8080 --cors -L
```

**Using the provided Netlify config (deploy and it just works):**
```bash
# Push to GitHub → Connect to Netlify → Auto-deploys with correct headers
```

### Option 3: Deploy Your Own (Free)

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start)

1. Fork this repo
2. Go to [Netlify](https://netlify.com) → **Add new site** → **Import from GitHub**
3. Select your forked repo
4. **Publish directory:** `.` (root)
5. Click **Deploy** — that's it! 🎉

The `netlify.toml` and `_headers` files automatically configure the required CORS headers.

---

## 💻 System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **Browser** | Chrome 113+ / Edge 113+ | Latest Chrome |
| **RAM** | 4 GB | 8+ GB |
| **GPU** | Any WebGPU-compatible | Discrete GPU |
| **Storage** | 1 GB free | 5 GB free (for larger models) |
| **OS** | Windows / macOS / Linux / ChromeOS | Any |

> **Not sure if your browser supports WebGPU?** The app will tell you instantly and link you to a compatible browser.

---

## 🏗️ Project Structure

```
llamachat/
├── index.html      → Full UI with inline CSS (GTA-inspired dark theme)
├── app.js          → Main thread: hardware detection, UI, worker bridge
├── worker.js       → Web Worker: AI engine lifecycle (WebLLM)
├── netlify.toml    → Netlify deployment config with CORS headers
├── _headers        → Netlify headers file (backup)
├── vercel.json     → Vercel deployment config (alternative)
└── README.md       → You are here
```

**Only 3 files matter:** `index.html`, `app.js`, `worker.js`. Everything else is deployment config.

---

## 🎨 Features

- **🔒 100% Private** — All AI processing happens in your browser
- **⚡ Instant Hardware Detection** — Auto-detects RAM, CPU cores, GPU in <50ms
- **🧵 Web Worker Architecture** — AI runs in a separate thread, UI never freezes
- **📦 Smart Caching** — Models are cached in IndexedDB after first download
- **📊 Real-time Progress** — Download speed (MB/s), ETA, and progress percentage
- **💬 Streaming Responses** — Tokens appear in real-time with a blinking cursor
- **📈 Performance Stats** — See tokens/second after each response
- **🌙 GTA-Inspired UI** — Dark theme with neon accents and scanline effects
- **📱 Responsive** — Works on desktop, tablet, and mobile
- **🔄 Multi-turn Chat** — Full conversation history maintained
- **🌐 Works Offline** — Once model is cached, no internet needed
- **♿ Accessible** — Keyboard navigation, screen reader friendly

---

## 🛠️ How It Works

```
┌─────────────┐          ┌──────────────────┐
│  index.html │          │    worker.js     │
│  + app.js   │ ◄──────► │  (Web Worker)    │
│  (Main UI)  │ messages  │  WebLLM Engine   │
│             │          │  Model Loading   │
│  Never      │          │  AI Inference    │
│  imports    │          │  100% isolated   │
│  WebLLM     │          │                  │
└─────────────┘          └──────────────────┘
       │                         │
       ▼                         ▼
  User sees UI              GPU processes AI
  Zero lag                  Via WebGPU
```

1. **Page loads** → Worker spawns immediately, hardware detected in parallel
2. **Model auto-selected** → Based on your device's RAM
3. **Model downloads** → Cached in IndexedDB for future visits
4. **You chat** → Messages sent to worker → AI generates response → Tokens stream back to UI
5. **Everything stays local** → No server, no API, no tracking

---

## 🤝 Contributing

Contributions are welcome! Here's how:

1. **Fork** this repository
2. **Create** a feature branch: `git checkout -b my-feature`
3. **Commit** your changes: `git commit -m "Add awesome feature"`
4. **Push** to the branch: `git push origin my-feature`
5. **Open** a Pull Request

### Ideas for contributions:
- [ ] Add more model options
- [ ] Conversation export (JSON/Markdown)
- [ ] System prompt customization
- [ ] Voice input support
- [ ] Multiple chat threads
- [ ] PWA support (installable app)

---

## 📄 License

MIT License — Use it, modify it, share it. Free forever.

---

## ⭐ Star This Repo!

If you find LlamaChat useful, please give it a ⭐ on GitHub — it helps others discover it!

---

<p align="center">
  <strong>Built with ❤️ using WebGPU + WebLLM</strong><br>
  <sub>No servers were harmed in the making of this application.</sub>
</p>
