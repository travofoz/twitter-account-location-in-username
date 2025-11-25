/**
 * @fileoverview API request queue and rate limiting for Twitter profile location fetching
 * @module api
 */

/** @type {Array<{screenName: string, resolve: Function, reject: Function}>} */
const requestQueue = [];
/** @type {boolean} */
let isProcessingQueue = false;
/** @type {number} */
let lastRequestTime = 0;

/** @constant {number} Minimum interval between API requests in milliseconds */
const MIN_REQUEST_INTERVAL = 2000;
/** @constant {number} Maximum number of concurrent API requests */
const MAX_CONCURRENT_REQUESTS = 2;
/** @constant {number} Request timeout in milliseconds */
const REQUEST_TIMEOUT = 10000;
/** @constant {number} Queue processing delay in milliseconds */
const QUEUE_PROCESS_DELAY = 200;
/** @constant {number} Maximum wait time for rate limit in milliseconds */
const MAX_RATE_LIMIT_WAIT = 60000;
/** @type {number} */
let activeRequests = 0;
/** @type {number} */
let rateLimitResetTime = 0;

/**
 * Logs structured error messages with timestamp and context
 * @param {string} context - The context where the error occurred
 * @param {Error|string} error - The error object or message
 * @param {'error'|'warn'|'info'} [severity='error'] - The severity level of the log
 * @returns {void}
 */
function logError(context, error, severity = 'error') {
  const timestamp = new Date().toISOString();
  const errorMsg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : '';
  console.error(`[${severity.toUpperCase()}] [${timestamp}] ${context}:`, {
    message: errorMsg,
    stack: stack
  });
}

/**
 * Processes the API request queue with rate limiting and concurrency control
 * @returns {Promise<void>}
 */
async function processRequestQueue() {
  if (isProcessingQueue || requestQueue.length === 0) return;
  
  if (rateLimitResetTime > 0) {
    const now = Math.floor(Date.now() / 1000);
    if (now < rateLimitResetTime) {
      const waitTime = (rateLimitResetTime - now) * 1000;
      console.log(`Rate limited. Waiting ${Math.ceil(waitTime / 1000 / 60)} minutes...`);
      setTimeout(processRequestQueue, Math.min(waitTime, MAX_RATE_LIMIT_WAIT));
      return;
    }
    rateLimitResetTime = 0;
  }
  
  isProcessingQueue = true;
  
  while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT_REQUESTS) {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
    }
    
    const { screenName, resolve, reject } = requestQueue.shift();
    activeRequests++;
    lastRequestTime = Date.now();
    
    makeLocationRequest(screenName)
      .then(location => {
        resolve(location);
        // Resolve any duplicate requests for same screenName
        if (this._extraResolves) {
          this._extraResolves.forEach(res => res(location));
          delete this._extraResolves;
        }
      })
      .catch(error => {
        reject(error);
        // Reject any duplicate requests for same screenName
        if (this._extraRejects) {
          this._extraRejects.forEach(rej => rej(error));
          delete this._extraRejects;
        }
      })
      .finally(() => {
        activeRequests--;
        setTimeout(processRequestQueue, QUEUE_PROCESS_DELAY);
      });
  }
  
  isProcessingQueue = false;
}

/**
 * Makes a location request for a Twitter username via postMessage communication
 * @param {string} screenName - The Twitter username to fetch location for
 * @returns {Promise<{location: string|null, locationAccurate: boolean|null, fullResult: Object|null}>}
 */
function makeLocationRequest(screenName) {
  return new Promise((resolve) => {
    const requestId = Date.now() + Math.random();
    
    const handler = (event) => {
      if (event.source !== window) return;
      
      if (event.data?.type === '__locationResponse' && 
          event.data.screenName === screenName && 
          event.data.requestId === requestId) {
        window.removeEventListener('message', handler);
        
        const location = event.data.location ?? null;
        const locationAccurate = event.data.locationAccurate ?? null;
        const fullResult = event.data.fullResult ?? null;
        const isRateLimited = event.data.isRateLimited ?? false;

          if (!isRateLimited) {
            try {
              if (typeof window !== 'undefined' && window.saveCacheEntry) {
                if (location !== null) window.saveCacheEntry(screenName, { location, locationAccurate: !!locationAccurate });
                else window.saveCacheEntry(screenName, null);
                if (fullResult && window.saveFullProfile) window.saveFullProfile(screenName, fullResult);
              } else {
                if (typeof saveCacheEntry === 'function') {
                  if (location !== null) saveCacheEntry(screenName, { location, locationAccurate: !!locationAccurate });
                  else saveCacheEntry(screenName, null);
                }
                if (fullResult && typeof saveFullProfile === 'function') saveFullProfile(screenName, fullResult);
              }
            } catch (e) {
              logError('Cache save after API response', e, 'warn');
            }
          } else {
            console.log(`Not caching for ${screenName} due to rate limit`);
          }

        resolve({ location, locationAccurate, fullResult });
      }
    };
    
    window.addEventListener('message', handler);
    window.postMessage({ type: '__fetchLocation', screenName, requestId }, '*');
    
    setTimeout(() => {
      window.removeEventListener('message', handler);
      console.log(`Request timeout for ${screenName}`);
      resolve(null);
    }, REQUEST_TIMEOUT);
  });
}

