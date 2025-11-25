/**
 * @fileoverview Cache management for Twitter profile locations and full profiles
 * @module cache
 */

/** @type {Map<string, {location: string|null, locationAccurate: boolean|null}|null>} */
const locationCache = new Map();
/** @type {Map<string, Object>} */
const fullProfileCache = new Map();

/** @constant {string} Storage key for cache data */
const CACHE_KEY = 'twitter_location_cache';
/** @constant {number} Number of days before cache entries expire */
const CACHE_EXPIRY_DAYS = 30;
/** @constant {number} Maximum number of entries in cache before LRU eviction */
const MAX_CACHE_SIZE = 500;
/** @constant {number} Cache save debounce delay in milliseconds */
const CACHE_SAVE_DELAY = 5000;

/**
 * Evicts the oldest entry from a cache map if it exceeds maximum size (LRU eviction)
 * @param {Map<string, any>} map - The cache map to evict from
 * @returns {void}
 */
function evictLRUEntry(map) {
  if (map.size >= MAX_CACHE_SIZE) {
    const firstKey = map.keys().next().value;
    if (firstKey) {
      map.delete(firstKey);
      console.log(`Evicted old cache entry: ${firstKey}`);
    }
  }
}

/**
 * Loads cached data from Chrome storage into memory caches
 * @returns {Promise<void>}
 */
async function loadCache() {
  try {
    if (!chrome.runtime?.id) {
      console.log('Extension context invalidated, skipping cache load');
      return;
    }
    
    const result = await chrome.storage.local.get(CACHE_KEY);
    if (!result[CACHE_KEY]) return;

    const cached = result[CACHE_KEY];
    const now = Date.now();

    for (const [username, data] of Object.entries(cached)) {
      if (!data.expiry || data.expiry <= now) continue;

      const stored = data.location;
      const storedFull = data.fullProfile;

      if (stored === null && !storedFull) continue;

      // Rehydrate location cache
      if (typeof stored === 'string') {
        locationCache.set(username, { location: stored, locationAccurate: null });
      } else if (typeof stored === 'object' && stored !== null) {
        const loc = stored.location ?? null;
        const acc = stored.locationAccurate ?? null;
        locationCache.set(username, { location: loc, locationAccurate: acc });
      } else if (stored === null) {
        locationCache.set(username, null);
      }

      // Rehydrate full profile cache
      if (storedFull) {
        fullProfileCache.set(username, storedFull);
      }
    }
    console.log(`Loaded ${locationCache.size} cached locations`);
  } catch (error) {
    if (!error.message?.includes('Extension context invalidated') && !error.message?.includes('message port closed')) {
      console.error('Error loading cache:', error);
    }
  }
}

/**
 * Saves current cache data to Chrome storage with expiry timestamps
 * @returns {Promise<void>}
 */
async function saveCache() {
  try {
    if (!chrome.runtime?.id) {
      console.log('Extension context invalidated, skipping cache save');
      return;
    }
    
    const cacheObj = {};
    const now = Date.now();
    const expiry = now + (CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    for (const [username, locationData] of locationCache.entries()) {
      let savedLocation = null;
      if (locationData !== null && typeof locationData === 'object') {
        savedLocation = {
          location: locationData.location ?? null,
          locationAccurate: locationData.locationAccurate ?? null
        };
      }

      const savedFullProfile = fullProfileCache.has(username) ? fullProfileCache.get(username) : undefined;
      const entry = {
        location: savedLocation,
        expiry,
        cachedAt: now
      };
      if (savedFullProfile !== undefined) {
        entry.fullProfile = savedFullProfile;
      }
      cacheObj[username] = entry;
    }

    await chrome.storage.local.set({ [CACHE_KEY]: cacheObj });
  } catch (error) {
    if (!error.message?.includes('Extension context invalidated') && !error.message?.includes('message port closed')) {
      console.error('Error saving cache:', error);
    }
  }
}

/**
 * Saves a location cache entry with debounced persistence
 * @param {string} username - The Twitter username
 * @param {{location: string|null, locationAccurate: boolean|null}|null} location - Location data to cache
 * @returns {void}
 */
function saveCacheEntry(username, location) {
  if (!chrome.runtime?.id) return;
  evictLRUEntry(locationCache);
  locationCache.set(username, location);
  if (!saveCache.timeout) {
    saveCache.timeout = setTimeout(async () => {
      await saveCache();
      saveCache.timeout = null;
    }, CACHE_SAVE_DELAY);
  }
}

/**
 * Saves a full profile object to cache with debounced persistence
 * @param {string} username - The Twitter username
 * @param {Object} profileObj - The full profile object to cache
 * @returns {void}
 */
function saveFullProfile(username, profileObj) {
  if (!username) return;
  evictLRUEntry(fullProfileCache);
  fullProfileCache.set(username, profileObj);
  if (!locationCache.has(username)) {
    evictLRUEntry(locationCache);
    locationCache.set(username, null);
  }
  if (!saveCache.timeout) {
    saveCache.timeout = setTimeout(async () => {
      await saveCache();
      saveCache.timeout = null;
    }, CACHE_SAVE_DELAY);
  }
}

/**
 * Checks if cached data exists for a given screen name
 * @param {string} screenName - The Twitter username to check
 * @returns {boolean} True if cached data exists
 */
function hasCachedData(screenName) {
  return fullProfileCache.has(screenName) || (locationCache.has(screenName) && locationCache.get(screenName) !== null);
}

/**
 * Clears all cache data from memory and storage
 * @returns {Promise<void>}
 */
function clearCache() {
  locationCache.clear();
  fullProfileCache.clear();
  console.log('Cache cleared by user');
  return saveCache();
}

/**
 * Clears cache data for a specific username
 * @param {string} screenName - The Twitter username to clear from cache
 * @returns {Promise<void>}
 */
function clearCacheEntry(screenName) {
  locationCache.delete(screenName);
  fullProfileCache.delete(screenName);
  console.log(`Cache cleared for ${screenName}`);
  return saveCache();
}

// Expose aliases on the global scope for other content scripts
try {
  window.locationCache = locationCache;
  window.fullProfileCache = fullProfileCache;
  window.hasCachedProfileData = hasCachedData;
  window.saveCacheEntry = saveCacheEntry;
  window.saveFullProfile = saveFullProfile;
  window.loadCache = loadCache;
  window.saveCache = saveCache;
  window.clearCache = clearCache;
  window.clearCacheEntry = clearCacheEntry;
} catch (e) {
  // In some environments window may be unavailable; silently ignore
}
