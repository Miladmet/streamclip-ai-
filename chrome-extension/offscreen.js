// StreamClip AI - Offscreen Document Engine (Manifest V3)
// Runs 100% in background without UI throttling

class RollingClipBuffer {
  constructor(canvasStream) {
    this.stream = canvasStream;
    this.slotA = { recorder: null, chunks: [], startTime: 0 };
    this.slotB = { recorder: null, chunks: [], startTime: 0 };
    this.slotDuration = 32000;
    this.staggerOffset = 16000;
    this.active = false;
    this.init();
  }

  init() {
    this.active = true;
    this.startSlot(this.slotA);
    setTimeout(() => {
      if (this.active) this.startSlot(this.slotB);
    }, this.staggerOffset);

    this.timer = setInterval(() => {
      if (!this.active) return;
      const now = Date.now();
      if (this.slotA.startTime && (now - this.slotA.startTime >= this.slotDuration)) {
        this.restartSlot(this.slotA);
      }
      if (this.slotB.startTime && (now - this.slotB.startTime >= this.slotDuration)) {
        this.restartSlot(this.slotB);
      }
    }, 1000);
  }

  startSlot(slot) {
    slot.chunks = [];
    slot.startTime = Date.now();
    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

      slot.recorder = new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: 2500000
      });

      slot.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          slot.chunks.push(e.data);
        }
      };

      slot.recorder.start(500);
    } catch (err) {
      console.error('Offscreen MediaRecorder error:', err);
    }
  }

  restartSlot(slot) {
    if (slot.recorder && slot.recorder.state !== 'inactive') {
      try {
        slot.recorder.stop();
      } catch (e) {}
    }
    this.startSlot(slot);
  }

  getBestClip() {
    const now = Date.now();
    const durA = this.slotA.startTime ? (now - this.slotA.startTime) : 0;
    const durB = this.slotB.startTime ? (now - this.slotB.startTime) : 0;

    let bestSlot = this.slotA;
    if (durB > durA) {
      bestSlot = this.slotB;
    }

    if (!bestSlot.chunks || bestSlot.chunks.length === 0) {
      return null;
    }

    return new Blob(bestSlot.chunks, { type: 'video/webm' });
  }
}

class OffscreenCanvasPipeline {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layout = 'split-right';
    this.panX = 50;
    this.panY = 50;
    this.zoom = 1.0;
    this.channel = 'streamer';
    this.clipper = 'Viewer';
    this.hookBanner = 'WAIT TILL THE END 😱 #shorts';
    this.simTime = 0;

    this.stream = this.canvas.captureStream(30);
    this.buffer = new RollingClipBuffer(this.stream);

