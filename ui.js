/**
 * @fileoverview UI elements (globe button, flags, loading shimmer, event handling)
 * @module ui
 */

// Click debouncing to prevent multiple rapid API calls
/** @type {Map<string, number>} Map of usernames to last click timestamps */
const clickDebounceMap = new Map();
/** @type {Map<string, number>} Map of usernames to timeout IDs for cleanup */
const debounceTimeoutMap = new Map();

/** @constant {number} Click debounce delay in milliseconds */
const CLICK_DEBOUNCE_DELAY = 500;
/** @constant {number} Shimmer size in em units */
const SHIMMER_SIZE = 1.2;
/** @constant {number} Shimmer margin right in pixels */
const SHIMMER_MARGIN_RIGHT = 4;
/** @constant {number} Flag margin right in pixels */
const FLAG_MARGIN_RIGHT = 4;
/** @constant {number} Cleanup delay in milliseconds */
const CLEANUP_DELAY = 1000;
/** @constant {number} Maximum username length */
const MAX_USERNAME_LENGTH = 15;
/** @constant {string} Username validation regex */
const USERNAME_REGEX = /^[a-zA-Z0-9_]{1,15}$/;

/**
 * @fileoverview UI elements (globe button, flags, loading shimmer, event handling)
 * @module ui
 */

// Initialize shimmer style once at module load
/**
 * Initializes the shimmer animation style if not already present
 * This function runs once at module load to inject the CSS animation
 * @private
 */
(function initializeShimmerStyle() {
  if (!document.getElementById('twitter-profile-shimmer-style')) {
    const style = document.createElement('style');
    style.id = 'twitter-profile-shimmer-style';
    style.textContent = `@keyframes loading-pulse { 0%, 100% { background-position: 0% center; } 50% { background-position: 100% center; } }`;
    document.head.appendChild(style);
  }
})();

/**
 * Creates a loading shimmer element for profile fetching
 * This shimmer replaces globe buttons during API calls and provides
 * visual feedback to users that profile data is being retrieved.
 * @returns {HTMLSpanElement} The created shimmer element
 */
function createLoadingShimmer() {
  const shimmer = document.createElement('span');
  shimmer.style.display = 'inline-block';
  shimmer.style.width = `${SHIMMER_SIZE}em`;
  shimmer.style.height = `${SHIMMER_SIZE}em`;
  shimmer.style.borderRadius = '50%';
  shimmer.style.background = 'linear-gradient(90deg, #555, #999, #555)';
  shimmer.style.backgroundSize = '200% 100%';
  shimmer.style.animation = 'loading-pulse 1.5s infinite';
  shimmer.style.marginRight = `${SHIMMER_MARGIN_RIGHT}px`;
  shimmer.style.verticalAlign = 'middle';
  shimmer.style.cursor = 'pointer';
  shimmer.title = 'Fetching profile...';

  return shimmer;
}

/**
 * Finds the handle section div that contains the @username link
 * This function identifies specific div within Twitter's UserName container
 * that holds the @username link, which is crucial for proper flag/globe positioning.
 * @param {Element} container - The UserName container element to search within
 * @param {string} screenName - The Twitter username to find (without @)
 * @returns {Element|null} The handle section element or null if not found
 */
function findHandleSection(container, screenName) {
  const divs = container.querySelectorAll('div');
  for (let i = 0; i < divs.length; i++) {
    const div = divs[i];
    const link = div.querySelector(`a[href="/${screenName}"]`);
    if (link) {
      const text = link.textContent?.trim();
      if (text === `@${screenName}`) {
        return div;
      }
    }
  }
  return null;
}

/**
 * Inserts a UI element (flag or globe) using the same positioning logic as local-beta
 * This function implements a 4-strategy approach to ensure proper placement within
 * Twitter's complex UserName DOM structure, handling various layout scenarios.
 * @param {Element} containerEl - The container element (article/UserCell) containing the username
 * @param {Element} uiElement - The UI element to insert (flag span or globe span)
 * @param {string} screenName - The Twitter username (without @)
 * @returns {boolean} True if insertion was successful, false otherwise
 */
