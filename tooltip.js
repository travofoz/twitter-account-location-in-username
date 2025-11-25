/**
 * @fileoverview Tooltip rendering and interactions for profile information
 * @module tooltip
 */

/** @type {Element|null} Currently displayed tooltip element */
let currentTooltip = null;
/** @type {Object<string, boolean>} Track which profiles are being refreshed */
let refreshInProgress = {};
/** @type {AbortController|null} AbortController for tooltip event cleanup */
let tooltipAbortController = null;

/** @constant {number} Tooltip minimum width in pixels */
const TOOLTIP_MIN_WIDTH = 280;
/** @constant {number} Tooltip maximum width in pixels */
const TOOLTIP_MAX_WIDTH = 380;
/** @constant {number} Tooltip padding in pixels */
const TOOLTIP_PADDING = 14;
/** @constant {number} Tooltip border radius in pixels */
const TOOLTIP_BORDER_RADIUS = 10;
/** @constant {number} Tooltip offset from anchor in pixels */
const TOOLTIP_OFFSET = 8;
/** @constant {number} Tooltip minimum distance from viewport edge in pixels */
const TOOLTIP_VIEWPORT_MARGIN = 20;
/** @constant {number} Avatar size in pixels */
const AVATAR_SIZE = 72;
/** @constant {number} Grid gap in pixels */
const GRID_GAP = 10;
/** @constant {number} Grid column gap in pixels */
const GRID_COLUMN_GAP = 12;

/**
 * Formats a timestamp to a localized date string
 * @param {number|string} ts - Timestamp to format
 * @returns {string|null} Formatted date string or null if invalid
 */
function formatTimestampToDate(ts) {
  if (!ts) return null;
  const n = Number(ts);
  if (!isFinite(n)) return null;
  const d = new Date(n);
  return d.toLocaleString();
}

/**
 * Refreshes profile data for a given screen name and updates tooltip
 * @param {string} screenName - The Twitter username to refresh
 * @returns {Promise<void>}
 */
async function refreshProfile(screenName) {
  if (refreshInProgress[screenName]) return;
  refreshInProgress[screenName] = true;

  try {
    const locGetter = window.getUserLocation || getUserLocation;
    const result = await locGetter(screenName, { force: true });
    const full = result?.fullResult ?? (window.fullProfileCache ? window.fullProfileCache.get(screenName) : (typeof fullProfileCache !== 'undefined' && fullProfileCache.get ? fullProfileCache.get(screenName) : null));
    if (full) {
      const anchorEl = currentTooltip?._anchorEl;
      if (anchorEl) {
        const showTooltip = window.showProfileTooltipForElement || showProfileTooltipForElement;
        showTooltip(anchorEl, full);
      }
    }
  } catch (err) {
    console.error('Error refreshing profile:', err);
  } finally {
    delete refreshInProgress[screenName];
  }
}

/**
 * Creates a profile tooltip element with user information
 * @param {Object} profile - The profile object to display
 * @returns {HTMLDivElement} The created tooltip element
 */
