# Twitter Account Location Flag Chrome Extension

A Chrome extension that displays country flag emojis next to Twitter/X usernames based on the account's location information.

## Fork Attribution

This is a fork of the original work by [Rhys Sullivan](https://github.com/RhysSullivan/twitter-account-location-in-username). The original repository provides the core functionality, while this fork adds significant enhancements to the user interface and user experience.

## Enhanced Features

### Core Functionality
- Automatically detects usernames on Twitter/X pages
- Queries Twitter's GraphQL API to get account location information
- Displays the corresponding country flag emoji next to usernames
- Works with dynamically loaded content (infinite scroll)
- Caches location data to minimize API calls

### 🆕 Enhanced Tooltip System
- **Improved Visual Design**: Modern, polished tooltip with better spacing and typography
- **Hover Tooltips**: All interactive icons now have explanatory tooltips on hover
- **Better Visual Hierarchy**: Clear separation between different information sections
- **Enhanced Button Styling**: Smooth hover effects and visual feedback
- **Location Accuracy Indicators**: 
  - 📍 for precise location
  - ⚠️ for potentially inaccurate location (VPN/Proxy detected)
- **Responsive Design**: Better handling of different content lengths
- **Accessibility**: Proper ARIA labels and keyboard navigation support

### 🆕 User Experience Improvements
- **Copy Username**: Click 📋 to copy username to clipboard
- **Refresh Profile**: Click 🔄 to refresh profile information
- **Enhanced Verification Badges**: Clear indicators for Blue Verified, Government, and Business accounts
- **Affiliate Information**: Better presentation of affiliated accounts and organizations
- **Smooth Animations**: Subtle transitions and micro-interactions throughout

## Features

- Automatically detects usernames on Twitter/X pages
- Queries Twitter's GraphQL API to get account location information
- Displays the corresponding country flag emoji next to usernames
- Works with dynamically loaded content (infinite scroll)
- Caches location data to minimize API calls

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top right corner - it's a switch labeled "Developer mode")
4. Click "Load unpacked" button that appears
5. Select the directory containing this extension
6. The extension will now be active on Twitter/X pages

**Note**: If you're new to Chrome extensions, "Developer mode" is a toggle switch in the top right corner of the `chrome://extensions/` page that enables loading unpacked extensions.





## Usage

- Click globe icon next to usernames to fetch location data
- Click flag that appears to open enhanced profile tooltip
- Click icons in tooltips for additional actions:
  - 📋 Copy username to clipboard
  - 🔄 Refresh profile information
  - 👤 Open full profile
- Location indicators show accuracy:
  - 📍 Precise location
  - ⚠️ May be inaccurate (VPN/Proxy detected)

## How It Works

1. The extension runs a content script on all Twitter/X pages
2. It identifies username elements in tweets and user profiles
3. For each username, it queries Twitter's GraphQL API endpoint (`AboutAccountQuery`) to get the account's location
4. The location is mapped to a flag emoji using the country flags mapping
5. The flag emoji is displayed next to the username

## Files

- `manifest.json` - Chrome extension configuration (Manifest V3)
- `content.js` - Main content script that processes the page and injects page scripts for API calls
- `tooltip.js` - Enhanced tooltip rendering with improved visual design and hover interactions
- `ui.js` - User interface management and user interactions
- `api.js` - API communication and error handling
- `cache.js` - Data caching and performance optimization
- `countryFlags.js` - Country name to flag emoji mapping
- `popup.html/js` - Extension popup interface
- `LICENSE.md` - MIT License
- `AGENTS.md` - Development guidelines and code style
- `README.md` - This file

## Technical Details

The extension uses a page script injection approach to make API requests. This allows it to:
- Access the same cookies and authentication as the logged-in user
- Make same-origin requests to Twitter's API without CORS issues
- Work seamlessly with Twitter's authentication system

The content script injects a script into the page context that listens for location fetch requests. When a username is detected, the content script sends a custom event to the page script, which makes the API request and returns the location data.

## API Endpoint

The extension uses Twitter's GraphQL API endpoint:
```
https://x.com/i/api/graphql/XRqGa7EeokUU5kppkh13EA/AboutAccountQuery
```

With variables:
```json
{
  "screenName": "username"
}
```

The response contains `account_based_in` field in:
```
data.user_result_by_screen_name.result.about_profile.account_based_in
```

## Limitations

- Requires the user to be logged into Twitter/X
- Only works for accounts that have location information available
- Country names must match the mapping in `countryFlags.js` (case-insensitive)
- Rate limiting may apply if making too many requests

## Privacy

- The extension only queries public account information
- No data is stored or transmitted to third-party servers
- All API requests are made directly to Twitter/X servers
- Location data is cached locally in memory

## Troubleshooting

If flags are not appearing:
1. Make sure you're logged into Twitter/X
2. Check the browser console for any error messages
3. Verify that the account has location information available
4. Try refreshing the page

If tooltips are not working:
1. Check that JavaScript is enabled
2. Check browser console for JavaScript errors
3. Ensure no other extensions are interfering



## Contributing

Contributions to this fork are welcome! Please:
1. Follow the development guidelines in `AGENTS.md`
2. Add appropriate attribution for new features
3. Test with the provided test files
4. Maintain the existing code style and documentation

## License

MIT License

See `LICENSE.md` for full license text.

