import React, { useState, useRef } from 'react';
import { ArrowLeft, Download, Share2, Maximize2, Info, PanelRightClose, PanelRightOpen } from 'lucide-react';
import EnhancedProfessionalVideoPlayer from './EnhancedProfessionalVideoPlayer';
import DetailsPanelWithAnnotationsEnhanced from './DetailsPanelWithAnnotationsEnhanced';

// Export type definitions for use by other components
export interface MediaMetadata {
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  bitrate?: string;
  duration?: number;
  format?: string;
  colorSpace?: string;
  audioCodec?: string;
  audioBitrate?: string;
  audioChannels?: number;
  sampleRate?: number;
}

export interface MediaAssetDetails {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadDate: string;
  modifiedDate?: string;
  owner?: string;
  organization?: string;
  tags?: string[];
  collections?: string[];
  version?: number;
  compressionStatus?: string;
  compressionRatio?: number;
  metadata?: MediaMetadata;
  analytics?: {
    views: number;
    downloads: number;
    shares: number;
    averageWatchTime?: number;
  };
  permissions?: {
    canEdit: boolean;
    canDelete: boolean;
    canShare: boolean;
    canDownload: boolean;
  };
}

export interface Annotation {
  id: string;
  timestamp: number;
  type: 'comment' | 'drawing' | 'text';
  content: string | DrawingData;
  user: string;
  userId: string;
  createdAt: Date;
  position?: { x: number; y: number };
  color?: string;
  resolved?: boolean;
  replies?: Comment[];
}

export interface Comment {
  id: string;
  text: string;
  user: string;
  userId: string;
  createdAt: Date;
}

export interface DrawingData {
  tool: 'rectangle' | 'circle' | 'arrow' | 'line' | 'text' | 'pen';
  points?: { x: number; y: number }[];
  startX: number;
  startY: number;
  endX?: number;
  endY?: number;
  color: string;
  strokeWidth: number;
  text?: string;
}

// MediaAsset interface remains for compatibility with MediaBrowser
interface MediaAsset {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  thumbnail?: string;
  duration?: number;
  createdAt?: string;
  updatedAt?: string;
  uploadDate?: string;
  uploadedAt?: string;
  tags?: string[];
  metadata?: {
    width?: number;
    height?: number;
    fps?: number;
    codec?: string;
    bitrate?: string;
  };
  compressionStatus?: string;
  compressionRatio?: number;
}

interface InPageMediaViewerProps {
  asset: MediaAsset;
  onClose: () => void;
}

