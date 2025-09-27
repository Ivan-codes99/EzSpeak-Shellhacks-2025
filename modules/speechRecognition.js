// speechRecognition.js (simplified baseline)
// Provides minimal auto language detect speech & translation recognizers.
// NO heuristic guessing, NO dynamic silence manipulation, NO timers beyond SDK internals.

export function createAutoDetectRecognizer({
  SpeechSDK,
  creds,              // { key, region, token, isToken }
  languages = [],
  pushStream,         // Azure PushAudioInputStream
  onLanguageDetected = () => {},
  onRecognizing = () => {},
  onRecognized = () => {},
  onCanceled = () => {},
  onSessionStarted = () => {},
  onSessionStopped = () => {}
}) {
  if (!SpeechSDK) throw new Error('SpeechSDK missing');
  if (!pushStream) throw new Error('pushStream missing');
  if (!languages.length) throw new Error('languages list empty');

  // Build speech config
  let speechConfig;
  if (creds.isToken && creds.token) {
    speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(creds.token, creds.region);
  } else if (creds.key && creds.region) {
    speechConfig = SpeechSDK.SpeechConfig.fromSubscription(creds.key, creds.region);
  } else {
    throw new Error('Incomplete credentials');
  }

  // Auto detect config
  let autoDetectConfig = null;
  try { autoDetectConfig = SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages(languages); } catch (e) {
    console.warn('[speechRecognition] AutoDetect config failed, falling back to first language', e);
  }

  const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(pushStream);
  const recognizer = (autoDetectConfig && SpeechSDK.SpeechRecognizer.FromConfig)
    ? SpeechSDK.SpeechRecognizer.FromConfig(speechConfig, autoDetectConfig, audioConfig)
    : new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  let lastDetected = null;
  function extractLang(result) {
    if (!result) return;
    let detected = null;
    try {
      // 1. Property bag raw value (may be plain code or JSON)
      if (result.properties && SpeechSDK.PropertyId?.SpeechServiceConnection_AutoDetectSourceLanguageResult) {
        const raw = result.properties.getProperty?.(SpeechSDK.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguageResult);
        if (raw) {
          if (/^[A-Za-z]{2,}-[A-Za-z0-9]{2,}$/i.test(raw)) {
            detected = raw; // already a language code
          } else if (raw.includes('{')) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed?.Language) detected = parsed.Language;
              else if (Array.isArray(parsed?.languages) && parsed.languages.length) detected = parsed.languages[0]?.language || parsed.languages[0];
            } catch(_) { /* ignore parse */ }
          }
        }
      }
      // 2. AutoDetectSourceLanguageResult helper
      if (!detected && SpeechSDK.AutoDetectSourceLanguageResult?.fromResult) {
        try { const adr = SpeechSDK.AutoDetectSourceLanguageResult.fromResult(result); if (adr?.language) detected = adr.language; } catch(_) {}
      }
      // 3. Direct field fallbacks
      if (!detected && result.language) detected = result.language;
      if (!detected && result.privLanguage) detected = result.privLanguage; // internal field some builds expose
      // 4. JSON on result.json
      if (!detected && result.json) {
        try {
          const parsed = JSON.parse(result.json);
          detected = parsed?.Language || parsed?.language || parsed?.PrimaryLanguage?.Language || null;
        } catch(_) {}
      }
      if (detected && detected !== lastDetected) {
        lastDetected = detected;
        onLanguageDetected(detected);
        try { console.debug('[speechRecognition] Detected language:', detected); } catch(_) {}
      }
    } catch (err) {
      console.warn('[speechRecognition] language detection error', err);
    }
  }

  recognizer.recognizing = (_s, e) => {
    if (e.result && e.result.text) {
      extractLang(e.result);
      onRecognizing(e.result.text);
    }
  };

  recognizer.recognized = (_s, e) => {
    if (e.result && e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
      extractLang(e.result);
      onRecognized(e.result.text);
    }
  };

  recognizer.canceled = (_s, e) => onCanceled(e.errorDetails || 'Canceled');
  recognizer.sessionStarted = () => onSessionStarted();
  recognizer.sessionStopped = () => onSessionStopped();

  recognizer.startContinuousRecognitionAsync();

  function stop() {
    try {
      recognizer.stopContinuousRecognitionAsync(
        () => { try { recognizer.close(); } catch(_){} },
        () => { try { recognizer.close(); } catch(_){} }
      );
    } catch(_) {
      try { recognizer.close(); } catch(_) {}
    }
  }
  return { recognizer, stop };
}

