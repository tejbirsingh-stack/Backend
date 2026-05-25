# CLAUDE.md - AI Service

This folder contains the AI-powered metadata extraction and content analysis service.

## Overview
Python-based service using machine learning models for automatic tagging, content moderation, and metadata extraction from media files.

## Tech Stack
- **Python 3.9+** - Core language
- **FastAPI** - REST API framework
- **TensorFlow/PyTorch** - ML frameworks
- **OpenCV** - Computer vision
- **Whisper** - Audio transcription
- **CLIP** - Image/video understanding

## Key Features
- Automatic scene detection
- Object and person recognition
- Audio transcription
- Content moderation
- Smart tagging
- Similar media detection
- OCR text extraction

## API Endpoints
- `POST /analyze/image` - Analyze image content
- `POST /analyze/video` - Extract video metadata
- `POST /analyze/audio` - Transcribe and analyze audio
- `POST /extract/metadata` - Extract technical metadata
- `POST /generate/tags` - Generate smart tags
- `POST /detect/duplicates` - Find similar media

## Models
- YOLO v8 - Object detection
- ResNet - Image classification
- Whisper - Speech to text
- CLIP - Multi-modal understanding
- BERT - Text analysis

## Running
```bash
# Install dependencies
pip install -r requirements.txt

# Development
uvicorn main:app --reload --port 4003

# Production
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker
```

## Integration
Called by main API for media processing:
```typescript
// From api/services/ai.service.ts
const analysis = await aiService.post('/analyze/video', {
  fileUrl: mediaUrl
});
```