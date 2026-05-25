import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  SkipBack, 
  SkipForward,
  MessageSquare,
  Edit3,
  Settings,
  Download,
  Share2,
  ChevronUp,
  ChevronDown,
  Circle,
  Square,
  Type,
  MousePointer,
  Trash2,
  Check,
  X,
  ArrowRight,
  Minus
} from 'lucide-react';

// Types
interface Annotation {
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
}

interface DrawingData {
  tool: 'rectangle' | 'circle' | 'arrow' | 'line' | 'text';
  startX: number;
  startY: number;
  endX?: number;
  endY?: number;
  color: string;
  strokeWidth: number;
  text?: string;
}

interface VideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  onClose?: () => void;
  enableAnnotations?: boolean;
  annotations?: Annotation[];
  onAnnotationAdd?: (annotation: Annotation) => void;
  onAnnotationUpdate?: (id: string, annotation: Partial<Annotation>) => void;
  onAnnotationDelete?: (id: string) => void;
  className?: string;
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const DRAWING_COLORS = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF', '#000000'];

export default function ProfessionalVideoPlayer({
  src,
  poster,
  title,
  onClose,
  enableAnnotations = true,
  annotations = [],
  onAnnotationAdd,
  onAnnotationUpdate,
  onAnnotationDelete,
  className = ""
}: VideoPlayerProps) {
  // Video refs and state
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);

  // Video state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);

  // Annotation state
  const [annotationMode, setAnnotationMode] = useState<'view' | 'comment' | 'draw'>('view');
  const [drawingTool, setDrawingTool] = useState<DrawingData['tool']>('rectangle');
  const [drawingColor, setDrawingColor] = useState('#FF0000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDrawing, setCurrentDrawing] = useState<Partial<DrawingData> | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(true);

  // Control visibility timer
  const hideControlsTimeout = useRef<NodeJS.Timeout>();

  // Get current frame number
  const getCurrentFrame = useCallback(() => {
    if (!videoRef.current) return 0;
    return Math.floor(videoRef.current.currentTime * 30); // Assuming 30fps
  }, []);

  // Format time display
  const formatTime = useCallback((time: number) => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    const frames = Math.floor((time % 1) * 30); // Assuming 30fps
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${frames.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${frames.toString().padStart(2, '0')}`;
  }, []);

  // Show controls temporarily
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }
    if (isPlaying) {
      hideControlsTimeout.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Initialize video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoading(false);
      generateThumbnails();
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      updateCanvas();
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleError = () => {
      setError('Failed to load video');
      setIsLoading(false);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleError);
    };
  }, []);

  // Generate video thumbnails for timeline
  const generateThumbnails = useCallback(() => {
    // In production, thumbnails would be generated server-side
    // This is a placeholder for the timeline preview
    const thumbCount = 10;
    const thumbs: string[] = [];
    for (let i = 0; i < thumbCount; i++) {
      thumbs.push(`thumbnail-${i}`);
    }
    setThumbnails(thumbs);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!videoRef.current) return;

      switch(e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) {
            frameStep(-1);
          } else {
            skip(-10);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) {
            frameStep(1);
          } else {
            skip(10);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          adjustVolume(0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          adjustVolume(-0.1);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'c':
          e.preventDefault();
          setAnnotationMode('comment');
          break;
        case 'd':
          e.preventDefault();
          setAnnotationMode('draw');
          break;
        case 'Escape':
          e.preventDefault();
          setAnnotationMode('view');
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          e.preventDefault();
          const speedIndex = parseInt(e.key) - 1;
          if (speedIndex < PLAYBACK_SPEEDS.length) {
            changePlaybackSpeed(PLAYBACK_SPEEDS[speedIndex]);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Video control functions
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(console.error);
    }
  }, [isPlaying]);

  const skip = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
  }, []);

  const frameStep = useCallback((frames: number) => {
    const video = videoRef.current;
    if (!video) return;
    const frameTime = 1 / 30; // Assuming 30fps
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + (frames * frameTime)));
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const seekBar = seekBarRef.current;
    if (!video || !seekBar) return;

    const rect = seekBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    video.currentTime = percent * video.duration;
  }, []);

  const handleSeekHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const seekBar = seekBarRef.current;
    if (!seekBar || !duration) return;

    const rect = seekBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    setHoveredTime(percent * duration);
  }, [duration]);

  const adjustVolume = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const newVolume = Math.max(0, Math.min(1, volume + delta));
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, [volume]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isMuted) {
      video.volume = volume || 1;
      setIsMuted(false);
    } else {
      video.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const changePlaybackSpeed = useCallback((speed: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  // Canvas drawing functions
  const updateCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw annotations for current timestamp
    const currentAnnotations = annotations.filter(a => 
      Math.abs(a.timestamp - currentTime) < 0.1
    );

    currentAnnotations.forEach(annotation => {
      if (annotation.type === 'drawing' && typeof annotation.content !== 'string') {
        drawAnnotation(ctx, annotation.content as DrawingData);
      }
    });

    // Draw current drawing if in progress
    if (isDrawing && currentDrawing) {
      drawAnnotation(ctx, currentDrawing as DrawingData);
    }
  }, [currentTime, annotations, isDrawing, currentDrawing]);

  const drawAnnotation = (ctx: CanvasRenderingContext2D, drawing: DrawingData) => {
    ctx.strokeStyle = drawing.color;
    ctx.lineWidth = drawing.strokeWidth;
    ctx.fillStyle = drawing.color;

    switch(drawing.tool) {
      case 'rectangle':
        if (drawing.endX && drawing.endY) {
          ctx.strokeRect(
            drawing.startX, 
            drawing.startY, 
            drawing.endX - drawing.startX, 
            drawing.endY - drawing.startY
          );
        }
        break;
      case 'circle':
        if (drawing.endX && drawing.endY) {
          const radius = Math.sqrt(
            Math.pow(drawing.endX - drawing.startX, 2) + 
            Math.pow(drawing.endY - drawing.startY, 2)
          );
          ctx.beginPath();
          ctx.arc(drawing.startX, drawing.startY, radius, 0, 2 * Math.PI);
          ctx.stroke();
        }
        break;
      case 'arrow':
        if (drawing.endX && drawing.endY) {
          drawArrow(ctx, drawing.startX, drawing.startY, drawing.endX, drawing.endY);
        }
        break;
      case 'line':
        if (drawing.endX && drawing.endY) {
          ctx.beginPath();
          ctx.moveTo(drawing.startX, drawing.startY);
          ctx.lineTo(drawing.endX, drawing.endY);
          ctx.stroke();
        }
        break;
      case 'text':
        if (drawing.text) {
          ctx.font = `${drawing.strokeWidth * 5}px Arial`;
          ctx.fillText(drawing.text, drawing.startX, drawing.startY);
        }
        break;
    }
  };

  const drawArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
    const headLength = 15;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    // Draw line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Draw arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI/6), toY - headLength * Math.sin(angle - Math.PI/6));
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI/6), toY - headLength * Math.sin(angle + Math.PI/6));
    ctx.stroke();
  };

  // Handle canvas drawing
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (annotationMode !== 'draw') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setCurrentDrawing({
      tool: drawingTool,
      startX: x,
      startY: y,
      color: drawingColor,
      strokeWidth: strokeWidth
    });
  }, [annotationMode, drawingTool, drawingColor, strokeWidth]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCurrentDrawing(prev => ({
      ...prev!,
      endX: x,
      endY: y
    }));
  }, [isDrawing, currentDrawing]);

  const handleCanvasMouseUp = useCallback(() => {
    if (!isDrawing || !currentDrawing) return;

    // Save the drawing as annotation
    if (currentDrawing.endX && currentDrawing.endY && onAnnotationAdd) {
      const annotation: Annotation = {
        id: `annotation-${Date.now()}`,
        timestamp: currentTime,
        type: 'drawing',
        content: currentDrawing as DrawingData,
        user: 'Current User',
        userId: 'user-1',
        createdAt: new Date()
      };
      onAnnotationAdd(annotation);
    }

    setIsDrawing(false);
    setCurrentDrawing(null);
  }, [isDrawing, currentDrawing, currentTime, onAnnotationAdd]);

  // Add comment annotation
  const addComment = useCallback(() => {
    if (!commentText.trim() || !onAnnotationAdd) return;

    const annotation: Annotation = {
      id: `annotation-${Date.now()}`,
      timestamp: currentTime,
      type: 'comment',
      content: commentText,
      user: 'Current User',
      userId: 'user-1',
      createdAt: new Date()
    };
    
    onAnnotationAdd(annotation);
    setCommentText('');
    setAnnotationMode('view');
  }, [commentText, currentTime, onAnnotationAdd]);

  // Get annotations at current time
  const currentAnnotations = useMemo(() => {
    return annotations.filter(a => 
      Math.abs(a.timestamp - currentTime) < 0.5
    );
  }, [annotations, currentTime]);

  // Progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div 
      ref={containerRef}
      className={`relative bg-black ${isFullscreen ? 'fixed inset-0 z-50' : 'rounded-lg overflow-hidden'} ${className}`}
      onMouseMove={showControlsTemporarily}
      onMouseEnter={showControlsTemporarily}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="w-full h-full object-contain"
        onClick={togglePlay}
      />

      {/* Canvas Overlay for Annotations */}
      {enableAnnotations && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ pointerEvents: annotationMode === 'draw' ? 'auto' : 'none' }}
          width={containerRef.current?.clientWidth || 1920}
          height={containerRef.current?.clientHeight || 1080}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
        />
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-red-500 text-center">
            <X className="w-12 h-12 mx-auto mb-2" />
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Annotation Tools Panel */}
      {enableAnnotations && showControls && (
        <div className="absolute top-4 right-4 bg-black/80 rounded-lg p-2 flex flex-col gap-2">
          <button
            onClick={() => setAnnotationMode('view')}
            className={`p-2 rounded ${annotationMode === 'view' ? 'bg-blue-600' : 'hover:bg-white/20'} text-white transition-colors`}
            title="View Mode (Esc)"
          >
            <MousePointer className="w-5 h-5" />
          </button>
          <button
            onClick={() => setAnnotationMode('comment')}
            className={`p-2 rounded ${annotationMode === 'comment' ? 'bg-blue-600' : 'hover:bg-white/20'} text-white transition-colors`}
            title="Add Comment (C)"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <button
            onClick={() => setAnnotationMode('draw')}
            className={`p-2 rounded ${annotationMode === 'draw' ? 'bg-blue-600' : 'hover:bg-white/20'} text-white transition-colors`}
            title="Draw Annotation (D)"
          >
            <Edit3 className="w-5 h-5" />
          </button>

          {/* Drawing Tools */}
          {annotationMode === 'draw' && (
            <div className="border-t border-gray-600 pt-2 mt-2">
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setDrawingTool('rectangle')}
                  className={`p-1 rounded ${drawingTool === 'rectangle' ? 'bg-blue-600' : 'hover:bg-white/20'} text-white`}
                >
                  <Square className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDrawingTool('circle')}
                  className={`p-1 rounded ${drawingTool === 'circle' ? 'bg-blue-600' : 'hover:bg-white/20'} text-white`}
                >
                  <Circle className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDrawingTool('arrow')}
                  className={`p-1 rounded ${drawingTool === 'arrow' ? 'bg-blue-600' : 'hover:bg-white/20'} text-white`}
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDrawingTool('line')}
                  className={`p-1 rounded ${drawingTool === 'line' ? 'bg-blue-600' : 'hover:bg-white/20'} text-white`}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDrawingTool('text')}
                  className={`p-1 rounded ${drawingTool === 'text' ? 'bg-blue-600' : 'hover:bg-white/20'} text-white`}
                >
                  <Type className="w-4 h-4" />
                </button>
              </div>

              {/* Color Picker */}
              <div className="grid grid-cols-4 gap-1 mt-2">
                {DRAWING_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setDrawingColor(color)}
                    className={`w-6 h-6 rounded ${drawingColor === color ? 'ring-2 ring-white' : ''}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>

              {/* Stroke Width */}
              <input
                type="range"
                min="1"
                max="10"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                className="w-full mt-2"
              />
            </div>
          )}
        </div>
      )}

      {/* Comment Input */}
      {annotationMode === 'comment' && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/90 rounded-lg p-4 min-w-[300px]">
          <h3 className="text-white font-semibold mb-2">Add Comment at {formatTime(currentTime)}</h3>
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="w-full p-2 rounded bg-gray-800 text-white resize-none"
            rows={3}
            placeholder="Enter your comment..."
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={addComment}
              className="flex-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Add Comment
            </button>
            <button
              onClick={() => {
                setAnnotationMode('view');
                setCommentText('');
              }}
              className="flex-1 px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Annotations Timeline */}
      {enableAnnotations && showAnnotationPanel && (
        <div className="absolute left-4 top-4 bottom-20 w-80 bg-black/80 rounded-lg p-4 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-semibold">Annotations</h3>
            <button
              onClick={() => setShowAnnotationPanel(false)}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-2">
            {annotations.sort((a, b) => a.timestamp - b.timestamp).map(annotation => (
              <div
                key={annotation.id}
                className={`p-2 rounded bg-gray-800 cursor-pointer hover:bg-gray-700 ${
                  selectedAnnotation === annotation.id ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => {
                  setSelectedAnnotation(annotation.id);
                  if (videoRef.current) {
                    videoRef.current.currentTime = annotation.timestamp;
                  }
                }}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>{formatTime(annotation.timestamp)}</span>
                      <span>•</span>
                      <span>{annotation.user}</span>
                    </div>
                    <div className="text-white text-sm mt-1">
                      {annotation.type === 'comment' ? (
                        <div className="flex items-start gap-2">
                          <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>{annotation.content as string}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Edit3 className="w-4 h-4" />
                          <span>Drawing annotation</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {onAnnotationDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAnnotationDelete(annotation.id);
                      }}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video Controls */}
      {showControls && !isLoading && !error && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent">
          {/* Timeline with Thumbnails */}
          <div className="px-4 pb-2">
            <div 
              ref={timelineRef}
              className="relative h-16 bg-gray-900 rounded overflow-hidden"
            >
              {/* Thumbnail Preview on Hover */}
              {hoveredTime !== null && (
                <div 
                  className="absolute top-0 transform -translate-x-1/2 bg-black rounded p-1 pointer-events-none z-10"
                  style={{ left: `${(hoveredTime / duration) * 100}%` }}
                >
                  <div className="text-white text-xs">{formatTime(hoveredTime)}</div>
                </div>
              )}

              {/* Annotation Markers */}
              {annotations.map(annotation => (
                <div
                  key={annotation.id}
                  className="absolute top-0 bottom-0 w-1 bg-yellow-500 opacity-75"
                  style={{ left: `${(annotation.timestamp / duration) * 100}%` }}
                  title={`${annotation.type} at ${formatTime(annotation.timestamp)}`}
                />
              ))}

              {/* Seek Bar */}
              <div 
                ref={seekBarRef}
                className="absolute inset-0 cursor-pointer"
                onClick={handleSeek}
                onMouseMove={handleSeekHover}
                onMouseLeave={() => setHoveredTime(null)}
              >
                {/* Progress Bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
                  <div 
                    className="h-full bg-blue-600 relative"
                    style={{ width: `${progressPercent}%` }}
                  >
                    <div className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg" />
                  </div>
                </div>
              </div>
            </div>

            {/* Time Display */}
            <div className="flex justify-between text-white text-xs mt-1">
              <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
              <span>Frame {getCurrentFrame()}</span>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="px-4 pb-4">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                {/* Play/Pause */}
                <button
                  onClick={togglePlay}
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                  title="Play/Pause (Space)"
                >
                  {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                </button>

                {/* Skip Backward */}
                <button
                  onClick={() => skip(-10)}
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                  title="Skip Backward 10s (←)"
                >
                  <SkipBack className="w-5 h-5" />
                </button>

                {/* Skip Forward */}
                <button
                  onClick={() => skip(10)}
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                  title="Skip Forward 10s (→)"
                >
                  <SkipForward className="w-5 h-5" />
                </button>

                {/* Volume Control */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className="p-2 rounded-full hover:bg-white/20 transition-colors"
                    title="Mute/Unmute (M)"
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      const newVolume = Number(e.target.value);
                      if (videoRef.current) {
                        videoRef.current.volume = newVolume;
                        setVolume(newVolume);
                        setIsMuted(newVolume === 0);
                      }
                    }}
                    className="w-20 accent-blue-600"
                  />
                </div>

                {/* Playback Speed */}
                <div className="relative group">
                  <button className="px-3 py-1 rounded hover:bg-white/20 transition-colors text-sm">
                    {playbackSpeed}x
                  </button>
                  <div className="absolute bottom-full left-0 mb-2 bg-black rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                    {PLAYBACK_SPEEDS.map(speed => (
                      <button
                        key={speed}
                        onClick={() => changePlaybackSpeed(speed)}
                        className={`block w-full px-4 py-2 text-left hover:bg-white/20 ${
                          playbackSpeed === speed ? 'text-blue-400' : ''
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                {title && (
                  <span className="ml-4 text-white font-medium">{title}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Annotation Panel Toggle */}
                {enableAnnotations && !showAnnotationPanel && (
                  <button
                    onClick={() => setShowAnnotationPanel(true)}
                    className="p-2 rounded-full hover:bg-white/20 transition-colors"
                    title="Show Annotations"
                  >
                    <MessageSquare className="w-5 h-5" />
                  </button>
                )}

                {/* Settings */}
                <button
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                  title="Settings"
                >
                  <Settings className="w-5 h-5" />
                </button>

                {/* Download */}
                <button
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                  title="Download"
                >
                  <Download className="w-5 h-5" />
                </button>

                {/* Share */}
                <button
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                  title="Share"
                >
                  <Share2 className="w-5 h-5" />
                </button>

                {/* Fullscreen */}
                <button
                  onClick={toggleFullscreen}
                  className="p-2 rounded-full hover:bg-white/20 transition-colors"
                  title="Fullscreen (F)"
                >
                  {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </button>

                {/* Close */}
                {onClose && (
                  <button
                    onClick={onClose}
                    className="p-2 rounded-full hover:bg-white/20 transition-colors ml-2"
                    title="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}