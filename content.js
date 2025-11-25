/**
 * @fileoverview Bootstrap and observer - orchestrates all extension modules
 * @module content
 * 
 * Modules loaded via script tags in manifest.json:
 * cache.js, api.js, countryFlags.js, tooltip.js, ui.js
 */

/** @type {MutationObserver|null} */
let observer = null;
/** @type {boolean} */
let extensionEnabled = true;

/** @constant {string} Storage key for extension toggle state */
const TOGGLE_KEY = 'extension_enabled';
/** @constant {boolean} Default enabled state */
const DEFAULT_ENABLED = true;
/** @constant {number} Debounce delay for username processing in milliseconds */
const USERNAME_PROCESS_DEBOUNCE = 300;
/** @constant {number} Extension toggle delay in milliseconds */
const TOGGLE_DELAY = 500;
/** @constant {number} Metrics logging interval */
const METRICS_LOG_INTERVAL = 100;

/** @type {Set<string>} Set of usernames currently being processed */
const processingUsernames = new Set();
/** @type {number|null} Timeout ID for debounced username processing */
let processUsernamesTimeout = null;

/** @type {Object} Performance metrics tracking */
const metrics = {
  totalProcessed: 0,
  totalFlags: 0,
  cacheHits: 0,
  apiRequests: 0,
  startTime: Date.now()
};

/**
 * Logs current performance metrics to console
 * @returns {void}
 */
function logMetrics() {
  const uptime = ((Date.now() - metrics.startTime) / 1000 / 60).toFixed(1);
  console.log(`[Metrics] Uptime: ${uptime}m | Processed: ${metrics.totalProcessed} | Flags: ${metrics.totalFlags} | Cache Hits: ${metrics.cacheHits} | API Requests: ${metrics.apiRequests}`);
}

/**
 * Loads the extension enabled state from Chrome storage
 * @returns {Promise<void>}
 */
async function loadEnabledState() {
  try {
    const result = await chrome.storage.local.get([TOGGLE_KEY]);
    extensionEnabled = result[TOGGLE_KEY] !== undefined ? result[TOGGLE_KEY] : DEFAULT_ENABLED;
    console.log('Extension enabled:', extensionEnabled);
  } catch (error) {
    console.error('Error loading enabled state:', error);
    extensionEnabled = DEFAULT_ENABLED;
  }
}

// Listen for toggle changes from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'extensionToggle') {
    extensionEnabled = request.enabled;
    console.log('Extension toggled:', extensionEnabled);
    
    if (extensionEnabled) {
      setTimeout(() => {
        processUsernames();
      }, TOGGLE_DELAY);
    } else {
      removeAllFlags();
      // Disconnect observer when extension is disabled
      if (observer) {
        observer.disconnect();
        console.log('Observer disconnected due to extension disable');
      }
    }
  } else if (request.type === 'clearCache') {
    // Clear runtime caches
    try {
      const clearCacheFunc = (typeof window !== 'undefined' && window.clearCache) ? window.clearCache : (typeof clearCache === 'function' ? clearCache : null);
      if (clearCacheFunc) {
        clearCacheFunc();
      }
    } catch (e) {
      console.error('Error clearing cache:', e);
    }
  }
});

/**
 * Checks if cached profile data exists for a screen name
 * @param {string} screenName - The Twitter username to check
 * @returns {boolean} True if cached data exists
 */
function hasCachedProfileData(screenName) {
  // Use the shared caches exposed by cache.js on the window object
  try {
    if (typeof window !== 'undefined' && window.fullProfileCache && window.locationCache) {
      return window.fullProfileCache.has(screenName) || (window.locationCache.has(screenName) && window.locationCache.get(screenName) !== null);
    }
  } catch (e) {
    // Silently ignore if caches are not yet available
  }
  // Fallback: direct global check (if cache.js hasn't loaded yet)
  if (typeof fullProfileCache !== 'undefined' && typeof locationCache !== 'undefined') {
    return fullProfileCache.has(screenName) || (locationCache.has(screenName) && locationCache.get(screenName) !== null);
  }
  return false;
}

/**
 * Extracts Twitter username from various UI elements
 * @param {Element} element - The DOM element to extract username from
 * @returns {string|null} The extracted username or null if not found
 */
