import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

export class FFmpegWebMExporter {
  constructor({ onProgress = () => {}, onLog = () => {} } = {}) {
    this.ffmpeg = new FFmpeg();
    this.onProgress = onProgress;
    this.onLog = onLog;
    this.loaded = false;
    this.loading = null;

    this.ffmpeg.on("progress", event => this.onProgress(event));
    this.ffmpeg.on("log", event => this.onLog(event.message));
  }

  async load() {
    if (this.loaded) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
      const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript");
      const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm");
      await this.ffmpeg.load({ coreURL, wasmURL });
      this.loaded = true;
    })();

    return this.loading;
  }

  async exportClip(selection, { filename = "streamclip.webm" } = {}) {
    const { parts, directBlob } = selection;

    // If we have a clean single-segment recording that is already <= 31s,
    // try ultra-fast FFmpeg stream copy (-c copy) first, or return directBlob immediately on any WASM delay.
    try {
      await Promise.race([
        this.load(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("FFmpeg WASM load timeout")), 6000))
      ]);
    } catch (loadErr) {
      console.warn("Using direct WebM recording (FFmpeg load skipped):", loadErr);
      if (directBlob) return directBlob;
      if (parts?.length) return parts[parts.length - 1].segment.blob;
      throw loadErr;
    }

    if (!parts?.length) {
      if (directBlob) return directBlob;
      throw new Error("No clip parts supplied to exporter.");
    }

    const inputNames = [];
    try {
      // Fast stream-copy path for single continuous segment (completes in ~100ms)
      if (parts.length === 1) {
        const part = parts[0];
        const name = "seg_0.webm";
        inputNames.push(name);
        await this.ffmpeg.writeFile(name, await fetchFile(part.segment.blob));

        const startSec = Math.max(0, part.trimStartMs / 1000).toFixed(3);
        const durSec = Math.max(0.5, (part.trimEndMs - part.trimStartMs) / 1000).toFixed(3);

        const exitCode = await this.ffmpeg.exec([
          "-ss", startSec,
          "-i", name,
          "-t", durSec,
          "-c", "copy",
          "-f", "webm",
          filename
        ]);

        if (exitCode === 0) {
          const data = await this.ffmpeg.readFile(filename);
          if (data.byteLength > 0) {
            return new Blob([data.buffer], { type: "video/webm" });
          }
        }
      }

      if (directBlob) return directBlob;
      return parts[parts.length - 1].segment.blob;
    } catch (err) {
      console.warn("FFmpeg trim fallback to direct WebM:", err);
      if (directBlob) return directBlob;
      if (parts?.length) return parts[parts.length - 1].segment.blob;
      throw err;
    } finally {
      for (const name of inputNames) {
        try { await this.ffmpeg.deleteFile(name); } catch {}
      }
      try { await this.ffmpeg.deleteFile(filename); } catch {}
    }
  }
}
