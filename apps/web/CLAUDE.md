# CLAUDE.md - Web Application

This folder contains the React web application for the Noah media asset management platform.

## Overview
Modern React 18 application with TypeScript, featuring a professional media browser, video player, and comprehensive asset management UI.

## Tech Stack
- **React 18** with TypeScript
- **Vite** for build tooling and dev server
- **Tailwind CSS** for styling
- **Zustand** for state management
- **Framer Motion** for animations
- **Axios** for API calls
- **React Router** for navigation

## Key Files & Folders

### Entry Points
- `src/main.tsx` - Application entry point
- `src/App.tsx` - Main app component with routing
- `index.html` - HTML template

### Pages
- `src/pages/MediaBrowser.tsx` - Main media library interface
- `src/pages/AuthPage.tsx` - Login/register with MFA support
- `src/pages/Settings.tsx` - User and system settings
- `src/pages/VideoPlayerDemo.tsx` - Professional video player demo

### Components
- `src/components/media/` - Media-specific components
- `src/components/MediaViewer.tsx` - Modal for viewing media details
- `src/components/VideoPlayer.tsx` - Basic video player
- `src/components/ProfessionalVideoPlayer.tsx` - Advanced player with controls
- `src/components/Sidebar.tsx` - Navigation sidebar
- `src/components/Navbar.tsx` - Top navigation bar

### State Management
- `src/stores/authStore.ts` - Authentication state
- `src/stores/mediaStore.ts` - Media assets and operations
- `src/stores/notificationStore.ts` - Toast notifications

## Development

### Setup
```bash
# Install dependencies
npm install

# Start dev server (port 3002)
npm run dev

# Build for production
npm run build
```

### Environment Variables
Create `.env` file:
```env
# Leave empty to use Vite proxy (recommended)
VITE_API_URL=

# Or set explicit URL
# VITE_API_URL=http://localhost:3000/api
```

## Configuration

### Vite Config (`vite.config.ts`)
- Dev server runs on port 3002
- Proxies `/api` and `/uploads` to port 3000 (API server)
- Code splitting configured for optimization

### Proxy Setup
The app uses Vite's proxy to avoid CORS issues:
- `/api/*` → `http://localhost:3000/api/*`
- `/uploads/*` → `http://localhost:3000/uploads/*`

## Key Features

### Media Browser
- Grid and list view modes
- Advanced filtering and search
- Bulk operations (select, delete)
- Real-time collaboration indicators
- Drag-and-drop upload support

### Authentication
- JWT-based auth with refresh tokens
- MFA/2FA support with TOTP
- Session management
- Password reset flow

### Media Display
- Automatic thumbnail generation
- Video preview on hover
- Fallback icons for failed loads
- Support for images, videos, audio, documents

## API Integration

### Media Store (`mediaStore.ts`)
```typescript
// Fetches from /api/media (proxied to port 3000)
fetchAssets()
uploadFiles(files, options)
deleteAssets(assetIds)
updateAsset(assetId, updates)
```

### Response Handling
The store handles both enhanced media server format:
```json
{
  "success": true,
  "assets": [...],
  "count": 10
}
```

## Styling
- Tailwind CSS with custom configuration
- Gradient backgrounds and glass morphism effects
- Responsive design with mobile support
- Dark mode ready (partial implementation)

## Testing
```bash
# Run tests
npm test

# With coverage
npm run test:coverage
```

## Common Issues

### Assets Not Loading
1. Check API server is running on port 3000
2. Verify proxy configuration in `vite.config.ts`
3. Check browser console for errors
4. Ensure `.env` has correct or empty `VITE_API_URL`

### CORS Errors
- Use the Vite dev server (port 3002) which proxies requests
- Don't access the API directly from browser

### Build Issues
- Clear `.vite` cache: `rm -rf .vite`
- Reinstall dependencies: `rm -rf node_modules && npm install`

## Production Build
```bash
# Build
npm run build

# Preview production build
npm run preview

# Serve with nginx (see nginx.conf)
docker build -t noah-web .
```

## Development Tips
- Use React DevTools for debugging
- Enable Zustand DevTools for state inspection
- Check Network tab for API calls
- Use `console.log` statements in mediaStore for debugging

## In-page Media Viewer Refactor (August 11, 2025)

### Architecture Changes
This refactor replaced the modal-based media viewing experience with a seamless in-page viewer:

- **Removed modal viewers**: The modal-based `MediaViewer` and `MediaPreviewModal` components are no longer used for primary viewing
- **Created in-page viewer**: New `InPageMediaViewer` component provides a full-screen viewing experience
- **Split-panel layout**: Media content displays on the left (70%) with a details panel on the right (30%)
- **Direct integration**: `EnhancedProfessionalVideoPlayer` is now embedded directly in the page

### New Components

#### `InPageMediaViewer.tsx`
- Main viewer component that replaces the entire browser view when an asset is selected
- Handles all media types (video, image, audio, documents)
- Includes header bar with back navigation and action buttons
- Split layout with media display and details panel

#### `DetailsPanel.tsx`
- Side panel component with two tabs: "Details" and "Comments & Annotations"
- Details tab displays:
  - Basic file information (name, size, type, duration)
  - Technical metadata (dimensions, codec, bitrate, FPS)
  - Tags and compression status
- Comments tab includes:
  - Comment thread with replies
  - Add comment functionality
  - Mock data for demonstration

### Modified Files

#### `MediaBrowser.tsx`
- Changed state from `viewingAsset` to `selectedAsset`
- Added conditional rendering: shows `InPageMediaViewer` when asset is selected
- Removed modal-based `MediaViewer` component and escape key handling
- Integrated `VideoThumbnail` component for video assets in grid view

#### Integration Updates
- `VideoThumbnail` component now generates canvas-based thumbnails for all videos
- `EnhancedProfessionalVideoPlayer` receives proper props from `InPageMediaViewer`
- Mock annotation handlers log to console for demonstration

### User Workflow
1. User browses media in grid/list view
2. Clicking any asset opens the in-page viewer
3. Media displays with appropriate player/viewer based on type
4. Details panel shows metadata and comments
5. "Back to Browser" button returns to grid view

### Deprecated Components
- `MediaViewer` component (modal-based)
- `MediaPreviewModal` components (all variants)

### Benefits
- No modal overlays blocking the interface
- Professional desktop-application experience
- Always-visible context with details panel
- Seamless navigation between browser and viewer
- Better use of screen real estate