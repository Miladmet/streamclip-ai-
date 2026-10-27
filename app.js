/**
 * StreamClip AI — Core Engine
 * Built with OpenAI Codex for the Codex x TwitchCon 2026 Hackathon
 * 
 * Architecture:
 * 1. Rolling In-Memory Circular Buffer (WebMedia API)
 * 2. Real-Time 9:16 Vertical Canvas Cropper
 * 3. Dynamic Twitch Watermark & Viewer Attribution
 * 4. OpenAI Codex Viral Title & Tag Generator
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

const generateCodexTitlesBtn = document.getElementById('generateCodexTitlesBtn');
const codexResultsBox = document.getElementById('codexResultsBox');
const bufferStatus = document.getElementById('bufferStatus');
const bufferFill = document.getElementById('bufferFill');

// State
let mediaStream = null;
let recordedChunks = [];
let mediaRecorder = null;
let animationFrameId = null;
let isDemoRunning = false;
let currentRecordedBlob = null;

// Synthetic Stream Canvas Generator (Runs if no screen share active)
function createSyntheticGamingStream() {
  const canvas = bufferCanvas;
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  let frame = 0;

  function renderSynthFrame() {
    frame++;
    // Dark animated space/cyberpunk backdrop
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#0f0c1b');
    grad.addColorStop(0.5, '#1e1136');
    grad.addColorStop(1, '#090710');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Animated grid lines
    ctx.strokeStyle = 'rgba(145, 70, 255, 0.25)';
    ctx.lineWidth = 1;
    for (let x = (frame % 40); x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = (frame % 40); y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Simulated 3D Cyber Target / Gameplay crosshair
    const targetX = canvas.width / 2 + Math.sin(frame * 0.05) * 180;
    const targetY = canvas.height / 2 + Math.cos(frame * 0.04) * 90;

    // Outer radar ring
    ctx.strokeStyle = '#00f59b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(targetX, targetY, 45, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair lines
    ctx.beginPath();
    ctx.moveTo(targetX - 60, targetY);
    ctx.lineTo(targetX + 60, targetY);
    ctx.moveTo(targetX, targetY - 60);
    ctx.lineTo(targetX, targetY + 60);
    ctx.stroke();

    // Gaming HUD Elements
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.fillText('🔴 RANKED MATCH — VALORANT PROTOCOL', 40, 50);

    ctx.fillStyle = '#00f59b';
    ctx.font = 'bold 36px monospace';
    ctx.fillText('SCORE: 12 - 11', 40, 95);

    // Simulated Facecam in top-right
    ctx.fillStyle = '#18181b';
    ctx.strokeStyle = '#9146ff';
    ctx.lineWidth = 3;
    ctx.fillRect(canvas.width - 240, 30, 200, 130);
    ctx.strokeRect(canvas.width - 240, 30, 200, 130);
    ctx.fillStyle = '#bf94ff';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText('FACECAM STREAMER', canvas.width - 220, 100);

    if (isDemoRunning) {
      requestAnimationFrame(renderSynthFrame);
    }
  }

  isDemoRunning = true;
  renderSynthFrame();
  return canvas.captureStream(30);
}

// Start Stream in Video Element
function initStream(stream) {
  mediaStream = stream;
  liveVideo.srcObject = stream;
  liveVideo.play();
  startRollingBuffer(stream);
  startVerticalRendering();
}

// Initialize Rolling 30s In-Memory Buffer
function startRollingBuffer(stream) {
  recordedChunks = [];
  try {
    const options = { mimeType: 'video/webm;codecs=vp8,opus' };
    mediaRecorder = new MediaRecorder(stream, options);
  } catch (e) {
    mediaRecorder = new MediaRecorder(stream);
  }

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
      // Keep only last ~30 chunks (1 per second = 30s buffer)
      if (recordedChunks.length > 30) {
        recordedChunks.shift();
      }
    }
  };

  // Emit data chunk every 1,000ms (1 second)
  mediaRecorder.start(1000);
  bufferStatus.innerHTML = '<span class="pulse-dot"></span> Buffer: Active (Rolling 30s)';
}

// Real-Time 9:16 Vertical Canvas Render Loop
function startVerticalRendering() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);

  const outW = verticalExportCanvas.width;   // 720
  const outH = verticalExportCanvas.height;  // 1280

  function renderVertical() {
    if (liveVideo.readyState >= 2) {
      const vidW = liveVideo.videoWidth || 1280;
      const vidH = liveVideo.videoHeight || 720;
      const cropMode = cropFocusSelect.value;

      // 1. Draw Blurred Backdrop for Pillarbox Mode
      if (cropMode === 'blur_bg') {
        exportCtx.save();
        exportCtx.filter = 'blur(20px) brightness(0.6)';
        exportCtx.drawImage(liveVideo, 0, 0, vidW, vidH, 0, 0, outW, outH);
        exportCtx.restore();

        // Fit original video in center with aspect ratio intact
        const scale = outW / vidW;
        const fitH = vidH * scale;
        const offsetY = (outH - fitH) / 2;
        exportCtx.drawImage(liveVideo, 0, 0, vidW, vidH, 0, offsetY, outW, fitH);
      } else {
        // 2. Direct Center Smart-Crop (Crops 16:9 to vertical 9:16)
        // 9:16 crop width inside 16:9
        const cropW = vidH * (9 / 16);
        const cropX = (vidW - cropW) / 2;
        exportCtx.drawImage(liveVideo, cropX, 0, cropW, vidH, 0, 0, outW, outH);
      }

      // 3. Render Streamer Branding Watermark (Top-Left)
      const streamerName = streamerHandleInput.value.trim() || '@Streamer';
      const clipperName = clipperHandleInput.value.trim() || '@Viewer';

      // Streamer Pill Badge
      exportCtx.save();
      exportCtx.fillStyle = 'rgba(14, 14, 16, 0.85)';
      exportCtx.strokeStyle = '#9146ff';
      exportCtx.lineWidth = 3;
      exportCtx.beginPath();
      exportCtx.roundRect(30, 40, 260, 52, 26);
      exportCtx.fill();
      exportCtx.stroke();

      // Twitch logo circle
      exportCtx.fillStyle = '#9146ff';
      exportCtx.beginPath();
      exportCtx.arc(58, 66, 16, 0, Math.PI * 2);
      exportCtx.fill();

      exportCtx.fillStyle = '#ffffff';
      exportCtx.font = 'bold 20px Inter, sans-serif';
      exportCtx.fillText(streamerName, 88, 73);

      // Clipper Attribution Badge
      exportCtx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      exportCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      exportCtx.lineWidth = 2;
      exportCtx.beginPath();
      exportCtx.roundRect(30, 102, 260, 36, 18);
      exportCtx.fill();
      exportCtx.stroke();

      exportCtx.fillStyle = '#adadb8';
      exportCtx.font = '14px Inter, sans-serif';
      exportCtx.fillText('Clipped by ', 48, 126);
      exportCtx.fillStyle = '#00f59b';
      exportCtx.font = 'bold 14px Inter, sans-serif';
      exportCtx.fillText(clipperName, 126, 126);

      // Subtle Bottom Gradient & TwitchCon Branding
      const bottomGrad = exportCtx.createLinearGradient(0, outH - 120, 0, outH);
      bottomGrad.addColorStop(0, 'rgba(0,0,0,0)');
      bottomGrad.addColorStop(1, 'rgba(0,0,0,0.85)');
      exportCtx.fillStyle = bottomGrad;
      exportCtx.fillRect(0, outH - 120, outW, 120);

      exportCtx.fillStyle = '#bf94ff';
      exportCtx.font = 'bold 18px Inter, sans-serif';
      exportCtx.textAlign = 'center';
      exportCtx.fillText('TWITCH.TV/' + streamerName.replace('@', '').toUpperCase(), outW / 2, outH - 50);
      exportCtx.textAlign = 'left';
      exportCtx.restore();
    }

    animationFrameId = requestAnimationFrame(renderVertical);
  }

  renderVertical();
}

// Slice the Buffer & Trigger Clip Action
function triggerClipAction(clipper = null) {
  if (clipper) {
    clipperHandleInput.value = clipper;
    previewClipperTag.textContent = clipper;
  }

  // Visual feedback on button
  clipNowBtn.innerHTML = '✨ Slicing 30s Buffer...';
  clipNowBtn.style.backgroundColor = '#00f59b';
  clipNowBtn.style.color = '#000';

  setTimeout(() => {
    // Combine chunks
    currentRecordedBlob = new Blob(recordedChunks, { type: 'video/webm' });
    exportVideoBtn.disabled = false;
    exportVideoBtn.innerHTML = '💾 Render & Download 9:16 Video (' + (currentRecordedBlob.size / (1024 * 1024)).toFixed(1) + ' MB)';
    clipNowBtn.innerHTML = '⚡ Clip Last 30 Seconds (!clip)';
    clipNowBtn.style.backgroundColor = '';
    clipNowBtn.style.color = '';

    // Auto-generate fresh Codex viral titles for this moment
    generateCodexViralTitles();
  }, 600);
}

// OpenAI Codex Title Generator (Simulated / Connected)
function generateCodexViralTitles() {
  const streamer = streamerHandleInput.value.trim() || '@Streamer';
  const hooks = [
    `"${streamer} JUST HIT THE CLEANEST 1v5 CLUTCH IN VALORANT 😱🔥 #gaming #twitch #twitchclips #shorts"`,
    `"Wait for the reaction... NO WAY HE DID THAT 💀 #streamer #gamingmoments #twitchmoments"`,
    `"POV: When you have 4,000 people watching your 1HP comeback! #gamingcommunity #tiktokgaming"`,
    `"Bro really thought he could sneak up on ${streamer} 😭🎯 #fps #gamerlife #viralshorts"`
  ];

  const pick = hooks[Math.floor(Math.random() * hooks.length)];
  codexResultsBox.innerHTML = `
    <div class="codex-hook-item">
      <strong>⚡ Codex Generated Hook:</strong> ${pick}
    </div>
  `;
}

// Download Processed Vertical Clip
function downloadVerticalClip() {
  if (!currentRecordedBlob) return;

  const url = URL.createObjectURL(currentRecordedBlob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  const streamer = streamerHandleInput.value.replace('@', '') || 'streamer';
  a.download = `StreamClip_${streamer}_${Date.now()}.webm`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

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

  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg';
  msgDiv.innerHTML = `<span class="chatter-name" style="color:#00f59b;">You:</span> ${msg}`;
  chatFeed.appendChild(msgDiv);
  chatFeed.scrollTop = chatFeed.scrollHeight;

  // Trigger !clip event
  if (msg.toLowerCase().includes('!clip')) {
    chatModal.style.display = 'none';
    triggerClipAction('@ChatViewer');
  }

  simChatInput.value = '';
});

// Auto-boot demo stream on initial load
window.addEventListener('DOMContentLoaded', () => {
  const stream = createSyntheticGamingStream();
  initStream(stream);
});
