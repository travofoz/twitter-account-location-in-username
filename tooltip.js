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
  displayName.style.display = 'flex';
  displayName.style.alignItems = 'center';
  displayName.style.gap = '6px';
  
  // Add verification badges
  const verificationBadges = document.createElement('div');
  verificationBadges.style.display = 'flex';
  verificationBadges.style.alignItems = 'center';
  verificationBadges.style.gap = '4px';
  
  // Blue verified indicator
  if (profile?.is_blue_verified) {
    const blueCheck = document.createElement('span');
    blueCheck.textContent = '✓';
    blueCheck.style.color = '#1d9bf0';
    blueCheck.style.fontSize = '16px';
    blueCheck.style.fontWeight = 'bold';
    blueCheck.title = 'Blue Verified';
    verificationBadges.appendChild(blueCheck);
  }
  
  // Government/Business verification type
  const verificationType = profile?.verification?.verified_type;
  if (verificationType === 'Government') {
    const govBadge = document.createElement('span');
    govBadge.textContent = '🏛️';
    govBadge.title = 'Government Verified';
    govBadge.style.fontSize = '14px';
    verificationBadges.appendChild(govBadge);
  } else if (verificationType === 'Business') {
    const bizBadge = document.createElement('span');
    bizBadge.textContent = '🏢';
    bizBadge.title = 'Business Verified';
    bizBadge.style.fontSize = '14px';
    verificationBadges.appendChild(bizBadge);
  }
  
  // Protected account indicator
  if (profile?.privacy?.protected) {
    const protectedBadge = document.createElement('span');
    protectedBadge.textContent = '🔒';
    protectedBadge.title = 'Protected Account';
    protectedBadge.style.fontSize = '14px';
    verificationBadges.appendChild(protectedBadge);
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
  handle.style.gap = '6px';
  handle.style.cursor = 'pointer';
  
  const handleText = document.createElement('span');
  handleText.textContent = `@${profile?.core?.screen_name || ''}`;
  handle.appendChild(handleText);
  
  // Copy button for username
  const copyBtn = document.createElement('button');
  copyBtn.textContent = '📋';
  copyBtn.title = 'Copy username';
  copyBtn.setAttribute('aria-label', 'Copy username to clipboard');
  copyBtn.style.border = 'none';
  copyBtn.style.background = 'transparent';
  copyBtn.style.cursor = 'pointer';
  copyBtn.style.fontSize = '12px';
  copyBtn.style.padding = '0';
  copyBtn.style.color = '#666';
  copyBtn.style.transition = 'color 0.2s';
  copyBtn.addEventListener('mouseenter', () => { copyBtn.style.color = '#1d9bf0'; });
  copyBtn.addEventListener('mouseleave', () => { copyBtn.style.color = '#666'; });
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const username = profile?.core?.screen_name;
    if (username) {
      navigator.clipboard.writeText(username).then(() => {
        copyBtn.textContent = '✓';
        setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
      }).catch(err => {
        if (typeof logError === 'function') {
          logError('copyUsername', err);
        } else {
          console.error('Failed to copy username:', err);
        }
      });
    }
  });
  handle.appendChild(copyBtn);

  textAndRefresh.appendChild(displayName);
  textAndRefresh.appendChild(handle);

  // Refresh button
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = '🔄';
  refreshBtn.title = 'Refresh profile';
  refreshBtn.setAttribute('aria-label', 'Refresh profile information');
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

  // Details section with improved layout
  const detailsSection = document.createElement('div');
  detailsSection.style.marginTop = '12px';
  
  const sectionTitle = document.createElement('div');
  sectionTitle.style.fontSize = '11px';
  sectionTitle.style.color = '#666';
  sectionTitle.style.textTransform = 'uppercase';
  sectionTitle.style.letterSpacing = '0.5px';
  sectionTitle.style.marginBottom = '8px';
  sectionTitle.style.fontWeight = '600';
  sectionTitle.textContent = 'Account Details';
  detailsSection.appendChild(sectionTitle);
  
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1fr';
  grid.style.gap = `${GRID_GAP}px ${GRID_COLUMN_GAP}px`;
  grid.style.marginBottom = '12px';
  grid.style.paddingBottom = '12px';
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
    v.style.lineHeight = '1.3';
    
    // Handle HTML content for values with icons/links - sanitize for security
    if (value && (value.includes('📍') || value.includes('<a'))) {
      // Only allow specific safe HTML patterns
      if (value.includes('<a')) {
        // Create a temporary element to safely parse the HTML
        const temp = document.createElement('div');
        temp.innerHTML = value;
        // Only keep anchor tags with safe attributes
        const links = temp.querySelectorAll('a');
        links.forEach(link => {
          // Ensure href starts with https://twitter.com/ or is safe
          if (link.href && !link.href.startsWith('https://twitter.com/')) {
            link.href = '#';
            link.removeAttribute('target');
            link.removeAttribute('rel');
          }
        });
        v.innerHTML = temp.innerHTML;
      } else {
        // For emoji-only content, use textContent
        v.textContent = value;
      }
    } else {
      v.textContent = value || '-';
    }

    grid.appendChild(l);
    grid.appendChild(v);
  }

  // Location with accuracy indicator
  const location = profile?.about_profile?.account_based_in || profile?.about_profile?.source || '-';
  const locationAccurate = profile?.about_profile?.location_accurate;
  const locationText = locationAccurate === true ? `📍 ${location}` : 
                      locationAccurate === false ? `📍‍🗺️ ${location}` : 
                      location;
  addRow('Location', locationText);

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
  affiliateSection.style.marginBottom = '8px';
  
  // Check for affiliate information from multiple sources
  const affiliateLabel = profile?.affiliates_highlighted_label?.label || 
                        profile?.identity_profile_labels_highlighted_label?.label;
  
  if (affiliateLabel?.description) {
    const affiliateContainer = document.createElement('div');
    affiliateContainer.style.display = 'flex';
    affiliateContainer.style.alignItems = 'center';
    affiliateContainer.style.gap = '8px';
    affiliateContainer.style.padding = '6px 0';
    affiliateContainer.style.borderTop = '1px solid #333';
    affiliateContainer.style.borderBottom = '1px solid #333';
    affiliateContainer.style.marginTop = '8px';
    
    // Affiliate badge image
    if (affiliateLabel.badge?.url) {
      const badgeImg = document.createElement('img');
      badgeImg.src = affiliateLabel.badge.url;
      badgeImg.alt = affiliateLabel.description;
      badgeImg.style.width = '20px';
      badgeImg.style.height = '20px';
      badgeImg.style.borderRadius = '4px';
      badgeImg.style.objectFit = 'cover';
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
    labelText.style.color = '#8a8a8a';
    labelText.style.textTransform = 'uppercase';
    labelText.style.letterSpacing = '0.5px';
    labelText.textContent = typeIcon + ' ' + affiliateLabelType.replace('Label', '');
    
    const affiliateLink = document.createElement('a');
    affiliateLink.href = affiliateLabel.url?.url || '#';
    affiliateLink.target = '_blank';
    affiliateLink.rel = 'noopener noreferrer';
    affiliateLink.style.color = '#1d9bf0';
    affiliateLink.style.textDecoration = 'none';
    affiliateLink.style.fontSize = '13px';
    affiliateLink.style.fontWeight = '500';
    affiliateLink.textContent = affiliateLabel.description;
    affiliateLink.onmouseenter = () => { affiliateLink.style.textDecoration = 'underline'; };
    affiliateLink.onmouseleave = () => { affiliateLink.style.textDecoration = 'none'; };
    
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
    affiliateUser.style.color = '#a0a0a0';
    affiliateUser.style.marginTop = '4px';
    const affiliateLink = document.createElement('a');
    affiliateLink.href = `https://twitter.com/${affiliateUsername}`;
    affiliateLink.target = '_blank';
    affiliateLink.rel = 'noopener noreferrer';
    affiliateLink.style.color = '#1d9bf0';
    affiliateLink.style.textDecoration = 'none';
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
  footer.style.marginTop = '12px';
  footer.style.paddingTop = '8px';
  footer.style.borderTop = '1px solid #333';
  footer.style.display = 'flex';
  footer.style.justifyContent = 'space-between';
  footer.style.alignItems = 'center';
  
  // Action buttons
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  
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
    profileBtn.style.padding = '4px 8px';
    profileBtn.style.borderRadius = '4px';
    profileBtn.style.transition = 'background-color 0.2s, border-color 0.2s';
    profileBtn.addEventListener('mouseenter', () => { 
      profileBtn.style.backgroundColor = '#1d9bf0'; 
      profileBtn.style.color = '#fff';
      profileBtn.style.borderColor = '#1d9bf0';
    });
    profileBtn.addEventListener('mouseleave', () => { 
      profileBtn.style.backgroundColor = 'transparent'; 
      profileBtn.style.color = '#1d9bf0';
      profileBtn.style.borderColor = '#333';
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
  hint.textContent = 'ESC to close';
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
