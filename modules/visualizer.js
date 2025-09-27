// visualizer.js
// Creates an audio visualization + speech activity detection loop.
// Returns { stop }.

export function startVisualization(stream, { onLevel, onSpeechActive }) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  // Speech activity detection state
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  let baselineAccum = 0;
  let baselineCount = 0;
  let baselineRms = 0.0; // adaptive noise floor
  let speechActive = false;
  let activeFrames = 0;
  let silenceFrames = 0;
  const REQUIRED_ACTIVE_FRAMES = 4;      // debounce activation
  const REQUIRED_SILENCE_FRAMES = 20;    // debounce deactivation
  const MIN_BASELINE = 0.003;
  const MAX_BASELINE_SAMPLES = 60;       // ~1s at 60fps
  let rafId = null;

  function step() {
    analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += Math.abs(dataArray[i] - 128);
    const norm = sum / dataArray.length / 128; // normalized 0..~1
    if (onLevel) onLevel(norm);

    // Baseline build / adapt
    if (baselineCount < MAX_BASELINE_SAMPLES) {
      baselineAccum += norm;
      baselineCount++;
      baselineRms = Math.max(MIN_BASELINE, baselineAccum / baselineCount);
    } else {
      baselineRms = Math.max(MIN_BASELINE, baselineRms * 0.995 + norm * 0.005);
    }

    const threshold = Math.max(baselineRms * 2.2, baselineRms + 0.01);
    const above = norm > threshold;

    if (above) {
      activeFrames++;
      silenceFrames = 0;
    } else {
      silenceFrames++;
      if (activeFrames > 0) activeFrames--;
    }

    if (!speechActive && activeFrames >= REQUIRED_ACTIVE_FRAMES) {
      speechActive = true;
      onSpeechActive && onSpeechActive(true);
    } else if (speechActive && silenceFrames >= REQUIRED_SILENCE_FRAMES) {
      speechActive = false;
      onSpeechActive && onSpeechActive(false);
    }

    rafId = requestAnimationFrame(step);
  }
  step();

  function stop() {
    try { cancelAnimationFrame(rafId); } catch (_) {}
    try { source.disconnect(); } catch (_) {}
    try { analyser.disconnect(); } catch (_) {}
    try { audioContext.close(); } catch (_) {}
  }

  return { stop };
}

