# AGENTS.md - Development Guidelines

## Build/Test Commands
This is a Chrome extension - no build system. Load via `chrome://extensions/` → "Load unpacked".
- Test: Open `test_fix.html` in browser for isolated component testing
- Debug: Use Chrome DevTools on extension popup and Twitter pages
- Lint: No formal linting configured - follow JSDoc patterns in existing code

## Code Style Guidelines

### Imports & Module Structure
- No ES6 imports - Chrome Extension Manifest V3 loads scripts via manifest.json in order
- Modules expose functions via `window.functionName = functionName` pattern
- Wrap window assignments in try/catch for content script safety
- Order in manifest: countryFlags.js, cache.js, api.js, tooltip.js, ui.js, content.js

### Formatting & Types
- Use JSDoc comments with @fileoverview, @module, @param, @returns
- Constants: UPPER_SNAKE_CASE with @constant JSDoc
- Variables: camelCase with @type JSDoc for complex types
- Functions: camelCase, comprehensive JSDoc with parameter types
- Use strict equality (===/!==) always

### Naming Conventions
- Functions: camelCase (addFlagToUsername, getUserLocation)
- Constants: UPPER_SNAKE_CASE (MIN_REQUEST_INTERVAL, MAX_CACHE_SIZE)
- DOM data attributes: kebab-case with prefix (data-twitter-location-flag)
- Event handlers: descriptive (clickHandler, handleRateLimitInfo)

### Error Handling
- Use structured logError(context, error, severity) function from api.js
- Never silent catch - always log with context
- Validate inputs at function boundaries (Element checks, string non-empty)
- Use try/catch for DOM operations and external API calls

### Chrome Extension Patterns
- Use chrome.storage.local.get/set for persistence
- Message passing: chrome.runtime.onMessage for popup↔content communication
- Content scripts: inject page scripts for same-origin API access
- MutationObserver with debouncing for dynamic content
- Cleanup on beforeunload and extension disable

### Performance Guidelines
- Debounce MutationObserver (300ms) and user interactions (500ms)
- Use Map/Set for O(1) lookups instead of arrays/includes()
- Implement LRU cache eviction (max 500 entries)
- Deduplicate API requests for same username
- Track metrics for debugging (window.metrics)

### Security & Privacy
- No external dependencies - all code self-contained
- Only access Twitter/X domains via host_permissions
- Cache data in memory only, cleared on browser close
- No telemetry or data transmission to external servers