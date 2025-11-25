// Bootstrap and observer - orchestrates all modules
// Modules loaded via script tags in manifest.json:
// cache.js, api.js, countryFlags.js, tooltip.js, ui.js

let observer = null;
let extensionEnabled = true;
const TOGGLE_KEY = 'extension_enabled';
const DEFAULT_ENABLED = true;
const processingUsernames = new Set();

// Load enabled state
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
      }, 500);
    } else {
      removeAllFlags();
    }
  }
});

// Helper: check if we should display cached UI instead of globe
function hasCachedProfileData(screenName) {
  // Prefer the compatibility helper if present
  if (typeof window !== 'undefined' && window.hasCachedProfileData) {
    return window.hasCachedProfileData(screenName);
  }
  // Fallback to direct caches (provided by cache.js)
  return (typeof fullProfileCache !== 'undefined' && fullProfileCache.has(screenName)) || (typeof locationCache !== 'undefined' && locationCache.has(screenName) && locationCache.get(screenName) !== null);
}

// Function to extract username from various Twitter UI elements
function extractUsername(element) {
  // Try data-testid="UserName" or "User-Name" first (most reliable)
  const usernameElement = element.querySelector('[data-testid="UserName"], [data-testid="User-Name"]');
  if (usernameElement) {
    const links = usernameElement.querySelectorAll('a[href^="/"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      const match = href.match(/^\/([^\/\?]+)/);
      if (match && match[1]) {
        const username = match[1];
        // Filter out common routes
        const excludedRoutes = ['home', 'explore', 'notifications', 'messages', 'i', 'compose', 'search', 'settings', 'bookmarks', 'lists', 'communities'];
        if (!excludedRoutes.includes(username) && 
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
    const excludedRoutes = ['home', 'explore', 'notifications', 'messages', 'i', 'compose', 'search', 'settings', 'bookmarks', 'lists', 'communities', 'hashtag'];
    if (excludedRoutes.some(route => potentialUsername === route || potentialUsername.startsWith(route))) {
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

// Function to remove all flags (when extension is disabled)
function removeAllFlags() {
  const flags = document.querySelectorAll('[data-twitter-flag]');
  flags.forEach(flag => flag.remove());
  
  // Also remove any loading shimmers
  const shimmers = document.querySelectorAll('[data-twitter-flag-shimmer]');
  shimmers.forEach(shimmer => shimmer.remove());
  
  // Reset flag added markers
  const containers = document.querySelectorAll('[data-flag-added]');
  containers.forEach(container => {
    delete container.dataset.flagAdded;
  });
  
  console.log('Removed all flags');
}

// Function to process all username elements on the page
async function processUsernames() {
  // Check if extension is enabled
  if (!extensionEnabled) {
    return;
  }
  
  // Find all tweet/article containers and user cells
  const containers = document.querySelectorAll('article[data-testid="tweet"], [data-testid="UserCell"], [data-testid="User-Names"], [data-testid="User-Name"]');
  
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
        addFlagToUsername(container, screenName).catch(err => {
          console.error(`Error processing ${screenName}:`, err);
          container.dataset.flagAdded = 'failed';
        });
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
  } else {
    console.log('No usernames found in containers');
  }
}

// Setup observer for dynamically loaded content
function setupObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver(() => {
    setTimeout(processUsernames, 100);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Initialize extension
async function init() {
  try {
    console.log('Initializing extension...');
    
    await loadEnabledState();
    await loadCache();
    
    // Inject page script for API calls
    injectPageScript();
    
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

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (observer) observer.disconnect();
});

