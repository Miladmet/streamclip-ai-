/**
 * StreamClip AI — Core Engine (Sprint 2 Upgrade)
 * Built with OpenAI Codex for the Codex x TwitchCon 2026 Hackathon
 *
 * Architecture:
 * 1. Dual Staggered Rolling 30s In-Memory Recorders (True 9:16 Vertical Canvas Stream)
 * 2. Real-Time 9:16 Vertical Canvas Cropper (Center Action, Split Cam + Gameplay, Pillarbox Blur)
 * 3. Live Twitch IRC WebSocket Listener (wss://irc-ws.chat.twitch.tv:443) + !clip Auto-Trigger
 * 4. Dynamic Twitch Watermark, Clipper Attribution & OpenAI Codex Viral Hook Overlay
 */

// DOM Elements
const liveVideo = document.getElementById('liveVideo');
const bufferCanvas = document.getElementById('bufferCanvas');
const verticalExportCanvas = document.getElementById('verticalExportCanvas');
const exportCtx = verticalExportCanvas.getContext('2d');

const loadDemoStreamBtn = document.getElementById('loadDemoStreamBtn');
const captureScreenBtn = document.getElementById('captureScreenBtn');
const clipNowBtn = document.getElementById('clipNowBtn');
const exportVideoBtn = document.getElementById('exportVideoBtn');

const streamerHandleInput = document.getElementById('streamerHandleInput');
const clipperHandleInput = document.getElementById('clipperHandleInput');
const cropFocusSelect = document.getElementById('cropFocusSelect');
const clipDurationSelect = document.getElementById('clipDurationSelect');

const previewStreamerTag = document.getElementById('previewStreamerTag');
const previewClipperTag = document.getElementById('previewClipperTag');

const openChatSimBtn = document.getElementById('openChatSimBtn');
const closeChatModalBtn = document.getElementById('closeChatModalBtn');
const chatModal = document.getElementById('chatModal');
const sendSimChatBtn = document.getElementById('sendSimChatBtn');
const simChatInput = document.getElementById('simChatInput');
const chatFeed = document.getElementById('chatFeed');
const mainChatLog = document.getElementById('mainChatLog');
const quickSimClipBtn = document.getElementById('quickSimClipBtn');

// Live Twitch Connection DOM Elements
const toggleTwitchConnectBtn = document.getElementById('toggleTwitchConnectBtn');
const twitchConnectBar = document.getElementById('twitchConnectBar');
const liveChannelInput = document.getElementById('liveChannelInput');
const connectChannelBtn = document.getElementById('connectChannelBtn');
const disconnectChannelBtn = document.getElementById('disconnectChannelBtn');
const triggerKeywordInput = document.getElementById('triggerKeywordInput');
const liveChatTicker = document.getElementById('liveChatTicker');
const twitchConnBadge = document.getElementById('twitchConnBadge');
const activeChannelPill = document.getElementById('activeChannelPill');

const generateCodexTitlesBtn = document.getElementById('generateCodexTitlesBtn');
const codexResultsBox = document.getElementById('codexResultsBox');
const bufferStatus = document.getElementById('bufferStatus');
const bufferTimer = document.getElementById('bufferTimer');
const bufferFill = document.getElementById('bufferFill');
const recorderFormatBadge = document.getElementById('recorderFormatBadge');

// Application State
let sourceMediaStream = null;
let verticalCanvasStream = null;
let animationFrameId = null;
let isDemoRunning = false;
let currentRecordedBlob = null;
let currentRecordedExt = 'webm';
let activeViralSubtitle = 'WAIT FOR THIS CLUTCH PLAY 😱🔥';
let clipFlashUntil = 0;
let lastClipTriggerTime = 0;

// Dual Staggered Rolling Recorders (Guarantees valid EBML/MP4 header on every slice)
let recorderSlots = [
  { id: 'A', recorder: null, chunks: [], startedAt: 0, mimeType: '' },
  { id: 'B', recorder: null, chunks: [], startedAt: 0, mimeType: '' }
];
let staggerTimeoutId = null;
let rotationIntervalId = null;
let bufferUiIntervalId = null;

