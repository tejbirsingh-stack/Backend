# Troubleshooting Media Not Showing

## Issue
After login, the media browser doesn't show any B2 files even though the API is working.

## Quick Checks

### 1. Check Browser Console (F12)
Open DevTools in your browser and check the Console tab for:
- API requests to `/api/media`
- What `source` parameter is being sent
- Any error messages

### 2. Check Network Tab
Open DevTools > Network tab:
- Look for requests to `/api/media`
- Check the response - does it have assets?
- Check the request params - what's the `source` value?

### 3. Manual API Test
Open this URL in your browser while logged in:
```
https://noah-production-e15c.up.railway.app/api/media?source=b2
```

You should see JSON with 633 assets.

## Common Fixes

### Fix 1: Storage Source Setting
The media store defaults to `storageSource: 'all'` which should work, but you can try:

1. Click the dropdown that says "📁 All Storage"
2. Select "☁️ B2 Cloud"
3. Click the Refresh button

### Fix 2: Force Refresh
1. Click the "Refresh" button in the media browser
2. Check browser console for API calls

### Fix 3: Clear Browser Cache
1. Press Ctrl+Shift+Delete (or Cmd+Shift+Delete on Mac)
2. Clear cached images and files
3. Reload the page

## Debug Information to Provide

If still not working, please provide:
1. Screenshot of browser Console tab (F12)
2. Screenshot of Network tab showing `/api/media` request
3. What you see in the media browser (blank? loading? error?)

## Expected Behavior
- On login, should call `/api/media?source=all`
- Should receive 633 assets from B2
- Should display 9 videos and 2 folders in grid view