function extractUsername(element) {
  // Cache querySelector calls at function level to avoid redundant DOM traversal
  const usernameElement = element.querySelector('[data-testid="UserName"], [data-testid="User-Name"]');
  if (usernameElement) {
    const links = usernameElement.querySelectorAll('a[href^="/"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      const match = href.match(/^\/([^\/\?]+)/);
      if (match && match[1]) {
        const username = match[1];
        // Filter out common routes
        const excludedRoutes = new Set(['home', 'explore', 'notifications', 'messages', 'i', 'compose', 'search', 'settings', 'bookmarks', 'lists', 'communities']);
        if (!excludedRoutes.has(username) && 
            !username.startsWith('hashtag') &&
            !username.startsWith('search') &&
            username.length > 0 &&
            username.length < 20) { // Usernames are typically short
          return username;
        }
      }
    }
  }
  
  // Try finding username links in the entire element (broader search)
  const allLinks = element.querySelectorAll('a[href^="/"]');
  const seenUsernames = new Set();
  const excludedRoutes = new Set(['home', 'explore', 'notifications', 'messages', 'i', 'compose', 'search', 'settings', 'bookmarks', 'lists', 'communities', 'hashtag']);
  
  for (const link of allLinks) {
    const href = link.getAttribute('href');
    if (!href) continue;
    
    const match = href.match(/^\/([^\/\?]+)/);
    if (!match || !match[1]) continue;
    
    const potentialUsername = match[1];
    
    // Skip if we've already checked this username
    if (seenUsernames.has(potentialUsername)) continue;
    seenUsernames.add(potentialUsername);
    
    // Filter out routes and invalid usernames
    if (excludedRoutes.has(potentialUsername) || potentialUsername.startsWith('hashtag')) {
      continue;
    }
    
    // Skip status/tweet links
    if (potentialUsername.includes('status') || potentialUsername.match(/^\d+$/)) {
      continue;
    }
    
    // Check link text/content for username indicators
    const text = link.textContent?.trim() || '';
    const linkText = text.toLowerCase();
    const usernameLower = potentialUsername.toLowerCase();
    
    // If link text starts with @, it's definitely a username
    if (text.startsWith('@')) {
      return potentialUsername;
    }
    
    // If link text matches the username (without @), it's likely a username
    if (linkText === usernameLower || linkText === `@${usernameLower}`) {
      return potentialUsername;
    }
    
    // Check if link is in a UserName container or has username-like structure
    const parent = link.closest('[data-testid="UserName"], [data-testid="User-Name"]');
    if (parent) {
      // If it's in a UserName container and looks like a username, return it
      if (potentialUsername.length > 0 && potentialUsername.length < 20 && !potentialUsername.includes('/')) {
        return potentialUsername;
      }
    }
    
    // Also check if link text is @username format
    if (text && text.trim().startsWith('@')) {
      const atUsername = text.trim().substring(1);
      if (atUsername === potentialUsername) {
        return potentialUsername;
      }
    }
  }
  
  // Last resort: look for @username pattern in text content and verify with link
  const textContent = element.textContent || '';
  const atMentionMatches = textContent.matchAll(/@([a-zA-Z0-9_]+)/g);
  for (const match of atMentionMatches) {
    const username = match[1];
    // Verify it's actually a link in a User-Name container
    const link = element.querySelector(`a[href="/${username}"], a[href^="/${username}?"]`);
    if (link) {
      // Make sure it's in a username context, not just mentioned in tweet text
      const isInUserNameContainer = link.closest('[data-testid="UserName"], [data-testid="User-Name"]');
      if (isInUserNameContainer) {
        return username;
      }
    }
  }
  
  return null;
}

/**
 * Removes all flag elements and cleans up extension UI when disabled
 */
function removeAllFlags() {
  // Remove flag elements
  const flags = document.querySelectorAll('[data-twitter-location-flag], [data-twitter-location-globe]');
  flags.forEach(flag => {
    // Clean up attached listeners before removing
    if (flag._clickHandler) {
      flag.removeEventListener('click', flag._clickHandler);
      delete flag._clickHandler;
    }
    flag.remove();
  });
  
  // Also remove any loading shimmers
  const shimmers = document.querySelectorAll('[data-twitter-flag-shimmer]');
  shimmers.forEach(shimmer => shimmer.remove());
  
  // Reset flag added markers
  const containers = document.querySelectorAll('[data-flag-added]');
  containers.forEach(container => {
    delete container.dataset.flagAdded;
  });
  
  // Reset username processed markers
  const processedContainers = document.querySelectorAll('[data-username-processed]');
  processedContainers.forEach(container => {
    delete container.dataset.usernameProcessed;
  });
  
  // Clear processingUsernames Set to prevent memory leak
  processingUsernames.clear();
  
  // Clean up click debounce entries
  try {
    const cleanupDebounces = (typeof window !== 'undefined' && window.cleanupAllClickDebounces) ? window.cleanupAllClickDebounces : (typeof cleanupAllClickDebounces === 'function' ? cleanupAllClickDebounces : null);
    if (cleanupDebounces) cleanupDebounces();
  } catch (e) {
    console.error('Error cleaning up click debounces:', e);
  }
  
  console.log('Removed all flags, shimmers, and cleared processing state');
}

/**
 * Processes all username elements on the page to add location flags
 * @returns {Promise<void>}
 */
