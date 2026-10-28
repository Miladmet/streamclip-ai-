import { RollingClipBuffer } from "./rolling-clip-buffer.js";
import { FFmpegWebMExporter } from "./ffmpeg-webm-exporter.js";
import { CanvasPipeline } from "./canvas-pipeline.js";
import { TwitchIRC } from "./twitch-irc.js";

if (typeof window !== "undefined") {
  window.StreamClip = { RollingClipBuffer, FFmpegWebMExporter, CanvasPipeline, TwitchIRC };
}

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
let statusPollTimer = null;
let irc = null;
let exporter = null;
let lastObjectURL = null;
let busy = false;

function setStatus(message) { status.textContent = message; }

function downloadBlob(blob, durationMs = 30000, username = "manual") {
  if (lastObjectURL) URL.revokeObjectURL(lastObjectURL);
  lastObjectURL = URL.createObjectURL(blob);
  const link = $("download");
  link.href = lastObjectURL;
  link.download = `streamclip-${username}-${new Date().toISOString().replaceAll(":", "-")}.webm`;
  link.textContent = `Download WebM (${(blob.size / 1024 / 1024).toFixed(2)} MB)`;
  link.hidden = false;

  const result = $("result");
  result.src = lastObjectURL;
  result.hidden = false;
  $("metadata").textContent =
    `Trigger: ${new Date().toISOString()}\n` +
    `Clipped by: ${$("clipper").value || `@${username}`}\n` +
    `Assembled duration: ${(durationMs / 1000).toFixed(2)} seconds\n` +
    `Output size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`;
}

async function exportAt(triggerAt, username = "manual") {
  if (!buffer || busy) return;
  busy = true;
  clipButton.disabled = true;
  try {
    setStatus("Selecting the buffered segments before the trigger…");
    const selection = await buffer.captureClip(triggerAt);
    const partCount = selection.parts?.length || 0;
    setStatus(`Selected ${partCount} overlapping WebM segments (${(selection.durationMs / 1000).toFixed(1)}s). Running FFmpeg…`);

    exporter ||= new FFmpegWebMExporter({
      onProgress: ({ progress }) => {
        if (Number.isFinite(progress) && progress >= 0 && progress <= 1) {
          setStatus(`Assembling 9:16 WebM clip… ${Math.round(progress * 100)}%`);
        }
      },
      onLog: message => console.debug("[ffmpeg]", message)
    });

    const blob = await exporter.exportClip(selection);
    downloadBlob(blob, selection.durationMs, username);
    setStatus(`✅ Clip ready! ${(selection.durationMs / 1000).toFixed(1)}s 9:16 WebM (${(blob.size / 1024 / 1024).toFixed(2)} MB). Scroll down to preview or download.`);
  } catch (error) {
    console.error(error);
    setStatus(`Clip failed: ${error.message}`);
  } finally {
    busy = false;
    clipButton.disabled = false;
  }
}

function startRollingBufferNow() {
  if (!recordingStream) throw new Error("Start screen capture first.");
  buffer?.stop();
  clearInterval(statusPollTimer);

  buffer = new RollingClipBuffer(recordingStream, {
    clipDurationMs: 30_000,
    segmentDurationMs: 2_000,
    staggerMs: 1_000,
    maxAgeMs: 42_000
  });

  const updateBufferReadout = () => {
    if (!buffer || busy) return;
    const state = buffer.getBufferStatus();
    const secs = Math.min(30, Math.floor(state.coveredMs / 1000));
    setStatus(
      `🟢 Rolling buffer active — ${secs}/30 seconds buffered (${state.segmentCount} segments retained). ` +
      (secs >= 2 ? "Ready to clip!" : "Warming up first segment…")
    );
  };

  buffer.addEventListener("segment", updateBufferReadout);
  buffer.addEventListener("recordererror", event => {
    console.error(event.detail.error);
    setStatus(`Recorder error: ${event.detail.error?.message || "unknown error"}`);
  });

  buffer.start();
  startButton.disabled = true;
  startButton.textContent = "Buffer running (30s)";
  clipButton.disabled = false;
  setStatus("🟢 Rolling buffer started — recording first 2-second segment…");

  statusPollTimer = setInterval(updateBufferReadout, 1000);
}

