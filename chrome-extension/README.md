# StreamClip AI - Chrome Extension (Manifest V3)

> **Zero-cost, 1-click 9:16 vertical short clipper for Twitch live streams with smart facecam crop and viral AI packaging.**

---

## 🚀 How to Install in Google Chrome (30 Seconds)

1. Open Google Chrome and navigate to:
   ```text
   chrome://extensions
   ```
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select this directory:
   ```text
   C:\Users\Milmann\.gemini\antigravity\scratch\streamclip-ai\chrome-extension
   ```
5. Pin **StreamClip AI** to your Chrome extension bar!

---

## ⚡ Features

1. **Native Twitch Floating Overlay**:
   - Automatically detects live Twitch channels (`twitch.tv/*`).
   - Injects a sleek in-browser clipping widget and live 🔥 **Chat Hype Meter**.
2. **Dual Staggered 30s Rolling Buffer (`chrome.offscreen`)**:
   - Runs in Chrome's official background offscreen engine without background tab throttling.
   - Slices instant `< 0.3s` WebM vertical clips with valid EBML headers.
3. **4 Smart 9:16 Layouts + Pan/Zoom**:
   - Top-Right Facecam + Gameplay Split
   - Top-Left Facecam + Gameplay Split
   - Center Action Crop (Crosshair tracker)
   - Pillarbox Blur Backdrop
   - 1-Click **"📺 Fit Twitch Video Player"** preset.
4. **OpenAI Codex Viral Packaging**:
   - Editable on-canvas viral hook banner.
   - 1-click viral title & hashtag generation.
5. **Session Vault**:
   - Instant in-browser downloads via Chrome's native `downloads` API.