function createProfileTooltip(profile) {
  // Input validation
  if (!profile || typeof profile !== 'object') {
    console.error('createProfileTooltip: Invalid profile object');
    return document.createElement('div');
  }

  const container = document.createElement('div');
  container.setAttribute('data-twitter-profile-tooltip', 'true');
  container.style.position = 'absolute';
  container.style.zIndex = 999999;
  container.style.minWidth = `${TOOLTIP_MIN_WIDTH}px`;
  container.style.maxWidth = `${TOOLTIP_MAX_WIDTH}px`;
  container.style.background = '#1a1a1a';
  container.style.color = '#e7e7e7';
  container.style.padding = `${TOOLTIP_PADDING}px`;
  container.style.borderRadius = `${TOOLTIP_BORDER_RADIUS}px`;
  container.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)';
  container.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
  container.style.fontSize = '13px';
  container.style.border = '1px solid #333';

  // Header
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'flex-start';
  header.style.gap = '12px';
  header.style.marginBottom = '12px';

  // Avatar (clickable) - only set link attributes when screenName exists
  const avatarLink = document.createElement('a');
  const screenName = profile?.core?.screen_name;
  avatarLink.style.flex = '0 0 auto';
  if (screenName) {
    avatarLink.setAttribute('href', `https://twitter.com/${screenName}`);
    avatarLink.setAttribute('target', '_blank');
    avatarLink.setAttribute('rel', 'noopener noreferrer');
    avatarLink.style.cursor = 'pointer';
    avatarLink.title = 'Open profile';
  } else {
    avatarLink.style.cursor = 'default';
    avatarLink.title = 'Profile unavailable';
    avatarLink.style.opacity = '0.5';
  }

  const avatar = document.createElement('img');
  avatar.src = profile?.avatar?.image_url || '';
  avatar.alt = profile?.core?.screen_name || '';
  avatar.style.width = `${AVATAR_SIZE}px`;
  avatar.style.height = `${AVATAR_SIZE}px`;
  avatar.style.borderRadius = profile?.profile_image_shape === 'Circle' ? '50%' : '8px';
  avatar.style.objectFit = 'cover';
  avatar.style.display = 'block';
  avatar.style.transition = 'opacity 0.2s';
  avatar.style.opacity = '1';
  
  // Handle broken image
  avatar.onerror = () => {
    avatar.style.display = 'none';
  };
  
  avatarLink.appendChild(avatar);
  avatarLink.addEventListener('mouseenter', () => { avatar.style.opacity = '0.8'; });
  avatarLink.addEventListener('mouseleave', () => { avatar.style.opacity = '1'; });

  // Text (name + handle)
  const textAndRefresh = document.createElement('div');
  textAndRefresh.style.flex = '1 1 auto';
  textAndRefresh.style.display = 'flex';
  textAndRefresh.style.flexDirection = 'column';
  textAndRefresh.style.gap = '4px';

  const displayName = document.createElement('div');
  displayName.style.fontWeight = '600';
  displayName.style.fontSize = '15px';
  displayName.style.color = '#fff';
  displayName.textContent = profile?.core?.name || profile?.core?.screen_name || '';

  const handle = document.createElement('div');
  handle.style.color = '#8a8a8a';
  handle.style.fontSize = '13px';
  handle.textContent = `@${profile?.core?.screen_name || ''}`;

  textAndRefresh.appendChild(displayName);
  textAndRefresh.appendChild(handle);

  // Refresh button
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = '🔄';
  refreshBtn.title = 'Refresh profile';
  refreshBtn.style.border = 'none';
  refreshBtn.style.background = 'transparent';
  refreshBtn.style.cursor = 'pointer';
  refreshBtn.style.fontSize = '16px';
  refreshBtn.style.padding = '0';
  refreshBtn.style.color = '#8a8a8a';
  refreshBtn.style.transition = 'transform 0.3s, color 0.2s';
  refreshBtn.style.flex = '0 0 auto';
  refreshBtn.addEventListener('mouseenter', () => { refreshBtn.style.color = '#1d9bf0'; });
  refreshBtn.addEventListener('mouseleave', () => { refreshBtn.style.color = '#8a8a8a'; });
  refreshBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!refreshInProgress[profile?.core?.screen_name]) {
      refreshBtn.style.animation = 'spin 1s linear infinite';
      refreshProfile(profile?.core?.screen_name).finally(() => {
        refreshBtn.style.animation = '';
      });
    }
  });

  header.appendChild(avatarLink);
  header.appendChild(textAndRefresh);
  header.appendChild(refreshBtn);
  container.appendChild(header);

  if (!document.getElementById('twitter-profile-spin-animation')) {
    const style = document.createElement('style');
    style.id = 'twitter-profile-spin-animation';
    style.textContent = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }

  // Details grid
  const grid = document.createElement('div');
  grid.style.marginTop = '0';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1fr';
  grid.style.gap = `${GRID_GAP}px ${GRID_COLUMN_GAP}px`;
  grid.style.marginBottom = '10px';
  grid.style.paddingBottom = '10px';
  grid.style.borderBottom = '1px solid #333';

  function addRow(label, value) {
    const l = document.createElement('div');
    l.style.fontSize = '11px';
    l.style.color = '#8a8a8a';
    l.style.textTransform = 'uppercase';
    l.style.letterSpacing = '0.5px';
    l.textContent = label;

    const v = document.createElement('div');
    v.style.fontSize = '13px';
    v.style.color = '#e7e7e7';
    v.style.fontWeight = '500';
    v.style.wordBreak = 'break-word';
    v.textContent = value || '-';

    grid.appendChild(l);
    grid.appendChild(v);
  }

  addRow('Location', profile?.about_profile?.account_based_in || profile?.about_profile?.source || '-');
  addRow('Accurate', typeof profile?.about_profile?.location_accurate === 'boolean' ? String(profile.about_profile.location_accurate) : '-');

  let createdFormatted = '-';
  if (profile?.core?.created_at) {
    const parsed = Date.parse(profile.core.created_at);
    const formatted = formatTimestampToDate(parsed);
    if (formatted) {
      createdFormatted = formatted.substring(0, 10);
    } else {
      // fallback to raw string trimmed safely
      try { createdFormatted = String(profile.core.created_at).substring(0, 10); } catch (e) { createdFormatted = '-'; }
    }
  }
  addRow('Created', createdFormatted);
  addRow('Source', profile?.about_profile?.source || '-');
  
  const usernameChanges = profile?.about_profile?.username_changes;
  const changeCount = usernameChanges?.count ? `${usernameChanges.count} time(s)` : '-';
  addRow('Username Changes', changeCount);
  
  const verifiedSince = profile?.verification_info?.reason?.verified_since_msec;
  let verifiedFormatted = '-';
  if (verifiedSince) {
    const formatted = formatTimestampToDate(Number(verifiedSince));
    if (formatted) verifiedFormatted = formatted.substring(0, 10);
  }
  addRow('Verified', verifiedFormatted);

  container.appendChild(grid);

  // Affiliates
  const extra = document.createElement('div');
  extra.style.marginTop = '0';
  extra.style.fontSize = '12px';
  extra.style.color = '#a0a0a0';
  extra.style.lineHeight = '1.4';
  if (profile?.affiliates_highlighted_label?.label?.description) {
    extra.textContent = `🏢 ${profile.affiliates_highlighted_label.label.description}`;
  } else if (profile?.identity_profile_labels_highlighted_label?.label?.description) {
    extra.textContent = `🏢 ${profile.identity_profile_labels_highlighted_label.label.description}`;
  }
  if (extra.textContent) {
    extra.style.marginBottom = '8px';
    container.appendChild(extra);
  }

  // Close hint
  const hint = document.createElement('div');
  hint.style.marginTop = '8px';
  hint.style.fontSize = '11px';
  hint.style.color = '#666';
  hint.style.textAlign = 'center';
  hint.textContent = 'Click outside or press ESC to close';
  container.appendChild(hint);

  return container;
}