captureButton.addEventListener("click", async () => {
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 30 } },
      audio: true
    });
    source.srcObject = displayStream;
    await source.play();

    const chName = ($("channel").value || "").trim();
    const streamerTag = chName && chName !== "YOUR_CHANNEL" ? `@${chName.replace(/^[@#]/, "")}` : "@streamer";

    pipeline = new CanvasPipeline({
      video: source,
      canvas,
      streamer: streamerTag,
      clipper: $("clipper").value || "@viewer"
    });
    pipeline.setLayout($("layout").value);
    pipeline.start();

    recordingStream = pipeline.createStream(displayStream);
    startButton.disabled = false;
    stopButton.disabled = false;
    connectButton.disabled = false;

    // Automatically start the rolling buffer as soon as capture starts
    startRollingBufferNow();

    displayStream.getVideoTracks()[0].addEventListener("ended", stopAll);
  } catch (error) {
    setStatus(`Capture was not started: ${error.message}`);
  }
});

$("layout").addEventListener("change", event => pipeline?.setLayout(event.target.value));
$("clipper").addEventListener("input", event => {
  if (pipeline) pipeline.clipper = event.target.value || "@viewer";
});
$("channel").addEventListener("input", event => {
  if (pipeline) {
    const val = event.target.value.trim();
    pipeline.streamer = val && val !== "YOUR_CHANNEL" ? `@${val.replace(/^[@#]/, "")}` : "@streamer";
  }
});

startButton.addEventListener("click", () => {
  try {
    startRollingBufferNow();
  } catch (error) {
    setStatus(error.message);
  }
});

clipButton.addEventListener("click", () => exportAt(performance.now(), "manual"));

connectButton.addEventListener("click", () => {
  try {
    irc?.disconnect();
    irc = new TwitchIRC($("channel").value, {
      onClipCommand: message => {
        const triggerAt = message.receivedAt;
        const clipper = `@${message.username}`;
        $("clipper").value = clipper;
        if (pipeline) pipeline.clipper = clipper;
        setStatus(`${clipper} requested a clip via Twitch chat! Preserving preceding 30s…`);
        exportAt(triggerAt, message.username);
      },
      onMessage: message => console.debug(`[chat] ${message.username}: ${message.text}`)
    });
    irc.connect();
    connectButton.disabled = true;
    disconnectButton.disabled = false;
    setStatus(`Connected to anonymous Twitch IRC (#${$("channel").value.replace(/^#/, "")}). Listening for !clip.`);
  } catch (error) {
    setStatus(error.message);
  }
});

disconnectButton.addEventListener("click", () => {
  irc?.disconnect();
  irc = null;
  connectButton.disabled = false;
  disconnectButton.disabled = true;
  setStatus("Twitch chat disconnected.");
});

function stopAll() {
  clearInterval(statusPollTimer);
  buffer?.stop();
  irc?.disconnect();
  pipeline?.stop();
  displayStream?.getTracks().forEach(track => track.stop());
  recordingStream?.getTracks().forEach(track => track.stop());
  buffer = null;
  irc = null;
  displayStream = null;
  recordingStream = null;
  startButton.disabled = true;
  startButton.textContent = "Start rolling buffer";
  clipButton.disabled = true;
  stopButton.disabled = true;
  connectButton.disabled = true;
  disconnectButton.disabled = true;
  setStatus("Capture stopped.");
}

stopButton.addEventListener("click", stopAll);
window.addEventListener("beforeunload", () => {
  stopAll();
  if (lastObjectURL) URL.revokeObjectURL(lastObjectURL);
});
