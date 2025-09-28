// Content script entry (verifies tabCapture availability and listens for START_CAPTURE messages).
console.log('contentScript.js loaded');
if (!chrome.tabCapture || !chrome.tabCapture.capture) {
    console.warn('tabCapture API not available in this tab.');
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_CAPTURE') {
        if (!chrome.tabCapture || !chrome.tabCapture.capture) {
            sendResponse({ success: false, error: 'tabCapture API not available in this tab.' });
            return;
        }
        chrome.tabCapture.capture({ audio: true, video: false }, stream => {
            if (chrome.runtime.lastError || !stream) {
                sendResponse({ success: false, error: chrome.runtime.lastError ? chrome.runtime.lastError.message : 'No stream' });
            } else {
                sendResponse({ success: true });
            }
        });
        return true;
    }
});
