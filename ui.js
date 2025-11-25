// UI elements (globe button, flags, loading shimmer, event handling)

function createLoadingShimmer() {
  const shimmer = document.createElement('span');
  shimmer.style.display = 'inline-block';
  shimmer.style.width = '1.2em';
  shimmer.style.height = '1.2em';
  shimmer.style.borderRadius = '50%';
  shimmer.style.background = 'linear-gradient(90deg, #555, #999, #555)';
  shimmer.style.backgroundSize = '200% 100%';
  shimmer.style.animation = 'loading-pulse 1.5s infinite';
  shimmer.style.marginRight = '4px';
  shimmer.style.verticalAlign = 'middle';
  shimmer.style.cursor = 'pointer';
  shimmer.title = 'Fetching profile...';

  if (!document.getElementById('twitter-profile-shimmer-style')) {
    const style = document.createElement('style');
    style.id = 'twitter-profile-shimmer-style';
    style.textContent = `@keyframes loading-pulse { 0%, 100% { background-position: 0% center; } 50% { background-position: 100% center; } }`;
    document.head.appendChild(style);
  }

  return shimmer;
}

function insertElementAt(parentEl, childEl, index) {
  const children = Array.from(parentEl.childNodes);
  if (index >= children.length) {
    parentEl.appendChild(childEl);
  } else {
    parentEl.insertBefore(childEl, children[index]);
  }
}

// Expose UI functions on window
try {
  window.addFlagToUsername = addFlagToUsername;
  window.createLoadingShimmer = createLoadingShimmer;
} catch (e) {
  // Silently ignore if window is unavailable
}

// Expose addFlagToUsername on window
async function addFlagToUsername(userEl, screenName) {
  // Input validation
  if (!userEl || !screenName) {
    console.error('addFlagToUsername: Invalid arguments', { userEl, screenName });
    return;
  }
  
  // Ensure userEl is a valid DOM element
  if (!(userEl instanceof Element)) {
    console.error('addFlagToUsername: userEl is not a valid DOM element');
    return;
  }
  
  // Ensure screenName is a non-empty string
  if (typeof screenName !== 'string' || screenName.length === 0) {
    console.error('addFlagToUsername: screenName must be a non-empty string');
    return;
  }

  const existing = userEl.querySelector('[data-twitter-location-globe]');
  if (existing) return;

  // Check cache first
  const cached = (window.fullProfileCache && window.fullProfileCache.has(screenName)) || (window.locationCache && window.locationCache.has(screenName) && window.locationCache.get(screenName) !== null);
  if (cached) {
    const data = (window.locationCache ? window.locationCache.get(screenName) : locationCache.get(screenName)) || (await getUserLocation(screenName));
    if (data?.fullProfile) {
      const flag = getCountryFlag(data.fullProfile?.about_profile?.account_based_in || '');
      if (flag) {
        const flagEl = document.createElement('span');
        flagEl.textContent = flag.emoji;
        flagEl.title = flag.label || flag.country || flag.emoji;
        flagEl.style.display = 'inline-block';
        flagEl.style.marginRight = '4px';
        flagEl.style.verticalAlign = 'middle';
        flagEl.style.cursor = 'pointer';
        flagEl.setAttribute('data-twitter-location-flag', screenName);
        flagEl.setAttribute('role', 'button');
        flagEl.setAttribute('tabindex', '0');
        
        const clickHandler = (e) => {
          e.stopPropagation();
          const full = data.fullProfile;
          if (full) (window.showProfileTooltipForElement || showProfileTooltipForElement)(flagEl, full);
        };
        flagEl._clickHandler = clickHandler;
        flagEl.addEventListener('click', clickHandler);
        insertElementAt(userEl, flagEl, 0);
      }
    }
  } else {
    // Insert globe button
    const globe = document.createElement('span');
    globe.textContent = '🌐';
    globe.style.display = 'inline-block';
    globe.style.marginRight = '4px';
    globe.style.verticalAlign = 'middle';
    globe.style.cursor = 'pointer';
    globe.style.opacity = '0.6';
    globe.title = 'Click to fetch profile location';
    globe.setAttribute('data-twitter-location-globe', screenName);
    globe.setAttribute('role', 'button');
    globe.setAttribute('tabindex', '0');

    insertElementAt(userEl, globe, 0);

    const clickHandler = async (e) => {
      e.stopPropagation();
      const shimmer = createLoadingShimmer();
      globe.replaceWith(shimmer);

      try {
        const locGetter = window.getUserLocation || getUserLocation;
        const result = await locGetter(screenName);
        const full = result?.fullResult ?? (window.fullProfileCache ? window.fullProfileCache.get(screenName) : (typeof fullProfileCache !== 'undefined' && fullProfileCache.get ? fullProfileCache.get(screenName) : null));

        if (full) {
          const flag = getCountryFlag(full?.about_profile?.account_based_in || '');
          const flagEl = document.createElement('span');
          
          if (flag) {
            flagEl.textContent = flag.emoji;
            flagEl.title = flag.label || flag.country || flag.emoji;
            flagEl.setAttribute('data-twitter-location-flag', screenName);

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
            }
          } else {
            flagEl.textContent = '🌍';
            flagEl.title = 'Location unavailable';
          }

          flagEl.style.display = 'inline-block';
          flagEl.style.marginRight = '4px';
          flagEl.style.verticalAlign = 'middle';
          flagEl.style.cursor = 'pointer';
          flagEl.setAttribute('role', 'button');
          flagEl.setAttribute('tabindex', '0');
          
          const flagClickHandler = (e2) => {
            e2.stopPropagation();
            if (full) (window.showProfileTooltipForElement || showProfileTooltipForElement)(flagEl, full);
          };
          flagEl._clickHandler = flagClickHandler;
          flagEl.addEventListener('click', flagClickHandler);

          shimmer.replaceWith(flagEl);
        } else {
          shimmer.textContent = '❌';
          shimmer.title = 'Profile fetch failed';
          shimmer.style.animation = 'none';
          shimmer.style.background = 'none';
          shimmer.style.cursor = 'not-allowed';
          shimmer.style.opacity = '0.5';
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        shimmer.textContent = '❌';
        shimmer.title = 'Error fetching profile';
        shimmer.style.animation = 'none';
        shimmer.style.background = 'none';
        shimmer.style.cursor = 'not-allowed';
        shimmer.style.opacity = '0.5';
      }
    };
    globe._clickHandler = clickHandler;
    globe.addEventListener('click', clickHandler);
  }
}
