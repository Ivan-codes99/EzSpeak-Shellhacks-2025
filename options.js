document.addEventListener('DOMContentLoaded', () => {
  const keyInput = document.getElementById('speechKey');
  const regionInput = document.getElementById('speechRegion');
  const langInput = document.getElementById('speechLang');
  const saveBtn = document.getElementById('saveBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusEl = document.getElementById('status');

  function setStatus(msg, ok = true) {
    statusEl.textContent = msg;
    statusEl.style.color = ok ? '#2e7d32' : '#c62828';
  }

  // Load existing values
  chrome.storage.sync.get(['azureSpeechKey','azureSpeechRegion','azureSpeechLang'], (items) => {
    if (chrome.runtime.lastError) {
      setStatus('Load error: ' + chrome.runtime.lastError.message, false);
      return;
    }
    if (items.azureSpeechKey) keyInput.value = items.azureSpeechKey;
    if (items.azureSpeechRegion) regionInput.value = items.azureSpeechRegion;
    if (items.azureSpeechLang) langInput.value = items.azureSpeechLang;
  });

  saveBtn.addEventListener('click', () => {
    const key = keyInput.value.trim();
    const region = regionInput.value.trim();
    const lang = (langInput.value.trim() || 'en-US');
    if (!key || !region) {
      setStatus('Key and region are required.', false);
      return;
    }
    chrome.storage.sync.set({
      azureSpeechKey: key,
      azureSpeechRegion: region,
      azureSpeechLang: lang
    }, () => {
      if (chrome.runtime.lastError) {
        setStatus('Save failed: ' + chrome.runtime.lastError.message, false);
        return;
      }
      setStatus('Saved. You can now open the side panel to start recognition.');
    });
  });

  clearBtn.addEventListener('click', () => {
    chrome.storage.sync.remove(['azureSpeechKey','azureSpeechRegion','azureSpeechLang'], () => {
      keyInput.value = '';
      regionInput.value = '';
      // leave language blank
      setStatus('Cleared.');
    });
  });
});