/** @type {boolean} */
let rateLimitInfoHandlerRegistered = false;
/** @type {boolean} */
let pageScriptInjected = false;

/**
 * Injects the page script for making API calls and sets up rate limit monitoring
 */
function injectPageScript() {
  // Prevent multiple script injections
  if (pageScriptInjected) {
    console.log('Page script already injected, skipping');
    return;
  }
  
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('pageScript.js');
  script.onload = () => {
    script.remove();
    pageScriptInjected = true;
    console.log('Page script injected successfully');
  };
  script.onerror = () => {
    console.error('Failed to inject page script');
  };
  (document.head || document.documentElement).appendChild(script);
  
  // Register rate limit listener only once to prevent accumulation
  if (!rateLimitInfoHandlerRegistered) {
    const handleRateLimitInfo = (event) => {
      if (event.source !== window) return;
      if (event.data?.type === '__rateLimitInfo') {
        rateLimitResetTime = event.data.resetTime;
        const waitTime = event.data.waitTime;
        console.log(`Rate limit detected. Will resume in ${Math.ceil(waitTime / 1000 / 60)} minutes`);
      }
    };
    window.addEventListener('message', handleRateLimitInfo);
    rateLimitInfoHandlerRegistered = true;
  }
}

/**
 * Gets user location data, checking cache first then queuing API request if needed
 * @param {string} screenName - The Twitter username to fetch location for
 * @param {Object} [options={}] - Options for the request
 * @param {boolean} [options.force=false] - Force refresh even if cached data exists
 * @returns {Promise<{location: string|null, locationAccurate: boolean|null, fullResult: Object|null}>}
 */
function getUserLocation(screenName, options = {}) {
  const force = !!options.force;
  
  // Prefer the shared window cache exposed by cache.js; fall back to any existing global
  try {
    if (!force && typeof window !== 'undefined' && window.locationCache && window.locationCache.has(screenName)) {
      const cached = window.locationCache.get(screenName);
      if (cached !== null) {
        console.log(`Using cached location for ${screenName}:`, cached);
        return Promise.resolve(cached);
      }
      window.locationCache.delete(screenName);
    } else if (!force && typeof locationCache !== 'undefined' && locationCache && typeof locationCache.has === 'function' && locationCache.has(screenName)) {
      const cached = locationCache.get(screenName);
      if (cached !== null) {
        console.log(`Using cached location for ${screenName}:`, cached);
        return Promise.resolve(cached);
      }
      if (typeof locationCache.delete === 'function') locationCache.delete(screenName);
    }
  } catch (e) {
    logError('Cache lookup', e, 'warn');
  }
  
  // Check if screenName is already in queue to prevent duplicate requests
  const existingRequest = requestQueue.find(req => req.screenName === screenName);
  if (existingRequest) {
    console.log(`Request already queued for ${screenName}, returning existing promise`);
    return new Promise((resolve, reject) => {
      // Attach new promise handlers to existing request
      existingRequest._extraResolves = existingRequest._extraResolves || [];
      existingRequest._extraRejects = existingRequest._extraRejects || [];
      existingRequest._extraResolves.push(resolve);
      existingRequest._extraRejects.push(reject);
    });
  }
  
  console.log(`Queueing API request for ${screenName}` + (force ? ' (forced)' : ''));
  // Track metrics if available
  if (typeof window !== 'undefined' && window.metrics) {
    window.metrics.apiRequests++;
  }
  return new Promise((resolve, reject) => {
    requestQueue.push({ screenName, resolve, reject });
    processRequestQueue();
  });
}

// Expose public API functions on window
try {
  window.injectPageScript = injectPageScript;
  window.getUserLocation = getUserLocation;
  window.processRequestQueue = processRequestQueue;
} catch (e) {
  // Silently ignore if window is unavailable
}
