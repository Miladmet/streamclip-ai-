# 🟣 StreamClip AI — Codex x TwitchCon Hackathon Edition

> **Turn live Twitch stream moments into viral 9:16 Vertical Shorts & TikToks in 1 click—powered by a 4-Slot Rolling Browser Buffer, Live Twitch IRC `!clip` & Hype-Spike Triggers, Real-Time Facecam Split Cropping, and OpenAI Codex Viral Packaging.**

---

## 💡 Overview

Twitch streamers broadcast hours of horizontal (`16:9`) live content every day, but modern audience discovery happens on vertical (`9:16`) platforms like **TikTok, YouTube Shorts, and Instagram Reels**. 

**StreamClip AI** eliminates expensive cloud GPU clipping subscriptions and tedious manual VOD editing. It runs **100% client-side in the browser** with **$0 server bandwidth fees**, allowing live Twitch chat (`!clip` commands or organic chat hype spikes) to automatically slice the preceding 30 seconds of a stream into a ready-to-upload `720×1280` vertical video with streamer branding, viewer attribution, and baked-in viral hooks.

---

## ✨ Key Features

### 1. 🔄 4-Slot Staggered 30-Second Rolling Buffer
- Maintains **4 staggered `MediaRecorder` slots** (`Slot A, B, C, D` offset by 10 seconds on a 41-second rotation cycle) capturing the composited `720×1280` (`9:16`) canvas stream + source audio.
- Mathematically guarantees that at **every timestamp $t \ge 30\text{s}$**, at least one active recorder slot holds a complete, unbroken 30-second window with an intact WebM EBML initialization header—enabling **instant `< 0.3s` exports** with zero gap errors.

### 2. 📱 4 Real-Time 9:16 Smart Crop Layouts
- **Center Crop (Crosshair / Action)**: Crops `16:9` gameplay to vertical `9:16` centered on the primary action zone.
- **Split: Top-Right Facecam + Gameplay**: Automatically crops the streamer's top-right camera corner into the top 33% (`410px`) and center gameplay into the bottom 67% (`870px`) with a glowing `#9147ff` Twitch divider.
- **Split: Top-Left Facecam + Gameplay**: Same dual-view vertical layout for streamers who position their facecam in the top-left corner.
- **Pillarbox Blur Background**: Scales the full `16:9` frame over a dynamically blurred `9:16` ambient backdrop.

### 3. 💬 Zero-OAuth Twitch IRC Listener + 🔥 Chat Hype-Spike Auto-Clipper
- Connects directly to any live Twitch channel via Twitch's official anonymous read-only IRC WebSocket (`wss://irc-ws.chat.twitch.tv:443`)—**no OAuth tokens or API keys required**.
- **Command Trigger (`!clip`)**: When any viewer types `!clip` in live chat, StreamClip AI automatically slices the preceding 30 seconds and stamps **`⚡ Clipped by @username`** on the video.
- **🔥 Chat Hype-Spike Detector**: Tracks chat velocity and hype keywords (`POG`, `LUL`, `KEKW`, `OMG`, `WTF`, `CLUTCH`, `CLIP`, `🔥`, `😱`) over a 7-second sliding window. When the Hype Meter reaches `100%`, it automatically triggers a 30s clip even if nobody remembered to type `!clip`! Includes a 1-click **`🔥 Simulate Chat Hype Spike`** button for instant live testing.

### 4. 🤖 OpenAI Codex Viral Hook Banner & Hashtag Pack
- **On-Video Viral Hook Banner**: Bakes a customizable TikTok/Shorts lower-third caption pill (e.g., `"WAIT FOR THIS CLUTCH 😱🔥"`) directly into the `9:16` video canvas.
- **Auto-Generated Viral Copy**: Generates 3 tailored viral titles and TikTok/Shorts/Reels hashtag packs for each clip with 1-click **`📋 Copy`** buttons.

### 5. 🗂️ Session Clip Vault & 1-Click Cover PNG Extractor
- Every triggered clip is preserved in the **Session Clip Vault** so back-to-back hype moments never overwrite earlier clips.
- Exports both the playable **9:16 `.webm` video** and a crisp **`720×1280` `.png` cover thumbnail** (`canvas.toDataURL("image/png")`).

---

## 🛠️ How It Was Built with OpenAI Codex

We used **OpenAI Codex** throughout the **Codex x TwitchCon Hackathon** to design, debug, and refine the core browser media and networking modules:
1. **`CanvasPipeline` (`720×1280` Compositor)**: Engineered the 30 FPS `requestAnimationFrame` pipeline that transforms `16:9` source video tracks into 4 vertical `9:16` layouts with dynamic pill badges and lower-third typography.
2. **`RollingClipBuffer` (Staggered WebM Ring)**: Solved the classic `MediaRecorder` rolling-chunk EBML header corruption problem and eliminated single-threaded WASM re-encoding bottlenecks by designing a 4-slot staggered recorder ring.
3. **`TwitchIRC` (WebSocket Client & Hype Velocity Scorer)**: Implemented the `justinfan` anonymous IRC handshake, `PING/PONG` keep-alive handler, and sliding-window hype velocity detector.

---

## 🚀 Quick Start

### Option A: Run with Vite Dev Server (Recommended)
```bash
npm install
npm run dev
```
Then open the local URL printed by Vite (typically `http://localhost:5173`).

### Option B: Zero-Build Direct Browser Launch
Because the production dashboard in `index.html` is self-contained with zero external runtime blockers, you can also open `index.html` directly in any Chromium-based browser (Chrome / Edge) or serve it with any static HTTP server.

---

## 🎮 How to Use (Demo Walkthrough)

1. Click **Capture screen / Twitch tab** and select a browser tab playing a Twitch stream or video (check *"Also share tab audio"* in the browser picker).
2. The **30-second rolling buffer** starts automatically (**`🟢 Buffer Active (30/30s)`**).
3. Under **Vertical preview (9:16)**, switch between **Center crop**, **Split: Top-Right Facecam + Gameplay**, or **Pillarbox Blur**, and customize your **On-Video Viral Hook Banner**.
4. Enter any live Twitch channel (e.g., `riotgames`, `shroud`) and click **🟣 Connect anonymous chat** to stream real-time Twitch IRC messages.
5. Trigger a clip in 3 ways:
   - Click **⚡ Clip last 30 seconds** manually,
   - Type `!clip` in the connected Twitch chat, or
   - Click **🔥 Simulate Chat Hype Spike** to watch the Hype Meter surge to `100%` and auto-clip!
6. Preview your vertical video under **Latest export**, copy a **Codex Viral Title & Hashtag Pack**, and click **💾 Download 9:16 WebM** or **📸 Save 9:16 Cover PNG**!

---

## 📁 Project Structure

```text
streamclip-ai/
├── index.html                  # Self-contained production UI & 4-slot 9:16 engine
├── src/
│   ├── main.js                 # Modular entry point
│   ├── canvas-pipeline.js      # 720x1280 9:16 smart crop & overlay compositor
│   ├── rolling-clip-buffer.js  # Staggered MediaRecorder rolling buffer
│   ├── twitch-irc.js           # Anonymous Twitch IRC WebSocket client
│   └── ffmpeg-webm-exporter.js # Optional FFmpeg WASM stream-copy trimmer
├── package.json
├── vite.config.js
└── README.md
```

---

## 📄 License

MIT License — Built for the **Codex x TwitchCon 2026 Hackathon**.
