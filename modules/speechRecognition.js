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
    try {
      if (SpeechSDK.AutoDetectSourceLanguageResult?.fromResult) {
        const adr = SpeechSDK.AutoDetectSourceLanguageResult.fromResult(result);
        if (adr?.language && adr.language !== lastDetected) {
          lastDetected = adr.language;
          onLanguageDetected(adr.language);
        }
      } else if (result.properties) {
        const prop = result.properties.getProperty?.(SpeechSDK.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguageResult);
        if (prop && prop !== lastDetected) {
          lastDetected = prop;
          onLanguageDetected(prop);
        }
      }
    } catch (err) {
      console.warn('[speechRecognition] language parse error', err);
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

  translationConfig.addTargetLanguage(targetLanguage);

  const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(pushStream);
  let autoDetectConfig = null;
  try { autoDetectConfig = SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages(languages); } catch(e) {
    console.warn('[speechRecognition] AutoDetect (translation) failed; defaulting to first', e);
    translationConfig.speechRecognitionLanguage = languages[0];
  }

  let recognizer;
  if (autoDetectConfig && SpeechSDK.TranslationRecognizer?.FromConfig) {
    try { recognizer = SpeechSDK.TranslationRecognizer.FromConfig(translationConfig, autoDetectConfig, audioConfig); } catch(e) {
      console.warn('[speechRecognition] TranslationRecognizer.FromConfig failed, fallback.', e);
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
    try {
      if (SpeechSDK.AutoDetectSourceLanguageResult?.fromResult) {
        const adr = SpeechSDK.AutoDetectSourceLanguageResult.fromResult(result);
        if (adr?.language && adr.language !== lastDetected) {
          lastDetected = adr.language;
          onLanguageDetected(adr.language);
        }
      } else if (result.properties) {
        const prop = result.properties.getProperty?.(SpeechSDK.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguageResult);
        if (prop && prop !== lastDetected) {
          lastDetected = prop;
          onLanguageDetected(prop);
        }
      }
    } catch (err) {
      console.warn('[speechRecognition] translation language parse error', err);
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