async function processUsernames() {
  // Check if extension is enabled
  if (!extensionEnabled) {
    return;
  }
  
  // Find all tweet/article containers and user cells (but not individual User-Name elements to avoid duplicates)
  const containers = document.querySelectorAll('article[data-testid="tweet"], [data-testid="UserCell"]');
  
  console.log(`Processing ${containers.length} containers for usernames`);
  
  let foundCount = 0;
  let processedCount = 0;
  let skippedCount = 0;
  
  for (const container of containers) {
    const screenName = extractUsername(container);
    if (screenName) {
      foundCount++;
      const status = container.dataset.flagAdded;
      if (!status || status === 'failed') {
        processedCount++;
        // Process in parallel but limit concurrency
        // Call addFlagToUsername via window if available; fallback to global
        // NOTE: This should ONLY handle UI display (cached data or globe), NO auto-fetching
        try {
          const flagAdder = (typeof window !== 'undefined' && window.addFlagToUsername) ? window.addFlagToUsername : (typeof addFlagToUsername === 'function' ? addFlagToUsername : null);
          if (flagAdder) {
            console.log(`[UI] Adding UI element for ${screenName} (click-to-fetch mode)`);
            flagAdder(container, screenName).catch(err => {
              console.error(`[UI] Error adding UI for ${screenName}:`, err);
              container.dataset.flagAdded = 'failed';
            });
          } else {
            console.error(`[UI] addFlagToUsername not available for ${screenName}`);
            container.dataset.flagAdded = 'failed';
          }
        } catch (e) {
          console.error(`[UI] Error adding UI for ${screenName}:`, e);
          container.dataset.flagAdded = 'failed';
        }
      } else {
        skippedCount++;
      }
    } else {
      // Debug: log containers that don't have usernames
      const hasUserName = container.querySelector('[data-testid="UserName"], [data-testid="User-Name"]');
      if (hasUserName) {
        console.log('Found UserName container but no username extracted');
      }
    }
  }
  
  if (foundCount > 0) {
    console.log(`Found ${foundCount} usernames, processing ${processedCount} new ones, skipped ${skippedCount} already processed`);
    metrics.totalProcessed += foundCount;
  } else {
    console.log('No usernames found in containers');
  }
  
  // Clear processingUsernames Set after each cycle to prevent unbounded growth
  processingUsernames.clear();
  
  // Log metrics every 100 processed items
  if (metrics.totalProcessed % METRICS_LOG_INTERVAL === 0 && metrics.totalProcessed > 0) {
    logMetrics();
  }
}

/**
 * Sets up MutationObserver to handle dynamically loaded content
 * @returns {void}
 */
function setupObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver(() => {
    // Clear existing timeout to prevent multiple pending calls
    if (processUsernamesTimeout) {
      clearTimeout(processUsernamesTimeout);
    }
    // Increase debounce from 100ms to 300ms to reduce excessive DOM queries
    processUsernamesTimeout = setTimeout(processUsernames, USERNAME_PROCESS_DEBOUNCE);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * Initializes the extension by loading state, cache, and setting up observers
 * @returns {Promise<void>}
 */
async function init() {
  try {
    console.log('Initializing extension...');
    
    await loadEnabledState();
    
    // Call cache loading via window if available; fallback to global
    try {
      const cacheLoader = (typeof window !== 'undefined' && window.loadCache) ? window.loadCache : (typeof loadCache === 'function' ? loadCache : null);
      if (cacheLoader) await cacheLoader();
    } catch (e) {
      console.error('Error loading cache:', e);
    }
    
    // Inject page script for API calls
    try {
      const pageScriptInjector = (typeof window !== 'undefined' && window.injectPageScript) ? window.injectPageScript : (typeof injectPageScript === 'function' ? injectPageScript : null);
      if (pageScriptInjector) pageScriptInjector();
    } catch (e) {
      console.error('Error injecting page script:', e);
    }
    
    // Initial processing
    processUsernames();
    
    // Setup observer for dynamic content
    setupObserver();
    
    console.log('Extension initialized');
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

// Start on DOMContentLoaded or immediately if already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/**
 * Cleans up all extension resources on page unload
 * @returns {void}
 */
function cleanupAllResources() {
  console.log('Cleaning up all resources...');
  
  // Log final metrics
  logMetrics();
  
  // Disconnect observer
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  
  // Clear debounce timeout
  if (processUsernamesTimeout) {
    clearTimeout(processUsernamesTimeout);
    processUsernamesTimeout = null;
  }
  
  // Cancel request queue
  if (typeof window !== 'undefined' && window.requestQueue) {
    window.requestQueue.length = 0;
  }
  
  // Clear processing state
  processingUsernames.clear();
  
  // Remove all event listeners attached to flags
  const flags = document.querySelectorAll('[data-twitter-location-flag], [data-twitter-location-globe]');
  flags.forEach(flag => {
    if (flag._clickHandler) {
      flag.removeEventListener('click', flag._clickHandler);
      delete flag._clickHandler;
    }
  });
  
  // Hide tooltip if visible
  try {
    const hideTooltip = (typeof window !== 'undefined' && window.hideProfileTooltip) ? window.hideProfileTooltip : (typeof hideProfileTooltip === 'function' ? hideProfileTooltip : null);
    if (hideTooltip) hideTooltip();
  } catch (e) {
    console.log('Error hiding tooltip during cleanup:', e);
  }
  
  console.log('Cleanup complete');
}

window.addEventListener('beforeunload', cleanupAllResources);

// Expose metrics for debugging
try {
  window.metrics = metrics;
  window.logMetrics = logMetrics;
} catch (e) {
  // Silently ignore if window is unavailable
}