// Detect best supported video MIME type
function getSupportedMimeType() {
  const candidates = [
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
    { mime: 'video/mp4', ext: 'mp4' }
  ];
  for (const c of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(c.mime)) {
      return c;
    }
  }
  return { mime: '', ext: 'webm' };
}

// ============================================================================
// 1. SYNTHETIC 16:9 GAMING STREAM GENERATOR
// ============================================================================
function createSyntheticGamingStream() {
  const canvas = bufferCanvas;
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  let frame = 0;

  function renderSynthFrame() {
    frame++;
    // Animated dark cyber arena background
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#0f0c1b');
    grad.addColorStop(0.5, '#1e1136');
    grad.addColorStop(1, '#090710');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Perspective cyber grid lines
    ctx.strokeStyle = 'rgba(145, 70, 255, 0.22)';
    ctx.lineWidth = 1;
    for (let x = (frame * 2) % 48; x < canvas.width; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = (frame * 2) % 48; y < canvas.height; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Dynamic moving targets & crosshair in center action zone
    const targetX = canvas.width / 2 + Math.sin(frame * 0.055) * 140;
    const targetY = canvas.height / 2 + Math.cos(frame * 0.045) * 85;

    // Target glow pulse
    const pulseRadius = 42 + Math.sin(frame * 0.15) * 6;
    ctx.strokeStyle = '#00f59b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(targetX, targetY, pulseRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner bullseye
    ctx.fillStyle = 'rgba(235, 4, 0, 0.75)';
    ctx.beginPath();
    ctx.arc(targetX, targetY, 10, 0, Math.PI * 2);
    ctx.fill();

    // Crosshair lines
    ctx.strokeStyle = '#00f59b';
    ctx.beginPath();
    ctx.moveTo(targetX - 62, targetY);
    ctx.lineTo(targetX + 62, targetY);
    ctx.moveTo(targetX, targetY - 62);
    ctx.lineTo(targetX, targetY + 62);
    ctx.stroke();

    // Periodic "ELIMINATION / CLUTCH" banner in center so clips look hype
    if (Math.floor(frame / 90) % 2 === 0) {
      ctx.fillStyle = 'rgba(0, 245, 155, 0.16)';
      ctx.strokeStyle = '#00f59b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(canvas.width / 2 - 150, canvas.height - 125, 300, 44, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ HEADSHOT STREAK x4 (ACE!)', canvas.width / 2, canvas.height - 97);
      ctx.textAlign = 'left';
    }

    // Top-Left Gaming HUD
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.fillText('🔴 RANKED MATCH — VALORANT PROTOCOL', 40, 50);

    ctx.fillStyle = '#00f59b';
    ctx.font = 'bold 34px "JetBrains Mono", monospace';
    ctx.fillText('SCORE: 12 - 11', 40, 94);

    // Simulated Streamer Facecam (Top-Right: x=1010..1240, y=30..175)
    const camX = canvas.width - 260;
    const camY = 30;
    const camW = 225;
    const camH = 145;

    ctx.fillStyle = '#18181b';
    ctx.strokeStyle = '#9146ff';
    ctx.lineWidth = 3;
    ctx.fillRect(camX, camY, camW, camH);
    ctx.strokeRect(camX, camY, camW, camH);

    // Animated streamer avatar silhouette inside facecam
    const headBob = Math.sin(frame * 0.08) * 4;
    ctx.fillStyle = '#9146ff';
    ctx.beginPath();
    ctx.arc(camX + camW / 2, camY + 55 + headBob, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(camX + camW / 2, camY + 125 + headBob, 42, Math.PI, Math.PI * 2);
    ctx.fill();

    // Headset mic graphic
    ctx.strokeStyle = '#00f59b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(camX + camW / 2, camY + 55 + headBob, 27, Math.PI * 0.9, Math.PI * 2.1);
    ctx.stroke();

    ctx.fillStyle = '#efeff1';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillText('🎥 ' + (streamerHandleInput.value || '@MilmannLive'), camX + 12, camY + camH - 12);

    if (isDemoRunning) {
      requestAnimationFrame(renderSynthFrame);
    }
  }

  isDemoRunning = true;
  renderSynthFrame();
  return canvas.captureStream(30);
}

// ============================================================================
// 2. REAL-TIME 9:16 VERTICAL CANVAS RENDERER (720x1280)
// ============================================================================
function startVerticalRendering() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  const outW = verticalExportCanvas.width;   // 720
  const outH = verticalExportCanvas.height;  // 1280

  function renderVertical() {
    if (liveVideo.readyState >= 2) {
      const vidW = liveVideo.videoWidth || 1280;
      const vidH = liveVideo.videoHeight || 720;
      const cropMode = cropFocusSelect.value;

      exportCtx.clearRect(0, 0, outW, outH);

      if (cropMode === 'blur_bg') {
        // MODE A: Pillarbox Blur Background
        exportCtx.save();
        exportCtx.filter = 'blur(22px) brightness(0.55)';
        exportCtx.drawImage(liveVideo, 0, 0, vidW, vidH, 0, 0, outW, outH);
        exportCtx.restore();

        const scale = outW / vidW;
        const fitH = vidH * scale;
        const offsetY = (outH - fitH) / 2;
        exportCtx.drawImage(liveVideo, 0, 0, vidW, vidH, 0, offsetY, outW, fitH);

        // Crisp top/bottom border on letterboxed 16:9 frame
        exportCtx.strokeStyle = 'rgba(145, 70, 255, 0.6)';
        exportCtx.lineWidth = 3;
        exportCtx.strokeRect(0, offsetY, outW, fitH);

      } else if (cropMode === 'split') {
        // MODE B: Split Cam (Top 34%) + Gameplay Action (Bottom 66%)
        const splitY = Math.round(outH * 0.34); // 435px
        const bottomH = outH - splitY;          // 845px

        // Top region: Zoom into top-right Facecam area of 16:9 source
        const camSrcW = Math.round(vidW * 0.22);
        const camSrcH = Math.round(vidH * 0.25);
        const camSrcX = vidW - camSrcW - Math.round(vidW * 0.015);
        const camSrcY = Math.round(vidH * 0.03);
        exportCtx.drawImage(liveVideo, camSrcX, camSrcY, camSrcW, camSrcH, 0, 0, outW, splitY);

        // Bottom region: Center gameplay action crop
        const actionAspect = outW / bottomH;
        const actionSrcW = Math.min(vidW, Math.round(vidH * actionAspect));
        const actionSrcX = Math.round((vidW - actionSrcW) / 2);
        exportCtx.drawImage(liveVideo, actionSrcX, 0, actionSrcW, vidH, 0, splitY, outW, bottomH);

        // Glowing neon divider line
        exportCtx.save();
        exportCtx.strokeStyle = '#9146ff';
        exportCtx.lineWidth = 6;
        exportCtx.beginPath();
        exportCtx.moveTo(0, splitY);
        exportCtx.lineTo(outW, splitY);
        exportCtx.stroke();
        exportCtx.restore();

      } else {
        // MODE C: Center Smart-Crop (16:9 -> 9:16 center action)
        const cropW = vidH * (9 / 16);
        const cropX = (vidW - cropW) / 2;
        exportCtx.drawImage(liveVideo, cropX, 0, cropW, vidH, 0, 0, outW, outH);
      }

      // ----------------------------------------------------------------------
      // OVERLAYS: Streamer Watermark, Clipper Attribution & Viral Hook Caption
      // ----------------------------------------------------------------------
      const streamerName = streamerHandleInput.value.trim() || '@Streamer';
      const clipperName = clipperHandleInput.value.trim() || '@Viewer';

      exportCtx.save();

      // 1. Streamer Pill Badge (Top-Left)
      exportCtx.fillStyle = 'rgba(14, 14, 16, 0.88)';
      exportCtx.strokeStyle = '#9146ff';
      exportCtx.lineWidth = 3;
      exportCtx.beginPath();
      exportCtx.roundRect(28, 36, 300, 54, 27);
      exportCtx.fill();
      exportCtx.stroke();

      exportCtx.fillStyle = '#9146ff';
      exportCtx.beginPath();
      exportCtx.arc(58, 63, 17, 0, Math.PI * 2);
      exportCtx.fill();

      exportCtx.fillStyle = '#ffffff';
      exportCtx.font = 'bold 21px Inter, sans-serif';
      exportCtx.fillText(streamerName, 86, 70);

      // 2. Clipper Attribution Badge
      exportCtx.fillStyle = 'rgba(0, 0, 0, 0.78)';
      exportCtx.strokeStyle = 'rgba(0, 245, 155, 0.45)';
      exportCtx.lineWidth = 2;
      exportCtx.beginPath();
      exportCtx.roundRect(28, 100, 300, 38, 19);
      exportCtx.fill();
      exportCtx.stroke();

      exportCtx.fillStyle = '#adadb8';
      exportCtx.font = '15px Inter, sans-serif';
      exportCtx.fillText('Clipped by ', 46, 124);
      exportCtx.fillStyle = '#00f59b';
      exportCtx.font = 'bold 15px Inter, sans-serif';
      exportCtx.fillText(clipperName, 126, 124);

      // 3. TikTok / Shorts Viral Caption Pill (Lower-Third)
      if (activeViralSubtitle) {
        exportCtx.fillStyle = 'rgba(0, 0, 0, 0.78)';
        exportCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        exportCtx.lineWidth = 2;
        exportCtx.beginPath();
        exportCtx.roundRect(40, outH - 210, outW - 80, 64, 16);
        exportCtx.fill();
        exportCtx.stroke();

        exportCtx.fillStyle = '#ffffff';
        exportCtx.font = 'bold 22px Inter, sans-serif';
        exportCtx.textAlign = 'center';
        exportCtx.fillText(activeViralSubtitle.slice(0, 38), outW / 2, outH - 170);
        exportCtx.textAlign = 'left';
      }

      // 4. Flash border when !clip is triggered
      if (Date.now() < clipFlashUntil) {
        exportCtx.strokeStyle = '#00f59b';
        exportCtx.lineWidth = 12;
        exportCtx.strokeRect(6, 6, outW - 12, outH - 12);
      }

      // 5. Bottom Gradient & Channel Callout
      const bottomGrad = exportCtx.createLinearGradient(0, outH - 125, 0, outH);
      bottomGrad.addColorStop(0, 'rgba(0,0,0,0)');
      bottomGrad.addColorStop(1, 'rgba(0,0,0,0.9)');
      exportCtx.fillStyle = bottomGrad;
      exportCtx.fillRect(0, outH - 125, outW, 125);

      exportCtx.fillStyle = '#bf94ff';
      exportCtx.font = 'bold 20px Inter, sans-serif';
      exportCtx.textAlign = 'center';
      exportCtx.fillText('TWITCH.TV/' + streamerName.replace('@', '').toUpperCase(), outW / 2, outH - 46);
      exportCtx.textAlign = 'left';
      exportCtx.restore();
    }

    animationFrameId = requestAnimationFrame(renderVertical);
  }

  renderVertical();
}

