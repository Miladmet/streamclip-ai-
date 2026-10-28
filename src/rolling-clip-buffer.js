const DEFAULTS = {
  clipDurationMs: 30_000,
  segmentDurationMs: 32_000,
  staggerMs: 15_000,
  maxAgeMs: 65_000,
  videoBitsPerSecond: 3_500_000,
  audioBitsPerSecond: 128_000,
  coverageToleranceMs: 800,
  finalizeTimeoutMs: 2_500
};

function nowMs() {
  return performance.now();
}

function chooseMimeType(hasAudio) {
  const candidates = hasAudio
    ? [
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9,opus",
        "video/webm"
      ]
    : [
        "video/webm;codecs=vp8",
        "video/webm;codecs=vp9",
        "video/webm"
      ];

  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || "";
}

/**
 * Dual staggered rolling buffer.
 *
 * Slot A starts at T=0s and records continuously (emitting chunks every 500ms).
 * Slot B starts at T=15s and records continuously (emitting chunks every 500ms).
 * Each slot rotates every 32s so at least one slot always holds a complete,
 * unbroken, header-intact WebM recording covering up to the last 30 seconds.
 */
export class RollingClipBuffer extends EventTarget {
  constructor(stream, options = {}) {
    super();
    if (!(stream instanceof MediaStream)) {
      throw new TypeError("RollingClipBuffer requires a MediaStream.");
    }
    if (!stream.getVideoTracks().length) {
      throw new Error("The recording stream must contain a video track.");
    }

    this.stream = stream;
    this.options = { ...DEFAULTS, ...options };
    this.mimeType = chooseMimeType(stream.getAudioTracks().length > 0);
    if (!this.mimeType && !MediaRecorder.isTypeSupported("video/webm")) {
      throw new Error("This browser does not support WebM MediaRecorder.");
    }

    this.segments = [];
    this.slots = [];
    this.running = false;
    this.startedAt = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startedAt = nowMs();

    this.slots = [
      this.#makeSlot("A"),
      this.#makeSlot("B")
    ];

    this.#startSlot(this.slots[0]);
    this.slots[1].startTimer = setTimeout(
      () => this.#startSlot(this.slots[1]),
      15_000
    );

    this.dispatchEvent(new CustomEvent("started", {
      detail: { startedAt: this.startedAt, mimeType: this.mimeType }
    }));
  }

