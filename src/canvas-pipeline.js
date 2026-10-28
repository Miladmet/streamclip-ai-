export class CanvasPipeline {
  constructor({ video, canvas, layout = "center", streamer = "@streamer", clipper = "@viewer", fps = 30 }) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.layout = layout;
    this.streamer = streamer;
    this.clipper = clipper;
    this.fps = fps;
    this.raf = null;
    this.running = false;
    canvas.width = 720;
    canvas.height = 1280;
  }

  setLayout(layout) {
    if (!["center", "blur", "split"].includes(layout)) throw new Error("Unknown layout.");
    this.layout = layout;
  }

  renderFrame() {
    const v = this.video;
    if (!v || v.readyState < 2 || !v.videoWidth || !v.videoHeight) return;
    const c = this.ctx, W = 720, H = 1280;

    if (this.layout === "center") {
      const ratio = 9 / 16;
      const cropW = Math.min(v.videoWidth, v.videoHeight * ratio);
      const cropH = cropW / ratio;
      c.drawImage(v, (v.videoWidth - cropW) / 2, (v.videoHeight - cropH) / 2, cropW, cropH, 0, 0, W, H);
    } else if (this.layout === "blur") {
      c.save();
      c.filter = "blur(32px) brightness(.42)";
      c.drawImage(v, -70, -70, W + 140, H + 140);
      c.restore();
      const scale = Math.min(W / v.videoWidth, H / v.videoHeight);
      const w = v.videoWidth * scale, h = v.videoHeight * scale;
      c.drawImage(v, (W - w) / 2, (H - h) / 2, w, h);
    } else {
      const top = 390;
      c.fillStyle = "#111"; c.fillRect(0, 0, W, top);
      c.fillStyle = "#eee"; c.font = "bold 28px sans-serif";
      c.fillText("FACECAM AREA", 235, 205);
      const cropW = Math.min(v.videoWidth, v.videoHeight * (W / (H - top)));
      c.drawImage(v, (v.videoWidth - cropW) / 2, 0, cropW, v.videoHeight, 0, top, W, H - top);
    }

    c.save();
    c.font = "bold 24px sans-serif";
    c.fillStyle = "#fff";
    c.shadowColor = "#000";
    c.shadowBlur = 5;
    c.fillText(this.streamer, 24, 42);
    c.font = "20px sans-serif";
    c.fillText(`Clipped by ${this.clipper}`, 24, H - 28);
    c.restore();
  }

  start() {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      this.renderFrame();
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  stop() {
    this.running = false;
    if (this.raf != null) cancelAnimationFrame(this.raf);
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
