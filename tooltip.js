/**
 * @fileoverview Tooltip rendering and interactions for profile information
 * @module tooltip
 * 
 * Enhanced version with improved visual design, hover tooltips, and better UX
 * Fork of original work by Rhys Sullivan: https://github.com/RhysSullivan/twitter-account-location-in-username
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
/** @constant {number} Hover tooltip minimum distance from viewport edge in pixels */
const HOVER_TOOLTIP_VIEWPORT_MARGIN = 10;
/** @constant {number} Hover tooltip offset from anchor in pixels */
const HOVER_TOOLTIP_OFFSET = 8;
/** @constant {number} Avatar size in pixels */
const AVATAR_SIZE = 72;
/** @constant {number} Grid gap in pixels */
const GRID_GAP = 10;
/** @constant {number} Grid column gap in pixels */
const GRID_COLUMN_GAP = 12;
/** @constant {number} Small hover tooltip delay in milliseconds */
const HOVER_TOOLTIP_DELAY = 800;
/** @constant {number} Hover tooltip z-index */
const HOVER_TOOLTIP_Z_INDEX = 9999999;

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
 * Creates a hover tooltip for an element
 * @param {Element} targetEl - The element to attach hover tooltip to
 * @param {string} text - The tooltip text to display
 * @returns {void}
 */
function createHoverTooltip(targetEl, text) {
  if (!targetEl || !text) return;
  
  let hoverTooltip = null;
  let showTimeout = null;
  
  function showTooltip() {
    hideTooltip();
    showTimeout = setTimeout(() => {
      hoverTooltip = document.createElement('div');
      hoverTooltip.textContent = text;
      hoverTooltip.style.position = 'fixed';
      hoverTooltip.style.zIndex = HOVER_TOOLTIP_Z_INDEX;
      hoverTooltip.style.background = 'rgba(0, 0, 0, 0.9)';
      hoverTooltip.style.color = '#fff';
      hoverTooltip.style.padding = '6px 10px';
      hoverTooltip.style.borderRadius = '4px';
      hoverTooltip.style.fontSize = '12px';
      hoverTooltip.style.fontWeight = '500';
      hoverTooltip.style.pointerEvents = 'none';
      hoverTooltip.style.whiteSpace = 'nowrap';
      hoverTooltip.style.maxWidth = '200px';
      hoverTooltip.style.wordWrap = 'break-word';
      hoverTooltip.style.whiteSpace = 'normal';
      hoverTooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      
      document.body.appendChild(hoverTooltip);
      
      const rect = targetEl.getBoundingClientRect();
      const tooltipRect = hoverTooltip.getBoundingClientRect();
      
      let top = rect.top - tooltipRect.height - HOVER_TOOLTIP_OFFSET;
      let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
      
      if (top < HOVER_TOOLTIP_VIEWPORT_MARGIN) {
        top = rect.bottom + HOVER_TOOLTIP_OFFSET;
      }
      if (left < HOVER_TOOLTIP_VIEWPORT_MARGIN) {
        left = HOVER_TOOLTIP_VIEWPORT_MARGIN;
      }
      if (left + tooltipRect.width > window.innerWidth - HOVER_TOOLTIP_VIEWPORT_MARGIN) {
        left = window.innerWidth - tooltipRect.width - HOVER_TOOLTIP_VIEWPORT_MARGIN;
      }
      
      hoverTooltip.style.top = `${top + window.scrollY}px`;
      hoverTooltip.style.left = `${left + window.scrollX}px`;
    }, HOVER_TOOLTIP_DELAY);
  }
  
  function hideTooltip() {
    if (showTimeout) {
      clearTimeout(showTimeout);
      showTimeout = null;
    }
    if (hoverTooltip) {
      hoverTooltip.remove();
      hoverTooltip = null;
    }
  }
  
  function cleanup() {
    hideTooltip();
    targetEl.removeEventListener('mouseenter', showTooltip);
    targetEl.removeEventListener('mouseleave', hideTooltip);
    targetEl.removeEventListener('click', hideTooltip);
  }
  
  targetEl.addEventListener('mouseenter', showTooltip);
  targetEl.addEventListener('mouseleave', hideTooltip);
  targetEl.addEventListener('click', hideTooltip);
  
  // Store cleanup function for potential later use
  targetEl._hoverTooltipCleanup = cleanup;
}

