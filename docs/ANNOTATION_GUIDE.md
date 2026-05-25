# Video Annotation Guide

## How to Use Annotations

### Drawing on Videos

1. **Open a video** in the Noah platform
2. **Enter Draw Mode** using one of these methods:
   - Click the pencil icon (✏️) in the top-right annotation panel
   - Press the `D` key on your keyboard
   - The button will turn blue when draw mode is active

3. **Select a drawing tool** from the panel:
   - Rectangle
   - Circle  
   - Arrow
   - Line
   - Pen (freehand drawing)

4. **Choose a color** from the color palette

5. **Draw on the video**:
   - Click and drag to create shapes
   - For pen tool, click and drag to draw freehand
   - Release mouse to complete the drawing

6. **Exit Draw Mode**:
   - Press `ESC` key
   - Click the cursor icon to return to view mode

### Adding Comments

1. **Enter Comment Mode**:
   - Click the comment icon (💬) in the annotation panel
   - Or press the `C` key

2. **Type your comment** in the text box that appears

3. **Click "Add Comment"** to save it at the current timestamp

### Keyboard Shortcuts

- `D` - Enter draw mode
- `C` - Enter comment mode
- `ESC` - Exit annotation mode
- `I` - Toggle file details overlay
- `Space` or `K` - Play/pause video
- `F` - Toggle fullscreen
- `Arrow Left/Right` - Skip 10 seconds
- `Shift + Arrow Left/Right` - Frame step

## Where Annotations Are Saved

### Current Storage (Development)
- **Location**: Browser's localStorage
- **Key Format**: `annotations_${assetId}`
- **Persistence**: Annotations persist across browser sessions
- **Visibility**: Check browser console for annotation logs

### Viewing Saved Annotations
1. Open browser Developer Tools (F12)
2. Go to Application/Storage tab
3. Find localStorage
4. Look for keys starting with `annotations_`

### Console Messages
When you draw an annotation, you'll see messages like:
```
🎨 Starting to draw: {tool: "rectangle", color: "#FF0000", position: {x: 100, y: 200}}
🎨 Finishing drawing: {startX: 100, startY: 200, endX: 300, endY: 400...}
📝 Creating annotation: {id: "annotation-1234567890", timestamp: 45.2, type: "drawing"...}
✅ Annotation saved! Total annotations for this video: 1
```

## Troubleshooting

### Annotations Not Appearing
1. **Check annotation mode**: Ensure you're in draw mode (button should be blue)
2. **Check console**: Open browser console (F12) to see debug messages
3. **Verify canvas**: The drawing canvas should be overlaid on the video

### Can't Draw
- Make sure the video is loaded
- Click the draw button or press `D` to enter draw mode
- Try refreshing the page if issues persist

### Annotations Not Saving
- Check browser console for error messages
- Verify localStorage is not disabled in your browser
- Try a different browser if issues persist

## Future Enhancements (Planned)

- [ ] Backend API integration for permanent storage
- [ ] Collaborative annotations (see other users' annotations)
- [ ] Export annotations as JSON/PDF
- [ ] Annotation history and versioning
- [ ] Permission-based annotation viewing/editing
- [ ] Annotation search and filtering
- [ ] Frame-accurate annotation placement

## Technical Details

### Storage Format
Annotations are stored as JSON objects:
```json
{
  "id": "annotation-1234567890",
  "timestamp": 45.2,
  "type": "drawing",
  "content": {
    "tool": "rectangle",
    "color": "#FF0000",
    "strokeWidth": 3,
    "startX": 100,
    "startY": 200,
    "endX": 300,
    "endY": 400
  },
  "user": "Current User",
  "userId": "user-1",
  "createdAt": "2025-08-11T18:00:00.000Z"
}
```

### API Endpoints (Future)
- `POST /api/media/{assetId}/annotations` - Create annotation
- `GET /api/media/{assetId}/annotations` - Get all annotations
- `PUT /api/media/{assetId}/annotations/{annotationId}` - Update annotation
- `DELETE /api/media/{assetId}/annotations/{annotationId}` - Delete annotation