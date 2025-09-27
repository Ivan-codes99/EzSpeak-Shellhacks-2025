// Orchestrator for side panel logic (ES module)
// Responsibilities:
// 1. Acquire credentials
// 2. Capture tab audio
// 3. Initialize visualization + speech activity
// 4. Initialize Azure Speech auto-detect recognizer
// 5. Wire UI updates

import { initUI, updateStatus, setLanguageCandidates, setDetectedLanguage, updateAudioLevel, updateSpeechActivity } from './modules/ui.js';
import { loadSpeechCredentials } from './modules/credentials.js';
import { captureTabAudio } from './modules/audioCapture.js';
import { startVisualization } from './modules/visualizer.js';
import { createAudioPushPipeline } from './modules/audioProcessing.js';
import { createAutoDetectRecognizer } from './modules/speechRecognition.js';

const AUTO_DETECT_SOURCE_LANGS = ["en-US", "es-ES", "de-DE"]; // configurable set

async function main() {
  const ui = initUI();
  setLanguageCandidates(AUTO_DETECT_SOURCE_LANGS);
  updateStatus('Initializing...');

  if (!window.SpeechSDK) {
    updateStatus('Azure Speech SDK not loaded.');
    return;
  }

  let creds;
  try {
    creds = await loadSpeechCredentials();
  } catch (e) {
    updateStatus('Credential load error: ' + e.message);
    return;
  }
  if (!creds) {
    updateStatus('No Azure Speech credentials found. Set them in Options.');
    return;
  }

  let stream;
  try {
    stream = await captureTabAudio();
  } catch (e) {
    updateStatus('Tab capture failed: ' + e.message);
    return;
  }
  updateStatus('Capturing tab audio...');

  // Start visualization (level + speech activity)
  const vizController = startVisualization(stream, {
    onLevel: level => updateAudioLevel(level),
    onSpeechActive: active => updateSpeechActivity(active)
  });

  // Create push audio pipeline feeding PCM into SDK
  const { pushStream, disposeAudio } = createAudioPushPipeline(stream);

  // Create recognizer with auto language detection
  const { recognizer, stop } = createAutoDetectRecognizer({
    SpeechSDK: window.SpeechSDK,
    creds,
    languages: AUTO_DETECT_SOURCE_LANGS,
    pushStream,
    onLanguageDetected: lang => setDetectedLanguage(lang),
    onRecognizing: text => updateStatus('Recognizing: ' + text),
    onRecognized: text => updateStatus('Recognized: ' + text),
    onCanceled: err => updateStatus('Canceled: ' + err),
    onSessionStarted: () => updateStatus('Recognition session started.'),
    onSessionStopped: () => updateStatus('Recognition session stopped.')
  });

  // Clean-up on unload
  window.addEventListener('beforeunload', () => {
    try { stop(); } catch (_) {}
    try { disposeAudio(); } catch (_) {}
    try { vizController.stop(); } catch (_) {}
    try { stream.getTracks().forEach(t => t.stop()); } catch (_) {}
  });
}

// Kick off after DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
