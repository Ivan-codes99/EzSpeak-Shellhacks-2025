// MV3 service worker entry.
console.log("Background service worker loaded.");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "GET_TABS") {
        chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT })
            .then(tabs => {
                sendResponse({ tabs: tabs.map(tab => ({ id: tab.id, title: tab.title, url: tab.url })) });
            })
            .catch(e => {
                console.log('Error querying tabs:', e);
                sendResponse({ tabs: [] });
            });
        return true;
    }
});
