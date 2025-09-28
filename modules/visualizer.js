// Lightweight amplitude + optional speech activity estimator.
export function startVisualization(stream, { onLevel, onSpeechActive }) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);
  const gainNode = audioContext.createGain();
  gainNode.gain.value = 0.15; // changed from 0.2 to match new default playback volume (15%)
  source.connect(gainNode);
  gainNode.connect(audioContext.destination);

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  let rafId = null;

  // Simple adaptive noise floor + hysteresis for speech on/off
  let baselineAccum = 0, baselineCount = 0, baselineRms = 0;
  let speechActive = false, activeFrames = 0, silenceFrames = 0;
  const REQUIRED_ACTIVE_FRAMES = 4;
  const REQUIRED_SILENCE_FRAMES = 20;
  const MIN_BASELINE = 0.003;
  const MAX_BASELINE_SAMPLES = 60;

  function step() {
    analyser.getByteTimeDomainData(dataArray);
    let sum = 0; for (let i = 0; i < dataArray.length; i++) sum += Math.abs(dataArray[i] - 128);
    const norm = sum / dataArray.length / 128;
    if (onLevel) onLevel(norm);

    if (onSpeechActive) {
      if (baselineCount < MAX_BASELINE_SAMPLES) {
        baselineAccum += norm; baselineCount++; baselineRms = Math.max(MIN_BASELINE, baselineAccum / baselineCount);
      } else {
        baselineRms = Math.max(MIN_BASELINE, baselineRms * 0.995 + norm * 0.005);
      }
      const threshold = Math.max(baselineRms * 2.2, baselineRms + 0.01);
      const above = norm > threshold;
      if (above) { activeFrames++; silenceFrames = 0; } else { silenceFrames++; if (activeFrames > 0) activeFrames--; }
      if (!speechActive && activeFrames >= REQUIRED_ACTIVE_FRAMES) { speechActive = true; onSpeechActive(true); }
      else if (speechActive && silenceFrames >= REQUIRED_SILENCE_FRAMES) { speechActive = false; onSpeechActive(false); }
    }
    rafId = requestAnimationFrame(step);
  }
  step();

  function stop() {
    try { cancelAnimationFrame(rafId); } catch(_) {}
    try { source.disconnect(); } catch(_) {}
    try { gainNode.disconnect(); } catch(_) {}
    try { analyser.disconnect(); } catch(_) {}
    try { audioContext.close(); } catch(_) {}
  }
  function setVolume(v) { try { gainNode.gain.value = v; } catch(_) {} }
  return { stop, setVolume };
}