export default function InPageMediaViewer({ asset, onClose }: InPageMediaViewerProps) {
  // State for video playback
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [enableAnnotations, setEnableAnnotations] = useState(false);
  const [annotationMode, setAnnotationMode] = useState<'view' | 'comment' | 'draw'>('view');
  const [drawingTool, setDrawingTool] = useState<string>('rectangle');
  const [drawingColor, setDrawingColor] = useState<string>('#FF0000');
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // State for storing annotations locally
  const [annotations, setAnnotations] = useState<Annotation[]>(() => {
    // Load annotations from localStorage if available
    const savedAnnotations = localStorage.getItem(`annotations_${asset.id}`);
    return savedAnnotations ? JSON.parse(savedAnnotations) : [];
  });

  // Debug logging
  console.log('InPageMediaViewer - Asset:', asset);
  console.log('InPageMediaViewer - Asset type:', asset.type);
  console.log('InPageMediaViewer - Asset URL:', asset.url);
  console.log('InPageMediaViewer - Annotations:', annotations);
  
  // Determine media type - handle both simple types (from enhanced server) and MIME types
  const typeStr = asset.type?.toLowerCase() || '';
  const fileName = asset.name?.toLowerCase() || '';
  
  // Check by type field first, then by file extension
  const isVideo = typeStr === 'video' || 
                  typeStr.includes('video') || 
                  typeStr.startsWith('video/') ||
                  fileName.endsWith('.mp4') ||
                  fileName.endsWith('.webm') ||
                  fileName.endsWith('.mov') ||
                  fileName.endsWith('.avi');
                  
  const isImage = typeStr === 'image' || 
                  typeStr.includes('image') || 
                  typeStr.startsWith('image/') ||
                  fileName.endsWith('.jpg') ||
                  fileName.endsWith('.jpeg') ||
                  fileName.endsWith('.png') ||
                  fileName.endsWith('.gif') ||
                  fileName.endsWith('.webp');
                  
  const isAudio = typeStr === 'audio' || 
                  typeStr.includes('audio') || 
                  typeStr.startsWith('audio/') ||
                  fileName.endsWith('.mp3') ||
                  fileName.endsWith('.wav') ||
                  fileName.endsWith('.ogg');
  
  console.log('InPageMediaViewer - Type detection:', { typeStr, isVideo, isImage, isAudio });

  // Transform asset to match EnhancedProfessionalVideoPlayer expectations
  const assetDetails = {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    size: asset.size,
    uploadDate: asset.uploadDate || asset.uploadedAt || asset.createdAt || new Date().toISOString(),
    owner: 'Current User', // Mock for now
    organization: 'Noah Platform',
    tags: asset.tags || [],
    collections: [],
    version: 1,
    compressionStatus: asset.compressionStatus,
    compressionRatio: asset.compressionRatio,
    metadata: {
      width: asset.metadata?.width,
      height: asset.metadata?.height,
      fps: asset.metadata?.fps,
      codec: asset.metadata?.codec,
      bitrate: asset.metadata?.bitrate,
      duration: asset.duration,
      format: asset.type,
    },
    analytics: {
      views: 0,
      downloads: 0,
      shares: 0,
    },
    permissions: {
      canEdit: true,
      canDelete: true,
      canShare: true,
      canDownload: true,
    },
  };

  // Annotation handlers with localStorage persistence
  const handleAnnotationAdd = (annotation: Annotation) => {
    console.log('Adding annotation:', annotation);
    const newAnnotations = [...annotations, annotation];
    setAnnotations(newAnnotations);
    // Save to localStorage
    localStorage.setItem(`annotations_${asset.id}`, JSON.stringify(newAnnotations));
    
    // Reset annotation mode after adding
    setAnnotationMode('view');
    setEnableAnnotations(false);
    
    // Show success message
    console.log('✅ Annotation saved! Total annotations for this video:', newAnnotations.length);
    console.log('Annotation details:', {
      type: annotation.type,
      timestamp: annotation.timestamp,
      tool: typeof annotation.content === 'object' && annotation.content?.tool || 'N/A',
      color: typeof annotation.content === 'object' && annotation.content?.color || 'N/A'
    });
  };

  const handleAnnotationUpdate = (id: string, updates: Partial<Annotation>) => {
    console.log('Updating annotation:', id, updates);
    const updatedAnnotations = annotations.map(ann => 
      ann.id === id ? { ...ann, ...updates } : ann
    );
    setAnnotations(updatedAnnotations);
    localStorage.setItem(`annotations_${asset.id}`, JSON.stringify(updatedAnnotations));
  };

  const handleAnnotationDelete = (id: string) => {
    console.log('Deleting annotation:', id);
    const filteredAnnotations = annotations.filter(ann => ann.id !== id);
    setAnnotations(filteredAnnotations);
    
    // Update localStorage
    if (filteredAnnotations.length > 0) {
      localStorage.setItem(`annotations_${asset.id}`, JSON.stringify(filteredAnnotations));
    } else {
      // Remove from localStorage if no annotations left
      localStorage.removeItem(`annotations_${asset.id}`);
    }
    
    console.log(`✅ Annotation deleted. Remaining: ${filteredAnnotations.length}`);
  };

  // Handle seeking to a specific timestamp from annotations
  const handleSeek = (timestamp: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timestamp;
      setCurrentTime(timestamp);
    }
  };

  // Handle annotation selection
  const handleAnnotationSelect = (annotation: Annotation) => {
    console.log('Annotation selected:', annotation);
    // Could highlight or focus the annotation in the video if needed
  };

  // Update playback state
  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
  };

  const handlePlayPause = (playing: boolean) => {
    setIsPlaying(playing);
  };

  const handleDurationChange = (dur: number) => {
    setDuration(dur);
  };

  // Handle starting annotation from the panel
  const handleStartAnnotation = (type: 'comment' | 'drawing', tool?: string, color?: string) => {
    if (type === 'drawing' && tool && color) {
      setDrawingTool(tool);
      setDrawingColor(color);
      setAnnotationMode('draw');
      setEnableAnnotations(true);
      console.log('Starting drawing annotation:', { tool, color });
    } else if (type === 'comment') {
      setAnnotationMode('comment');
      setEnableAnnotations(true);
    }
  };

  const handleDownload = () => {
    console.log('Downloading asset:', asset.name);
    // In production, this would trigger actual download
    const link = document.createElement('a');
    link.href = asset.url;
    link.download = asset.name;
    link.click();
  };

  const handleShare = () => {
    console.log('Sharing asset:', asset.name);
    // In production, this would open share dialog
  };

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {/* Header Bar */}
      <div className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Browser
          </button>
          <div className="text-white">
            <h2 className="font-semibold text-lg">{asset.name}</h2>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={handleShare}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Share"
          >
            <Share2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsPanelVisible(!isPanelVisible)}
            className={`p-2 rounded-lg transition-colors ${
              isPanelVisible 
                ? 'text-blue-400 bg-blue-900/50 hover:bg-blue-800/50' 
                : 'text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
            title={isPanelVisible ? "Hide Comments Panel" : "Show Comments Panel"}
          >
            {isPanelVisible ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Main Content Area - Account for header (64px) */}
      <div className="flex-1 flex" style={{ height: 'calc(100vh - 64px)', maxHeight: 'calc(100vh - 64px)', position: 'relative' }}>
        {/* Media Display Area - Full width when panel hidden */}
        <div className={`bg-black relative transition-all duration-300 ${
          isPanelVisible ? 'flex-1' : 'w-full'
        }`} style={{
          height: '100%',
          maxHeight: '100%',
          position: 'relative',
          overflow: 'visible',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: '100px' // Reduced space for controls - eliminates gap
        }}>
          {isVideo ? (
            asset.url ? (
              <EnhancedProfessionalVideoPlayer
                  src={asset.url}
                  poster={asset.thumbnail}
                  title={asset.name}
                  assetDetails={assetDetails}
                  annotations={annotations}
                  onClose={onClose}
                  onAnnotationAdd={handleAnnotationAdd}
                  onAnnotationUpdate={handleAnnotationUpdate}
                  onAnnotationDelete={handleAnnotationDelete}
                  onCommentReply={(annotationId: string, comment: Comment) => {
                    const annotation = annotations.find(a => a.id === annotationId);
                    if (annotation) {
                      const updatedAnnotation = {
                        ...annotation,
                        replies: [...(annotation.replies || []), comment]
                      };
                      handleAnnotationUpdate(annotationId, updatedAnnotation);
                    }
                  }}
                  enableAnnotations={enableAnnotations}
                  annotationMode={annotationMode}
                  drawingTool={drawingTool}
                  drawingColor={drawingColor}
                  onTimeUpdate={handleTimeUpdate}
                  onPlayPause={handlePlayPause}
                  onDurationChange={handleDurationChange}
                  videoRef={videoRef}
                  className="flex-1 w-full"
                />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-white">
                  <p>Video URL not available</p>
                  <p className="text-sm text-gray-400 mt-2">Asset: {JSON.stringify(asset)}</p>
                </div>
              </div>
            )
          ) : isImage ? (
            <div className="w-full h-full flex items-center justify-center p-8">
              <img
                src={asset.url}
                alt={asset.name}
                className="max-w-full max-h-full object-contain"
                style={{ maxHeight: 'calc(100vh - 128px)' }}
              />
            </div>
          ) : isAudio ? (
            <div className="bg-slate-800 p-8 rounded-lg">
              <div className="text-white text-center mb-6">
                <div className="text-6xl mb-4">🎵</div>
                <h3 className="text-xl font-semibold mb-2">{asset.name}</h3>
              </div>
              <audio
                controls
                className="w-full"
                src={asset.url}
                autoPlay
              >
                Your browser does not support the audio element.
              </audio>
            </div>
          ) : (
            <div className="text-center text-white">
              <Info className="w-16 h-16 mx-auto mb-4 text-slate-400" />
              <h3 className="text-xl font-semibold mb-2">Preview not available</h3>
              <p className="text-slate-400">
                This file type ({asset.type}) cannot be previewed in the browser.
              </p>
              <button
                onClick={handleDownload}
                className="mt-4 px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
              >
                Download File
              </button>
            </div>
          )}
        </div>

        {/* Details Panel with Annotations - Collapsible */}
        {isPanelVisible && (
          <div className="w-96 transition-all duration-300">
            <DetailsPanelWithAnnotationsEnhanced 
              asset={asset}
              annotations={annotations}
              currentTime={currentTime}
              isPlaying={isPlaying}
              onAnnotationAdd={handleAnnotationAdd}
              onAnnotationDelete={handleAnnotationDelete}
              onAnnotationSelect={handleAnnotationSelect}
              onSeek={handleSeek}
              onStartAnnotation={handleStartAnnotation}
            />
          </div>
        )}
      </div>
    </div>
  );
}