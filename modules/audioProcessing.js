// audioProcessing.js
// Responsible for converting a MediaStream into 16 kHz mono PCM chunks and pushing
// them into an Azure Speech SDK PushAudioInputStream.

export function createAudioPushPipeline(stream) {
  if (!window.SpeechSDK) throw new Error('SpeechSDK not available');
  const pushStream = window.SpeechSDK.AudioInputStream.createPushStream();

  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);

  let workletNode = null;
  let processor = null;
  let disposed = false;

  const targetSampleRate = 16000;

  function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
    if (outputSampleRate === inputSampleRate) return buffer;
    const sampleRateRatio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0; let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) { accum += buffer[i]; count++; }
      result[offsetResult] = count ? (accum / count) : 0;
      offsetResult++; offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  function floatTo16BitPCM(floatBuffer) {
    const output = new DataView(new ArrayBuffer(floatBuffer.length * 2));
    for (let i = 0; i < floatBuffer.length; i++) {
      let s = Math.max(-1, Math.min(1, floatBuffer[i]));
      output.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Uint8Array(output.buffer);
  }

  function handleFrame(channelData) {
    if (disposed) return;
    if (!channelData || !channelData.length) return;
    const ds = downsampleBuffer(channelData, audioContext.sampleRate, targetSampleRate);
    const pcm16 = floatTo16BitPCM(ds);
    try { pushStream.write(pcm16); } catch (_) {}
  }

  const useWorklet = !!audioContext.audioWorklet;
  if (useWorklet) {
    audioContext.audioWorklet.addModule('pcm-worklet.js').then(() => {
      if (disposed) return;
      workletNode = new AudioWorkletNode(audioContext, 'pcm-capture-processor', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0.0;
      workletNode.connect(silentGain).connect(audioContext.destination);
      source.connect(workletNode);
      workletNode.port.onmessage = e => handleFrame(e.data);
    }).catch(err => {
      console.warn('[audioProcessing] Worklet failed, falling back:', err);
      fallbackProcessor();
    });
  } else {
    fallbackProcessor();
  }

  function fallbackProcessor() {
    if (disposed) return;
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    source.connect(processor);
    processor.connect(audioContext.destination);
    processor.onaudioprocess = e => {
      const input = e.inputBuffer.getChannelData(0);
      handleFrame(input);
    };
  }

  function disposeAudio() {
    if (disposed) return;
    disposed = true;
    try { pushStream.close(); } catch (_) {}
    try { workletNode && workletNode.disconnect(); } catch (_) {}
    try { processor && processor.disconnect(); } catch (_) {}
    try { source.disconnect(); } catch (_) {}
    try { audioContext.close(); } catch (_) {}
  }

  stream.getAudioTracks()[0].addEventListener('ended', disposeAudio);

  return { pushStream, disposeAudio };
}

