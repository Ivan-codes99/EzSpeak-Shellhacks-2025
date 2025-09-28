// UI helpers for side panel.
const MAX_TRANSCRIPT_CHARS = 100;

const LANGUAGE_NAMES = {
  'en': 'English', 'en-US': 'English', 'en-GB': 'English',
  'es': 'Spanish', 'es-ES': 'Spanish', 'es-MX': 'Spanish',
  'de': 'German',  'de-DE': 'German'
};

function humanLanguageName(code) {
  if (!code) return '(pending)';
  const norm = code.trim();
  if (LANGUAGE_NAMES[norm]) return LANGUAGE_NAMES[norm];
  const base = norm.split('-')[0];
  return LANGUAGE_NAMES[base] || norm;
}

function clampTail(text, max) {
  if (!text) return '';
  return text.length <= max ? text : '…' + text.slice(-max);
}

export function initUI() {
  return {
    statusEl: document.getElementById('status'),
    detectedLangEl: document.getElementById('detected-language'),
    audioIndicator: document.getElementById('audio-indicator'),
    speechDot: document.getElementById('speech-dot'),
    speechLabel: document.getElementById('speech-label'),
    volumeSlider: document.getElementById('volumeSlider'),
    volumeValue: document.getElementById('volumeValue'),
    sourceTranscriptEl: document.getElementById('source-transcript-output'),
    translationTranscriptEl: document.getElementById('translation-output'),
    voiceControls: document.getElementById('voice-controls'),
    voiceToggle: document.getElementById('voiceToggle'),
    ttsVolumeSlider: document.getElementById('ttsVolumeSlider')
  };
}

export function updateStatus(msg) {
  const el = document.getElementById('status-message') || document.getElementById('status');
  if (!el) return;
  if (msg && (msg.startsWith('Recognizing: ') || msg.startsWith('Recognized: '))) {
    const idx = msg.indexOf(': ');
    const prefix = msg.slice(0, idx + 2);
    const body = msg.slice(idx + 2);
    const clamped = clampTail(body, MAX_TRANSCRIPT_CHARS);
    el.textContent = prefix + clamped;
    if (clamped !== body) el.title = body; else el.removeAttribute('title');
  } else {
    el.textContent = msg || '';
    el.removeAttribute('title');
  }
}

export function setDetectedLanguage(lang) {
  const el = document.getElementById('detected-language');
  if (el) el.textContent = 'Language: ' + humanLanguageName(lang);
}

export function updateAudioLevel(level) {
  const bar = document.getElementById('audio-indicator');
  if (!bar) return;
  const pct = Math.round(Math.min(1, Math.max(0, level)) * 100);
  bar.style.width = pct + '%';
}

export function updateSpeechActivity(active) {
  const dot = document.getElementById('speech-dot');
  const label = document.getElementById('speech-label'); // may be absent now
  if (!dot) return; // allow operation without label
  if (active) {
    dot.style.background = '#2e7d32';
    dot.style.boxShadow = '0 0 6px 2px rgba(46,125,50,0.55)';
    if (label) label.textContent = 'Speech: active';
  } else {
    dot.style.background = '#bbb';
    dot.style.boxShadow = '0 0 0 0 rgba(0,0,0,0.15)';
    if (label) label.textContent = 'Speech: silence';
  }
}

export function setTranslationOutput(text, { partial = false } = {}) {
  const el = document.getElementById('translation-output');
  if (!el) return;
  const clamped = clampTail(text || '', MAX_TRANSCRIPT_CHARS);
  el.style.opacity = partial ? '0.7' : '1';
  el.textContent = clamped;
  if (clamped !== (text || '')) el.title = text || ''; else el.removeAttribute('title');
}
export function clearTranslationOutput() {
  const el = document.getElementById('translation-output');
  if (el) { el.textContent = ''; el.removeAttribute('title'); }
}

export function setSourceTranscriptOutput(text, { partial = false } = {}) {
  const el = document.getElementById('source-transcript-output');
  if (!el) return;
  const clamped = clampTail(text || '', MAX_TRANSCRIPT_CHARS);
  el.style.opacity = partial ? '0.7' : '1';
  el.textContent = clamped;
  if (clamped !== (text || '')) el.title = text || ''; else el.removeAttribute('title');
}
export function clearSourceTranscriptOutput() {
  const el = document.getElementById('source-transcript-output');
  if (el) { el.textContent = ''; el.removeAttribute('title'); }
}