function insertUIElement(containerEl, uiElement, screenName) {
  // Find the UserName container (where flags should be positioned)
  const userNameContainer = containerEl.querySelector('[data-testid="UserName"], [data-testid="User-Name"]');
  if (!userNameContainer) {
    console.error('[UI] Could not find UserName container for positioning');
    return false;
  }

  let inserted = false;
  
  // Find the handle section - the div that contains the @username link
  const handleSection = findHandleSection(userNameContainer, screenName);
  
  // Strategy 1: Insert right before the handle section div (which contains @username)
  // The handle section is a direct child of User-Name container
  if (handleSection && handleSection.parentNode === userNameContainer) {
    try {
      userNameContainer.insertBefore(uiElement, handleSection);
      inserted = true;
      console.log(`[UI] ✓ Inserted UI element before handle section for ${screenName}`);
    } catch (e) {
      console.log('[UI] Failed to insert before handle section:', e);
    }
  }
  
  // Strategy 2: Find the handle section's parent and insert before it
  if (!inserted && handleSection && handleSection.parentNode) {
    try {
      // Insert before the handle section's parent (if it's not User-Name)
      const handleParent = handleSection.parentNode;
      if (handleParent !== userNameContainer && handleParent.parentNode) {
        handleParent.parentNode.insertBefore(uiElement, handleParent);
        inserted = true;
        console.log(`[UI] ✓ Inserted UI element before handle parent for ${screenName}`);
      } else if (handleParent === userNameContainer) {
        // Handle section is direct child, insert before it
        userNameContainer.insertBefore(uiElement, handleSection);
        inserted = true;
        console.log(`[UI] ✓ Inserted UI element before handle section (direct child) for ${screenName}`);
      }
    } catch (e) {
      console.log('[UI] Failed to insert before handle parent:', e);
    }
  }
  
  // Strategy 3: Find display name container and insert after it, before handle section
  if (!inserted && handleSection) {
    try {
      // Find the display name link (first link)
      const displayNameLink = userNameContainer.querySelector('a[href^="/"]');
      if (displayNameLink) {
        // Find the div that contains the display name link
        const displayNameContainer = displayNameLink.closest('div');
        if (displayNameContainer && displayNameContainer.parentNode) {
          // Check if handle section is a sibling
          if (displayNameContainer.parentNode === handleSection.parentNode) {
            displayNameContainer.parentNode.insertBefore(uiElement, handleSection);
            inserted = true;
            console.log(`[UI] ✓ Inserted UI element between display name and handle (siblings) for ${screenName}`);
          } else {
            // Try inserting after display name container
            displayNameContainer.parentNode.insertBefore(uiElement, displayNameContainer.nextSibling);
            inserted = true;
            console.log(`[UI] ✓ Inserted UI element after display name container for ${screenName}`);
          }
        }
      }
    } catch (e) {
      console.log('[UI] Failed to insert after display name:', e);
    }
  }
  
  // Strategy 4: Insert at the end of User-Name container (fallback)
  if (!inserted) {
    try {
      userNameContainer.appendChild(uiElement);
      inserted = true;
      console.log(`[UI] ✓ Inserted UI element at end of UserName container for ${screenName}`);
    } catch (e) {
      console.error('[UI] Failed to append UI element to User-Name container:', e);
    }
  }
  
  return inserted;
}

/**
 * Inserts a child element at a specific index in a parent element
 * This utility function provides precise DOM insertion control,
 * though it's primarily used as a fallback for complex positioning.
 * @param {Element} parentEl - The parent element to insert into
 * @param {Element} childEl - The child element to insert
 * @param {number} index - The index at which to insert the child
 * @returns {void}
 */
function insertElementAt(parentEl, childEl, index) {
  // Input validation
  if (!parentEl || !(parentEl instanceof Element)) {
    console.error('[UI] insertElementAt: Invalid parent element');
    return;
  }
  if (!childEl || !(childEl instanceof Element)) {
    console.error('[UI] insertElementAt: Invalid child element');
    return;
  }
  if (typeof index !== 'number' || index < 0) {
    console.error('[UI] insertElementAt: Invalid index', index);
    return;
  }
  
  try {
    const children = Array.from(parentEl.childNodes);
    if (index >= children.length) {
      parentEl.appendChild(childEl);
    } else {
      parentEl.insertBefore(childEl, children[index]);
    }
  } catch (e) {
    console.error('[UI] insertElementAt: Error inserting element', e);
  }
}

/**
 * Validates input parameters for addFlagToUsername function
 * @param {Element} containerEl - The container element to validate
 * @param {string} screenName - The username to validate
 * @returns {boolean} True if inputs are valid, false otherwise
 */
