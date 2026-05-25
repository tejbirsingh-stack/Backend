# 🧪 Noah Platform - Testing Guide

## Quick Start Testing

### 1. Start the Platform
```bash
# Windows
start-noah.bat

# Or manually:
cd apps/api && PORT=4000 npm run dev:simple  # Terminal 1
cd apps/web && npm run dev         # Terminal 2
```

### 2. Login Testing
The platform accepts **ANY credentials** for testing:
- **URL**: http://localhost:3000
- **Email**: Any email (e.g., test@noah.com)
- **Password**: Any password
- **Result**: Will always authenticate successfully

### 3. Run Automated Tests
```bash
# Windows
run-tests.bat

# Or open in browser:
test-suite.html
```

## 📋 Test Suite Features

### Authentication Tests
- ✅ API Health Check
- ✅ User Login (any credentials)
- ✅ User Registration
- ✅ JWT Token Validation
- ✅ User Logout

### Media Management Tests
- ✅ Fetch Media Assets
- ✅ Upload Media Files
- ✅ Search Media Assets
- ✅ Filter by Type
- ✅ Delete Media Assets

### Video Player Tests
- ✅ Load Video Player
- ✅ Video Controls Response
- ✅ Annotations System
- ✅ Drawing Tools
- ✅ File Metadata Display

## 🎬 Manual Testing Guide

### 1. Media Browser
1. Navigate to http://localhost:3000
2. Login with any credentials
3. Click "Upload" button
4. Select files (images, videos, PDFs)
5. Watch upload progress
6. Files appear in grid view

**Test Points:**
- Grid/List view toggle
- Search by name
- Filter by type (Video, Images, Audio, Document)
- Sort by date, name, size, type
- Bulk selection with checkboxes

### 2. Professional Video Player
1. Click on any video thumbnail
2. Video player opens with controls

**Keyboard Shortcuts to Test:**
- `Space` or `K`: Play/Pause
- `←/→`: Skip 10 seconds
- `Shift + ←/→`: Frame-by-frame
- `↑/↓`: Volume control
- `M`: Mute/Unmute
- `F`: Fullscreen
- `C`: Comment mode
- `D`: Drawing mode
- `I`: Show file details
- `1-8`: Playback speeds
- `Esc`: Exit mode

### 3. Annotations & Comments
1. Press `C` during video playback
2. Add timestamped comment
3. Comment appears in timeline
4. Click comment to jump to timestamp

**Features to Test:**
- Add comment at current time
- Reply to existing comments
- Delete comments
- Navigate via annotation timeline

### 4. Drawing Tools
1. Press `D` during video playback
2. Select drawing tool:
   - Pen (freehand)
   - Rectangle
   - Circle
   - Arrow
   - Line
   - Text

**Test Workflow:**
- Select color (8 options)
- Adjust stroke width
- Draw on video
- Annotations saved at timestamp
- View in annotation panel

### 5. File Details Overlay
1. Press `I` during video playback
2. View comprehensive metadata:
   - File information (name, size, date)
   - Video properties (resolution, codec, fps)
   - Analytics (views, downloads, shares)
   - Tags and collections
   - Compression status

## 🔍 Quick Test Script

Run the quick test to verify all endpoints:
```bash
node quick-test.js
```

Expected output:
```
✅ API is running
✅ Login successful
✅ Media endpoint working
✅ Upload endpoint working
```

## 📊 Test Coverage

| Feature | Status | Test Method |
|---------|--------|-------------|
| Authentication | ✅ Working | Accepts any credentials |
| Media Upload | ✅ Working | Multipart form upload |
| Media Browse | ✅ Working | Grid/List views |
| Video Playback | ✅ Working | HTML5 video player |
| Annotations | ✅ Working | Canvas overlay |
| Drawing Tools | ✅ Working | Multiple shapes + pen |
| Comments | ✅ Working | Timestamped with replies |
| File Details | ✅ Working | Metadata overlay |
| Search/Filter | ✅ Working | Query parameters |
| Keyboard Shortcuts | ✅ Working | Event listeners |

## 🐛 Troubleshooting Tests

### API Not Responding
```bash
# Check if port 4000 is in use
netstat -an | findstr :4000

# Kill process on port
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000') do taskkill /F /PID %%a

# Restart API
cd apps/api
PORT=4000 npm run dev:simple
```

### Login Not Working
1. Ensure API is running on port 4000
2. Check browser console for errors
3. Try clearing browser cache
4. Verify CORS is enabled

### Upload Failing
1. Check `apps/api/uploads/` directory exists
2. Verify multipart plugin loaded
3. Check file size (max 100MB default)
4. Ensure correct content-type headers

### Video Not Playing
1. Check video format (MP4 recommended)
2. Verify file URL is correct
3. Check browser supports format
4. Try different video file

## 📝 Test Data

### Sample Users
- Email: `test@noah.com`, Password: `any`
- Email: `admin@noah.com`, Password: `any`
- Email: `user@noah.com`, Password: `any`

### Sample Files
Place test files in `apps/api/uploads/`:
- Videos: `.mp4`, `.webm`, `.mov`
- Images: `.jpg`, `.png`, `.gif`
- Audio: `.mp3`, `.wav`
- Documents: `.pdf`

## 🚀 CI/CD Testing

For automated testing in CI/CD:
```bash
# Start services
npm run docker:up

# Run tests
npm test

# Run E2E tests
npm run test:e2e
```

## 📈 Performance Testing

Monitor these metrics:
- Page load time: < 2 seconds
- Video start time: < 1 second
- Upload speed: > 1MB/s
- API response: < 200ms
- Memory usage: < 500MB

## ✅ Test Checklist

Before deployment, verify:
- [ ] All auth endpoints respond
- [ ] Media upload works
- [ ] Videos play correctly
- [ ] Annotations save/load
- [ ] Drawing tools function
- [ ] Comments system works
- [ ] Search returns results
- [ ] Filter by type works
- [ ] Keyboard shortcuts respond
- [ ] File details show
- [ ] Responsive on mobile
- [ ] Works in Chrome/Firefox/Safari

## 🎯 Success Criteria

The platform is ready when:
1. All automated tests pass (15/15)
2. Manual testing completes without errors
3. Performance metrics meet targets
4. No console errors in browser
5. All features accessible via keyboard

## 📞 Support

If tests fail:
1. Check the test logs
2. Verify all dependencies installed
3. Ensure correct Node.js version (18+)
4. Review error messages in console
5. Check network tab for failed requests