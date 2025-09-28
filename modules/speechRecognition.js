// Speech recognition helpers: auto-detect (speech) + auto-detect translation.

export function createAutoDetectRecognizer({
  SpeechSDK,
  creds,
  languages = [],
  pushStream,
  onLanguageDetected = () => {},
  onRecognizing = () => {},
  onRecognized = () => {},
  onCanceled = () => {},
  onSessionStarted = () => {},
  onSessionStopped = () => {},
  onSpeechStart = () => {},
  onSpeechEnd = () => {}
}) {
  if (!SpeechSDK) throw new Error('SpeechSDK missing');
  if (!pushStream) throw new Error('pushStream missing');
  if (!languages.length) throw new Error('languages list empty');

  // Build config
  let speechConfig;
  if (creds.isToken && creds.token) {
    speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(creds.token, creds.region);
  } else if (creds.key && creds.region) {
    speechConfig = SpeechSDK.SpeechConfig.fromSubscription(creds.key, creds.region);
  } else {
    throw new Error('Incomplete credentials');
  }

  // Auto-detect configuration
  let autoDetectConfig = null;
  try { autoDetectConfig = SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages(languages); } catch (e) {
    console.warn('[speechRecognition] auto-detect create failed, fallback single language', e);
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
      // Property bag (may be plain code or JSON)
      if (result.properties && SpeechSDK.PropertyId?.SpeechServiceConnection_AutoDetectSourceLanguageResult) {
        const raw = result.properties.getProperty?.(SpeechSDK.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguageResult);
        if (raw) {
          if (/^[A-Za-z]{2,}-[A-Za-z0-9]{2,}$/i.test(raw)) detected = raw; else if (raw.includes('{')) {
            try { const parsed = JSON.parse(raw); detected = parsed?.Language || parsed?.languages?.[0]?.language || parsed?.languages?.[0] || detected; } catch(_) {}
          }
        }
      }
      // Helper
      if (!detected && SpeechSDK.AutoDetectSourceLanguageResult?.fromResult) {
        try { const adr = SpeechSDK.AutoDetectSourceLanguageResult.fromResult(result); if (adr?.language) detected = adr.language; } catch(_) {}
      }
      // Direct fields / JSON
      if (!detected && result.language) detected = result.language;
      if (!detected && result.privLanguage) detected = result.privLanguage;
      if (!detected && result.json) {
        try { const parsed = JSON.parse(result.json); detected = parsed?.Language || parsed?.language || parsed?.PrimaryLanguage?.Language || detected; } catch(_) {}
      }
      if (detected && detected !== lastDetected) {
        lastDetected = detected;
        onLanguageDetected(detected);
      }
    } catch (err) {
      console.warn('[speechRecognition] language detect error', err);
    }
  }

  recognizer.recognizing = (_s, e) => { if (e.result?.text) { extractLang(e.result); onRecognizing(e.result.text); } };
  recognizer.recognized  = (_s, e) => { if (e.result && e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) { extractLang(e.result); onRecognized(e.result.text); } };
  try {
    recognizer.speechStartDetected = () => { try { onSpeechStart(); } catch(_){} };
    recognizer.speechEndDetected   = () => { try { onSpeechEnd(); } catch(_){} };
  } catch(_) {}
  recognizer.canceled       = (_s, e) => onCanceled(e.errorDetails || 'Canceled');
  recognizer.sessionStarted = () => onSessionStarted();
  recognizer.sessionStopped = () => onSessionStopped();

  recognizer.startContinuousRecognitionAsync();

  function stop() {
    try {
      recognizer.stopContinuousRecognitionAsync(
        () => { try { recognizer.close(); } catch(_){} },
        () => { try { recognizer.close(); } catch(_){} }
      );
    } catch(_) { try { recognizer.close(); } catch(_) {} }
  }
  return { recognizer, stop };
}