function validateAddFlagInputs(containerEl, screenName) {
  if (!containerEl || !screenName) {
    console.error('[UI] addFlagToUsername: Invalid arguments', { containerEl, screenName });
    return false;
  }
  
  if (!(containerEl instanceof Element)) {
    console.error('[UI] addFlagToUsername: containerEl is not a valid DOM element', typeof containerEl);
    return false;
  }
  
  if (typeof screenName !== 'string' || screenName.length === 0) {
    console.error('[UI] addFlagToUsername: screenName must be a non-empty string', typeof screenName);
    return false;
  }
  
  if (!USERNAME_REGEX.test(screenName)) {
    console.warn('[UI] addFlagToUsername: Invalid screenName format', screenName);
    return false;
  }
  
  if (!document.contains(containerEl)) {
    console.warn('[UI] addFlagToUsername: Element not in DOM', screenName);
    return false;
  }

  return true;
}

/**
 * Finds the username link within a container using multiple strategies
 * @param {Element} containerEl - The container element to search within
 * @param {string} screenName - The Twitter username to find
 * @returns {Element|null} The username link element or null if not found
 */
function findUsernameLink(containerEl, screenName) {
  const userNameContainer = containerEl.querySelector('[data-testid="UserName"], [data-testid="User-Name"]');
  
  // Strategy 1: Find link with @username text content in UserName container
  if (userNameContainer) {
    const containerLinks = userNameContainer.querySelectorAll('a[href^="/"]');
    for (const link of containerLinks) {
      const text = link.textContent?.trim();
      const href = link.getAttribute('href');
      const match = href.match(/^\/([^\/\?]+)/);
      
      if (match && match[1] === screenName && (text === `@${screenName}` || text === screenName)) {
        return link;
      }
    }
    
    // Strategy 2: Find any link with @username text in UserName container
    for (const link of containerLinks) {
      const text = link.textContent?.trim();
      if (text === `@${screenName}`) {
        return link;
      }
    }
  }
  
  // Strategy 3: Find link with exact matching href
  const links = containerEl.querySelectorAll('a[href^="/"]');
  for (const link of links) {
    const href = link.getAttribute('href');
    const text = link.textContent?.trim();
    if ((href === `/${screenName}` || href.startsWith(`/${screenName}?`)) && 
        (text === `@${screenName}` || text === screenName)) {
      return link;
    }
  }
  
  // Strategy 4: Fallback to any matching href
  for (const link of links) {
    const href = link.getAttribute('href');
    const match = href.match(/^\/([^\/\?]+)/);
    if (match && match[1] === screenName) {
      const hasVerificationBadge = link.closest('[data-testid="User-Name"]')?.querySelector('[data-testid="icon-verified"]');
      if (!hasVerificationBadge || link.textContent?.trim() === `@${screenName}`) {
        return link;
      }
    }
  }

  return null;
}

/**
 * Gets cached profile data for a username
 * @param {string} screenName - The Twitter username
 * @returns {Object|null} Cached profile data or null if not found
 */
function getCachedProfileData(screenName) {
  try {
    const hasFullProfile = (window.fullProfileCache && window.fullProfileCache.has(screenName));
    const hasLocationData = (window.locationCache && window.locationCache.has(screenName) && window.locationCache.get(screenName) !== null);
    
    if (!hasFullProfile && !hasLocationData) {
      return null;
    }
    
    let data = null;
    if (window.locationCache && window.locationCache.has(screenName)) {
      data = window.locationCache.get(screenName);
    } else if (typeof locationCache !== 'undefined' && locationCache.has(screenName)) {
      data = locationCache.get(screenName);
    }
    
    const fullProfile = (window.fullProfileCache && window.fullProfileCache.get(screenName)) || 
                        (typeof fullProfileCache !== 'undefined' && fullProfileCache.get(screenName));
    
    return (data && data.fullProfile) || fullProfile;
  } catch (e) {
    if (typeof logError === 'function') {
      logError('UI', `Error checking cache for ${screenName}: ${e.message || e}`, 'error');
    } else {
      console.error(`[UI] Error checking cache for ${screenName}:`, e);
    }
    return null;
  }
}

/**
 * Creates a flag element with appropriate styling and content
 * @param {string} screenName - The Twitter username
 * @param {Object} profileData - The profile data containing location
 * @returns {HTMLSpanElement} The created flag element
 */
