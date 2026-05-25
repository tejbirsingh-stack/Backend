# Video Player Test Plan

## Overview
Comprehensive test plan for the Enhanced Professional Video Player in the Noah Media Asset Management Platform.

## Test Environment Setup

### Prerequisites
1. **API Server Running**
   ```bash
   cd apps/api
   node src/enhanced-media-server.cjs
   ```
   - Should be running on http://localhost:3000
   - Verify with: `curl http://localhost:3000/api/health`

2. **Web App Running**
   ```bash
   cd apps/web
   npm run dev
   ```
   - Should be running on http://localhost:3002
   - Check for compilation errors in terminal

3. **Test Files Available**
   - Ensure `/uploads` directory has test video files
   - Sample files should include various formats (MP4, WebM, etc.)

## Component Testing

### 1. Video Player Initialization
**Test ID**: VP-001
**Component**: EnhancedProfessionalVideoPlayer

#### Steps:
1. Open browser console (F12)
2. Navigate to http://localhost:3002
3. Login with any email/password
4. Click on a video asset in the media browser
5. Check console for initialization logs

#### Expected Results:
- Console shows: "🎬 EnhancedProfessionalVideoPlayer mounted"
- Console shows: "Video src: [URL]"
- Console shows: "🎬 Video load started"
- Console shows: "🎬 Video metadata loaded"
- No error messages in console

### 2. Video Playback Controls
**Test ID**: VP-002

#### Steps:
1. With video loaded, click play button
2. Verify video starts playing
3. Click pause button
4. Click skip forward/backward buttons
5. Adjust volume slider
6. Change playback speed

#### Expected Results:
- Play/pause toggles correctly
- Skip buttons jump 10 seconds forward/backward
- Volume adjusts smoothly
- Playback speed changes affect video speed
- Console logs confirm each action

### 3. Annotation System - Comment Mode
**Test ID**: VP-003

#### Steps:
1. Open a video asset
2. Ensure right panel is visible (toggle if needed)
3. Switch to "Comment" mode in annotations panel
4. Click on video timeline to add comment
5. Type comment and submit
6. Verify comment appears in list

#### Expected Results:
- Comment saved with timestamp
- Comment appears in annotation list
- Clicking comment seeks to timestamp
- Comments persist on page reload

### 4. Annotation System - Drawing Mode
**Test ID**: VP-004

#### Steps:
1. Switch to "Draw" mode in annotations panel
2. Select drawing tool (rectangle, circle, arrow, etc.)
3. Draw on video canvas
4. Verify drawing appears
5. Save annotation
6. Check if drawing persists at timestamp

#### Expected Results:
- Canvas overlay appears in draw mode
- Drawing tools work correctly
- Drawings saved with timestamp
- Drawings reappear when seeking to timestamp

### 5. Video Loading Error Handling
**Test ID**: VP-005

#### Steps:
1. Modify a video URL to be invalid
2. Try to load the video
3. Check error handling

#### Expected Results:
- Error message displayed to user
- Console shows detailed error information
- App doesn't crash
- User can navigate back to browser

### 6. Full Screen Mode
**Test ID**: VP-006

#### Steps:
1. Click fullscreen button during playback
2. Verify fullscreen mode activates
3. Test all controls in fullscreen
4. Exit fullscreen

#### Expected Results:
- Video enters fullscreen properly
- Controls remain accessible
- Annotations still work
- ESC key exits fullscreen

### 7. Timeline and Seeking
**Test ID**: VP-007

#### Steps:
1. Click on various points on timeline
2. Drag timeline scrubber
3. Hover over timeline to see time preview
4. Check annotation markers on timeline

#### Expected Results:
- Seeking is smooth and accurate
- Time preview shows on hover
- Annotation markers appear at correct positions
- Current time updates correctly

### 8. Responsive Design
**Test ID**: VP-008

#### Steps:
1. Resize browser window
2. Test on different screen sizes
3. Toggle right panel on/off
4. Check mobile viewport

#### Expected Results:
- Video player adapts to container size
- Controls remain accessible
- Panel toggle works smoothly
- No UI elements cut off

## Integration Testing

### 9. Media Browser to Player Flow
**Test ID**: INT-001

#### Steps:
1. Start from media browser
2. Filter/search for specific video
3. Click to open in player
4. Verify correct video loads
5. Navigate back to browser
6. Select different video

#### Expected Results:
- Smooth transition between browser and player
- Correct asset data passed to player
- Back button returns to browser state
- No memory leaks on component unmount

### 10. API Integration
**Test ID**: INT-002

#### Steps:
1. Monitor network tab in browser
2. Load video from API
3. Check request/response
4. Verify CORS headers

#### Expected Results:
- Video URL constructed correctly
- No CORS errors
- Proper authentication headers sent
- Video streams successfully

## Performance Testing

### 11. Large Video Files
**Test ID**: PERF-001

#### Steps:
1. Load a large video file (>100MB)
2. Monitor loading time
3. Check memory usage
4. Test seeking performance

#### Expected Results:
- Video loads within reasonable time
- Seeking doesn't cause lag
- Memory usage stays stable
- No browser crashes

### 12. Multiple Annotations
**Test ID**: PERF-002

#### Steps:
1. Add 50+ annotations to a video
2. Test playback performance
3. Check annotation list scrolling
4. Monitor browser performance

#### Expected Results:
- Playback remains smooth
- Annotation list scrolls smoothly
- No significant performance degradation
- Canvas updates efficiently

## Browser Compatibility

### 13. Cross-Browser Testing
**Test ID**: COMPAT-001

#### Browsers to Test:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

#### Expected Results:
- All features work consistently
- No browser-specific errors
- Video formats supported appropriately

## Debug Checklist

### Console Logs to Monitor:
- [ ] "🚀 Enhanced Media Server v2.0 Started!" - Server running
- [ ] "📺 InPageMediaViewer mounted with asset" - Viewer initialized
- [ ] "🎬 EnhancedProfessionalVideoPlayer mounted" - Player initialized
- [ ] "🎬 Video metadata loaded" - Video ready
- [ ] No red error messages in console

### Common Issues and Solutions:

1. **Video Not Loading**
   - Check if API server is running
   - Verify video URL is correct
   - Check CORS settings
   - Ensure file exists in uploads directory

2. **Controls Cut Off**
   - Fixed with absolute positioning
   - Controls height set to 100px
   - Z-index properly layered

3. **Annotations Not Saving**
   - Check localStorage
   - Verify annotation state management
   - Check console for errors

4. **CORS Errors**
   - Use Vite proxy (port 3002)
   - Don't access API directly from browser
   - Check enhanced-media-server CORS config

## Test Execution Log

| Test ID | Date | Tester | Result | Notes |
|---------|------|--------|--------|-------|
| VP-001  |      |        |        |       |
| VP-002  |      |        |        |       |
| VP-003  |      |        |        |       |
| VP-004  |      |        |        |       |
| VP-005  |      |        |        |       |
| VP-006  |      |        |        |       |
| VP-007  |      |        |        |       |
| VP-008  |      |        |        |       |
| INT-001 |      |        |        |       |
| INT-002 |      |        |        |       |
| PERF-001|      |        |        |       |
| PERF-002|      |        |        |       |
| COMPAT-001|    |        |        |       |

## Summary

This test plan covers:
- ✅ Basic video playback functionality
- ✅ Advanced annotation features
- ✅ Error handling and edge cases
- ✅ Performance considerations
- ✅ Browser compatibility
- ✅ Integration with media browser
- ✅ API communication

Execute all tests before deployment to ensure the video player is production-ready.