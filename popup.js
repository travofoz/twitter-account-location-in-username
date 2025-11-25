/**
 * @fileoverview Popup script for extension toggle and cache management
 * @module popup
 */

/** @constant {string} Storage key for extension toggle state */
const TOGGLE_KEY = 'extension_enabled';
/** @constant {string} Storage key for cache data */
const CACHE_KEY = 'twitter_location_cache';
/** @constant {boolean} Default enabled state */
const DEFAULT_ENABLED = true;
/** @constant {string} Extension enabled color */
const ENABLED_COLOR = '#1d9bf0';
/** @constant {string} Extension disabled color */
const DISABLED_COLOR = '#536471';

// Get elements
const toggleSwitch = document.getElementById('toggleSwitch');
const status = document.getElementById('status');
const cacheSize = document.getElementById('cacheSize');
const clearCacheBtn = document.getElementById('clearCacheBtn');

// Load current state
chrome.storage.local.get([TOGGLE_KEY], (result) => {
  const isEnabled = result[TOGGLE_KEY] !== undefined ? result[TOGGLE_KEY] : DEFAULT_ENABLED;
  updateToggle(isEnabled);
});

/**
 * Updates the cache size display in the popup
 */
function updateCacheSize() {
  chrome.storage.local.get([CACHE_KEY], (result) => {
    const cache = result[CACHE_KEY] || {};
    const count = Object.keys(cache).length;
    cacheSize.textContent = count;
  });
}

// Load cache size on popup open
updateCacheSize();

// Toggle click handler
toggleSwitch.addEventListener('click', () => {
  chrome.storage.local.get([TOGGLE_KEY], (result) => {
    const currentState = result[TOGGLE_KEY] !== undefined ? result[TOGGLE_KEY] : DEFAULT_ENABLED;
    const newState = !currentState;
    
    chrome.storage.local.set({ [TOGGLE_KEY]: newState }, () => {
      updateToggle(newState);
      
      // Notify content script to update
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'extensionToggle',
            enabled: newState
          }).catch(() => {
            // Tab might not have content script loaded yet, that's okay
          });
        }
      });
    });
  });
});

// Clear cache button handler
clearCacheBtn.addEventListener('click', () => {
  if (confirm('Clear all cached profiles? This cannot be undone.')) {
    chrome.storage.local.remove([CACHE_KEY], () => {
      console.log('Cache cleared from popup');
      updateCacheSize();
      alert('Cache cleared successfully!');
      
      // Notify content script to clear runtime caches
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'clearCache'
          }).catch(() => {
            // Tab might not have content script
          });
        });
      });
    });
  }
});

/**
 * Updates the toggle switch UI based on enabled state
 * @param {boolean} isEnabled - Whether the extension is enabled
 */
function updateToggle(isEnabled) {
  if (isEnabled) {
    toggleSwitch.classList.add('enabled');
    status.textContent = 'Extension is enabled';
    status.style.color = ENABLED_COLOR;
  } else {
    toggleSwitch.classList.remove('enabled');
    status.textContent = 'Extension is disabled';
    status.style.color = DISABLED_COLOR;
  }
}