function createFlagElement(screenName, profileData) {
  const location = profileData?.about_profile?.account_based_in || '';
  const flag = getCountryFlag(location);
  const flagEl = document.createElement('span');

  if (flag) {
    flagEl.textContent = ` ${flag.emoji}`;
    flagEl.title = flag.label || flag.country || flag.emoji;
  } else if (location) {
    flagEl.textContent = ' 🌍';
    flagEl.title = `Location: ${location} (no flag available)`;
  } else {
    flagEl.textContent = ' ❓';
    flagEl.title = 'Location information unavailable';
  }

  flagEl.style.display = 'inline';
  flagEl.style.marginRight = '4px';
  flagEl.style.color = 'inherit';
  flagEl.setAttribute('data-twitter-location-flag', screenName);
  flagEl.setAttribute('role', 'button');
  flagEl.setAttribute('tabindex', '0');
  
  return flagEl;
}

/**
 * Creates a globe button element for fetching profile data
 * @param {string} screenName - The Twitter username
 * @returns {HTMLSpanElement} The created globe element
 */
function createGlobeElement(screenName) {
  const globe = document.createElement('span');
  globe.textContent = '🌐';
  globe.style.display = 'inline';
  globe.style.verticalAlign = 'middle';
  globe.style.cursor = 'pointer';
  globe.style.opacity = '0.6';
  globe.style.marginRight = '4px';
  globe.title = 'Click to fetch profile location';
  globe.setAttribute('data-twitter-location-globe', screenName);
  globe.setAttribute('role', 'button');
  globe.setAttribute('tabindex', '0');
  
  return globe;
}

/**
 * Handles cached flag display for a username
 * @param {Element} containerEl - The container element
 * @param {string} screenName - The Twitter username
 * @param {Object} profileData - The cached profile data
 * @returns {Promise<void>}
 */
async function handleCachedFlag(containerEl, screenName, profileData) {
  const flagEl = createFlagElement(screenName, profileData);
  
  const clickHandler = (e) => {
    e.stopPropagation();
    if (profileData) {
      (window.showProfileTooltipForElement || showProfileTooltipForElement)(flagEl, profileData);
    } else {
      handleFlagClickToFetch(flagEl, screenName);
    }
  };
  
  flagEl._clickHandler = clickHandler;
  flagEl.addEventListener('click', clickHandler);
  
  const inserted = insertUIElement(containerEl, flagEl, screenName);
  if (inserted) {
    containerEl.dataset.flagAdded = 'true';
    console.log(`[UI] Displayed cached flag for ${screenName}`, {
      flagEmoji: flagEl.textContent.trim(),
      flagTitle: flagEl.title,
      profileLocation: profileData?.about_profile?.account_based_in || 'none'
    });
  } else {
    console.error('[UI] Failed to insert flag');
    containerEl.dataset.flagAdded = 'failed';
  }
}

/**
 * Handles click-to-fetch functionality for flag elements
 * @param {Element} flagEl - The flag element that was clicked
 * @param {string} screenName - The Twitter username
 * @returns {Promise<void>}
 */
async function handleFlagClickToFetch(flagEl, screenName) {
  const locGetter = window.getUserLocation || getUserLocation;
  if (!locGetter) return;
  
  const shimmer = createLoadingShimmer();
  flagEl.replaceWith(shimmer);
  
  try {
    const result = await locGetter(screenName);
    const full = result?.fullResult || 
                (window.fullProfileCache && window.fullProfileCache.get(screenName)) ||
                (typeof fullProfileCache !== 'undefined' && fullProfileCache.get ? fullProfileCache.get(screenName) : null);
    
    if (full && typeof full === 'object') {
      const newFlagEl = createFlagElement(screenName, full);
      
      const newClickHandler = (e2) => {
        e2.stopPropagation();
        if (full) (window.showProfileTooltipForElement || showProfileTooltipForElement)(newFlagEl, full);
      };
      newFlagEl._clickHandler = newClickHandler;
      newFlagEl.addEventListener('click', newClickHandler);
      
      shimmer.replaceWith(newFlagEl);
    } else {
      showFetchError(shimmer, 'Failed to fetch profile - click to retry', () => handleFlagClickToFetch(shimmer, screenName));
    }
  } catch (err) {
    showFetchError(shimmer, 'Error fetching profile - click to retry', () => handleFlagClickToFetch(shimmer, screenName));
  }
}

/**
 * Shows an error state for failed fetch operations
 * @param {Element} element - The element to show error in
 * @param {string} message - The error message
 * @param {Function} retryHandler - The retry click handler
 */
