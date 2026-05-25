# Noah Media Platform - Quick Start Guide

## 🚀 Getting Started

### Prerequisites
- Node.js v18+ installed
- npm or yarn package manager

### Installation
```bash
# Install all dependencies
npm install

# Build packages
npm run build:packages
```

### Quick Start (Windows)
Simply double-click `start-noah.bat` or run:
```bash
start-noah.bat
```

### Manual Start

#### 1. Start the API Server (Port 4000)
```bash
cd apps/api
PORT=4000 npm run dev:simple
```

#### 2. Start the Web Application (Port 3000)
```bash
cd apps/web
npm run dev
```

### Access the Platform
- **Web Application**: http://localhost:3000
- **API Server**: http://localhost:4000
- **Health Check**: http://localhost:4000/health

## 🎬 Features Available

### Media Browser
- Upload videos, images, audio files, and documents
- Search and filter media assets
- Grid and list view modes
- Bulk selection and operations
- Real-time collaboration indicators

### Professional Video Player
- **Playback Controls**
  - Play/Pause (Space or K)
  - Skip forward/backward (Arrow keys)
  - Frame-by-frame stepping (Shift + Arrow keys)
  - Variable playback speed (1-8 keys)
  - Volume control (Up/Down arrows)
  - Fullscreen mode (F)

- **Annotations & Comments**
  - Add timestamped comments (C)
  - Drawing tools with multiple shapes (D)
  - Pen tool for freehand drawing
  - Color selection and stroke width
  - Reply to comments
  - Annotation timeline

- **File Details Overlay (I)**
  - Complete file metadata
  - Video properties (resolution, codec, fps)
  - Analytics (views, downloads, shares)
  - Tags and collections
  - Compression status

### Drawing Tools
- Rectangle, Circle, Arrow, Line
- Freehand pen tool
- Text annotations
- 8 color options
- Adjustable stroke width

## 🔑 Authentication
For testing purposes, you can:
1. Use any email/password combination
2. The system will create a mock session
3. All features are accessible without real authentication

## 📁 File Storage
- Files are stored in `apps/api/uploads/`
- Supported formats:
  - Video: MP4, WebM, MOV
  - Image: JPG, PNG, GIF, WebP
  - Audio: MP3, WAV, OGG
  - Documents: PDF

## 🎯 Testing the Platform

1. **Upload Media**
   - Click "Upload" button in Media Browser
   - Select multiple files
   - Watch upload progress

2. **View & Annotate Videos**
   - Click on any video thumbnail
   - Press 'I' to see file details
   - Press 'C' to add comments
   - Press 'D' to use drawing tools
   - Use timeline to navigate

3. **Search & Filter**
   - Use search bar for name/tag search
   - Filter by media type
   - Sort by date, name, size, or type

## ⚙️ Environment Variables
Create `.env` files if needed:

```env
# apps/api/.env
PORT=4000
NODE_ENV=development

# apps/web/.env
VITE_API_URL=http://localhost:4000/api
```

## 🐛 Troubleshooting

### Port Already in Use
If ports 3000 or 4000 are in use:
1. The start script will automatically kill existing processes
2. Or manually change ports in the .env files

### Upload Not Working
1. Ensure `apps/api/uploads/` directory exists
2. Check file size limits (default: 100MB)
3. Verify CORS settings allow localhost:3000

### Video Not Playing
1. Check browser console for errors
2. Ensure video format is supported (MP4 recommended)
3. Verify file permissions in uploads directory

## 📚 Keyboard Shortcuts

### Video Player
- **Space/K**: Play/Pause
- **←/→**: Skip 10 seconds
- **Shift + ←/→**: Frame step
- **↑/↓**: Volume control
- **M**: Mute/Unmute
- **F**: Fullscreen
- **C**: Comment mode
- **D**: Drawing mode
- **I**: Show file details
- **1-8**: Playback speed
- **Esc**: Exit mode/fullscreen

## 🎨 Professional Features for CMOs

The platform is designed for Fortune 500 marketing executives who need:

- **Quick Access**: Instant search across all campaign assets
- **Collaboration**: Real-time comments and annotations
- **Review Tools**: Frame-accurate navigation and markup
- **Asset Intelligence**: AI-powered tagging and metadata
- **Campaign History**: Complete archive of past campaigns
- **Export Options**: Download and share capabilities
- **Analytics**: Track asset usage and engagement

## 📧 Support
For issues or questions about the Noah Media Platform, please refer to the main documentation or contact the development team.