  #makeSlot(id) {
    return {
      id,
      recorder: null,
      chunks: [],
      startMs: null,
      stopMs: null,
      stopTimer: null,
      startTimer: null,
      generation: 0
    };
  }

  #startSlot(slot) {
    if (!this.running) return;

    const generation = ++slot.generation;
    slot.chunks = [];
    slot.startMs = nowMs();
    slot.stopMs = null;

    const hasAudio = this.stream.getAudioTracks().length > 0;
    const recOptions = {
      ...(this.mimeType ? { mimeType: this.mimeType } : {}),
      videoBitsPerSecond: this.options.videoBitsPerSecond
    };
    if (hasAudio) {
      recOptions.audioBitsPerSecond = this.options.audioBitsPerSecond;
    }

    let recorder;
    try {
      recorder = new MediaRecorder(this.stream, recOptions);
    } catch (e) {
      recorder = new MediaRecorder(this.stream);
    }
    slot.recorder = recorder;

    recorder.addEventListener("dataavailable", event => {
      if (event.data?.size) {
        slot.chunks.push(event.data);
        this.dispatchEvent(new CustomEvent("segment", {
          detail: { slot: slot.id, chunkCount: slot.chunks.length }
        }));
      }
    });

    recorder.addEventListener("error", event => {
      this.dispatchEvent(new CustomEvent("recordererror", {
        detail: { slot: slot.id, error: event.error || event }
      }));
    });

    recorder.addEventListener("stop", () => {
      const endMs = slot.stopMs ?? nowMs();
      const blob = new Blob(slot.chunks, {
        type: recorder.mimeType || this.mimeType || "video/webm"
      });

      if (blob.size > 0) {
        const segment = {
          id: `${slot.id}-${generation}-${Math.round(slot.startMs)}`,
          slot: slot.id,
          startMs: slot.startMs,
          endMs,
          durationMs: Math.max(0, endMs - slot.startMs),
          blob,
          mimeType: blob.type
        };
        this.segments.push(segment);
        this.#prune();
        this.dispatchEvent(new CustomEvent("segment", { detail: segment }));
      }

      slot.chunks = [];
      slot.recorder = null;

      if (this.running) {
        slot.startTimer = setTimeout(() => this.#startSlot(slot), 20);
      }
    }, { once: true });

    // Emit chunks every 500ms so live progress and instant slicing work at any second
    recorder.start(500);
    slot.stopTimer = setTimeout(() => {
      if (recorder.state === "recording") {
        slot.stopMs = nowMs();
        recorder.stop();
      }
    }, 32_000);
  }

  #prune(referenceTime = nowMs()) {
    const cutoff = referenceTime - this.options.maxAgeMs;
    this.segments = this.segments.filter(segment => segment.endMs >= cutoff);
  }

  getBufferStatus() {
    const time = nowMs();
    this.#prune(time);

    // Check active recording slots + finalized segments
    const activeAges = this.slots
      .filter(s => s.recorder && s.recorder.state === "recording" && s.startMs != null)
      .map(s => time - s.startMs);

    const maxActiveMs = activeAges.length ? Math.max(...activeAges) : 0;
    const totalElapsedMs = this.startedAt == null ? 0 : time - this.startedAt;
    const coveredMs = Math.max(0, Math.min(this.options.clipDurationMs, Math.max(maxActiveMs, totalElapsedMs)));

    const totalChunks = this.slots.reduce((acc, s) => acc + (s.chunks?.length || 0), 0) + this.segments.length;

    return {
      available: coveredMs >= 1000,
      coveredMs,
      requiredMs: this.options.clipDurationMs,
      segmentCount: totalChunks,
      ageMs: totalElapsedMs
    };
  }

  async captureClip(triggerAt = nowMs()) {
    if (!this.running) throw new Error("Rolling buffer is not running.");

    // Pick the active slot that has been recording the longest (up to 30-32s of unbroken WebM with intact header)
    const activeSlots = this.slots
      .filter(s => s.recorder && s.recorder.state === "recording" && s.chunks.length > 0)
      .sort((a, b) => a.startMs - b.startMs);

    if (activeSlots.length > 0) {
      const bestSlot = activeSlots[0];
      const slotStartMs = bestSlot.startMs;

      // Flush final data from active recorder and stop it cleanly (it will auto-restart in 20ms)
      await new Promise(resolve => {
        const rec = bestSlot.recorder;
        if (!rec || rec.state !== "recording") {
          resolve();
          return;
        }
        const timeout = setTimeout(resolve, 600);
        rec.addEventListener("stop", () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
        clearTimeout(bestSlot.stopTimer);
        bestSlot.stopMs = nowMs();
        try { rec.stop(); } catch { resolve(); }
      });

      // Retrieve the newly finalized segment from this.segments
      const latestSeg = this.segments[this.segments.length - 1];
      if (latestSeg && latestSeg.blob?.size > 0) {
        const totalDurMs = Math.max(500, latestSeg.endMs - latestSeg.startMs);
        const clipDurMs = Math.min(this.options.clipDurationMs, totalDurMs);
        const trimStartMs = Math.max(0, totalDurMs - clipDurMs);
        const trimEndMs = totalDurMs;

        const part = {
          segment: latestSeg,
          trimStartMs,
          trimEndMs,
          timelineStartMs: latestSeg.endMs - clipDurMs,
          timelineEndMs: latestSeg.endMs
        };

        return {
          parts: [part],
          segments: [latestSeg],
          directBlob: latestSeg.blob,
          triggerAt,
          targetStart: part.timelineStartMs,
          targetEnd: part.timelineEndMs,
          durationMs: clipDurMs,
          hasAudio: this.stream.getAudioTracks().length > 0
        };
      }
    }

    // Fallback to most recent finalized segment
    if (this.segments.length > 0) {
      const seg = this.segments[this.segments.length - 1];
      const clipDurMs = Math.min(this.options.clipDurationMs, seg.durationMs);
      const part = {
        segment: seg,
        trimStartMs: Math.max(0, seg.durationMs - clipDurMs),
        trimEndMs: seg.durationMs,
        timelineStartMs: seg.endMs - clipDurMs,
        timelineEndMs: seg.endMs
      };
      return {
        parts: [part],
        segments: [seg],
        directBlob: seg.blob,
        triggerAt,
        targetStart: part.timelineStartMs,
        targetEnd: part.timelineEndMs,
        durationMs: clipDurMs,
        hasAudio: this.stream.getAudioTracks().length > 0
      };
    }

    throw new Error("Wait 1-2 seconds for the buffer to capture video frames, then click Clip again.");
  }

  stop() {
    if (!this.running) return;
    this.running = false;

    for (const slot of this.slots) {
      clearTimeout(slot.startTimer);
      clearTimeout(slot.stopTimer);
      if (slot.recorder?.state === "recording") {
        slot.stopMs = nowMs();
        try { slot.recorder.stop(); } catch {}
      }
    }

    this.dispatchEvent(new Event("stopped"));
  }

  dispose() {
    this.stop();
    this.segments = [];
  }
}
