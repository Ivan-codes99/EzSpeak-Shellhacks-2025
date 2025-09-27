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
            // Rename callback param so we don't shadow the global window object used for closing the popup.
            chrome.windows.getCurrent(function(chromeWin) {
                if (chromeWin && chromeWin.id !== undefined) {
                    // Quick slide animation
                    document.body.style.transform = 'translateX(-100%)';
                    document.body.style.transition = 'transform 0.15s ease-out';

                    // Open side panel immediately
                    try { chrome.sidePanel.open({ windowId: chromeWin.id }); } catch (e) { console.warn('Failed to open side panel:', e); }

                    // Close popup after brief animation. Use globalThis.close() explicitly to avoid any shadowing.
                    setTimeout(() => {
                        try {
                            if (typeof globalThis.close === 'function') {
                                globalThis.close();
                            } else if (typeof window !== 'undefined' && typeof window.close === 'function') {
                                window.close();
                            }
                        } catch (e) {
                            console.warn('Popup close failed:', e);
                        }
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