function showFetchError(element, message, retryHandler) {
  element.textContent = '❌';
  element.title = message;
  element.style.cursor = 'pointer';
  element.style.animation = 'none';
  element.style.background = 'none';
  element.style.opacity = '0.5';
  
  // Clean up existing handler
  if (element._clickHandler) {
    element.removeEventListener('click', element._clickHandler);
  }
  
  element._clickHandler = retryHandler;
  element.addEventListener('click', retryHandler);
  
  // Use structured error logging if available
  if (typeof logError === 'function') {
    logError('UI', message, 'warning');
  }
}

/**
 * Handles globe button click to fetch profile data
 * @param {Element} containerEl - The container element
 * @param {string} screenName - The Twitter username
 * @returns {Promise<void>}
 */
async function handleGlobeClick(containerEl, screenName) {
  const now = Date.now();
  const lastClick = clickDebounceMap.get(screenName) || 0;
  if (now - lastClick < CLICK_DEBOUNCE_DELAY) {
    console.log(`[UI] Debounced click for ${screenName} (${now - lastClick}ms ago)`);
    return;
  }
  clickDebounceMap.set(screenName, now);
  
  console.log(`[UI] Globe clicked for ${screenName}, starting fetch`);
  
  const currentGlobe = containerEl.querySelector('[data-twitter-location-globe]');
  if (!currentGlobe) {
    console.error('[UI] Globe element not found for click handler');
    return;
  }

  let shimmer;
  try {
    shimmer = createLoadingShimmer();
    currentGlobe.replaceWith(shimmer);
  } catch (err) {
    console.error('[UI] Error creating shimmer:', err);
    return;
  }

  try {
    const locGetter = window.getUserLocation || getUserLocation;
    if (!locGetter || typeof locGetter !== 'function') {
      throw new Error('getUserLocation function not available');
    }
    
    console.log(`[UI] Fetching location for ${screenName}`);
    const result = await locGetter(screenName);
    
    if (!result || typeof result !== 'object') {
      throw new Error('Invalid result structure from API');
    }
    
    const full = result?.fullResult ?? 
                (window.fullProfileCache ? window.fullProfileCache.get(screenName) : 
                (typeof fullProfileCache !== 'undefined' && fullProfileCache.get ? fullProfileCache.get(screenName) : null));

    if (full && typeof full === 'object') {
      const flagEl = createFlagElement(screenName, full);
      
      const flagClickHandler = (e2) => {
        e2.stopPropagation();
        if (full) (window.showProfileTooltipForElement || showProfileTooltipForElement)(flagEl, full);
      };
      flagEl._clickHandler = flagClickHandler;
      flagEl.addEventListener('click', flagClickHandler);

      const inserted = insertUIElement(containerEl, flagEl, screenName);
      if (inserted) {
        shimmer.remove();
      } else {
        console.error('[UI] Failed to insert flag after fetch');
        showFetchError(shimmer, 'Error displaying flag', () => handleGlobeClick(containerEl, screenName));
      }
      
      // Show warning if needed
      if (result?.locationAccurate === false) {
        const warning = document.createElement('span');
        warning.textContent = '⚠️';
        warning.title = 'Location may be inaccurate (VPN/Proxy detected)';
        warning.style.display = 'inline-block';
        warning.style.marginLeft = '2px';
        warning.style.fontSize = '0.9em';
        warning.style.verticalAlign = 'middle';
        flagEl.after(warning);
        console.log(`[UI] Added VPN warning for ${screenName}`);
      }
    } else {
      showFetchError(shimmer, 'Profile fetch failed - click to retry', () => handleGlobeClick(containerEl, screenName));
    }
  } catch (err) {
    if (typeof logError === 'function') {
      logError('UI', `Error fetching profile for ${screenName}: ${err.message || err}`, 'error');
    } else {
      console.error(`[UI] Error fetching profile for ${screenName}:`, err);
    }
    showFetchError(shimmer, 'Error fetching profile - click to retry', () => handleGlobeClick(containerEl, screenName));
  } finally {
    const timeoutId = setTimeout(() => cleanupClickDebounce(screenName), CLEANUP_DELAY);
    debounceTimeoutMap.set(screenName, timeoutId);
  }
}

