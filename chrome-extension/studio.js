(() => {
  const DEFAULTS = {
    clipDurationMs: 30000,
    segmentDurationMs: 32000,
    staggerMs: 15000,
    maxAgeMs: 65000,
    videoBitsPerSecond: 2500000,
    audioBitsPerSecond: 128000
  };

  function nowMs() {
    return performance.now();
  }

  function chooseMimeType(hasAudio) {
    const candidates = hasAudio
      ? ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"]
      : ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm"];
    return candidates.find(type => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || "";
  }

  class CanvasPipeline {
    constructor({ video, canvas, layout = "center", streamer = "@streamer", clipper = "@viewer", hookBanner = "", panX = 0.5, panY = 0.5, zoom = 1.0, fps = 30 }) {
      this.video = video;
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.layout = layout;
      this.streamer = streamer;
      this.clipper = clipper;
      this.hookBanner = hookBanner;
      this.panX = panX;
      this.panY = panY;
      this.zoom = zoom;
      this.fps = fps;
      this.raf = null;
      this.running = false;
      this.drmChecked = false;
      this.isDrmBlack = false;
      canvas.width = 720;
      canvas.height = 1280;
    }

    setLayout(layout) {
      if (!["center", "blur", "split", "split_left"].includes(layout)) return;
      this.layout = layout;
    }

    checkDrmProtected() {
      this.drmChecked = true;
      try {
        const v = this.video;
        const sampleCanvas = document.createElement("canvas");
        sampleCanvas.width = 10;
        sampleCanvas.height = 10;
        const sCtx = sampleCanvas.getContext("2d");
        sCtx.drawImage(v, 0, 0, 10, 10);
        const imgData = sCtx.getImageData(0, 0, 10, 10).data;
        let isAllBlack = true;
        for (let i = 0; i < imgData.length; i += 4) {
          if (imgData[i] > 14 || imgData[i + 1] > 14 || imgData[i + 2] > 14) {
            isAllBlack = false;
            break;
          }
        }
        if (isAllBlack && !v.paused) {
          this.isDrmBlack = true;
          const banner = $("drmWarningBanner");
          if (banner) banner.style.display = "block";
          setStatus("⚠️ Black Screen: Video is protected by DRM (e.g. VEVO / Netflix). Please test on Twitch streams or YouTube gaming clips!");
        }
      } catch (e) {
        console.warn("DRM sample error:", e);
      }
    }

    renderFrame() {
      const v = this.video;
      if (!v || v.readyState < 2 || !v.videoWidth || !v.videoHeight) return;

      if (!this.drmChecked && v.currentTime > 2.0) {
        this.checkDrmProtected();
      }

      const c = this.ctx, W = 720, H = 1280;
      const z = Math.max(1.0, this.zoom || 1.0);
      const px = Math.max(0, Math.min(1, this.panX ?? 0.5));
      const py = Math.max(0, Math.min(1, this.panY ?? 0.5));

      if (this.layout === "center") {
        const ratio = 9 / 16;
        const baseW = Math.min(v.videoWidth, v.videoHeight * ratio);
        const baseH = baseW / ratio;
        const cropW = baseW / z;
        const cropH = baseH / z;
        const sx = Math.max(0, Math.min(v.videoWidth - cropW, (v.videoWidth - cropW) * px));
        const sy = Math.max(0, Math.min(v.videoHeight - cropH, (v.videoHeight - cropH) * py));
        c.drawImage(v, sx, sy, cropW, cropH, 0, 0, W, H);
      } else if (this.layout === "blur") {
        const subW = v.videoWidth / z;
        const subH = v.videoHeight / z;
        const sx = Math.max(0, Math.min(v.videoWidth - subW, (v.videoWidth - subW) * px));
        const sy = Math.max(0, Math.min(v.videoHeight - subH, (v.videoHeight - subH) * py));
        c.save();
        c.filter = "blur(32px) brightness(.42)";
        c.drawImage(v, sx, sy, subW, subH, -70, -70, W + 140, H + 140);
        c.restore();
        const scale = Math.min(W / subW, H / subH);
        const w = subW * scale, h = subH * scale;
        c.drawImage(v, sx, sy, subW, subH, (W - w) / 2, (H - h) / 2, w, h);
      } else {
        // Real Split-Screen Facecam (Top 410px) + Center Gameplay (Bottom 870px)
        const topH = 410;
        const botH = H - topH;
        const camW = Math.round(v.videoWidth * 0.28);
        const camH = Math.round(v.videoHeight * 0.28);
        const camX = this.layout === "split_left"
          ? Math.round(v.videoWidth * 0.02)
          : v.videoWidth - camW - Math.round(v.videoWidth * 0.02);
        const camY = Math.round(v.videoHeight * 0.03);

        // Top: Zoomed Streamer Facecam Region
        c.drawImage(v, camX, camY, camW, camH, 0, 0, W, topH);

        // Bottom: Action Gameplay (respects Pan/Zoom sliders!)
        const baseW = Math.min(v.videoWidth, v.videoHeight * (W / botH));
        const cropW = baseW / z;
        const cropH = v.videoHeight / z;
        const sx = Math.max(0, Math.min(v.videoWidth - cropW, (v.videoWidth - cropW) * px));
        const sy = Math.max(0, Math.min(v.videoHeight - cropH, (v.videoHeight - cropH) * py));
        c.drawImage(v, sx, sy, cropW, cropH, 0, topH, W, botH);

        // Glowing Twitch Purple Split Divider
        c.save();
        c.strokeStyle = "#9147ff";
        c.lineWidth = 6;
        c.beginPath();
        c.moveTo(0, topH);
        c.lineTo(W, topH);
        c.stroke();
        c.restore();
      }

      c.save();
      // Top-Left Streamer Watermark Pill
      c.fillStyle = "rgba(16, 16, 20, 0.82)";
      c.strokeStyle = "#9147ff";
      c.lineWidth = 2.5;
      c.beginPath();
      if (c.roundRect) c.roundRect(20, 20, 260, 44, 22);
      else c.rect(20, 20, 260, 44);
      c.fill();
      c.stroke();

      c.font = "bold 22px sans-serif";
      c.fillStyle = "#fff";
      c.fillText("🟣 " + this.streamer, 34, 49);

      // On-Video Viral Hook Banner (Lower-Third TikTok/Shorts Style)
      if (this.hookBanner && this.hookBanner.trim()) {
        c.fillStyle = "rgba(16, 16, 20, 0.86)";
        c.strokeStyle = "#10b981";
        c.lineWidth = 2.5;
        c.beginPath();
        if (c.roundRect) c.roundRect(36, H - 140, W - 72, 56, 14);
        else c.rect(36, H - 140, W - 72, 56);
        c.fill();
        c.stroke();

        c.font = "bold 23px sans-serif";
        c.fillStyle = "#ffffff";
        c.textAlign = "center";
        c.fillText(this.hookBanner.trim().slice(0, 36), W / 2, H - 104);
        c.textAlign = "left";
      }

      // Bottom Attribution Pill
      c.font = "bold 20px sans-serif";
      c.fillStyle = "#10b981";
      c.shadowColor = "#000";
      c.shadowBlur = 6;
      c.fillText(`⚡ Clipped by ${this.clipper}`, 28, H - 32);

      // On-Canvas DRM / Black Screen Warning Box
      if (this.isDrmBlack) {
        c.fillStyle = "rgba(185, 28, 28, 0.92)";
        c.beginPath();
        if (c.roundRect) c.roundRect(40, H / 2 - 95, W - 80, 190, 16);
        else c.rect(40, H / 2 - 95, W - 80, 190);
        c.fill();
        c.strokeStyle = "#ffffff";
        c.lineWidth = 2.5;
        c.stroke();

        c.fillStyle = "#ffffff";
        c.font = "bold 21px sans-serif";
        c.textAlign = "center";
        c.fillText("⚠️ DRM COPY PROTECTED", W / 2, H / 2 - 45);
        c.font = "14px sans-serif";
        c.fillText("VEVO / Netflix Content Blocked by Chrome", W / 2, H / 2 - 12);
        c.font = "bold 15px sans-serif";
        c.fillStyle = "#00f5ff";
        c.fillText("👉 Test on Twitch or YouTube Gaming!", W / 2, H / 2 + 35);
        c.textAlign = "left";
      }
      c.restore();
    }

    start() {
      if (this.running) return;
      this.running = true;
      let lastDraw = 0;
      const drawStep = () => {
        if (!this.running) return;
        const now = performance.now();
        if (now - lastDraw >= 28) {
          lastDraw = now;
          this.renderFrame();
        }
      };
      // Keep rendering even when the StreamClip AI tab is in the background!
      this.bgTimer = setInterval(drawStep, 33);
      const tick = () => {
        if (!this.running) return;
        drawStep();
        this.raf = requestAnimationFrame(tick);
      };
      tick();
    }

    stop() {
      this.running = false;
      if (this.raf != null) cancelAnimationFrame(this.raf);
      if (this.bgTimer != null) clearInterval(this.bgTimer);
    }

    createStream(audioSourceStream) {
      const videoStream = this.canvas.captureStream(this.fps);
      const tracks = [
        ...videoStream.getVideoTracks(),
        ...(audioSourceStream?.getAudioTracks() || [])
      ];
      return new MediaStream(tracks);
    }
  }

  class RollingClipBuffer extends EventTarget {
    constructor(stream, options = {}) {
      super();
      this.stream = stream;
      this.options = { ...DEFAULTS, ...options };
      this.mimeType = chooseMimeType(stream.getAudioTracks().length > 0);
      this.segments = [];
      this.slots = [];
      this.running = false;
      this.startedAt = null;
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.startedAt = nowMs();
      this.slots = [this._makeSlot("A"), this._makeSlot("B")];
      this._startSlot(this.slots[0]);
      this.slots[1].startTimer = setTimeout(() => this._startSlot(this.slots[1]), 15000);
    }

    _makeSlot(id) {
      return { id, recorder: null, chunks: [], startMs: null, stopMs: null, stopTimer: null, startTimer: null, generation: 0 };
    }

    _startSlot(slot) {
      if (!this.running) return;
      const generation = ++slot.generation;
      slot.chunks = [];
      slot.startMs = nowMs();
      slot.stopMs = null;

      let recorder;
      try {
        recorder = this.mimeType
          ? new MediaRecorder(this.stream, { mimeType: this.mimeType, videoBitsPerSecond: this.options.videoBitsPerSecond })
          : new MediaRecorder(this.stream);
      } catch (e) {
        recorder = new MediaRecorder(this.stream);
      }
      slot.recorder = recorder;

      recorder.addEventListener("dataavailable", event => {
        if (event.data && event.data.size > 0) {
          slot.chunks.push(event.data);
          this.dispatchEvent(new CustomEvent("segment", { detail: { slot: slot.id } }));
        }
      });

      recorder.addEventListener("error", event => {
        this.dispatchEvent(new CustomEvent("recordererror", { detail: { slot: slot.id, error: event.error || event } }));
      });

      recorder.addEventListener("stop", () => {
        const endMs = slot.stopMs ?? nowMs();
        const blob = new Blob(slot.chunks, { type: recorder.mimeType || this.mimeType || "video/webm" });
        if (blob.size > 0) {
          this.segments.push({
            id: `${slot.id}-${generation}`,
            slot: slot.id,
            startMs: slot.startMs,
            endMs,
            durationMs: Math.max(0, endMs - slot.startMs),
            blob,
            mimeType: blob.type
          });
          const cutoff = nowMs() - this.options.maxAgeMs;
          this.segments = this.segments.filter(s => s.endMs >= cutoff);
          this.dispatchEvent(new CustomEvent("segment", {}));
        }
        slot.chunks = [];
        slot.recorder = null;
        if (this.running) {
          slot.startTimer = setTimeout(() => this._startSlot(slot), 20);
        }
      }, { once: true });

      recorder.start(500);
      slot.stopTimer = setTimeout(() => {
        if (recorder.state === "recording") {
          slot.stopMs = nowMs();
          recorder.stop();
        }
      }, this.options.segmentDurationMs);
    }

    getBufferStatus() {
      const time = nowMs();
      const activeAges = this.slots
        .filter(s => s.recorder && s.recorder.state === "recording" && s.startMs != null)
        .map(s => time - s.startMs);
      const maxActiveMs = activeAges.length ? Math.max(...activeAges) : 0;
      const totalElapsedMs = this.startedAt == null ? 0 : time - this.startedAt;
      const coveredMs = Math.max(0, Math.min(this.options.clipDurationMs, Math.max(maxActiveMs, totalElapsedMs)));
      const totalChunks = this.slots.reduce((acc, s) => acc + (s.chunks ? s.chunks.length : 0), 0);
      return {
        available: coveredMs >= 1000,
        coveredMs,
        requiredMs: this.options.clipDurationMs,
        segmentCount: totalChunks
      };
    }

    async captureClip(triggerAt = nowMs()) {
      if (!this.running) throw new Error("Rolling buffer is not running.");
      const activeSlots = this.slots
        .filter(s => s.recorder && s.recorder.state === "recording" && s.chunks.length > 0)
        .sort((a, b) => a.startMs - b.startMs);

      if (activeSlots.length > 0) {
        const bestSlot = activeSlots[0];
        await new Promise(resolve => {
          const rec = bestSlot.recorder;
          if (!rec || rec.state !== "recording") { resolve(); return; }
          const t = setTimeout(resolve, 600);
          rec.addEventListener("stop", () => { clearTimeout(t); resolve(); }, { once: true });
          clearTimeout(bestSlot.stopTimer);
          bestSlot.stopMs = nowMs();
          try { rec.stop(); } catch { resolve(); }
        });

        const latestSeg = this.segments[this.segments.length - 1];
        if (latestSeg && latestSeg.blob && latestSeg.blob.size > 0) {
          const clipDurMs = Math.min(this.options.clipDurationMs, Math.max(500, latestSeg.durationMs));
          return {
            blob: latestSeg.blob,
            durationMs: clipDurMs,
            triggerAt
          };
        }
      }

      if (this.segments.length > 0) {
        const seg = this.segments[this.segments.length - 1];
        return {
          blob: seg.blob,
          durationMs: Math.min(this.options.clipDurationMs, seg.durationMs),
          triggerAt
        };
      }
      throw new Error("Wait 1-2 seconds for video frames to buffer, then try again.");
    }

    stop() {
      this.running = false;
      for (const slot of this.slots) {
        clearTimeout(slot.startTimer);
        clearTimeout(slot.stopTimer);
        if (slot.recorder && slot.recorder.state === "recording") {
          try { slot.recorder.stop(); } catch {}
        }
      }
    }
  }

  class TwitchIRC {
    constructor(channel, { onClipCommand = () => {}, onMessage = () => {}, cooldownMs = 5000 } = {}) {
      this.channel = (channel || "").trim().toLowerCase().replace(/^[@#]/, "");
      this.onClipCommand = onClipCommand;
      this.onMessage = onMessage;
      this.cooldownMs = cooldownMs;
      this.lastClipAt = 0;
      this.socket = null;
      this.manualClose = false;
    }

    connect() {
      if (!this.channel || this.channel === "your_channel") {
        this.channel = "riotgames";
      }
      this.manualClose = false;
      this.socket = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
      this.socket.addEventListener("open", () => {
        this.socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
        this.socket.send("PASS SCHMOOPIIE");
        this.socket.send(`NICK justinfan${Math.floor(Math.random() * 900000 + 100000)}`);
        this.socket.send(`JOIN #${this.channel}`);
      });
      this.socket.addEventListener("message", event => this._handle(event.data));
    }

    _handle(raw) {
      for (const line of String(raw).split(/\r\n/)) {
        if (!line) continue;
        if (line.startsWith("PING")) {
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send("PONG :tmi.twitch.tv");
          }
          continue;
        }
        const match = line.match(/(?:^| ):(\w+)!.*? PRIVMSG #\S+ :(.*)$/);
        if (!match) continue;
        const message = { username: match[1], text: match[2], receivedAt: performance.now() };
        this.onMessage(message);
        if (message.text.trim().toLowerCase().includes("!clip")) {
          const now = Date.now();
          if (now - this.lastClipAt < this.cooldownMs) continue;
          this.lastClipAt = now;
          this.onClipCommand(message);
        }
      }
    }

    disconnect() {
      this.manualClose = true;
      if (this.socket) try { this.socket.close(); } catch {}
      this.socket = null;
    }
  }

  class AudioReactionDetector {
    constructor({ onPeak = () => {}, thresholdDb = 85, cooldownMs = 8000 } = {}) {
      this.onPeak = onPeak;
      this.thresholdDb = thresholdDb;
      this.cooldownMs = cooldownMs;
      this.audioCtx = null;
      this.analyser = null;
      this.sourceNode = null;
      this.rafId = null;
      this.lastPeakAt = 0;
      this.active = false;
      this.currentDb = 0;
    }

    start(stream) {
      if (!stream || stream.getAudioTracks().length === 0) return;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContextClass();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
        this.sourceNode.connect(this.analyser);
        this.active = true;
        this._loop();
      } catch (e) {
        console.warn("AudioReactionDetector start error:", e);
      }
    }

    _loop() {
      if (!this.active || !this.analyser) return;
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);

      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i];
      }
      const avg = sum / data.length; // 0 to 255
      // Convert to normalized approximate decibels (0 to 100 dB)
      const db = Math.min(100, Math.round((avg / 255) * 105));
      this.currentDb = db;

      const fill = $("audioBarFill");
      const label = $("audioScoreText");
      if (fill) fill.style.width = `${Math.min(100, db)}%`;
      if (label) {
        if (db >= this.thresholdDb) {
          label.innerHTML = `<strong style="color:#ff4655;">🚨 SHOUT / REACTION PEAK (${db} dB)!</strong>`;
        } else if (db >= 50) {
          label.innerHTML = `<span style="color:#f59e0b;">🗣️ Talking / Game Action (${db} dB)</span>`;
        } else {
          label.innerHTML = `<span style="color:#00f5ff;">(${db} dB / Normal)</span>`;
        }
      }

      if (db >= this.thresholdDb) {
        const now = Date.now();
        if (now - this.lastPeakAt >= this.cooldownMs) {
          this.lastPeakAt = now;
          this.onPeak(db);
        }
      }

      this.rafId = requestAnimationFrame(() => this._loop());
    }

    stop() {
      this.active = false;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      if (this.sourceNode) try { this.sourceNode.disconnect(); } catch {}
      if (this.analyser) try { this.analyser.disconnect(); } catch {}
      if (this.audioCtx && this.audioCtx.state !== "closed") {
        try { this.audioCtx.close(); } catch {}
      }
      this.audioCtx = null;
      this.analyser = null;
      this.sourceNode = null;
      const fill = $("audioBarFill");
      const label = $("audioScoreText");
      if (fill) fill.style.width = "0%";
      if (label) label.textContent = "(0 dB / Idle)";
    }
  }

  // UI Wiring
  const $ = id => document.getElementById(id);
  const source = $("source");
  const canvas = $("output");
  const status = $("status");
  const startButton = $("start");
  const clipButton = $("clip");
  const captureButton = $("capture");
  const stopButton = $("stop");
  const connectButton = $("connect");
  const disconnectButton = $("disconnect");

  let displayStream = null;
  let pipeline = null;
  let recordingStream = null;
  let buffer = null;
  let pollTimer = null;
  let irc = null;
  let busy = false;
  let sessionVault = [];
  let recentHypeEvents = [];
  let lastHypeClipAt = 0;
  let audioDetector = null;

  const ON_SCREEN_HOOKS = [
    "WAIT FOR THIS CLUTCH 😱🔥",
    "CHAT WENT CRAZY HERE 🚨",
    "200 IQ STREAM MOMENT 🧠⚡",
    "NO WAY THIS JUST HAPPENED 💀",
    "CLIP OF THE YEAR?! 🏆🔥"
  ];
  let hookIdx = 0;

  function setStatus(msg) { status.textContent = msg; }

  // 1. OpenAI Codex Viral Hook & Hashtag Pack Generator
  function renderCodexHooks(customClipper = null) {
    const ch = ($("channel").value || "streamer").replace(/^[@#]/, "");
    const clipper = customClipper || $("clipper").value || "@viewer";
    const listEl = $("codexHooksList");
    if (!listEl) return;

    const packs = [
      `POV: @${ch} pulls off the cleanest play on stream 😱🔥 (Clipped by ${clipper}) #twitch #twitchclips #gaming #shorts`,
      `Chat couldn't believe what @${ch} just did 💀🎯 #streamer #viralclips #tiktokgaming #twitchcon`,
      `Wait for the end... ${clipper} hit !clip at the exact right millisecond ⚡🏆 #live #highlights #reels`
    ];

    listEl.innerHTML = "";
    packs.forEach(text => {
      const row = document.createElement("div");
      row.className = "codex-item";
      const span = document.createElement("span");
      span.textContent = text;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.style.padding = "4px 8px";
      btn.style.fontSize = "12px";
      btn.style.whiteSpace = "nowrap";
      btn.textContent = "📋 Copy";
      btn.addEventListener("click", () => {
        navigator.clipboard?.writeText(text);
        btn.textContent = "✅ Copied!";
        setTimeout(() => { btn.textContent = "📋 Copy"; }, 1500);
      });
      row.appendChild(span);
      row.appendChild(btn);
      listEl.appendChild(row);
    });
  }

  // 2. Chat Hype-Spike Velocity Detector
  function recordChatHype(username, text) {
    const now = Date.now();
    const lower = (text || "").toLowerCase();
    const isHypeWord = /pog|lul|kekw|omg|wtf|clip|insane|clutch|goat|holy|🔥|😱|💀/.test(lower);
    const weight = isHypeWord ? 22 : 10;
    recentHypeEvents.push({ time: now, weight, username });
    recentHypeEvents = recentHypeEvents.filter(e => now - e.time < 7000);

    const score = Math.min(100, recentHypeEvents.reduce((sum, e) => sum + e.weight, 0));
    const fillEl = $("hypeBarFill");
    const textEl = $("hypeScoreText");
    if (fillEl) fillEl.style.width = `${score}%`;
    if (textEl) textEl.textContent = `(${score}% Hype)`;

    const autoToggle = $("autoHypeClipToggle");
    if (score >= 100 && autoToggle && autoToggle.checked && (now - lastHypeClipAt > 8000)) {
      lastHypeClipAt = now;
      const hypeClipper = `@${username}_HypeSpike🔥`;
      $("clipper").value = hypeClipper;
      if (pipeline) pipeline.clipper = hypeClipper;
      const chatStatusBox = $("chatStatus");
      if (chatStatusBox) {
        chatStatusBox.textContent = `🔥 HYPE SPIKE (100%)! Auto-clipping last 30s (Triggered by ${hypeClipper})…`;
      }
      exportAt(performance.now(), `${username}-hype`);
    }
  }

  // Decay hype bar smoothly
  setInterval(() => {
    const now = Date.now();
    recentHypeEvents = recentHypeEvents.filter(e => now - e.time < 7000);
    const score = Math.min(100, recentHypeEvents.reduce((sum, e) => sum + e.weight, 0));
    const fillEl = $("hypeBarFill");
    const textEl = $("hypeScoreText");
    if (fillEl) fillEl.style.width = `${score}%`;
    if (textEl) textEl.textContent = `(${score}% Hype)`;
  }, 1000);

  // 3. Export Video + Cover PNG + Session Clip Vault
  function showExportedVideo(blob, durationMs, username = "manual") {
    const videoURL = URL.createObjectURL(blob);
    const ts = new Date().toISOString().replaceAll(":", "-");
    const fileName = `streamclip-9x16-${username}-${ts}.webm`;
    const sizeMb = (blob.size / 1024 / 1024).toFixed(2);
    const durSec = (durationMs / 1000).toFixed(1);
    const clipperTag = $("clipper").value || `@${username}`;

    // Capture 9:16 Cover Thumbnail asynchronously via toBlob so UI never freezes
    const linksRow = $("exportLinksRow");
    if (linksRow) linksRow.style.display = "flex";

    const link = $("download");
    link.href = videoURL;
    link.download = fileName;
    link.textContent = `💾 Download 9:16 WebM (${sizeMb} MB)`;
    link.hidden = false;

    const result = $("result");
    result.src = videoURL;
    result.hidden = false;
    result.style.display = "block";
    $("metadata").textContent =
      `Trigger: ${new Date().toISOString()}\n` +
      `Clipped by: ${clipperTag}\n` +
      `Duration: ${durSec} seconds\n` +
      `Output size: ${sizeMb} MB`;

    const vaultEntry = {
      id: sessionVault.length + 1,
      clipper: clipperTag,
      durSec,
      sizeMb,
      videoURL,
      fileName,
      thumbDataUrl: "",
      timeLabel: new Date().toLocaleTimeString()
    };
    sessionVault.unshift(vaultEntry);

    const renderVault = () => {
      const vaultSec = $("vaultSection");
      const vaultList = $("vaultList");
      const vaultCount = $("vaultCount");
      if (vaultSec && vaultList && vaultCount) {
        vaultSec.style.display = "block";
        vaultCount.textContent = String(sessionVault.length);
        vaultList.innerHTML = "";
        sessionVault.slice(0, 6).forEach(item => {
          const div = document.createElement("div");
          div.className = "vault-item";
          div.innerHTML = `
            <div>
              <strong>Clip #${item.id}</strong> • <span style="color:#10b981;">${item.clipper}</span>
              <div class="small">${item.durSec}s • ${item.sizeMb} MB • ${item.timeLabel}</div>
            </div>
            <div style="display:flex; gap:6px;">
              <a href="${item.videoURL}" download="${item.fileName}" style="background:#9147ff; color:#fff; padding:5px 10px; border-radius:6px; text-decoration:none; font-size:12px; font-weight:600;">WebM</a>
              ${item.thumbDataUrl ? `<a href="${item.thumbDataUrl}" download="cover-${item.id}.jpg" style="background:#262632; border:1px solid #494957; color:#fff; padding:5px 10px; border-radius:6px; text-decoration:none; font-size:12px;">Cover</a>` : ""}
            </div>
          `;
          vaultList.appendChild(div);
        });
      }
    };
    renderVault();

    if (canvas.toBlob) {
      canvas.toBlob(jpgBlob => {
        if (!jpgBlob) return;
        const thumbUrl = URL.createObjectURL(jpgBlob);
        vaultEntry.thumbDataUrl = thumbUrl;
        const thumbLink = $("downloadThumb");
        if (thumbLink) {
          thumbLink.href = thumbUrl;
          thumbLink.download = `streamclip-cover-${username}-${ts}.jpg`;
          thumbLink.hidden = false;
        }
        renderVault();
      }, "image/jpeg", 0.85);
    }

    renderCodexHooks(clipperTag);
  }

  async function exportAt(triggerAt, username = "manual") {
    if (!buffer || busy) return;
    busy = true;
    clipButton.disabled = true;
    try {
      setStatus("Finalizing 9:16 WebM clip from rolling buffer…");
      const result = await buffer.captureClip(triggerAt);
      showExportedVideo(result.blob, result.durationMs, username);
      setStatus(`✅ Clip ready! ${(result.durationMs / 1000).toFixed(1)}s 9:16 WebM (${(result.blob.size / 1024 / 1024).toFixed(2)} MB). Saved to Session Clip Vault below!`);
    } catch (err) {
      console.error(err);
      setStatus(`Clip error: ${err.message}`);
    } finally {
      busy = false;
      clipButton.disabled = false;
    }
  }

  function startRollingBufferNow() {
    if (!recordingStream) {
      setStatus("Click 'Capture screen / Twitch tab' first.");
      return;
    }
    if (buffer) buffer.stop();
    clearInterval(pollTimer);

    buffer = new RollingClipBuffer(recordingStream);
    const updateReadout = () => {
      if (!buffer || busy) return;
      const st = buffer.getBufferStatus();
      const secs = Math.min(30, Math.round(st.coveredMs / 1000));
      startButton.textContent = `🟢 Buffer Active (${secs}/30s)`;
      startButton.style.background = "#059669";
      startButton.style.borderColor = "#10b981";
      setStatus(`🟢 Rolling buffer active — ${secs}/30 seconds buffered (${st.segmentCount} chunks retained). Ready to clip!`);
    };

    buffer.addEventListener("segment", updateReadout);
    buffer.start();
    startButton.disabled = false;
    startButton.textContent = "🟢 Buffer Active (0/30s)";
    startButton.style.background = "#059669";
    startButton.style.borderColor = "#10b981";
    clipButton.disabled = false;
    setStatus("🟢 Rolling buffer started! Recording 9:16 vertical stream…");
    pollTimer = setInterval(updateReadout, 1000);
  }

  async function attachAndStartStream(stream) {
    displayStream = stream;
    source.srcObject = displayStream;
    await source.play();

    const chVal = ($("channel").value || "").trim();
    const streamerName = chVal && chVal !== "YOUR_CHANNEL" ? `@${chVal.replace(/^[@#]/, "")}` : "@streamer";

    pipeline = new CanvasPipeline({
      video: source,
      canvas,
      streamer: streamerName,
      clipper: $("clipper").value || "@viewer",
      hookBanner: $("hookOverlayInput") ? $("hookOverlayInput").value : "",
      panX: $("panXSlider") ? Number($("panXSlider").value) / 100 : 0.5,
      panY: $("panYSlider") ? Number($("panYSlider").value) / 100 : 0.5,
      zoom: $("zoomSlider") ? Number($("zoomSlider").value) / 100 : 1.0
    });
    pipeline.setLayout($("layout").value);
    pipeline.start();

    recordingStream = pipeline.createStream(displayStream);
    startButton.disabled = false;
    stopButton.disabled = false;
    connectButton.disabled = false;

    // Start Audio Reaction Peak Detector if audio track is present
    if (audioDetector) audioDetector.stop();
    audioDetector = new AudioReactionDetector({
      thresholdDb: 85,
      cooldownMs: 8000,
      onPeak: (db) => {
        const autoAudioToggle = $("autoAudioClipToggle");
        if (autoAudioToggle && !autoAudioToggle.checked) return;
        if (busy) return;
        const clipperName = `@AudioReaction_${db}dB 🔥`;
        $("clipper").value = clipperName;
        renderCodexHooks(clipperName);
        if (pipeline) pipeline.clipper = clipperName;
        setStatus(`🚨 LOUD REACTION DETECTED (${db} dB)! Auto-clipping last 30s (${clipperName})…`);
        exportAt(performance.now(), clipperName);
      }
    });
    audioDetector.start(displayStream);

    // Auto-start rolling buffer immediately upon capture
    startRollingBufferNow();

    displayStream.getVideoTracks()[0].addEventListener("ended", stopAll);
  }

  captureButton.addEventListener("click", async () => {
    try {
      if (window.chrome && chrome.desktopCapture && typeof chrome.desktopCapture.chooseDesktopMedia === "function") {
        chrome.desktopCapture.chooseDesktopMedia(["tab", "window", "screen"], async (streamId) => {
          if (!streamId) {
            setStatus("Tab / screen selection was cancelled.");
            return;
          }
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                mandatory: {
                  chromeMediaSource: "desktop",
                  chromeMediaSourceId: streamId
                }
              },
              video: {
                mandatory: {
                  chromeMediaSource: "desktop",
                  chromeMediaSourceId: streamId,
                  maxWidth: 1920,
                  maxHeight: 1080
                }
              }
            });
            await attachAndStartStream(stream);
          } catch (e) {
            setStatus(`Capture stream error: ${e.message}`);
          }
        });
      } else {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30, max: 30 } },
          audio: true
        });
        await attachAndStartStream(stream);
      }
    } catch (err) {
      setStatus(`Capture was not started: ${err.message}`);
    }
  });

  $("layout").addEventListener("change", ev => pipeline && pipeline.setLayout(ev.target.value));

  function syncCropSliders(pxPct, pyPct, zoomPct) {
    if ($("panXSlider")) $("panXSlider").value = String(pxPct);
    if ($("panYSlider")) $("panYSlider").value = String(pyPct);
    if ($("zoomSlider")) $("zoomSlider").value = String(zoomPct);
    if ($("panXVal")) $("panXVal").textContent = `${pxPct}%`;
    if ($("panYVal")) $("panYVal").textContent = `${pyPct}%`;
    if ($("zoomVal")) $("zoomVal").textContent = `${(zoomPct / 100).toFixed(1)}x`;
    if (pipeline) {
      pipeline.panX = pxPct / 100;
      pipeline.panY = pyPct / 100;
      pipeline.zoom = zoomPct / 100;
    }
  }

  if ($("panXSlider")) {
    $("panXSlider").addEventListener("input", ev => {
      const v = Number(ev.target.value);
      if ($("panXVal")) $("panXVal").textContent = `${v}%`;
      if (pipeline) pipeline.panX = v / 100;
    });
  }
  if ($("panYSlider")) {
    $("panYSlider").addEventListener("input", ev => {
      const v = Number(ev.target.value);
      if ($("panYVal")) $("panYVal").textContent = `${v}%`;
      if (pipeline) pipeline.panY = v / 100;
    });
  }
  if ($("zoomSlider")) {
    $("zoomSlider").addEventListener("input", ev => {
      const v = Number(ev.target.value);
      if ($("zoomVal")) $("zoomVal").textContent = `${(v / 100).toFixed(1)}x`;
      if (pipeline) pipeline.zoom = v / 100;
    });
  }
  if ($("presetWebPlayerBtn")) {
    $("presetWebPlayerBtn").addEventListener("click", () => syncCropSliders(28, 34, 150));
  }
  if ($("presetResetCropBtn")) {
    $("presetResetCropBtn").addEventListener("click", () => syncCropSliders(50, 50, 100));
  }
  $("clipper").addEventListener("input", ev => { if (pipeline) pipeline.clipper = ev.target.value || "@viewer"; });
  $("channel").addEventListener("input", ev => {
    if (pipeline) {
      const v = ev.target.value.trim();
      pipeline.streamer = v && v !== "YOUR_CHANNEL" ? `@${v.replace(/^[@#]/, "")}` : "@streamer";
    }
    renderCodexHooks();
  });

  if ($("hookOverlayInput")) {
    $("hookOverlayInput").addEventListener("input", ev => {
      if (pipeline) pipeline.hookBanner = ev.target.value;
    });
  }

  if ($("cycleHookBtn")) {
    $("cycleHookBtn").addEventListener("click", () => {
      hookIdx = (hookIdx + 1) % ON_SCREEN_HOOKS.length;
      const nextHook = ON_SCREEN_HOOKS[hookIdx];
      if ($("hookOverlayInput")) $("hookOverlayInput").value = nextHook;
      if (pipeline) pipeline.hookBanner = nextHook;
    });
  }

  if ($("regenCodexBtn")) {
    $("regenCodexBtn").addEventListener("click", () => renderCodexHooks());
  }

  if ($("simHypeBtn")) {
    $("simHypeBtn").addEventListener("click", () => {
      const chatStatusBox = $("chatStatus");
      const sampleBursts = [
        { u: "ClutchKing99", m: "POGGERS WHAT A PLAY 🔥🔥" },
        { u: "ValorantPro_TV", m: "OMG NO WAY 😱" },
        { u: "TwitchSniper42", m: "INSANE CLUTCH WTF!!" },
        { u: "PixelQueen_", m: "CLIP THAT RIGHT NOW 🔥" },
        { u: "xX_Shadow_Xx", m: "GOAT STREAMER POG!!" }
      ];
      sampleBursts.forEach((b, idx) => {
        setTimeout(() => {
          if (chatStatusBox) {
            chatStatusBox.style.borderLeftColor = "#f59e0b";
            chatStatusBox.textContent = `🔥 #${($("channel").value || "stream").replace(/^[@#]/, "")} — ${b.u}: ${b.m}`;
          }
          recordChatHype(b.u, b.m);
        }, idx * 180);
      });
    });
  }

  startButton.addEventListener("click", startRollingBufferNow);
  clipButton.addEventListener("click", () => exportAt(performance.now(), "manual"));

  connectButton.addEventListener("click", () => {
    try {
      if (irc) irc.disconnect();
      let chInput = ($("channel").value || "").trim();
      if (!chInput || chInput.toLowerCase() === "your_channel") {
        chInput = "riotgames";
        $("channel").value = chInput;
      }
      const chatStatusBox = $("chatStatus");
      irc = new TwitchIRC(chInput, {
        onMessage: msg => {
          if (chatStatusBox) {
            chatStatusBox.textContent = `🟢 #${irc.channel} — ${msg.username}: ${msg.text}`;
          }
          recordChatHype(msg.username, msg.text);
        },
        onClipCommand: msg => {
          const clipper = `@${msg.username}`;
          $("clipper").value = clipper;
          if (pipeline) pipeline.clipper = clipper;
          if (chatStatusBox) {
            chatStatusBox.textContent = `⚡ ${clipper} typed !clip in #${irc.channel}! Exporting clip…`;
          }
          setStatus(`${clipper} typed !clip in chat! Exporting clip…`);
          exportAt(msg.receivedAt, msg.username);
        }
      });
      irc.connect();
      connectButton.disabled = false;
      connectButton.textContent = `🟢 Chat Connected (#${irc.channel})`;
      connectButton.style.background = "#059669";
      connectButton.style.borderColor = "#10b981";
      disconnectButton.disabled = false;
      if (chatStatusBox) {
        chatStatusBox.style.borderLeftColor = "#10b981";
        chatStatusBox.textContent = `🟢 Connected to Twitch IRC (#${irc.channel}) — Listening for !clip & Hype Spikes…`;
      }
    } catch (err) {
      setStatus(err.message);
    }
  });

  disconnectButton.addEventListener("click", () => {
    if (irc) irc.disconnect();
    irc = null;
    connectButton.disabled = false;
    connectButton.textContent = "🟣 Connect anonymous chat";
    connectButton.style.background = "";
    connectButton.style.borderColor = "";
    disconnectButton.disabled = true;
    const chatStatusBox = $("chatStatus");
    if (chatStatusBox) {
      chatStatusBox.style.borderLeftColor = "#9147ff";
      chatStatusBox.textContent = "💬 Twitch Chat: Disconnected.";
    }
  });

  function stopAll() {
    clearInterval(pollTimer);
    if (audioDetector) audioDetector.stop();
    audioDetector = null;
    if (buffer) buffer.stop();
    if (pipeline) pipeline.stop();
    if (displayStream) displayStream.getTracks().forEach(t => t.stop());
    if (recordingStream) recordingStream.getTracks().forEach(t => t.stop());
    buffer = null;
    displayStream = null;
    recordingStream = null;
    startButton.disabled = true;
    startButton.textContent = "Start rolling buffer";
    startButton.style.background = "";
    startButton.style.borderColor = "";
    clipButton.disabled = true;
    stopButton.disabled = true;
    setStatus("Capture stopped.");
  }

  stopButton.addEventListener("click", stopAll);
  renderCodexHooks();
})();
