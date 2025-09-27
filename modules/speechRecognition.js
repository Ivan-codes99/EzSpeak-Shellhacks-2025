// speechRecognition.js
// Creates an auto language detection SpeechRecognizer using Azure Speech SDK.
// Exports factory returning { recognizer, stop }.

export function createAutoDetectRecognizer({
  SpeechSDK,
  creds,              // { key, region, token, isToken }
  languages = [],
  pushStream,         // Azure PushAudioInputStream (already created)
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

  let speechConfig;
  if (creds.isToken && creds.token) {
    speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(creds.token, creds.region);
  } else if (creds.key && creds.region) {
    speechConfig = SpeechSDK.SpeechConfig.fromSubscription(creds.key, creds.region);
  } else {
    throw new Error('Incomplete credentials for Speech SDK');
  }

  // Do NOT set speechRecognitionLanguage when using auto-detect.
  let autoDetectConfig = null;
  try {
    autoDetectConfig = SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages(languages);
  } catch (e) {
    console.warn('[speechRecognition] AutoDetect config failed; falling back to first language', e);
  }

  const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(pushStream);
  const recognizer = (autoDetectConfig && SpeechSDK.SpeechRecognizer.FromConfig)
    ? SpeechSDK.SpeechRecognizer.FromConfig(speechConfig, autoDetectConfig, audioConfig)
    : new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  let lastDetectedLang = null;

  function extractDetected(result) {
    if (!result) return;
    try {
      if (SpeechSDK.AutoDetectSourceLanguageResult && SpeechSDK.AutoDetectSourceLanguageResult.fromResult) {
        const adr = SpeechSDK.AutoDetectSourceLanguageResult.fromResult(result);
        if (adr && adr.language && adr.language !== lastDetectedLang) {
          lastDetectedLang = adr.language;
          onLanguageDetected(lastDetectedLang);
        }
      } else {
        const prop = result.properties?.getProperty?.(SpeechSDK.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguageResult);
        if (prop && prop !== lastDetectedLang) {
          lastDetectedLang = prop;
          onLanguageDetected(lastDetectedLang);
        }
      }
    } catch (err) {
      console.warn('[speechRecognition] Language detection parse error', err);
    }
  }

  recognizer.recognizing = (_s, e) => {
    if (e.result && e.result.text) {
      onRecognizing(e.result.text);
      extractDetected(e.result);
    }
  };

  recognizer.recognized = (_s, e) => {
    if (e.result && e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
      onRecognized(e.result.text);
      extractDetected(e.result);
    }
  };

  recognizer.canceled = (_s, e) => {
    onCanceled(e.errorDetails || 'Canceled');
  };

  recognizer.sessionStarted = () => onSessionStarted();
  recognizer.sessionStopped = () => onSessionStopped();

  recognizer.startContinuousRecognitionAsync();

  function stop() {
    try {
      recognizer.stopContinuousRecognitionAsync(() => recognizer.close(), () => recognizer.close());
    } catch (_) {}
  }

  return { recognizer, stop };
}