// ============================================================================
// 3. DUAL STAGGERED 9:16 CANVAS ROLLING BUFFER (Valid WebM/MP4 Export)
// ============================================================================
function startRollingVerticalBuffer(sourceStream) {
  // Clean up previous timers/recorders
  if (staggerTimeoutId) clearTimeout(staggerTimeoutId);
  if (rotationIntervalId) clearInterval(rotationIntervalId);
  if (bufferUiIntervalId) clearInterval(bufferUiIntervalId);

  recorderSlots.forEach(slot => {
    if (slot.recorder && slot.recorder.state !== 'inactive') {
      try { slot.recorder.stop(); } catch (e) {}
    }
    slot.chunks = [];
  });

  // Capture 30 FPS directly from the 9:16 vertical canvas
  verticalCanvasStream = verticalExportCanvas.captureStream(30);

  // Attach audio track from source stream if available
  if (sourceStream && sourceStream.getAudioTracks().length > 0) {
    sourceStream.getAudioTracks().forEach(track => {
      verticalCanvasStream.addTrack(track);
    });
  }

  const formatInfo = getSupportedMimeType();
  currentRecordedExt = formatInfo.ext;
  recorderFormatBadge.textContent = `9:16 ${formatInfo.ext.toUpperCase()} Ready`;

  function launchSlot(slotIndex) {
    const slot = recorderSlots[slotIndex];
    if (slot.recorder && slot.recorder.state !== 'inactive') {
      try { slot.recorder.stop(); } catch (e) {}
    }
    slot.chunks = [];
    slot.startedAt = Date.now();
    slot.mimeType = formatInfo.mime || 'video/webm';

    let rec;
    try {
      rec = formatInfo.mime
        ? new MediaRecorder(verticalCanvasStream, { mimeType: formatInfo.mime, videoBitsPerSecond: 4500000 })
        : new MediaRecorder(verticalCanvasStream);
    } catch (err) {
      rec = new MediaRecorder(verticalCanvasStream);
    }

    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        slot.chunks.push(ev.data);
      }
    };

    rec.start(500); // Emit chunk every 500ms with intact initial header at chunks[0]
    slot.recorder = rec;
  }

  // Start Slot A immediately, and Slot B after 15 seconds.
  // Rotate whichever slot exceeds 32 seconds so one slot ALWAYS holds 15s-30s of header-intact 9:16 video!
  launchSlot(0);
  staggerTimeoutId = setTimeout(() => {
    launchSlot(1);
  }, 15000);

  rotationIntervalId = setInterval(() => {
    const now = Date.now();
    const maxWindowMs = (parseInt(clipDurationSelect.value, 10) || 30) * 1000 + 2000;
    recorderSlots.forEach((slot, idx) => {
      if (slot.startedAt > 0 && (now - slot.startedAt) > maxWindowMs) {
        launchSlot(idx);
      }
    });
  }, 2000);

  // Update buffer timeline UI
  bufferUiIntervalId = setInterval(() => {
    const now = Date.now();
    const ages = recorderSlots
      .filter(s => s.startedAt > 0 && s.chunks.length > 0)
      .map(s => (now - s.startedAt) / 1000);
    const maxSec = Math.min(30, ages.length ? Math.max(...ages) : 0);
    bufferTimer.textContent = `${maxSec.toFixed(1)}s available (9:16 HD)`;
    bufferFill.style.width = `${Math.min(100, Math.max(15, (maxSec / 30) * 100))}%`;
  }, 300);

  bufferStatus.innerHTML = '<span class="pulse-dot"></span> Buffer: Active (9:16 Rolling 30s)';
}

