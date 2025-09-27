// popup.js
document.addEventListener('DOMContentLoaded', function() {
    const openSidePanelBtn = document.getElementById('openSidePanelBtn');
    if (openSidePanelBtn && chrome.sidePanel && chrome.sidePanel.open) {
        openSidePanelBtn.addEventListener('click', function() {
            chrome.windows.getCurrent(function(window) {
                if (window && window.id !== undefined) {
                    chrome.sidePanel.open({windowId: window.id});
                }
            });
        });
    }
});

chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs && tabs.length > 0) {
        chrome.storage.local.set({activeTabId: tabs[0].id});
    }
});
