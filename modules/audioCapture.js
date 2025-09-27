// audioCapture.js
// Wrapper for chrome.tabCapture to obtain the current tab's audio stream.

export function captureTabAudio() {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabCapture.capture({ audio: true, video: false }, stream => {
        if (chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
        }
        if (!stream) {
            reject(new Error('No stream returned from tabCapture.'));
            return;
        }
        resolve(stream);
      });
    } catch (e) {
      reject(e);
    }
  });
}

