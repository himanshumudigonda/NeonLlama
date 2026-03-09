<div align="center">

# 🦙 NeonLlama

### Chat with AI — 100% in your browser. Nothing leaves your device.

![NeonLlama](https://img.shields.io/badge/NeonLlama-Private_AI-c8f000?style=for-the-badge&logoColor=black)
![WebGPU](https://img.shields.io/badge/Runs_On-WebGPU-00ff88?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

<br>

<img src="https://readme-typing-svg.herokuapp.com?font=Rajdhani&weight=700&size=24&duration=3000&pause=1000&color=C8F000&center=true&vCenter=true&width=500&lines=No+servers.+No+API+keys.+No+cloud.;Your+conversations+stay+on+YOUR+device.;Works+offline+after+first+load.;Completely+free.+Forever." alt="Typing SVG" />

</div>

---

## What is NeonLlama?

NeonLlama lets you talk to powerful AI models from **Meta** and **Microsoft** — directly in your web browser. No sign-ups, no subscriptions, no data collection. The AI runs entirely on your computer using your GPU.

**Think of it as ChatGPT, but private and free.**

---

## Try It

### Use Online (Recommended)
> **[Launch NeonLlama](#)** — *deploying soon on Netlify*

Just open the link in Chrome or Edge. That's it. No install.

### Run It Yourself

```bash
git clone https://github.com/himanshumudigonda/NeonLlama.git
cd NeonLlama
npx serve .
```

Open `http://localhost:3000` in Chrome/Edge.

### Deploy Your Own Copy (Free)

1. **Fork** this repo
2. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from GitHub**
3. Pick your fork, set publish directory to `.`
4. Click **Deploy**

Done. You now have your own private AI chat site.

---

## Available Models

| Model | Download Size | Best For |
|-------|:---:|----------|
| ⚡ **Llama 3.2 1B** | ~0.7 GB | Quick answers on any device |
| ⚖️ **Phi 3.5 Mini** | ~2.2 GB | Smart responses on most laptops |
| 🧠 **Llama 3.1 8B** | ~4.5 GB | Best quality — needs 8GB+ RAM |

NeonLlama detects your hardware and picks the right model automatically. You can always switch manually.

Models download once, then get **cached in your browser** — next time it loads in seconds.

---

## Requirements

| | Minimum | Recommended |
|---|---|---|
| **Browser** | Chrome 113+ or Edge 113+ | Latest Chrome |
| **RAM** | 4 GB | 8 GB+ |
| **GPU** | Any WebGPU-compatible | Dedicated GPU |
| **Disk** | 1 GB free | 5 GB free |

> Works on **Windows, macOS, Linux, and ChromeOS**.
> NeonLlama checks your browser on load and shows a clear message if something's missing.

---

## Features

- **Private** — Everything runs locally. Zero data sent anywhere.
- **Fast** — AI runs on your GPU. Responses stream in real-time.
- **Smart Caching** — Models download once, load instantly after that.
- **Offline Mode** — Works without internet once the model is cached.
- **Auto Hardware Detection** — Picks the best model for your device.
- **Live Stats** — See download speed, tokens per second, and more.
- **Dark Theme** — Easy on the eyes. Looks great.
- **Mobile Friendly** — Works on phones and tablets too.
- **Multi-turn Chat** — Remembers earlier messages in the conversation.

---

## FAQ

**Q: Is this really free?**
Yes. No hidden costs, no premium tier, no ads. MIT licensed.

**Q: Does it send my data anywhere?**
No. Everything — the AI model, your messages, the responses — stays in your browser. Check the source code yourself.

**Q: Why does the first load take a while?**
The AI model needs to download once (0.7–4.5 GB depending on the model). After that, it's cached and loads in seconds.

**Q: Can I use it offline?**
Yes! Once the model is downloaded, you can disconnect from the internet and keep chatting.

**Q: Which browsers work?**
Chrome 113+ and Edge 113+. Firefox and Safari don't support WebGPU yet.

**Q: My device is slow. Will it work?**
NeonLlama will auto-select the lightest model (0.7 GB) for low-end devices. If your device has at least 4GB RAM and a WebGPU-compatible browser, it'll work.

---

## Contributing

Pull requests welcome! Fork the repo, make your changes, and submit a PR.

Some ideas:
- More model support
- Chat export
- Custom system prompts
- Voice input
- Multiple chat threads

---

## License

MIT — free to use, modify, and share.

---

<div align="center">

**If NeonLlama is useful to you, drop a ⭐ — it helps others find it.**

Made by [Himanshu Mudigonda](https://github.com/himanshumudigonda)

</div>
