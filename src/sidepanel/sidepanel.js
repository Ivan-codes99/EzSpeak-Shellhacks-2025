// Side panel orchestration: credentials -> capture -> visualize -> recognize (speech or translation + optional TTS).
// Responsibilities:
// 1. Acquire credentials
// 2. Capture tab audio
// 3. Initialize visualization + speech activity
// 4. Initialize Azure Speech auto-detect recognizer (speech or translation)
// 5. Wire UI updates

import { initUI, updateStatus, setDetectedLanguage, updateAudioLevel, updateSpeechActivity, setTranslationOutput, clearTranslationOutput, setSourceTranscriptOutput, clearSourceTranscriptOutput } from '../../modules/ui.js';
import { loadSpeechCredentials } from '../../modules/credentials.js';
import { captureTabAudio } from '../../modules/audioCapture.js';
import { startVisualization } from '../../modules/visualizer.js';
import { createAudioPushPipeline } from '../../modules/audioProcessing.js';
import { createAutoDetectRecognizer, createAutoDetectTranslationRecognizer } from '../../modules/speechRecognition.js';
import { createTTSEngine } from '../../modules/tts.js'; // Added TTS

// Minimal language set (auto-detect)
const AUTO_DETECT_SOURCE_LANGS = ["en-US", "es-ES", "de-DE"];

async function main() {
  const ui = initUI();
  updateStatus('Initializing...');

  // Collapsible transcript sections (source + translation) - always default open each load (no persistence)
  const toggles = [
    { btnId: 'toggleSourceTranscriptBtn', sectionId: 'source-transcript-section' },
    { btnId: 'toggleTranscriptBtn', sectionId: 'transcript-section' }
  ];

  function wireToggle({ btnId, sectionId }) {
    const btn = document.getElementById(btnId);
    const section = document.getElementById(sectionId);
    if (!btn || !section) return;

    function apply(expanded) {
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      section.classList.toggle('collapsed', !expanded);
    }

    // Force default open every load
    apply(true);

    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      apply(!expanded);
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

  // Visualization (level only; speech activity now from SDK events)
  const vizController = startVisualization(stream, {
    onLevel: level => updateAudioLevel(level)
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

  // === TTS Integration (translation mode only) ===
  let ttsEngine = null;
  let lastSpoken = '';
  function initVoiceControls() {
    if (!ui.voiceControls) return;
    if (mode !== 'translation') {
      ui.voiceControls.style.display = 'none';
      return;
    }
    ui.voiceControls.style.display = 'flex';
    if (ui.voiceToggle) {
      ui.voiceToggle.addEventListener('change', () => {
        if (ttsEngine) ttsEngine.setEnabled(ui.voiceToggle.checked);
        if (!ui.voiceToggle.checked) {
          const fill = document.getElementById('voice-level-fill');
          if (fill) { fill.style.width = '0%'; fill.classList.remove('active'); }
        }
      });
    }
    if (ui.ttsVolumeSlider) {
      ui.ttsVolumeSlider.addEventListener('input', () => {
        try { ttsEngine?.setVolume(parseFloat(ui.ttsVolumeSlider.value)); } catch(_) {}
      });
    }
  }

  function createAndInitTTS(targetLang) {
    try {
      const voiceLevelFill = document.getElementById('voice-level-fill');
      let smooth = 0;
      ttsEngine = createTTSEngine({
        SpeechSDK: window.SpeechSDK,
        creds,
        targetLanguage: targetLang,
        onState: (state) => {
          if (state === 'error' && voiceLevelFill) {
            voiceLevelFill.style.background = 'linear-gradient(180deg,#EF4444,#B91C1C)';
          }
        },
        onLevel: (rms) => {
          if (!voiceLevelFill) return;
          smooth = smooth * 0.7 + rms * 0.3;
          const pct = Math.min(1, smooth * 3); // amplify visually
          voiceLevelFill.style.width = (pct * 100).toFixed(1) + '%';
          if (pct > 0.02) voiceLevelFill.classList.add('active'); else voiceLevelFill.classList.remove('active');
        }
      });
      initVoiceControls();
      if (ui.voiceToggle) ttsEngine.setEnabled(ui.voiceToggle.checked);
      if (ui.ttsVolumeSlider) ttsEngine.setVolume(parseFloat(ui.ttsVolumeSlider.value));
    } catch (e) {
      console.warn('[tts] init failed', e);
      ttsEngine = null;
    }
  }
  // === End TTS Integration ===

  function startSpeechRecognizer() {
    clearSourceTranscriptOutput();
    const { stop } = createAutoDetectRecognizer({
      SpeechSDK: window.SpeechSDK,
      creds,
      languages: AUTO_DETECT_SOURCE_LANGS,
      pushStream,
      onLanguageDetected: lang => setDetectedLanguage(lang),
      onRecognizing: text => { setSourceTranscriptOutput(text, { partial: true }); },
      onRecognized: text => { setSourceTranscriptOutput(text, { partial: false }); },
      onCanceled: err => updateStatus('Canceled: ' + err),
      onSessionStarted: () => updateStatus('Session started'),
      onSessionStopped: () => updateStatus('Session stopped'),
      onSpeechStart: () => updateSpeechActivity(true),
      onSpeechEnd: () => updateSpeechActivity(false)
    });
    currentStop = stop;
  }

  function startTranslationRecognizer(targetLang) {
    clearSourceTranscriptOutput();
    clearTranslationOutput();
    setTranslationOutput('Awaiting translation...', { partial: true });

    createAndInitTTS(targetLang);

    const { stop } = createAutoDetectTranslationRecognizer({
      SpeechSDK: window.SpeechSDK,
      creds,
      languages: AUTO_DETECT_SOURCE_LANGS,
      targetLanguage: targetLang,
      pushStream,
      onLanguageDetected: lang => setDetectedLanguage(lang),
      onSourceRecognizing: text => { setSourceTranscriptOutput(text, { partial: true }); },
      onSourceRecognized: text => { setSourceTranscriptOutput(text, { partial: false }); },
      onTranslationRecognizing: t => setTranslationOutput(t, { partial: true }),
      onTranslationRecognized: t => {
        setTranslationOutput(t, { partial: false });
        if (ttsEngine && t && t !== lastSpoken && (!ui.voiceToggle || ui.voiceToggle.checked)) {
          lastSpoken = t;
          try { ttsEngine.speak(t, targetLang); } catch(e) { console.warn('[tts] speak error', e); }
        }
      },
      onCanceled: err => updateStatus('Translation canceled: ' + err),
      onSessionStarted: () => updateStatus('Translation session started'),
      onSessionStopped: () => updateStatus('Translation session stopped'),
      onSpeechStart: () => updateSpeechActivity(true),
      onSpeechEnd: () => updateSpeechActivity(false)
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
    try { ttsEngine?.dispose(); } catch(_) {}
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