export function createAutoDetectTranslationRecognizer({
  SpeechSDK,
  creds,
  languages = [],
  targetLanguage,           // e.g. 'en-US'
  pushStream,
  onLanguageDetected = () => {},
  onSourceRecognizing = () => {},
  onSourceRecognized = () => {},
  onTranslationRecognizing = () => {},
  onTranslationRecognized = () => {},
  onCanceled = () => {},
  onSessionStarted = () => {},
  onSessionStopped = () => {}
}) {
  if (!SpeechSDK) throw new Error('SpeechSDK missing');
  if (!pushStream) throw new Error('pushStream missing');
  if (!languages.length) throw new Error('languages list empty');
  if (!targetLanguage) throw new Error('targetLanguage missing');

  let translationConfig;
  if (creds.isToken && creds.token) {
    translationConfig = SpeechSDK.SpeechTranslationConfig.fromAuthorizationToken(creds.token, creds.region);
  } else if (creds.key && creds.region) {
    translationConfig = SpeechSDK.SpeechTranslationConfig.fromSubscription(creds.key, creds.region);
  } else {
    throw new Error('Incomplete credentials');
  }

  // Ensure a base recognition language is always set (Azure expects SpeechServiceConnection_RecoLanguage even with auto-detect)
  if (languages.length) {
    try { translationConfig.speechRecognitionLanguage = languages[0]; } catch(_) {}
  }

  translationConfig.addTargetLanguage(targetLanguage);

  const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(pushStream);
  let autoDetectConfig = null;
  try { autoDetectConfig = SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages(languages); } catch(e) {
    console.warn('[speechRecognition] AutoDetect (translation) failed; defaulting to first', e);
    translationConfig.speechRecognitionLanguage = languages[0];
  }

  let recognizer;
  if (autoDetectConfig && SpeechSDK.TranslationRecognizer?.FromConfig) {
    try {
      recognizer = SpeechSDK.TranslationRecognizer.FromConfig(translationConfig, autoDetectConfig, audioConfig);
    } catch(e) {
      console.warn('[speechRecognition] TranslationRecognizer.FromConfig failed, fallback. Base language:', translationConfig.speechRecognitionLanguage, e);
    }
  }
  if (!recognizer) {
    if (!translationConfig.speechRecognitionLanguage) {
      translationConfig.speechRecognitionLanguage = languages[0];
    }
    recognizer = new SpeechSDK.TranslationRecognizer(translationConfig, audioConfig);
  }

  let lastDetected = null;
  function extractLang(result) {
    if (!result) return;
    let detected = null;
    try {
      if (result.properties && SpeechSDK.PropertyId?.SpeechServiceConnection_AutoDetectSourceLanguageResult) {
        const raw = result.properties.getProperty?.(SpeechSDK.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguageResult);
        if (raw) {
          if (/^[A-Za-z]{2,}-[A-Za-z0-9]{2,}$/i.test(raw)) {
            detected = raw;
          } else if (raw.includes('{')) {
            try { const parsed = JSON.parse(raw); if (parsed?.Language) detected = parsed.Language; else if (Array.isArray(parsed?.languages) && parsed.languages.length) detected = parsed.languages[0]?.language || parsed.languages[0]; } catch(_) {}
          }
        }
      }
      if (!detected && SpeechSDK.AutoDetectSourceLanguageResult?.fromResult) {
        try { const adr = SpeechSDK.AutoDetectSourceLanguageResult.fromResult(result); if (adr?.language) detected = adr.language; } catch(_) {}
      }
      if (!detected && result.language) detected = result.language;
      if (!detected && result.privLanguage) detected = result.privLanguage;
      if (!detected && result.json) {
        try { const parsed = JSON.parse(result.json); detected = parsed?.Language || parsed?.language || parsed?.PrimaryLanguage?.Language || null; } catch(_) {}
      }
      if (detected && detected !== lastDetected) {
        lastDetected = detected;
        onLanguageDetected(detected);
        try { console.debug('[speechRecognition][translation] Detected language:', detected); } catch(_) {}
      }
    } catch(err) {
      console.warn('[speechRecognition] translation language detection error', err);
    }
  }

  recognizer.recognizing = (_s, e) => {
    if (!e.result) return;
    extractLang(e.result);
    const src = e.result.text;
    if (src) onSourceRecognizing(src);
    if (e.result.translations && e.result.translations.get(targetLanguage)) {
      onTranslationRecognizing(e.result.translations.get(targetLanguage));
    }
  };

  recognizer.recognized = (_s, e) => {
    if (!e.result) return;
    if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
      extractLang(e.result);
      const src = e.result.text;
      if (src) onSourceRecognized(src);
      if (e.result.translations && e.result.translations.get(targetLanguage)) {
        onTranslationRecognized(e.result.translations.get(targetLanguage));
      }
    }
  };

  recognizer.canceled = (_s, e) => onCanceled(e.errorDetails || 'Canceled');
  recognizer.sessionStarted = () => onSessionStarted();
  recognizer.sessionStopped = () => onSessionStopped();

  recognizer.startContinuousRecognitionAsync();

  function stop() {
    try {
      recognizer.stopContinuousRecognitionAsync(
        () => { try { recognizer.close(); } catch(_){} },
        () => { try { recognizer.close(); } catch(_){} }
      );
    } catch(_) {
      try { recognizer.close(); } catch(_) {}
    }
  }
  return { recognizer, stop };
}
