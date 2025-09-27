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
  let heuristicIssued = false;
  let sessionStart = performance.now();
  let partialAggregate = '';

  function guessLanguage(text) {
    const t = text.toLowerCase();
    const scores = { 'es-ES': 0, 'de-DE': 0, 'en-US': 0 };
    // Spanish markers
    if (/ñ|¿|¡|á|é|í|ó|ú/.test(t)) scores['es-ES'] += 3;
    [' que ',' para ',' una ',' como ',' los ',' las ',' pero ',' porque ',' tengo ',' hago '].forEach(w=>{ if(t.includes(w)) scores['es-ES']+=1; });
    // German markers
    if (/ä|ö|ü|ß/.test(t)) scores['de-DE'] += 3;
    [' und ',' ich ',' nicht ',' der ',' die ',' das ',' ist ',' habe ',' eine ',' zum '].forEach(w=>{ if(t.includes(w)) scores['de-DE']+=1; });
    // English markers
    [' the ',' and ',' you ',' have ',' this ',' that ',' with ',' from ',' just ',' about '].forEach(w=>{ if(t.includes(w)) scores['en-US']+=1; });
    // Pick max
    let best = 'en-US';
    let bestScore = -1;
    Object.entries(scores).forEach(([k,v])=>{ if(v>bestScore){ bestScore=v; best=k; }});
    // Basic confidence: difference between top and second
    const sorted = Object.values(scores).sort((a,b)=>b-a);
    const margin = sorted[0] - (sorted[1] ?? 0);
    const tag = margin < 2 ? 'low' : (margin < 4 ? 'medium' : 'high');
    return { lang: best, confidence: tag, scores };
  }

  function issueHeuristicIfNeeded(forceFinal=false) {
    if (lastDetectedLang || heuristicIssued) return;
    if (partialAggregate.length < 15) return; // not enough text
    const elapsed = performance.now() - sessionStart;
    if (!forceFinal && elapsed < 2800) return; // wait ~3s
    const { lang, confidence } = guessLanguage(partialAggregate);
    heuristicIssued = true;
    onLanguageDetected(`~${lang} (heuristic:${confidence})`);
  }

  // Timed heuristic checks (3s & 5s)
  setTimeout(()=>issueHeuristicIfNeeded(false), 3000);
  setTimeout(()=>issueHeuristicIfNeeded(true), 5000);

  function extractDetected(result) {
    if (!result) return;
    try {
      if (SpeechSDK.AutoDetectSourceLanguageResult && SpeechSDK.AutoDetectSourceLanguageResult.fromResult) {
        const adr = SpeechSDK.AutoDetectSourceLanguageResult.fromResult(result);
        if (adr && adr.language && adr.language !== lastDetectedLang) {
          lastDetectedLang = adr.language;
          onLanguageDetected(adr.language); // override heuristic if any
          return;
        }
      } else {
        const prop = result.properties?.getProperty?.(SpeechSDK.PropertyId.SpeechServiceConnection_AutoDetectSourceLanguageResult);
        if (prop && prop !== lastDetectedLang) {
          lastDetectedLang = prop;
            onLanguageDetected(prop);
            return;
        }
      }
    } catch (err) {
      console.warn('[speechRecognition] Language detection parse error', err);
    }
  }

  recognizer.recognizing = (_s, e) => {
    if (e.result && e.result.text) {
      partialAggregate = e.result.text; // latest partial aggregate
      onRecognizing(e.result.text);
      extractDetected(e.result);
      issueHeuristicIfNeeded(false);
    }
  };

  recognizer.recognized = (_s, e) => {
    if (e.result && e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
      partialAggregate = e.result.text;
      onRecognized(e.result.text);
      extractDetected(e.result);
      issueHeuristicIfNeeded(true);
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