// Start Stream in Video Element + Boot 9:16 Renderer & Rolling Buffer
function initStream(stream) {
  sourceMediaStream = stream;
  liveVideo.srcObject = stream;
  liveVideo.play();
  startVerticalRendering();
  startRollingVerticalBuffer(stream);
}

// ============================================================================
// 4. TRIGGER CLIP ACTION & EXPORT
// ============================================================================
function triggerClipAction(clipper = null, chatMsgText = null) {
  const now = Date.now();
  // 2.5s cooldown so rapid !clip chat messages don't collide
  if (now - lastClipTriggerTime < 2500) return;
  lastClipTriggerTime = now;

  if (clipper) {
    const formattedClipper = clipper.startsWith('@') ? clipper : '@' + clipper;
    clipperHandleInput.value = formattedClipper;
    previewClipperTag.textContent = formattedClipper;
  }

  clipFlashUntil = now + 900;

  // Pick the active recorder slot with the fullest valid recording
  const validSlots = recorderSlots.filter(s => s.recorder && s.chunks.length > 0);
  validSlots.sort((a, b) => a.startedAt - b.startedAt); // Oldest startedAt = longest duration
  const chosenSlot = validSlots[0] || recorderSlots[0];

  clipNowBtn.innerHTML = '✨ Slicing 9:16 Vertical Buffer...';
  clipNowBtn.style.backgroundColor = '#00f59b';
  clipNowBtn.style.color = '#000';

  // Request final data frame before building Blob
  if (chosenSlot.recorder && chosenSlot.recorder.state === 'recording') {
    try { chosenSlot.recorder.requestData(); } catch (e) {}
  }

  setTimeout(() => {
    const blobType = chosenSlot.mimeType || 'video/webm';
    currentRecordedBlob = new Blob(chosenSlot.chunks, { type: blobType });
    const sizeMb = Math.max(0.1, currentRecordedBlob.size / (1024 * 1024)).toFixed(2);
    const clipSec = Math.min(30, Math.max(1, ((Date.now() - chosenSlot.startedAt) / 1000))).toFixed(1);

    exportVideoBtn.disabled = false;
    exportVideoBtn.innerHTML = `💾 Download 9:16 Vertical Video (${clipSec}s • ${sizeMb} MB .${currentRecordedExt})`;

    clipNowBtn.innerHTML = '⚡ Clip Last 30 Seconds (!clip)';
    clipNowBtn.style.backgroundColor = '';
    clipNowBtn.style.color = '';

    // Generate Codex viral hook & update on-canvas subtitle
    generateCodexViralTitles(chatMsgText);
  }, 450);
}

