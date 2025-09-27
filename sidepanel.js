// Orchestrator for side panel logic (ES module)
// Responsibilities:
// 1. Acquire credentials
// 2. Capture tab audio
// 3. Initialize visualization + speech activity
// 4. Initialize Azure Speech auto-detect recognizer (speech or translation)
// 5. Wire UI updates

import { initUI, updateStatus, setDetectedLanguage, updateAudioLevel, updateSpeechActivity, setTranslationOutput, clearTranslationOutput, setSourceTranscriptOutput, clearSourceTranscriptOutput } from './modules/ui.js';
import { loadSpeechCredentials } from './modules/credentials.js';
import { captureTabAudio } from './modules/audioCapture.js';
import { startVisualization } from './modules/visualizer.js';
import { createAudioPushPipeline } from './modules/audioProcessing.js';
import { createAutoDetectRecognizer, createAutoDetectTranslationRecognizer } from './modules/speechRecognition.js';

// Minimal language set (auto-detect)
const AUTO_DETECT_SOURCE_LANGS = ["en-US", "es-ES", "de-DE"];

async function main() {
  const ui = initUI();
  updateStatus('Initializing...');

  // Collapsible transcript sections (source + translation)
  const toggles = [
    { btnId: 'toggleSourceTranscriptBtn', sectionId: 'source-transcript-section', storageKey: 'sourceTranscriptCollapsed' },
    { btnId: 'toggleTranscriptBtn', sectionId: 'transcript-section', storageKey: 'translationTranscriptCollapsed' }
  ];

  function wireToggle({ btnId, sectionId, storageKey }) {
    const btn = document.getElementById(btnId);
    const section = document.getElementById(sectionId);
    if (!btn || !section) return;

    function apply(expanded) {
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      section.classList.toggle('collapsed', !expanded);
    }

    // Restore persisted state
    try {
      chrome.storage.local.get([storageKey], items => {
        const collapsed = items[storageKey] === true;
        apply(!collapsed);
      });
    } catch(_) { /* ignore */ }

    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const next = !expanded;
      apply(next);
      try { chrome.storage.local.set({ [storageKey]: !next }); } catch(_) {}
    });
  }

  toggles.forEach(wireToggle);

  if (!window.SpeechSDK) {
    updateStatus('Azure Speech SDK not loaded.');
    return;
  }

  // Retrieve selected translation target language (chosen in popup)
  const translationTargetLang = await new Promise(resolve => {
    try { chrome.storage.local.get(['translationTargetLang'], items => resolve(items.translationTargetLang || null)); }
    catch { resolve(null); }
  });

  let creds;
  try { creds = await loadSpeechCredentials(); } catch (e) {
    updateStatus('Credential load error: ' + e.message);
    return;
  }
  if (!creds) {
    updateStatus('No Azure Speech credentials found. Set them in Options.');
    return;
  }

  let stream;
  try { stream = await captureTabAudio(); } catch (e) {
    updateStatus('Tab capture failed: ' + e.message);
    return;
  }
  updateStatus('Capturing tab audio...');

  // Visualization
  const vizController = startVisualization(stream, {
    onLevel: level => updateAudioLevel(level),
    onSpeechActive: active => updateSpeechActivity(active)
  });

  if (ui.volumeSlider && vizController.setVolume) {
    ui.volumeSlider.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      vizController.setVolume(v);
      if (ui.volumeValue) ui.volumeValue.textContent = Math.round(v * 100) + '%';
    });
  }

  const { pushStream, disposeAudio } = await createAudioPushPipeline(stream);

  let currentStop = () => {};
  const mode = translationTargetLang ? 'translation' : 'speech';

  function startSpeechRecognizer() {
    clearSourceTranscriptOutput();
    const { stop } = createAutoDetectRecognizer({
      SpeechSDK: window.SpeechSDK,
      creds,
      languages: AUTO_DETECT_SOURCE_LANGS,
      pushStream,
      onLanguageDetected: lang => setDetectedLanguage(lang),
      onRecognizing: text => { updateStatus('Recognizing (orig): ' + text); setSourceTranscriptOutput(text, { partial: true }); },
      onRecognized: text => { updateStatus('Recognized (orig): ' + text); setSourceTranscriptOutput(text, { partial: false }); },
      onCanceled: err => updateStatus('Canceled: ' + err),
      onSessionStarted: () => updateStatus('Session started'),
      onSessionStopped: () => updateStatus('Session stopped')
    });
    currentStop = stop;
  }

  function startTranslationRecognizer(targetLang) {
    clearSourceTranscriptOutput();
    clearTranslationOutput();
    setTranslationOutput('Awaiting translation...', { partial: true });
    const { stop } = createAutoDetectTranslationRecognizer({
      SpeechSDK: window.SpeechSDK,
      creds,
      languages: AUTO_DETECT_SOURCE_LANGS,
      targetLanguage: targetLang,
      pushStream,
      onLanguageDetected: lang => setDetectedLanguage(lang),
      onSourceRecognizing: text => { updateStatus('Recognizing (orig): ' + text); setSourceTranscriptOutput(text, { partial: true }); },
      onSourceRecognized: text => { updateStatus('Recognized (orig): ' + text); setSourceTranscriptOutput(text, { partial: false }); },
      onTranslationRecognizing: t => setTranslationOutput(t, { partial: true }),
      onTranslationRecognized: t => setTranslationOutput(t, { partial: false }),
      onCanceled: err => updateStatus('Translation canceled: ' + err),
      onSessionStarted: () => updateStatus('Translation session started'),
      onSessionStopped: () => updateStatus('Translation session stopped')
    });
    currentStop = stop;
  }

  if (mode === 'translation') startTranslationRecognizer(translationTargetLang);
  else startSpeechRecognizer();

  window.addEventListener('beforeunload', () => {
    try { currentStop(); } catch(_) {}
    try { disposeAudio(); } catch(_) {}
    try { vizController.stop(); } catch(_) {}
    try { stream.getTracks().forEach(t => t.stop()); } catch(_) {}
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
