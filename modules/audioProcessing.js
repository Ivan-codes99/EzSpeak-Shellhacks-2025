// audioProcessing.js (AudioWorklet-based pipeline with fallback)
// Capture MediaStream -> (AudioWorklet batches mono float32) -> downsample (16k) -> convert 16-bit PCM -> push to Azure PushAudioInputStream.
// Falls back to deprecated ScriptProcessorNode if AudioWorklet not available or module load fails.

export async function createAudioPushPipeline(stream) {
  if (!window.SpeechSDK) throw new Error('SpeechSDK not available');

  let format;
  try { format = window.SpeechSDK.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1); } catch(_) {}
  const pushStream = format
    ? window.SpeechSDK.AudioInputStream.createPushStream(format)
    : window.SpeechSDK.AudioInputStream.createPushStream();

  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);
  const targetSampleRate = 16000;
  let disposed = false;

  function downsampleBuffer(buffer, inputRate, outRate) {
    if (inputRate === outRate) return buffer;
    const ratio = inputRate / outRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < newLength) {
      const nextOffset = Math.round((offsetResult + 1) * ratio);
      let accum = 0, count = 0;
      for (let i = offsetBuffer; i < nextOffset && i < buffer.length; i++) { accum += buffer[i]; count++; }
      result[offsetResult] = count ? (accum / count) : 0;
      offsetResult++; offsetBuffer = nextOffset;
    }
    return result;
  }

  function floatTo16BitPCM(floatBuf) {
    const view = new DataView(new ArrayBuffer(floatBuf.length * 2));
    for (let i = 0; i < floatBuf.length; i++) {
      let s = Math.max(-1, Math.min(1, floatBuf[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Uint8Array(view.buffer);
  }

  function handleSamples(f32) {
    if (disposed || !f32 || !f32.length) return;
    const ds = downsampleBuffer(f32, audioContext.sampleRate, targetSampleRate);
    const pcm = floatTo16BitPCM(ds);
    try { pushStream.write(pcm); } catch(_) {}
  }

  let workletNode = null;
  let processor = null; // legacy fallback
  let mute = null;

  async function initWorklet() {
    const workletUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
      ? chrome.runtime.getURL('pcm-worklet.js')
      : 'pcm-worklet.js';
    await audioContext.audioWorklet.addModule(workletUrl);
    workletNode = new AudioWorkletNode(audioContext, 'pcm-capture-processor');
    workletNode.port.onmessage = (e) => { handleSamples(e.data); };
    mute = audioContext.createGain();
    mute.gain.value = 0; // silence
    source.connect(workletNode).connect(mute).connect(audioContext.destination);
  }

  async function initFallbackScriptProcessor() {
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    mute = audioContext.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute).connect(audioContext.destination);
    processor.onaudioprocess = e => { if (!disposed) handleSamples(e.inputBuffer.getChannelData(0)); };
  }

  if (audioContext.audioWorklet && typeof audioContext.audioWorklet.addModule === 'function') {
    try {
      await initWorklet();
    } catch (err) {
      console.warn('[audioProcessing] AudioWorklet init failed, falling back:', err);
      await initFallbackScriptProcessor();
    }
  } else {
    console.warn('[audioProcessing] AudioWorklet not supported, using ScriptProcessor fallback');
    await initFallbackScriptProcessor();
  }

  function disposeAudio() {
    if (disposed) return; disposed = true;
    try { pushStream.close(); } catch(_) {}
    try { if (workletNode) { workletNode.port.onmessage = null; workletNode.disconnect(); } } catch(_) {}
    try { if (processor) processor.disconnect(); } catch(_) {}
    try { source.disconnect(); } catch(_) {}
    try { if (mute) mute.disconnect(); } catch(_) {}
    try { audioContext.close(); } catch(_) {}
  }

  try { stream.getAudioTracks()[0].addEventListener('ended', disposeAudio); } catch(_) {}

  return { pushStream, disposeAudio };
}
