/*
 * AudioWorkletProcessor for capturing mono PCM frames and sending them
 * to the main thread with modest batching to reduce postMessage overhead.
 * The main thread (sidepanel.js) will handle resampling + 16-bit conversion.
 */

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this._chunks = [];
    this._length = 0;
    // Batch size in samples before posting to main thread. 1024 @ 48kHz ~21.3ms.
    // Keeps latency low while reducing message overhead vs 128-frame bursts.
    this.FRAME_BATCH = 1024;
  }

  _flush() {
    if (this._length === 0) return;
    if (this._chunks.length === 1) {
      // Single chunk fast-path.
      this.port.postMessage(this._chunks[0]);
    } else {
      const out = new Float32Array(this._length);
      let offset = 0;
      for (const c of this._chunks) {
        out.set(c, offset);
        offset += c.length;
      }
      this.port.postMessage(out);
    }
    this._chunks = [];
    this._length = 0;
  }

  process(inputs /*, outputs, parameters */) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true; // keep processor alive even if silence
    }
    // Take first channel (mono)
    const channel = input[0];
    if (channel && channel.length) {
      // Copy because underlying buffer is reused by the system.
      const copy = new Float32Array(channel.length);
      copy.set(channel);
      this._chunks.push(copy);
      this._length += copy.length;
      if (this._length >= this.FRAME_BATCH) {
        this._flush();
      }
    }
    return true; // Continue processing.
  }

  // Optional: ensure any remainder is flushed when GC / node ends (not guaranteed).
  // In practice the main thread closes stream on track end and we don't rely on this.
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);

