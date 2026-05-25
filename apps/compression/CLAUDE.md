# CLAUDE.md - Compression Service

This folder contains the Rust-based media compression service for optimizing video, image, and audio files.

## Overview
High-performance compression service built with Rust, providing efficient media optimization with minimal quality loss.

## Tech Stack
- **Rust** - Core language for performance
- **FFmpeg** bindings - Video/audio processing
- **ImageMagick** bindings - Image optimization
- **Actix-web** - HTTP server framework
- **Tokio** - Async runtime

## Architecture
- REST API for compression requests
- Job queue for background processing
- WebSocket for progress updates
- S3/MinIO integration for storage

## Key Features
- Multi-format support (MP4, WebM, JPEG, PNG, etc.)
- Configurable quality levels
- Batch processing
- Progress tracking
- Automatic format detection

## API Endpoints
- `POST /compress` - Submit compression job
- `GET /status/:jobId` - Check job status
- `GET /download/:jobId` - Download compressed file
- `WS /progress/:jobId` - Real-time progress

## Configuration
Set in environment or `config.toml`:
- `COMPRESSION_QUALITY` - Default quality (1-100)
- `MAX_FILE_SIZE` - Maximum input size
- `OUTPUT_FORMAT` - Default output format
- `WORKERS` - Number of worker threads

## Running
```bash
# Development
cargo run

# Production
cargo build --release
./target/release/compression-service

# With Docker
docker build -t noah-compression .
docker run -p 4002:4002 noah-compression
```

## Integration
The API service calls this for media optimization:
```javascript
// From api/services/compression.service.ts
await compressionAPI.post('/compress', {
  fileUrl: s3Url,
  quality: 'high',
  format: 'mp4'
})
```