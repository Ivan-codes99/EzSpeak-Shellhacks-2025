// popup.js
document.addEventListener('DOMContentLoaded', function() {
    const openSidePanelBtn = document.getElementById('openSidePanelBtn');
    const translationSelect = document.getElementById('translationSelect');

    if (translationSelect) {
        translationSelect.addEventListener('change', async () => {
            const val = translationSelect.value;
            if (val) {
                await chrome.storage.local.set({ translationTargetLang: val });
                openSidePanelBtn.disabled = false;
            } else {
                openSidePanelBtn.disabled = true;
            }
        });
        // Attempt to pre-populate from previous choice
        chrome.storage.local.get(['translationTargetLang'], items => {
            if (items.translationTargetLang) {
                translationSelect.value = items.translationTargetLang;
                openSidePanelBtn.disabled = false;
            }
        });
    }

    if (openSidePanelBtn && chrome.sidePanel && chrome.sidePanel.open) {
        openSidePanelBtn.addEventListener('click', function() {
            chrome.windows.getCurrent(function(window) {
                if (window && window.id !== undefined) {
                     // Quick slide animation
                    document.body.style.transform = 'translateX(-100%)';
                    document.body.style.transition = 'transform 0.15s ease-out';
                
                    // Open side panel immediately
                    chrome.sidePanel.open({windowId: window.id});
                
                    // Close popup after brief animation
                    setTimeout(() => {
                        window.close();
                    }, 150);
                    


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