// Translation + auto-detect wrapper
export function createAutoDetectTranslationRecognizer({
  SpeechSDK,
  creds,
  languages = [],
  targetLanguage,
  pushStream,
  onLanguageDetected = () => {},
  onSourceRecognizing = () => {},
  onSourceRecognized = () => {},
  onTranslationRecognizing = () => {},
  onTranslationRecognized = () => {},
  onCanceled = () => {},
  onSessionStarted = () => {},
  onSessionStopped = () => {},
  onSpeechStart = () => {},
  onSpeechEnd = () => {}
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

  // Ensure a base reco language always set
  if (languages.length) {
    try { translationConfig.speechRecognitionLanguage = languages[0]; } catch(_) {}
  }

  const baseCode = targetLanguage.includes('-') ? targetLanguage.split('-')[0] : targetLanguage;
  try {
    if (baseCode && baseCode !== targetLanguage) translationConfig.addTargetLanguage(baseCode);
    translationConfig.addTargetLanguage(targetLanguage);
  } catch(_) {}

  const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(pushStream);
  let autoDetectConfig = null;
  try { autoDetectConfig = SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages(languages); } catch(e) {
    console.warn('[speechRecognition] translation auto-detect fail; defaulting first', e);
    translationConfig.speechRecognitionLanguage = languages[0];
  }

  let recognizer;
  if (autoDetectConfig && SpeechSDK.TranslationRecognizer?.FromConfig) {
    try { recognizer = SpeechSDK.TranslationRecognizer.FromConfig(translationConfig, autoDetectConfig, audioConfig); } catch(e) {
      console.warn('[speechRecognition] FromConfig fallback', e);
    }
  }
  if (!recognizer) {
    if (!translationConfig.speechRecognitionLanguage) translationConfig.speechRecognitionLanguage = languages[0];
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
          if (/^[A-Za-z]{2,}-[A-Za-z0-9]{2,}$/i.test(raw)) detected = raw; else if (raw.includes('{')) {
            try { const parsed = JSON.parse(raw); detected = parsed?.Language || parsed?.languages?.[0]?.language || parsed?.languages?.[0] || detected; } catch(_) {}
          }
        }
      }
      if (!detected && SpeechSDK.AutoDetectSourceLanguageResult?.fromResult) {
        try { const adr = SpeechSDK.AutoDetectSourceLanguageResult.fromResult(result); if (adr?.language) detected = adr.language; } catch(_) {}
      }
      if (!detected && result.language) detected = result.language;
      if (!detected && result.privLanguage) detected = result.privLanguage;
      if (!detected && result.json) {
        try { const parsed = JSON.parse(result.json); detected = parsed?.Language || parsed?.language || parsed?.PrimaryLanguage?.Language || detected; } catch(_) {}
      }
      if (detected && detected !== lastDetected) { lastDetected = detected; onLanguageDetected(detected); }
    } catch(err) {
      console.warn('[speechRecognition] translation detect error', err);
    }
  }

  recognizer.recognizing = (_s, e) => {
    if (!e.result) return;
    extractLang(e.result);
    const src = e.result.text;
    if (src) onSourceRecognizing(src);
    if (e.result.translations) {
      const trMap = e.result.translations;
      const val = trMap.get(baseCode) || trMap.get(targetLanguage);
      if (val) onTranslationRecognizing(val);
    }
  };

  recognizer.recognized = (_s, e) => {
    if (!e.result) return;
    const reason = e.result.reason;
    const RR = SpeechSDK.ResultReason;
    if (reason === RR.TranslatedSpeech || reason === RR.RecognizedSpeech) {
      extractLang(e.result);
      const src = e.result.text; if (src) onSourceRecognized(src);
      if (e.result.translations) {
        const trMap = e.result.translations;
        const val = trMap.get(baseCode) || trMap.get(targetLanguage);
        if (val) onTranslationRecognized(val);
      }
    }
  };

  try {
    recognizer.speechStartDetected = () => { try { onSpeechStart(); } catch(_){} };
    recognizer.speechEndDetected   = () => { try { onSpeechEnd(); } catch(_){} };
  } catch(_) {}
  recognizer.canceled       = (_s, e) => onCanceled(e.errorDetails || 'Canceled');
  recognizer.sessionStarted = () => onSessionStarted();
  recognizer.sessionStopped = () => onSessionStopped();

  recognizer.startContinuousRecognitionAsync();

  function stop() {
    try {
      recognizer.stopContinuousRecognitionAsync(
        () => { try { recognizer.close(); } catch(_){} },
        () => { try { recognizer.close(); } catch(_){} }
      );
    } catch(_) { try { recognizer.close(); } catch(_) {} }
  }
  return { recognizer, stop };
}
