// API request queue and rate limiting
const requestQueue = [];
let isProcessingQueue = false;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000;
const MAX_CONCURRENT_REQUESTS = 2;
let activeRequests = 0;
let rateLimitResetTime = 0;

// Structured error logging
function logError(context, error, severity = 'error') {
  const timestamp = new Date().toISOString();
  const errorMsg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : '';
  console.error(`[${severity.toUpperCase()}] [${timestamp}] ${context}:`, {
    message: errorMsg,
    stack: stack
  });
}

async function processRequestQueue() {
  if (isProcessingQueue || requestQueue.length === 0) return;
  
  if (rateLimitResetTime > 0) {
    const now = Math.floor(Date.now() / 1000);
    if (now < rateLimitResetTime) {
      const waitTime = (rateLimitResetTime - now) * 1000;
      console.log(`Rate limited. Waiting ${Math.ceil(waitTime / 1000 / 60)} minutes...`);
      setTimeout(processRequestQueue, Math.min(waitTime, 60000));
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
        setTimeout(processRequestQueue, 200);
      });
  }
  
  isProcessingQueue = false;
}

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
    }, 10000);
  });
}

let rateLimitInfoHandlerRegistered = false;

function injectPageScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('pageScript.js');
  script.onload = () => script.remove();
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
