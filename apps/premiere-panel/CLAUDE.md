# CLAUDE.md - Adobe Premiere Pro Extension

This folder contains the Adobe Premiere Pro CEP extension for direct integration with Noah.

## Overview
Native Premiere Pro panel allowing editors to browse, import, and manage Noah media assets directly within their editing workflow.

## Tech Stack
- **CEP (Common Extensibility Platform)** - Adobe's extension framework
- **ExtendScript** - Adobe's JavaScript dialect for app automation
- **React** - Panel UI
- **Node.js** - Backend operations in CEP

## Structure
```
CSXS/
├── manifest.xml        # Extension configuration
└── debug.xml          # Debug settings

src/
├── index.html         # Panel HTML
├── index.tsx          # React entry point
├── jsx/               # ExtendScript files
│   ├── premiere.jsx   # Premiere API calls
│   └── utils.jsx      # Helper functions
└── components/        # React components
```

## Key Features
- Browse Noah media library within Premiere
- Direct import to project bins
- Proxy/original quality toggle
- Metadata sync
- Collaborative markers
- Version control integration
- Auto-sync project assets

## Installation

### Development
1. Enable debug mode in Premiere
2. Copy extension to CEP folder:
   - Windows: `C:\Program Files\Common Files\Adobe\CEP\extensions\`
   - Mac: `/Library/Application Support/Adobe/CEP/extensions/`
3. Set debug flag in registry/plist
4. Restart Premiere Pro

### Production
1. Build and sign with Adobe certificate
2. Package as ZXP file
3. Install via Adobe Extension Manager

## CEP APIs Used

### Premiere Integration
```javascript
// Import media to project
app.project.importFiles(['/path/to/media.mp4']);

// Create sequence from clips
app.project.activeSequence.videoTracks[0].insertClip(clip, time);

// Export frame
app.project.activeSequence.exportFramePNG(time, outputPath);
```

### Communication with Host
```javascript
// Call ExtendScript from JS
CSInterface.evalScript('premierePro.getActiveSequence()', callback);

// Listen for Premiere events
CSInterface.addEventListener('com.adobe.csxs.events.TimelineChanged', handler);
```

## Panel UI Components
- Media browser with search
- Asset preview player
- Metadata inspector
- Upload progress tracker
- Project sync status
- User collaboration presence

## Configuration
```xml
<!-- manifest.xml -->
<Extension Id="com.noah.premiere" Version="1.0.0">
  <HostList>
    <Host Name="PPRO" Version="[14.0,99.9]" />
  </HostList>
</Extension>
```

## Building
```bash
# Development build
npm run build:dev

# Production build with signing
npm run build:prod
npm run sign -- certificate.p12 password

# Package as ZXP
npm run package
```

## API Integration
Panel connects to Noah API:
```typescript
// Authenticate
const token = await noahAPI.authenticate(email, password);

// Fetch media
const assets = await noahAPI.getAssets({
  projectId: getCurrentProjectId()
});

// Import to Premiere
assets.forEach(asset => {
  importToProject(asset.proxyUrl || asset.url);
});
```

## Debugging
1. Open Chrome DevTools at `http://localhost:9229`
2. Set breakpoints in panel code
3. Use `$.writeln()` for ExtendScript logs
4. Check CEP logs in system folders

## Common Issues

### Panel Not Showing
- Check manifest.xml version compatibility
- Verify debug mode is enabled
- Clear CEP cache

### Import Failures
- Verify file paths are accessible
- Check codec compatibility
- Ensure proper permissions

### Performance
- Use proxy files for preview
- Implement pagination for large libraries
- Cache metadata locally