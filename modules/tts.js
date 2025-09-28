// tts.js - Azure Speech SDK Text-to-Speech helper (from working branch)
// Queue-based neural voice playback for final translations.

const DEFAULT_VOICE_MAP = {
  'en-US': 'en-US-AriaNeural',
  'es-ES': 'es-ES-ElviraNeural',
  'de-DE': 'de-DE-KatjaNeural'
};

const TTS_DEBUG = true;
function tlog(...args) { if (TTS_DEBUG) try { console.log('[tts]', ...args); } catch(_) {} }

export function createTTSEngine({ SpeechSDK, creds, targetLanguage, voiceMap = DEFAULT_VOICE_MAP, onState = () => {} }) {
  if (!SpeechSDK) throw new Error('SpeechSDK missing');
  if (!targetLanguage) throw new Error('targetLanguage missing');

  let enabled = true;
  let synthesizer = null;
  let creating = null;
  let currentLang = null;
  const queue = [];
  let speaking = false;
  let disposed = false;
  let audioCtx = null;
  let gainNode = null;

  function voiceFor(lang) {
    return voiceMap[lang] || voiceMap[lang.split('-')[0]] || 'en-US-AriaNeural';
  }

  function makeSpeechConfig(lang) {
    let speechConfig;
    if (creds.isToken && creds.token) {
      speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(creds.token, creds.region);
    } else if (creds.key && creds.region) {
      speechConfig = SpeechSDK.SpeechConfig.fromSubscription(creds.key, creds.region);
    } else {
      throw new Error('Incomplete credentials for TTS');
    }
    speechConfig.speechSynthesisLanguage = lang;
    speechConfig.speechSynthesisVoiceName = voiceFor(lang);
    try { speechConfig.setSpeechSynthesisOutputFormat(SpeechSDK.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm); } catch(_) {}
    return speechConfig;
  }

  function ensureSynth(lang) {
    if (disposed) return Promise.reject(new Error('disposed'));
    if (synthesizer && lang === currentLang) return Promise.resolve(synthesizer);
    if (creating) return creating;
    creating = new Promise((resolve, reject) => {
      try {
        currentLang = lang;
        const config = makeSpeechConfig(lang);
        if (synthesizer) { try { synthesizer.close(); } catch(_) {} }
        synthesizer = new SpeechSDK.SpeechSynthesizer(config, undefined); // capture audioData
        creating = null;
        resolve(synthesizer);
      } catch(e) { creating = null; reject(e); }
    });
    return creating;
  }

  function emit(state, detail) { try { onState(state, detail); } catch(_) {} }

  function ensureAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      gainNode = audioCtx.createGain();
      gainNode.gain.value = 1.0;
      gainNode.connect(audioCtx.destination);
    }
  }

  function setVolume(v) {
    ensureAudioContext();
    if (gainNode) gainNode.gain.value = Math.min(1, Math.max(0, Number(v)));
  }

  async function playPcmWavBytes(bytes) {
    if (!bytes || !bytes.length) return;
    ensureAudioContext();
    try { await audioCtx.resume(); } catch(_) {}
    return new Promise(resolve => {
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      audioCtx.decodeAudioData(ab.slice(0), buffer => {
        const src = audioCtx.createBufferSource();
        src.buffer = buffer;
        src.connect(gainNode);
        src.onended = resolve;
        src.start();
      }, () => resolve());
    });
  }

  function dequeue() {
    if (speaking || !enabled || disposed) return;
    const item = queue.shift();
    if (!item) { emit('idle'); return; }
    speaking = true;
    emit('synthesizing', { text: item.text });
    ensureSynth(item.lang).then(s => {
      s.speakTextAsync(item.text,
        async result => {
          try {
            if (result && result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted && result.audioData?.byteLength) {
              emit('decoding');
              await playPcmWavBytes(result.audioData);
              emit('done');
            } else {
              emit('error', new Error('Synthesis incomplete'));
            }
          } finally { speaking = false; dequeue(); }
        },
        err => { emit('error', err); speaking = false; dequeue(); }
      );
    }).catch(err => { emit('error', err); speaking = false; dequeue(); });
  }

  function speak(text, lang = targetLanguage) {
    if (disposed || !enabled || !text || !text.trim()) return;
    const trimmed = text.trim();
    queue.push({ text: trimmed.length > 500 ? trimmed.slice(0, 500) : trimmed, lang });
    emit('queue', { size: queue.length });
    dequeue();
  }

  function setEnabled(val) {
    enabled = !!val;
    emit(enabled ? 'enabled' : 'disabled');
    if (enabled) dequeue(); else queue.length = 0;
  }

  function dispose() {
    disposed = true;
    queue.length = 0;
    try { if (synthesizer) synthesizer.close(); } catch(_) {}
    try { if (audioCtx) audioCtx.close(); } catch(_) {}
    synthesizer = null; audioCtx = null; gainNode = null;
    emit('disposed');
  }

  function test(text = 'This is a test of the synthesized voice.') { speak(text, targetLanguage); }

  emit('enabled');
  return { speak, setEnabled, dispose, test, setVolume };
}

