# 🟣 StreamClip AI — Live 9:16 Video Clipper

> **Turn live Twitch and YouTube stream moments into viral 9:16 Vertical Shorts & TikToks in 1 click—powered by a Dual Staggered Rolling Browser Buffer, Live Twitch IRC `!clip` & Hype-Spike Triggers, Real-Time Facecam Split Cropping, Web Audio Reaction Peak Detection, and Chrome Extension MV3.**

---

## 💡 Overview

Twitch streamers and content creators broadcast hours of widescreen (`16:9`) live video every day, but modern audience discovery happens on vertical (`9:16`) platforms like **TikTok, YouTube Shorts, and Instagram Reels**. 

**StreamClip AI** eliminates expensive cloud GPU clipping subscriptions and tedious manual editing. It runs **100% client-side in the browser** with **$0 server compute fees**, allowing live chat triggers (`!clip`), organic emote hype spikes, or loud microphone reaction peaks to automatically capture the preceding 30 seconds into an export-ready `720×1280` vertical video with streamer branding, viewer attribution, and baked-in viral hooks.

---

## ✨ Key Features

### 1. 🔄 Dual Staggered 30-Second Rolling Buffer
- Maintains **2 staggered `MediaRecorder` slots** (`Slot A` and `Slot B` offset by 15 seconds on a 32-second rotation cycle) capturing the composited `720×1280` (`9:16`) canvas stream + source audio at 2.5 Mbps VP8.
- Ensures every sliced clip retains an intact WebM EBML initialization header—enabling **instant exports** with zero video header corruption.

### 2. 📱 4 Real-Time 9:16 Smart Crop Layouts
- **Center Crop (Crosshair / Action)**: Crops `16:9` gameplay to vertical `9:16` centered on the primary action zone.
- **Split: Top-Right Facecam + Gameplay**: Automatically crops the streamer's top-right camera corner into the top 34% and center gameplay into the bottom 66% with a glowing `#9146ff` Twitch divider.
- **Split: Top-Left Facecam + Gameplay**: Dedicated dual-view vertical layout for streamers with top-left facecams.
- **Pillarbox Blur Background**: Centers the full `16:9` frame over a dynamically blurred ambient backdrop.
- **Smart Framing Presets**: Interactive `Pan X`, `Pan Y`, and `Zoom` controls with a 1-click **"📺 Fit YouTube / Twitch Tab"** preset.

### 3. 💬 Zero-OAuth Twitch IRC Listener + 🔥 Chat Hype-Spike Auto-Clipper
- Connects directly to any live Twitch channel via Twitch's official anonymous read-only IRC WebSocket (`wss://irc-ws.chat.twitch.tv:443`)—**no OAuth tokens or API keys required**.
- **Command Trigger (`!clip`)**: When any viewer types `!clip` in chat, StreamClip AI slices the preceding 30 seconds and stamps **`⚡ Clipped by @username`** on the video.
- **🔥 Chat Hype-Spike Detector**: Tracks emote velocity (`POG`, `LUL`, `KEKW`, `OMG`, `CLUTCH`, `CLIP`, `🔥`) over a 7-second sliding window. When the Hype Meter reaches `100%`, it automatically triggers a clip.

### 4. 🎙️ Web Audio Reaction Peak Detector
- Uses the standard browser **Web Audio API** (`AudioContext` + `AnalyserNode`) to monitor stream decibels in real time.
- **Shout & Laugh Auto-Clip**: Automatically slices moments when streamer or gameplay volume peaks (>85 dB), stamping **`⚡ Clipped by @AudioReaction_88dB 🔥`**.

### 5. 🤖 Viral Hook Banner & Copy Engine
- **On-Video Viral Hook Banner**: Renders an editable TikTok/Shorts lower-third caption pill (e.g., `"WAIT FOR THIS CLUTCH 😱🔥"`) directly into the `9:16` video pixels.
- **Auto-Generated Copy**: Generates copy-ready viral titles and hashtag packs with 1-click clipboard copy.

### 6. 🗂️ Session Clip Vault & Automatic Cover Thumbnails
- Every triggered clip is preserved in the **Session Clip Vault** with file metadata and cover thumbnail generation.
- 1-click download saves directly to disk without cloud uploads.

---

## 🧩 Chrome Extension (Manifest V3)

StreamClip AI includes a dedicated Chrome Extension in `chrome-extension/`:
- **MV3 Compliant Architecture**: Uses a background service worker (`background.js`) paired with an offscreen document (`offscreen.html` / `offscreen.js`) for background canvas recording without tab throttling.
- **Live Studio Dashboard**: Dedicated `studio.html` and `studio.js` control center.
- **In-Player Overlay (`content.js` / `content.css`)**: Injects a floating 1-click clip button and hype meter on Twitch and YouTube.

### Installing Unpacked in Chrome:
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** (top-left button).
4. Select the `chrome-extension` folder inside this repository.

---

## 🚀 Quick Start (Web App)

### Option A: Open Hosted Live Web App
Open the deployed application directly in any modern Chromium browser:
👉 **[https://miladmet.github.io/streamclip-ai-/](https://miladmet.github.io/streamclip-ai-/)**

### Option B: Local Direct Launch
Open `index.html` directly in Google Chrome or serve it with any static web server:
```bash
npx serve .
```

---

## 📁 Repository Structure

```text
streamclip-ai/
├── index.html                  # Self-contained production web studio
├── chrome-extension/           # Chrome Manifest V3 extension
│   ├── manifest.json           # MV3 specification
│   ├── background.js           # Service worker coordinator
│   ├── offscreen.html / .js    # Background canvas & audio/video recorder
│   ├── popup.html / .js        # Extension popup controls
│   ├── studio.html / .js       # Fullscreen extension studio
│   ├── content.js / .css       # Twitch & YouTube in-player widget
│   └── icons/                  # 16px, 48px, 128px extension icons
├── package.json
└── README.md
```

---

## 📄 License

MIT License