/**
 * Refreshes profile data for a given screen name and updates tooltip
 * @param {string} screenName - The Twitter username to refresh
 * @returns {Promise<void>}
 */
async function refreshProfile(screenName) {
  if (!screenName || typeof screenName !== 'string') {
    logError('refreshProfile', 'Invalid screenName provided', 'error');
    return;
  }
  if (refreshInProgress[screenName]) return;
  refreshInProgress[screenName] = true;

  try {
    const locGetter = window.getUserLocation || getUserLocation;
    if (!locGetter) {
      throw new Error('getUserLocation function not available');
    }
    
    const result = await locGetter(screenName, { force: true });
    const full = result?.fullResult ?? (window.fullProfileCache ? window.fullProfileCache.get(screenName) : (typeof fullProfileCache !== 'undefined' && fullProfileCache.get ? fullProfileCache.get(screenName) : null));
    
    if (full) {
      const anchorEl = currentTooltip?._anchorEl;
      if (anchorEl) {
        const showTooltip = window.showProfileTooltipForElement || showProfileTooltipForElement;
        if (showTooltip) {
          showTooltip(anchorEl, full);
        }
      }
    }
  } catch (err) {
    if (typeof logError === 'function') {
      logError('refreshProfile', err);
    } else {
      console.error('Error refreshing profile:', err);
    }
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
  container.setAttribute('role', 'tooltip');
  container.setAttribute('aria-live', 'polite');
  container.style.position = 'absolute';
  container.style.zIndex = 999999;
  container.style.minWidth = `${TOOLTIP_MIN_WIDTH}px`;
  container.style.maxWidth = `${TOOLTIP_MAX_WIDTH}px`;
  container.style.background = '#1a1a1a';
  container.style.color = '#e7e7e7';
  container.style.padding = `${TOOLTIP_PADDING}px`;
  container.style.borderRadius = `${TOOLTIP_BORDER_RADIUS}px`;
  container.style.boxShadow = '0 12px 40px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3)';
  container.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
  container.style.fontSize = '13px';
  container.style.border = '1px solid #444';
  container.style.backdropFilter = 'blur(10px)';
  container.style.transition = 'opacity 0.2s ease-in-out';

  // Header
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'flex-start';
  header.style.gap = '14px';
  header.style.marginBottom = '16px';
  header.style.paddingBottom = '12px';
  header.style.borderBottom = '1px solid #333';

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
  textAndRefresh.style.gap = '6px';
  textAndRefresh.style.minWidth = '0';

  const displayName = document.createElement('div');
  displayName.style.fontWeight = '600';
  displayName.style.fontSize = '16px';
  displayName.style.color = '#fff';
  displayName.style.display = 'flex';
  displayName.style.alignItems = 'center';
  displayName.style.gap = '8px';
  displayName.style.lineHeight = '1.2';
  displayName.style.wordBreak = 'break-word';
  
  // Add verification badges
  const verificationBadges = document.createElement('div');
  verificationBadges.style.display = 'flex';
  verificationBadges.style.alignItems = 'center';
  verificationBadges.style.gap = '6px';
  verificationBadges.style.flexShrink = '0';
  
  // Blue verified indicator
  if (profile?.is_blue_verified) {
    const blueCheck = document.createElement('span');
    blueCheck.textContent = '✓';
    blueCheck.style.color = '#1d9bf0';
    blueCheck.style.fontSize = '18px';
    blueCheck.style.fontWeight = 'bold';
    blueCheck.style.cursor = 'help';
    verificationBadges.appendChild(blueCheck);
    createHoverTooltip(blueCheck, 'Blue Verified');
  }
  
  // Government/Business verification type
  const verificationType = profile?.verification?.verified_type;
  if (verificationType === 'Government') {
    const govBadge = document.createElement('span');
    govBadge.textContent = '🏛️';
    govBadge.style.fontSize = '16px';
    govBadge.style.cursor = 'help';
    verificationBadges.appendChild(govBadge);
    createHoverTooltip(govBadge, 'Government Verified');
  } else if (verificationType === 'Business') {
    const bizBadge = document.createElement('span');
    bizBadge.textContent = '🏢';
    bizBadge.style.fontSize = '16px';
    bizBadge.style.cursor = 'help';
    verificationBadges.appendChild(bizBadge);
    createHoverTooltip(bizBadge, 'Business Verified');
  }
  
  // Protected account indicator
  if (profile?.privacy?.protected) {
    const protectedBadge = document.createElement('span');
    protectedBadge.textContent = '🔒';
    protectedBadge.style.fontSize = '16px';
    protectedBadge.style.cursor = 'help';
    verificationBadges.appendChild(protectedBadge);
    createHoverTooltip(protectedBadge, 'Protected Account - Only approved followers can see tweets');
  }
  
  const nameText = document.createElement('span');
  nameText.textContent = profile?.core?.name || profile?.core?.screen_name || '';
  displayName.appendChild(nameText);
  displayName.appendChild(verificationBadges);

  const handle = document.createElement('div');
  handle.style.color = '#8a8a8a';
  handle.style.fontSize = '13px';
  handle.style.display = 'flex';
  handle.style.alignItems = 'center';
  handle.style.gap = '8px';
  handle.style.cursor = 'pointer';
  handle.style.transition = 'color 0.2s';
  
  const handleText = document.createElement('span');
  handleText.textContent = `@${profile?.core?.screen_name || ''}`;
  handle.appendChild(handleText);
  
  // Copy button for username
  const copyBtn = document.createElement('button');
  copyBtn.textContent = '📋';
  copyBtn.setAttribute('aria-label', 'Copy username to clipboard');
  copyBtn.style.border = 'none';
  copyBtn.style.background = 'transparent';
  copyBtn.style.cursor = 'pointer';
  copyBtn.style.fontSize = '14px';
  copyBtn.style.padding = '2px';
  copyBtn.style.borderRadius = '3px';
  copyBtn.style.color = '#666';
  copyBtn.style.transition = 'all 0.2s';
  copyBtn.style.display = 'flex';
  copyBtn.style.alignItems = 'center';
  copyBtn.style.justifyContent = 'center';
  copyBtn.addEventListener('mouseenter', () => { 
    copyBtn.style.color = '#1d9bf0';
    copyBtn.style.background = 'rgba(29, 155, 240, 0.1)';
  });
  copyBtn.addEventListener('mouseleave', () => { 
    copyBtn.style.color = '#666';
    copyBtn.style.background = 'transparent';
  });
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const username = profile?.core?.screen_name;
    if (username) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(username).then(() => {
          copyBtn.textContent = '✓';
          setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
        }).catch(err => {
          if (typeof logError === 'function') {
            logError('copyUsername', err);
          } else {
            console.error('Failed to copy username:', err);
          }
          // Fallback for clipboard API failure
          copyToClipboardFallback(username);
        });
      } else {
        // Fallback for browsers without clipboard API
        copyToClipboardFallback(username);
      }
    }
  });
  
  function copyToClipboardFallback(text) {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        copyBtn.textContent = '✓';
        setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
      } else {
        throw new Error('execCommand failed');
      }
    } catch (err) {
      if (typeof logError === 'function') {
        logError('copyUsernameFallback', err);
      } else {
        console.error('Failed to copy username (fallback):', err);
      }
    }
  }

  // Refresh button
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = '🔄';
  refreshBtn.setAttribute('aria-label', 'Refresh profile information');
  refreshBtn.style.border = 'none';
  refreshBtn.style.background = 'transparent';
  refreshBtn.style.cursor = 'pointer';
  refreshBtn.style.fontSize = '18px';
  refreshBtn.style.padding = '4px';
  refreshBtn.style.borderRadius = '4px';
  refreshBtn.style.color = '#8a8a8a';
  refreshBtn.style.transition = 'all 0.2s';
  refreshBtn.style.flex = '0 0 auto';
  refreshBtn.style.display = 'flex';
  refreshBtn.style.alignItems = 'center';
  refreshBtn.style.justifyContent = 'center';
  refreshBtn.addEventListener('mouseenter', () => { 
    refreshBtn.style.color = '#1d9bf0';
    refreshBtn.style.background = 'rgba(29, 155, 240, 0.1)';
    refreshBtn.style.transform = 'scale(1.1)';
  });
  refreshBtn.addEventListener('mouseleave', () => { 
    refreshBtn.style.color = '#8a8a8a';
    refreshBtn.style.background = 'transparent';
    refreshBtn.style.transform = 'scale(1)';
  });
  refreshBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!refreshInProgress[profile?.core?.screen_name]) {
      refreshBtn.style.animation = 'spin 1s linear infinite';
      refreshProfile(profile?.core?.screen_name).finally(() => {
        refreshBtn.style.animation = '';
      });
    }
  });
  createHoverTooltip(refreshBtn, 'Refresh profile information');
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

  // Details section with improved layout
  const detailsSection = document.createElement('div');
  detailsSection.style.marginTop = '16px';
  
  const sectionTitle = document.createElement('div');
  sectionTitle.style.fontSize = '12px';
  sectionTitle.style.color = '#999';
  sectionTitle.style.textTransform = 'uppercase';
  sectionTitle.style.letterSpacing = '0.8px';
  sectionTitle.style.marginBottom = '12px';
  sectionTitle.style.fontWeight = '600';
  sectionTitle.style.display = 'flex';
  sectionTitle.style.alignItems = 'center';
  sectionTitle.style.gap = '6px';
  sectionTitle.textContent = '📊 Account Details';
  detailsSection.appendChild(sectionTitle);
  
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1.5fr';
  grid.style.gap = `${GRID_GAP + 2}px ${GRID_COLUMN_GAP}px`;
  grid.style.marginBottom = '16px';
  grid.style.paddingBottom = '16px';
  grid.style.borderBottom = '1px solid #333';
  grid.style.alignItems = 'start';

  function addRow(label, value) {
    const l = document.createElement('div');
    l.style.fontSize = '11px';
    l.style.color = '#999';
    l.style.textTransform = 'uppercase';
    l.style.letterSpacing = '0.5px';
    l.style.fontWeight = '600';
    l.style.lineHeight = '1.4';
    l.textContent = label;

    const v = document.createElement('div');
    v.style.fontSize = '13px';
    v.style.color = '#e7e7e7';
    v.style.fontWeight = '500';
    v.style.wordBreak = 'break-word';
    v.style.lineHeight = '1.4';
    v.style.paddingTop = '2px';
    
    // Handle content safely - avoid XSS by using textContent for all values
    if (value && (value.includes('📍') || value.includes('⚠️'))) {
      // For emoji content, use textContent to preserve emojis safely
      v.textContent = value;
    } else {
      v.textContent = value || '-';
    }

    grid.appendChild(l);
    grid.appendChild(v);
    
    return { label: l, value: v };
  }

  // Location with accuracy indicator
  const location = profile?.about_profile?.account_based_in || profile?.about_profile?.source || '-';
  const locationAccurate = profile?.about_profile?.location_accurate;
  let locationText = location;
  let locationTitle = '';
  
  if (locationAccurate === true) {
    locationText = `📍 ${location}`;
    locationTitle = 'Precise location';
  } else if (locationAccurate === false) {
    locationText = `⚠️ ${location}`;
    locationTitle = 'Location may be inaccurate (VPN/Proxy detected)';
  }
  
  const locationRow = addRow('Location', locationText);
  if (locationTitle) {
    const valueCell = locationRow.value;
    if (valueCell) {
      valueCell.style.cursor = 'help';
      createHoverTooltip(valueCell, locationTitle);
    }
  }

  // Account age calculation
  let accountAge = '-';
  if (profile?.core?.created_at) {
    const parsed = Date.parse(profile.core.created_at);
    if (!isNaN(parsed)) {
      const createdDate = new Date(parsed);
      const now = new Date();
      const yearsDiff = (now - createdDate) / (1000 * 60 * 60 * 24 * 365.25);
      accountAge = yearsDiff >= 1 ? `${Math.floor(yearsDiff)} years` : 
                   yearsDiff >= 0.083 ? `${Math.floor(yearsDiff * 12)} months` : 
                   'Less than 1 month';
    }
  }
  addRow('Account Age', accountAge);

  let createdFormatted = '-';
  if (profile?.core?.created_at) {
    const parsed = Date.parse(profile.core.created_at);
    if (!isNaN(parsed)) {
      createdFormatted = new Date(parsed).toLocaleDateString();
    } else {
      // fallback to raw string trimmed safely
      try { createdFormatted = String(profile.core.created_at).substring(0, 10); } catch (e) { createdFormatted = '-'; }
    }
  }
  addRow('Created', createdFormatted);
  addRow('Source', profile?.about_profile?.source || '-');
  
  // Enhanced username changes with last changed date
  const usernameChanges = profile?.about_profile?.username_changes;
  let changeText = '-';
  if (usernameChanges?.count) {
    changeText = `${usernameChanges.count} time(s)`;
    if (usernameChanges.last_changed_at_msec) {
      const lastChanged = new Date(Number(usernameChanges.last_changed_at_msec)).toLocaleDateString();
      changeText += ` (last: ${lastChanged})`;
    }
  }
  addRow('Username Changes', changeText);
  
  const verifiedSince = profile?.verification_info?.reason?.verified_since_msec;
  let verifiedFormatted = '-';
  if (verifiedSince) {
    const timestamp = Number(verifiedSince);
    if (!isNaN(timestamp)) {
      verifiedFormatted = new Date(timestamp).toLocaleDateString();
    }
  }
  addRow('Verified', verifiedFormatted);

  detailsSection.appendChild(grid);
  container.appendChild(detailsSection);

  // Enhanced Affiliates section
  const affiliateSection = document.createElement('div');
  affiliateSection.style.marginTop = '0';
  affiliateSection.style.marginBottom = '12px';
  
  // Check for affiliate information from multiple sources
  const affiliateLabel = profile?.affiliates_highlighted_label?.label || 
                        profile?.identity_profile_labels_highlighted_label?.label;
  
  if (affiliateLabel?.description) {
    const affiliateContainer = document.createElement('div');
    affiliateContainer.style.display = 'flex';
    affiliateContainer.style.alignItems = 'center';
    affiliateContainer.style.gap = '10px';
    affiliateContainer.style.padding = '10px';
    affiliateContainer.style.background = 'rgba(29, 155, 240, 0.05)';
    affiliateContainer.style.border = '1px solid rgba(29, 155, 240, 0.2)';
    affiliateContainer.style.borderRadius = '6px';
    affiliateContainer.style.marginTop = '8px';
    
    // Affiliate badge image
    if (affiliateLabel.badge?.url) {
      const badgeImg = document.createElement('img');
      badgeImg.src = affiliateLabel.badge.url;
      badgeImg.alt = affiliateLabel.description;
      badgeImg.style.width = '24px';
      badgeImg.style.height = '24px';
      badgeImg.style.borderRadius = '4px';
      badgeImg.style.objectFit = 'cover';
      badgeImg.style.flexShrink = '0';
      badgeImg.onerror = () => { badgeImg.style.display = 'none'; };
      affiliateContainer.appendChild(badgeImg);
    }
    
    // Affiliate text with link
    const affiliateText = document.createElement('div');
    affiliateText.style.flex = '1';
    
    const affiliateLabelType = affiliateLabel.userLabelType || 'Affiliation';
    const typeIcon = affiliateLabelType === 'BusinessLabel' ? '🏢' : 
                    affiliateLabelType === 'GovernmentLabel' ? '🏛️' : '🏢';
    
    const labelText = document.createElement('div');
    labelText.style.fontSize = '11px';
    labelText.style.color = '#1d9bf0';
    labelText.style.textTransform = 'uppercase';
    labelText.style.letterSpacing = '0.5px';
    labelText.style.fontWeight = '600';
    labelText.textContent = typeIcon + ' ' + affiliateLabelType.replace('Label', '');
    
    const affiliateLink = document.createElement('a');
    const url = affiliateLabel.url?.url;
    affiliateLink.href = (url && url.startsWith('https://')) ? url : '#';
    affiliateLink.target = '_blank';
    affiliateLink.rel = 'noopener noreferrer';
    affiliateLink.style.color = '#e7e7e7';
    affiliateLink.style.textDecoration = 'none';
    affiliateLink.style.fontSize = '13px';
    affiliateLink.style.fontWeight = '500';
    affiliateLink.style.lineHeight = '1.3';
    affiliateLink.style.wordBreak = 'break-word';
    affiliateLink.textContent = affiliateLabel.description;
    affiliateLink.onmouseenter = () => { 
      affiliateLink.style.textDecoration = 'underline';
      affiliateLink.style.color = '#1d9bf0';
    };
    affiliateLink.onmouseleave = () => { 
      affiliateLink.style.textDecoration = 'none';
      affiliateLink.style.color = '#e7e7e7';
    };
    
    affiliateText.appendChild(labelText);
    affiliateText.appendChild(affiliateLink);
    affiliateContainer.appendChild(affiliateText);
    
    affiliateSection.appendChild(affiliateContainer);
  }
  
  // Show affiliate username if available
  const affiliateUsername = profile?.about_profile?.affiliate_username;
  if (affiliateUsername) {
    const affiliateUser = document.createElement('div');
    affiliateUser.style.fontSize = '12px';
    affiliateUser.style.color = '#999';
    affiliateUser.style.marginTop = '8px';
    affiliateUser.style.padding = '6px 10px';
    affiliateUser.style.background = 'rgba(0, 0, 0, 0.2)';
    affiliateUser.style.borderRadius = '4px';
    affiliateUser.style.display = 'flex';
    affiliateUser.style.alignItems = 'center';
    affiliateUser.style.gap = '6px';
    
    affiliateUser.appendChild(document.createTextNode('🔗'));
    
    const affiliateLink = document.createElement('a');
    affiliateLink.href = affiliateUsername ? `https://twitter.com/${encodeURIComponent(affiliateUsername)}` : '#';
    affiliateLink.target = '_blank';
    affiliateLink.rel = 'noopener noreferrer';
    affiliateLink.style.color = '#1d9bf0';
    affiliateLink.style.textDecoration = 'none';
    affiliateLink.style.fontSize = '12px';
    affiliateLink.style.fontWeight = '500';
    affiliateLink.textContent = `@${affiliateUsername}`;
    affiliateLink.onmouseenter = () => { affiliateLink.style.textDecoration = 'underline'; };
    affiliateLink.onmouseleave = () => { affiliateLink.style.textDecoration = 'none'; };
    
    affiliateUser.appendChild(document.createTextNode('Affiliated with: '));
    affiliateUser.appendChild(affiliateLink);
    affiliateSection.appendChild(affiliateUser);
  }
  
  if (affiliateSection.children.length > 0) {
    container.appendChild(affiliateSection);
  }

  // Footer with actions and hint
  const footer = document.createElement('div');
  footer.style.marginTop = '16px';
  footer.style.paddingTop = '12px';
  footer.style.borderTop = '1px solid #333';
  footer.style.display = 'flex';
  footer.style.justifyContent = 'space-between';
  footer.style.alignItems = 'center';
  
  // Action buttons
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '10px';
  
  // Profile link button
  if (screenName) {
    const profileBtn = document.createElement('button');
    profileBtn.textContent = '👤 Profile';
    profileBtn.title = 'Open full profile';
    profileBtn.setAttribute('aria-label', 'Open full Twitter profile');
    profileBtn.style.border = '1px solid #333';
    profileBtn.style.background = 'transparent';
    profileBtn.style.color = '#1d9bf0';
    profileBtn.style.cursor = 'pointer';
    profileBtn.style.fontSize = '11px';
    profileBtn.style.padding = '6px 12px';
    profileBtn.style.borderRadius = '6px';
    profileBtn.style.transition = 'all 0.2s';
    profileBtn.style.fontWeight = '600';
    profileBtn.style.letterSpacing = '0.3px';
    profileBtn.addEventListener('mouseenter', () => { 
      profileBtn.style.backgroundColor = '#1d9bf0'; 
      profileBtn.style.color = '#fff';
      profileBtn.style.borderColor = '#1d9bf0';
      profileBtn.style.transform = 'translateY(-1px)';
      profileBtn.style.boxShadow = '0 2px 8px rgba(29, 155, 240, 0.3)';
    });
    profileBtn.addEventListener('mouseleave', () => { 
      profileBtn.style.backgroundColor = 'transparent'; 
      profileBtn.style.color = '#1d9bf0';
      profileBtn.style.borderColor = '#333';
      profileBtn.style.transform = 'translateY(0)';
      profileBtn.style.boxShadow = 'none';
    });
    profileBtn.addEventListener('click', () => {
      window.open(`https://twitter.com/${screenName}`, '_blank', 'noopener,noreferrer');
    });
    actions.appendChild(profileBtn);
  }
  
  footer.appendChild(actions);
  
  // Close hint
  const hint = document.createElement('div');
  hint.style.fontSize = '10px';
  hint.style.color = '#666';
  hint.style.textAlign = 'right';
  hint.style.fontWeight = '500';
  hint.style.letterSpacing = '0.3px';
  hint.style.display = 'flex';
  hint.style.alignItems = 'center';
  hint.style.gap = '4px';
  hint.textContent = '⌨️ ESC to close';
  footer.appendChild(hint);
  
  container.appendChild(footer);

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
    try { 
      currentTooltip.remove(); 
    } catch (e) {
      if (typeof logError === 'function') {
        logError('hideProfileTooltip', e);
      }
    }
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
  if (typeof logError === 'function') {
    logError('windowAssignment', e);
  }
}
