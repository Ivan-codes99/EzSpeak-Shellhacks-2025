// background.js (MV3 service worker)
console.log("Background service worker loaded.");

// Optional: respond to messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "GET_TABS") {
        console.log('Received GET_TABS message');
        chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT })
            .then(tabs => {
                console.log('Queried tabs:', tabs);
                sendResponse({ tabs: tabs.map(tab => ({ id: tab.id, title: tab.title, url: tab.url })) });
            })
            .catch(e => {
                console.log('Error querying tabs:', e);
                sendResponse({ tabs: [] });
            });
        return true;
    }
});