    this.startLoop();
  }

  startLoop() {
    const render = () => {
      this.drawFrame();
    };
    setInterval(render, 33); // Strict 30 FPS timer in offscreen document
  }

  drawFrame() {
    this.simTime += 0.033;
    const ctx = this.ctx;
    const w = 720;
    const h = 1280;

    // Background gradient / gameplay simulation
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, w, h);

    if (this.layout === 'blur') {
      // Blurred backdrop
      ctx.fillStyle = '#1e1136';
      ctx.fillRect(0, 0, w, h);

      // Centered 16:9 gameplay
      const vh = Math.round(w * (9 / 16));
      const vy = Math.round((h - vh) / 2);
      this.drawSyntheticScene(0, vy, w, vh);
    } else if (this.layout === 'split-right' || this.layout === 'split-left') {
      // Facecam Top 34%
      const camH = Math.round(h * 0.34);
      this.drawSyntheticFacecam(0, 0, w, camH);

      // Neon Twitch Divider
      ctx.fillStyle = '#9146ff';
      ctx.fillRect(0, camH - 2, w, 4);

      // Gameplay Bottom 66%
      const gameH = h - camH;
      this.drawSyntheticScene(0, camH, w, gameH);
    } else {
      // Center Action Crop
      this.drawSyntheticScene(0, 0, w, h);
    }

    // Overlays: Live Pill & Streamer Tag
    this.drawOverlays();
  }

  drawSyntheticScene(x, y, w, h) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    // Animated grid & action elements
    ctx.fillStyle = '#111026';
    ctx.fillRect(x, y, w, h);

    const cx = x + (w * this.panX) / 100;
    const cy = y + (h * this.panY) / 100;

    ctx.strokeStyle = 'rgba(145, 71, 255, 0.2)';
    ctx.lineWidth = 2;
    for (let i = 0; i < w; i += 40) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i, y + h);
      ctx.stroke();
    }

    // Moving target/crosshair
    const targetX = cx + Math.sin(this.simTime * 2) * 80;
    const targetY = cy + Math.cos(this.simTime * 2) * 50;

    ctx.fillStyle = '#00f5ff';
    ctx.beginPath();
    ctx.arc(targetX, targetY, 24 * this.zoom, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(targetX, targetY, 36 * this.zoom, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  drawSyntheticFacecam(x, y, w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = '#18142a';
    ctx.fillRect(x, y, w, h);

    // Streamer avatar circle
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = '#9146ff';
    ctx.beginPath();
    ctx.arc(cx, cy, 54, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('@' + this.channel.toUpperCase(), cx, cy + 90);
  }

  drawOverlays() {
    const ctx = this.ctx;
    const w = 720;
    const h = 1280;

    // Top-Left LIVE Badge
    ctx.fillStyle = '#ff4655';
    ctx.beginPath();
    ctx.roundRect(32, 40, 110, 36, 18);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🔴 LIVE', 87, 63);

    // Streamer Attribution Badge
    ctx.fillStyle = 'rgba(18, 16, 28, 0.85)';
    ctx.beginPath();
    ctx.roundRect(150, 40, 220, 36, 18);
    ctx.fill();
    ctx.fillStyle = '#00f5ff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('twitch.tv/' + this.channel, 260, 63);

    // Bottom-Center Clipper Credit
    ctx.fillStyle = 'rgba(18, 16, 28, 0.9)';
    ctx.beginPath();
    ctx.roundRect(36, h - 140, w - 72, 42, 21);
    ctx.fill();
    ctx.fillStyle = '#9146ff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚡ Clipped by @' + this.clipper, w / 2, h - 114);

    // Viral Hook Banner
    if (this.hookBanner) {
      ctx.fillStyle = '#ffe600';
      ctx.beginPath();
      ctx.roundRect(36, h - 84, w - 72, 46, 10);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.font = '900 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.hookBanner.toUpperCase(), w / 2, h - 55);
    }
  }

  async captureCoverThumbnail() {
    return new Promise((resolve) => {
      this.canvas.toBlob((blob) => {
        if (!blob) {
          resolve('');
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.85);
    });
  }
}

let pipeline = null;

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('offscreenCanvas');
  pipeline = new OffscreenCanvasPipeline(canvas);
  console.log('StreamClip AI Offscreen pipeline ready.');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target !== 'offscreen') return;

  if (request.action === 'SET_CONFIG') {
    if (pipeline) {
      if (request.layout) pipeline.layout = request.layout;
      if (request.panX !== undefined) pipeline.panX = request.panX;
      if (request.panY !== undefined) pipeline.panY = request.panY;
      if (request.zoom !== undefined) pipeline.zoom = request.zoom;
      if (request.hookBanner) pipeline.hookBanner = request.hookBanner;
    }
    sendResponse({ success: true });
    return;
  }

  if (request.action === 'SLICE_CLIP') {
    if (!pipeline) {
      sendResponse({ success: false, error: 'Pipeline not initialized' });
      return;
    }

    if (request.channel) pipeline.channel = request.channel;
    if (request.clipper) pipeline.clipper = request.clipper;

    const clipBlob = pipeline.buffer.getBestClip();
    if (!clipBlob) {
      sendResponse({ success: false, error: 'Buffer warming up (less than 1s of video)' });
      return;
    }

    pipeline.captureCoverThumbnail().then((thumbUrl) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        sendResponse({
          success: true,
          dataUrl: reader.result,
          thumbUrl: thumbUrl,
          duration: '30s',
          size: (clipBlob.size / (1024 * 1024)).toFixed(1) + ' MB'
        });
      };
      reader.readAsDataURL(clipBlob);
    });

    return true; // async sendResponse
  }
});
