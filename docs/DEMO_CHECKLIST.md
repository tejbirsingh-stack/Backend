# Noah Platform Demo Checklist

## Pre-Demo Setup (Complete these before the demo)

### 1. Services Running
- [ ] Demo server running on port 3000 (`node demo-server.cjs`)
- [ ] Web app running on port 3002 (`npm run start:web`)
- [ ] Verify both services are accessible

### 2. Test Accounts
- [ ] Can register new account
- [ ] Can login with credentials
- [ ] Authentication persists across page refreshes

## Demo Flow

### 1. Initial Access
- [ ] Open browser to http://localhost:3002
- [ ] Show login/registration page
- [ ] Register or login

### 2. Media Browser
- [ ] Grid view displays sample media assets
- [ ] Thumbnails load correctly
- [ ] Can switch between grid and list views
- [ ] Search functionality works
- [ ] Filter by media type (All, Videos, Images, Audio, Documents)

### 3. File Upload
- [ ] Click "Upload" button
- [ ] Drag and drop files or use file selector
- [ ] Upload progress shows
- [ ] New files appear in media browser
- [ ] Multiple file upload works

### 4. Video Playback
- [ ] Click on a video to open viewer
- [ ] Video loads and plays
- [ ] Play/pause controls work
- [ ] Volume controls work
- [ ] Progress bar seeking works
- [ ] Fullscreen toggle works
- [ ] Keyboard shortcuts:
  - Space: Play/pause
  - F: Fullscreen
  - M: Mute
  - Arrow keys: Seek

### 5. Professional Features
- [ ] Timeline with frame preview
- [ ] Playback speed control (0.25x - 2x)
- [ ] Quality selection (if available)
- [ ] Picture-in-picture mode
- [ ] Loop toggle
- [ ] Frame-by-frame navigation (< and >)

### 6. Annotation Tools
- [ ] Enable annotation mode
- [ ] Drawing tools:
  - [ ] Rectangle tool
  - [ ] Circle tool
  - [ ] Arrow tool
  - [ ] Pen (freehand drawing)
  - [ ] Text annotations
- [ ] Color picker for annotations
- [ ] Stroke width adjustment
- [ ] Clear all annotations
- [ ] Annotations sync with video timeline

### 7. Comments & Collaboration
- [ ] Open details panel
- [ ] View file metadata
- [ ] Add comments
- [ ] Comments show timestamp
- [ ] Reply to comments

### 8. Media Management
- [ ] Select multiple assets (checkbox mode)
- [ ] Bulk delete
- [ ] Edit asset metadata
- [ ] Add/remove tags
- [ ] Download assets

### 9. Additional Features
- [ ] Share link generation
- [ ] Export options
- [ ] Settings page access
- [ ] Responsive design (resize window)

## Known Issues / Limitations

1. **Sample Data**: Using demo videos from Google's sample bucket
2. **Persistence**: Data resets when demo server restarts
3. **Annotations**: Saved in memory only (not persisted to database)
4. **Authentication**: Simplified for demo (no real JWT validation)

## Quick Fixes if Something Breaks

### Web app not loading:
```bash
# Kill all node processes and restart
taskkill /F /IM node.exe
cd C:\Users\don63\OneDrive\Documents\GitHub\noah
node demo-server.cjs  # In one terminal
npm run start:web     # In another terminal
```

### Videos not playing:
- Check browser console for CORS errors
- Ensure demo server is running on port 3000
- Try refreshing the page

### Upload not working:
- Check that uploads folder exists
- Verify file size is under 500MB
- Check browser console for errors

## Demo Talking Points

1. **Professional Media Management**: Netflix-scale architecture
2. **Real-time Collaboration**: Multiple users can annotate simultaneously
3. **AI-Powered**: Automatic tagging and metadata extraction (in full version)
4. **Enterprise Security**: JWT auth, MFA support, audit logging
5. **Scalable Architecture**: Microservices, containerized, cloud-ready
6. **Adobe Integration**: Premiere Pro panel extension available
7. **Compression Service**: Rust-based for optimal performance
8. **Multi-format Support**: Videos, images, audio, documents

## Post-Demo
- [ ] Save any created content if needed
- [ ] Note feedback and questions
- [ ] Plan follow-up improvements