/**
 * Adds a location flag or globe button to a username container
 * This function handles both cached flag display and globe button insertion
 * for click-to-fetch functionality. Uses sophisticated positioning logic
 * to ensure UI elements appear in the correct location within Twitter's
 * UserName DOM structure.
 * @param {Element} containerEl - The container element (article/UserCell) to add flag to
 * @param {string} screenName - The Twitter username (without @)
 * @returns {Promise<void>}
 */
async function addFlagToUsername(containerEl, screenName) {
  if (!validateAddFlagInputs(containerEl, screenName)) {
    return;
  }

  if (containerEl.dataset.flagAdded === 'true') {
    console.log(`[UI] Skipping ${screenName} - already processed this container`);
    return;
  }

  containerEl.dataset.flagAdded = 'processing';

  const usernameLink = findUsernameLink(containerEl, screenName);
  if (!usernameLink) {
    console.error(`[UI] Could not find username link for ${screenName}`);
    console.error('[UI] Available links in container:', Array.from(containerEl.querySelectorAll('a[href^="/"]')).map(l => ({
      href: l.getAttribute('href'),
      text: l.textContent?.trim()
    })));
    containerEl.dataset.flagAdded = 'failed';
    return;
  }
  
  console.log(`[UI] Found username link for ${screenName}:`, usernameLink.href, usernameLink.textContent?.trim());

  const profileData = getCachedProfileData(screenName);
  
  if (profileData) {
    await handleCachedFlag(containerEl, screenName, profileData);
  } else {
    const globe = createGlobeElement(screenName);
    
    const inserted = insertUIElement(containerEl, globe, screenName);
    if (inserted) {
      containerEl.dataset.flagAdded = 'true';
      console.log(`[UI] Added globe button for ${screenName}`);
    } else {
      console.error('[UI] Failed to insert globe');
      containerEl.dataset.flagAdded = 'failed';
    }

    const clickHandler = async (e) => {
      e.stopPropagation();
      await handleGlobeClick(containerEl, screenName);
    };
    
    globe._clickHandler = clickHandler;
    globe.addEventListener('click', clickHandler);
  }
}

/**
 * Cleans up click debounce entry for a specific username
 * This function removes debounce tracking and clears any pending
 * timeout to prevent memory leaks after API calls complete.
 * @param {string} screenName - The username to clean up debounce for
 * @returns {void}
 */
function cleanupClickDebounce(screenName) {
  clickDebounceMap.delete(screenName);
  // Clear any pending timeout
  const timeoutId = debounceTimeoutMap.get(screenName);
  if (timeoutId) {
    clearTimeout(timeoutId);
    debounceTimeoutMap.delete(screenName);
  }
}

/**
 * Cleans up all click debounce entries and timeouts
 * This function is called during extension disable/unload to prevent
 * memory leaks by clearing all debounce tracking data and pending timeouts.
 * Also cleans up event listeners on DOM elements.
 * @returns {void}
 */
function cleanupAllClickDebounces() {
  clickDebounceMap.clear();
  // Clear all pending timeouts
  debounceTimeoutMap.forEach(timeoutId => clearTimeout(timeoutId));
  debounceTimeoutMap.clear();
  
  // Clean up event listeners on flag and globe elements
  const flagElements = document.querySelectorAll('[data-twitter-location-flag], [data-twitter-location-globe]');
  flagElements.forEach(element => {
    if (element._clickHandler) {
      element.removeEventListener('click', element._clickHandler);
      delete element._clickHandler;
    }
  });
  
  // Use structured error logging if available
  if (typeof logError === 'function') {
    logError('UI', 'Cleanup completed', 'info');
  } else {
    console.log('[UI] Cleared all click debounce entries and timeouts');
  }
}

// Expose UI functions on window following Chrome Extension patterns
try {
  window.addFlagToUsername = addFlagToUsername;
  window.createLoadingShimmer = createLoadingShimmer;
  window.cleanupClickDebounce = cleanupClickDebounce;
  window.cleanupAllClickDebounces = cleanupAllClickDebounces;
  window.validateAddFlagInputs = validateAddFlagInputs;
  window.findUsernameLink = findUsernameLink;
  window.getCachedProfileData = getCachedProfileData;
  window.createFlagElement = createFlagElement;
  window.createGlobeElement = createGlobeElement;
  window.handleCachedFlag = handleCachedFlag;
  window.handleFlagClickToFetch = handleFlagClickToFetch;
  window.showFetchError = showFetchError;
  window.handleGlobeClick = handleGlobeClick;
} catch (e) {
  // Silently ignore if window is unavailable (content script safety)
}