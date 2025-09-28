// Minimal credential loader: attempts injected env first, then chrome.storage.sync.
export async function loadSpeechCredentials() {
  // Global injected env script
  if (typeof window !== 'undefined' && window.__ENV && (window.__ENV.AZURE_SPEECH_KEY || window.__ENV.AZURE_SPEECH_AUTH_TOKEN)) {
    return {
      key: window.__ENV.AZURE_SPEECH_KEY || null,
      token: window.__ENV.AZURE_SPEECH_AUTH_TOKEN || null,
      region: window.__ENV.AZURE_SPEECH_REGION || null,
      isToken: !!window.__ENV.AZURE_SPEECH_AUTH_TOKEN
    };
  }

  // chrome.storage fallback
  return new Promise((resolve, reject) => {
    if (!('chrome' in window) || !chrome.storage || !chrome.storage.sync) {
      resolve(null);
      return;
    }
    chrome.storage.sync.get(['azureSpeechKey','azureSpeechRegion','azureSpeechAuthToken'], items => {
      if (chrome.runtime && chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      const key = items.azureSpeechKey || null;
      const region = items.azureSpeechRegion || null;
      const token = items.azureSpeechAuthToken || null;
      if (!key && !token) {
        resolve(null);
        return;
      }
      resolve({ key, region, token, isToken: !!token });
    });
  });
}
