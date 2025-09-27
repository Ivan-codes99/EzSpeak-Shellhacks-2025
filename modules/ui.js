// UI utility module
// Exposes functions to initialize and update the side panel UI elements.

const MAX_TRANSCRIPT_CHARS = 100;

function clampTail(text, max) {
  if (!text) return '';
  if (text.length <= max) return text;
  return '…' + text.slice(-max);
}

export function initUI() {
  return {
    statusEl: document.getElementById('status'),
    langCandidatesEl: document.getElementById('language-display'),
    detectedLangEl: document.getElementById('detected-language'),
    audioIndicator: document.getElementById('audio-indicator'),
    speechDot: document.getElementById('speech-dot'),
    speechLabel: document.getElementById('speech-label'),
    volumeSlider: document.getElementById('volumeSlider'),
    volumeValue: document.getElementById('volumeValue')
  };
}

export function updateStatus(msg) {
  const el = document.getElementById('status');
  if (!el) return;
  // Apply clamping only to transcription-bearing statuses
  if (msg && (msg.startsWith('Recognizing: ') || msg.startsWith('Recognized: '))) {
    const idx = msg.indexOf(': ');
    const prefix = msg.slice(0, idx + 2); // includes ': '
    const body = msg.slice(idx + 2);
    const clamped = clampTail(body, MAX_TRANSCRIPT_CHARS);
    el.textContent = prefix + clamped;
    if (clamped !== body) el.title = body; else el.removeAttribute('title');
  } else {
    el.textContent = msg;
    el.removeAttribute('title');
  }
}

export function setLanguageCandidates(list) {
  const el = document.getElementById('language-display');
  if (el) el.textContent = 'Languages (auto): ' + list.join(', ');
}

export function setDetectedLanguage(lang) {
  const el = document.getElementById('detected-language');
  if (el) el.textContent = 'Detected language: ' + (lang || '(pending)');
}

export function updateAudioLevel(level) {
  const bar = document.getElementById('audio-indicator');
  if (bar) bar.style.width = Math.round(Math.min(1, Math.max(0, level)) * 100) + '%';
}

export function updateSpeechActivity(active) {
  const dot = document.getElementById('speech-dot');
  const label = document.getElementById('speech-label');
  if (!dot || !label) return;
  if (active) {
    dot.style.background = '#2e7d32';
    dot.style.boxShadow = '0 0 6px 2px rgba(46,125,50,0.55)';
    label.textContent = 'Speech: active';
  } else {
    dot.style.background = '#bbb';
    dot.style.boxShadow = '0 0 0 0 rgba(0,0,0,0.15)';
    label.textContent = 'Speech: silence';
  }
}

export function setTranslationOutput(text, { partial = false } = {}) {
  const el = document.getElementById('translation-output');
  if (!el) return;
  const clamped = clampTail(text || '', MAX_TRANSCRIPT_CHARS);
  if (partial) {
    el.style.opacity = '0.7';
  } else {
    el.style.opacity = '1';
  }
  el.textContent = clamped;
  if (clamped !== (text || '')) el.title = text || ''; else el.removeAttribute('title');
}

export function clearTranslationOutput() {
  const el = document.getElementById('translation-output');
  if (el) { el.textContent = ''; el.removeAttribute('title'); }
}