/**
 * Shows a profile tooltip positioned relative to an anchor element
 * @param {Element} anchorEl - The element to position tooltip relative to
 * @param {Object} profile - The profile object to display in tooltip
 * @returns {void}
 */
function showProfileTooltipForElement(anchorEl, profile) {
  // Input validation
  if (!anchorEl || !(anchorEl instanceof Element)) {
    console.error('showProfileTooltipForElement: anchorEl must be a valid DOM element');
    return;
  }
  if (!profile || typeof profile !== 'object') {
    console.error('showProfileTooltipForElement: profile must be a valid object');
    return;
  }

  hideProfileTooltip();
  const tooltip = createProfileTooltip(profile);
  document.body.appendChild(tooltip);
  currentTooltip = tooltip;
  currentTooltip._anchorEl = anchorEl;

  // Create AbortController for automatic cleanup
  tooltipAbortController = new AbortController();
  const signal = tooltipAbortController.signal;

  // Measure & position after layout to avoid offsetWidth==0 issues
  requestAnimationFrame(() => {
    // Check if tooltip is still in DOM before styling
    if (!document.contains(tooltip)) {
      return;
    }
    const tooltipWidth = tooltip.offsetWidth || tooltip.clientWidth || TOOLTIP_MAX_WIDTH;
    const rect = anchorEl.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + TOOLTIP_OFFSET;
    const left = Math.min(window.innerWidth - TOOLTIP_VIEWPORT_MARGIN - tooltipWidth, Math.max(TOOLTIP_VIEWPORT_MARGIN, rect.left + window.scrollX));
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  });

  function onDocClick(e) {
    if (!tooltip.contains(e.target) && e.target !== anchorEl) {
      hideProfileTooltip();
    }
  }
  function onKey(e) {
    if (e.key === 'Escape') hideProfileTooltip();
  }
  setTimeout(() => {
    document.addEventListener('click', onDocClick, { signal });
    document.addEventListener('keydown', onKey, { signal });
  }, 0);

  tooltip._cleanup = () => {
    // Abort all listeners associated with this tooltip
    if (tooltipAbortController) {
      tooltipAbortController.abort();
    }
  };
}

/**
 * Hides currently displayed profile tooltip
 * @returns {void}
 */
function hideProfileTooltip() {
  if (currentTooltip) {
    if (currentTooltip._cleanup) currentTooltip._cleanup();
    try { currentTooltip.remove(); } catch (e) {}
    currentTooltip = null;
  }
}

// Expose tooltip functions on window
try {
  window.createProfileTooltip = createProfileTooltip;
  window.showProfileTooltipForElement = showProfileTooltipForElement;
  window.hideProfileTooltip = hideProfileTooltip;
  window.refreshProfile = refreshProfile;
} catch (e) {
  // Silently ignore if window is unavailable
}
