# CLAUDE.md - Mobile Application

This folder contains the React Native mobile app for iOS and Android.

## Overview
Native mobile application providing on-the-go access to Noah media assets with offline support and mobile-optimized features.

## Tech Stack
- **React Native** - Cross-platform framework
- **TypeScript** - Type safety
- **React Navigation** - Navigation
- **React Query** - Data fetching and caching
- **AsyncStorage** - Local storage
- **Expo** (optional) - Development tools

## Structure
```
src/
├── screens/          # Screen components
├── components/       # Reusable components
├── navigation/       # Navigation configuration
├── services/         # API and native services
├── stores/          # State management
└── utils/           # Utilities

ios/                 # iOS native code
android/             # Android native code
```

## Key Features
- Media browsing with offline cache
- Mobile upload with background processing
- Push notifications
- Biometric authentication
- Download for offline viewing
- Share to social media
- Camera integration
- Location tagging

## Screens
- **Login** - Email/password with biometric option
- **Media Grid** - Responsive media browser
- **Media Viewer** - Full-screen preview with gestures
- **Upload** - Camera capture and file selection
- **Profile** - Settings and account management
- **Downloads** - Offline media management

## Setup

### Development
```bash
# Install dependencies
npm install

# iOS setup
cd ios && pod install

# Run on iOS
npm run ios

# Run on Android
npm run android

# Start Metro bundler
npm start
```

### Building

#### iOS
```bash
# Development build
npm run ios:build:dev

# Production build
npm run ios:build:prod

# Archive for App Store
xcodebuild archive -scheme Noah
```

#### Android
```bash
# Debug APK
cd android && ./gradlew assembleDebug

# Release APK
cd android && ./gradlew assembleRelease

# Bundle for Play Store
cd android && ./gradlew bundleRelease
```

## Native Modules

### Camera Integration
```typescript
import { launchCamera } from 'react-native-image-picker';

const result = await launchCamera({
  mediaType: 'mixed',
  quality: 0.8,
  videoQuality: 'high'
});
```

### Biometric Auth
```typescript
import TouchID from 'react-native-touch-id';

const biometryType = await TouchID.isSupported();
const authenticated = await TouchID.authenticate('Access Noah');
```

### Background Upload
```typescript
import BackgroundUpload from 'react-native-background-upload';

BackgroundUpload.startUpload({
  url: 'https://api.noah.com/upload',
  path: localFilePath,
  headers: { Authorization: token }
});
```

## State Management
Using Zustand for state:
```typescript
const useMediaStore = create((set) => ({
  media: [],
  fetchMedia: async () => {
    const data = await api.getMedia();
    set({ media: data });
  }
}));
```

## Offline Support
- SQLite for metadata cache
- File system for media cache
- Sync queue for uploads
- Conflict resolution

## Performance Optimization
- Image lazy loading
- Video thumbnail generation
- List virtualization
- Memory management
- Bundle splitting

## Platform-Specific Code
```typescript
import { Platform } from 'react-native';

const styles = StyleSheet.create({
  header: {
    height: Platform.OS === 'ios' ? 44 : 56,
    paddingTop: Platform.OS === 'ios' ? 20 : 0
  }
});
```

## Push Notifications

### Setup
- iOS: Configure in Xcode capabilities
- Android: Add Firebase configuration

### Implementation
```typescript
import messaging from '@react-native-firebase/messaging';

// Request permission
await messaging().requestPermission();

// Get token
const token = await messaging().getToken();

// Handle notifications
messaging().onMessage(async remoteMessage => {
  console.log('Notification received', remoteMessage);
});
```

## Testing
```bash
# Unit tests
npm test

# E2E tests (Detox)
npm run e2e:ios
npm run e2e:android
```

## Common Issues

### Build Failures
- Clean builds: `cd ios && rm -rf build && pod install`
- Reset Metro: `npx react-native start --reset-cache`
- Clean Android: `cd android && ./gradlew clean`

### Performance
- Enable Hermes for Android
- Use production builds for testing
- Profile with React DevTools
- Monitor memory usage

### Debugging
- Use Flipper for network inspection
- React Native Debugger for state
- Xcode/Android Studio for native issues