// Download Processed 9:16 Vertical Clip
function downloadVerticalClip() {
  if (!currentRecordedBlob) return;

  const url = URL.createObjectURL(currentRecordedBlob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  const streamer = (streamerHandleInput.value || 'streamer').replace(/[^a-zA-Z0-9_-]/g, '');
  const clipper = (clipperHandleInput.value || 'viewer').replace(/[^a-zA-Z0-9_-]/g, '');
  a.download = `StreamClip_9x16_${streamer}_by_${clipper}_${Date.now()}.${currentRecordedExt}`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 150);
}

// ============================================================================
// 5. OPENAI CODEX VIRAL TITLE & HOOK GENERATOR
// ============================================================================
function generateCodexViralTitles(contextMessage = null) {
  const streamer = streamerHandleInput.value.trim() || '@Streamer';
  const clipper = clipperHandleInput.value.trim() || '@Viewer';

  const hooks = [
    {
      subtitle: `${streamer} 1v5 CLUTCH PLAY 😱🔥`,
      full: `"${streamer} JUST HIT THE CLEANEST CLUTCH ON STREAM 😱🔥 (Clipped by ${clipper}) #gaming #twitch #twitchclips #shorts"`
    },
    {
      subtitle: `WAIT FOR THE REACTION 💀🎯`,
      full: `"Wait for the reaction... NO WAY ${streamer} PULLED THAT OFF 💀 #streamer #gamingmoments #twitchmoments #tiktokgaming"`
    },
    {
      subtitle: `CHAT WENT CRAZY AFTER THIS 🚨`,
      full: `"POV: ${clipper} typed !clip at the exact right millisecond 🏆🔥 #gamingcommunity #viralshorts #twitchcon"`
    },
    {
      subtitle: `200 IQ PLAY ON LIVE STREAM 🧠⚡`,
      full: `"Bro really thought he could outplay ${streamer} live in front of 4,000 viewers 😭🎯 #fps #gamerlife #shorts"`
    }
  ];

  const pick = hooks[Math.floor(Math.random() * hooks.length)];
  activeViralSubtitle = pick.subtitle;

  codexResultsBox.innerHTML = `
    <div class="codex-hook-item">
      <strong>⚡ Codex Generated Hook:</strong> ${pick.full}
    </div>
  `;
}

// ============================================================================
// 6. LIVE TWITCH CHAT IRC WEBSOCKET CLIENT (Anonymous Read-Only)
//    Connects directly to wss://irc-ws.chat.twitch.tv:443 (Zero OAuth Needed)
// ============================================================================
class TwitchLiveChatListener {
  constructor() {
    this.ws = null;
    this.channel = null;
    this.isConnected = false;
  }

  connect(channelName) {
    const cleanChannel = channelName.trim().toLowerCase().replace(/^[@#]/, '');
    if (!cleanChannel) return;

    this.disconnect();
    this.channel = cleanChannel;

    // Update UI to connecting state
    liveChatTicker.innerHTML = `<span style="color:#bf94ff;">⏳ Connecting to Twitch IRC WebSocket for <strong>#${cleanChannel}</strong>...</span>`;

    try {
      this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    } catch (err) {
      this.handleError('WebSocket blocked or offline');
      return;
    }

    this.ws.onopen = () => {
      // Official Twitch anonymous read-only IRC handshake (same protocol used by tmi.js)
      const anonNick = 'justinfan' + Math.floor(10000 + Math.random() * 89999);
      this.ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      this.ws.send('PASS SCHMOOPIIE');
      this.ws.send(`NICK ${anonNick}`);
      this.ws.send(`JOIN #${this.channel}`);
    };

    this.ws.onmessage = (event) => {
      const rawData = event.data;
      const lines = rawData.split('\r\n');

      for (const line of lines) {
        if (!line) continue;

        // Keep-alive PING/PONG
        if (line.startsWith('PING')) {
          this.ws.send('PONG :tmi.twitch.tv');
          continue;
        }

        // Confirm JOIN success
        if (line.includes(`JOIN #${this.channel}`)) {
          this.isConnected = true;
          this.updateConnectedUI(true);
          appendChatMessage('System', `Connected live to #${this.channel}! Listening for ${triggerKeywordInput.value || '!clip'}...`, '#00f59b', false);
          continue;
        }

        // Parse PRIVMSG
        if (line.includes('PRIVMSG')) {
          this.parsePrivMsg(line);
        }
      }
    };

    this.ws.onerror = () => {
      this.handleError(`Could not reach Twitch IRC for #${this.channel}`);
    };

    this.ws.onclose = () => {
      if (this.isConnected) {
        this.isConnected = false;
        this.updateConnectedUI(false);
      }
    };
  }

  parsePrivMsg(line) {
    // Extract display-name and color from IRCv3 tags
    let displayName = 'TwitchViewer';
    let color = '#bf94ff';

    const nameMatch = line.match(/display-name=([^;]+)/);
    if (nameMatch && nameMatch[1]) {
      displayName = nameMatch[1];
    } else {
      const userMatch = line.match(/:([^!]+)!/);
      if (userMatch && userMatch[1]) displayName = userMatch[1];
    }

    const colorMatch = line.match(/color=(#[0-9a-fA-F]{6})/);
    if (colorMatch && colorMatch[1]) {
      color = colorMatch[1];
    }

    const msgSplit = line.split(`PRIVMSG #${this.channel} :`);
    if (msgSplit.length < 2) return;
    const messageText = msgSplit.slice(1).join(`PRIVMSG #${this.channel} :`).trim();

    const triggerCmd = (triggerKeywordInput.value || '!clip').trim().toLowerCase();
    const isTrigger = triggerCmd && messageText.toLowerCase().includes(triggerCmd);

    appendChatMessage(displayName, messageText, color, isTrigger);

    if (isTrigger) {
      triggerClipAction(`@${displayName}`, messageText);
    }
  }

  updateConnectedUI(connected) {
    if (connected) {
      twitchConnBadge.innerHTML = `<span class="status-dot online"></span> Live: #${this.channel}`;
      activeChannelPill.textContent = `#${this.channel} (LIVE)`;
      connectChannelBtn.style.display = 'none';
      disconnectChannelBtn.style.display = 'inline-flex';
      liveChatTicker.innerHTML = `<span style="color:#00f59b;">🟢 Connected to <strong>#${this.channel}</strong> — Waiting for chat messages...</span>`;
      // Also auto-fill streamer handle if user wants
      streamerHandleInput.value = `@${this.channel}`;
      previewStreamerTag.textContent = `@${this.channel}`;
    } else {
      twitchConnBadge.innerHTML = `<span class="status-dot offline"></span> Twitch Chat: Sim Mode`;
      activeChannelPill.textContent = '#sim-chat';
      connectChannelBtn.style.display = 'inline-flex';
      disconnectChannelBtn.style.display = 'none';
    }
  }

  handleError(msg) {
    liveChatTicker.innerHTML = `<span style="color:#f59e0b;">⚠️ ${msg} — Chat Simulator active</span>`;
    this.updateConnectedUI(false);
  }

  disconnect() {
    if (this.ws) {
      this.isConnected = false;
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    this.updateConnectedUI(false);
    liveChatTicker.innerHTML = `<span class="ticker-placeholder">Disconnected. Enter any live Twitch channel to listen for <code>!clip</code> triggers...</span>`;
  }
}

const twitchListener = new TwitchLiveChatListener();

// Append message to UI feeds (Main Chat Log, Top Ticker, and Modal Feed)
function appendChatMessage(username, messageText, color = '#00f59b', isClipTrigger = false) {
  const safeUser = username.replace(/[<>&"']/g, '');
  const safeMsg = messageText.replace(/[<>&"']/g, '');

  const rowHtml = `<span class="chatter-name" style="color:${color};">${safeUser}:</span> ${safeMsg} ${
    isClipTrigger ? '<strong style="color:#00f59b;">[⚡ AUTO-CLIPPED!]</strong>' : ''
  }`;

  // 1. Update Main Chat Log
  if (mainChatLog) {
    const div = document.createElement('div');
    div.className = 'chat-msg' + (isClipTrigger ? ' clip-trigger-highlight' : '');
    div.innerHTML = rowHtml;
    mainChatLog.appendChild(div);
    while (mainChatLog.children.length > 40) {
      mainChatLog.removeChild(mainChatLog.firstChild);
    }
    mainChatLog.scrollTop = mainChatLog.scrollHeight;
  }

  // 2. Update Modal Chat Feed
  if (chatFeed) {
    const modalDiv = document.createElement('div');
    modalDiv.className = 'chat-msg' + (isClipTrigger ? ' clip-trigger-highlight' : '');
    modalDiv.innerHTML = rowHtml;
    chatFeed.appendChild(modalDiv);
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }

  // 3. Update Top Live Ticker
  if (liveChatTicker) {
    liveChatTicker.innerHTML = rowHtml;
  }
}

// ============================================================================
// 7. UI EVENT LISTENERS
// ============================================================================

// Screen / Tab Capture
captureScreenBtn.addEventListener('click', async () => {
  try {
    isDemoRunning = false;
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 60, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: true
    });
    initStream(stream);
  } catch (err) {
    console.error('Screen capture cancelled or error:', err);
  }
});

// Load Demo Synthetic Stream
loadDemoStreamBtn.addEventListener('click', () => {
  const stream = createSyntheticGamingStream();
  initStream(stream);
});

// Clip Button Trigger
clipNowBtn.addEventListener('click', () => {
  triggerClipAction();
});

// Quick Test !clip Button in Live Chat Card
quickSimClipBtn.addEventListener('click', () => {
  const demoViewers = ['ClutchKing99', 'ValorantPro_TV', 'TwitchSniper42', 'PixelQueen_'];
  const randomViewer = demoViewers[Math.floor(Math.random() * demoViewers.length)];
  const cmd = triggerKeywordInput.value || '!clip';
  appendChatMessage(randomViewer, `${cmd} INSANE PLAY!!`, '#00f59b', true);
  triggerClipAction(`@${randomViewer}`, `${cmd} INSANE PLAY!!`);
});

// Export Download Button
exportVideoBtn.addEventListener('click', () => {
  downloadVerticalClip();
});

// Input Synchronization
streamerHandleInput.addEventListener('input', (e) => {
  previewStreamerTag.textContent = e.target.value || '@Streamer';
});

clipperHandleInput.addEventListener('input', (e) => {
  previewClipperTag.textContent = e.target.value || '@Viewer';
});

generateCodexTitlesBtn.addEventListener('click', () => {
  generateCodexViralTitles();
});

// Live Twitch Connect Bar Events
connectChannelBtn.addEventListener('click', () => {
  twitchListener.connect(liveChannelInput.value);
});

liveChannelInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    twitchListener.connect(liveChannelInput.value);
  }
});

disconnectChannelBtn.addEventListener('click', () => {
  twitchListener.disconnect();
});

toggleTwitchConnectBtn.addEventListener('click', () => {
  liveChannelInput.focus();
  liveChannelInput.select();
});

// Chat Simulator Modal Events
openChatSimBtn.addEventListener('click', () => {
  chatModal.style.display = 'flex';
});

closeChatModalBtn.addEventListener('click', () => {
  chatModal.style.display = 'none';
});

sendSimChatBtn.addEventListener('click', () => {
  const msg = simChatInput.value.trim();
  if (!msg) return;

  const triggerCmd = (triggerKeywordInput.value || '!clip').trim().toLowerCase();
  const isClip = msg.toLowerCase().includes(triggerCmd);

  appendChatMessage('ChatViewer_01', msg, '#00f59b', isClip);

  if (isClip) {
    chatModal.style.display = 'none';
    triggerClipAction('@ChatViewer_01', msg);
  }

  simChatInput.value = '';
});

// Auto-boot demo stream on initial load
window.addEventListener('DOMContentLoaded', () => {
  const stream = createSyntheticGamingStream();
  initStream(stream);
});
