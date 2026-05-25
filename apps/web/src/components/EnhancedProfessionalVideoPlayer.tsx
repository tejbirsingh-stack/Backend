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
  Plus,
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
  Minus,
  Info,
  FileText,
  Film,
  Clock,
  HardDrive,
  Hash,
  Calendar,
  User,
  Tag,
  Layers,
  Activity,
  Palette,
  PenTool,
  ArrowUpRight
} from 'lucide-react';

interface MediaMetadata {
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

interface MediaAssetDetails {
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
  replies?: Comment[];
}

interface Comment {
  id: string;
  text: string;
  user: string;
  userId: string;
  createdAt: Date;
}

interface DrawingData {
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

interface VideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  assetDetails?: MediaAssetDetails;
  onClose?: () => void;
  enableAnnotations?: boolean;
  annotations?: Annotation[];
  onAnnotationAdd?: (annotation: Annotation) => void;
  onAnnotationUpdate?: (id: string, annotation: Partial<Annotation>) => void;
  onAnnotationDelete?: (id: string) => void;
  onCommentReply?: (annotationId: string, comment: Comment) => void;
  onTimeUpdate?: (time: number) => void;
  onPlayPause?: (isPlaying: boolean) => void;
  onDurationChange?: (duration: number) => void;
  videoRef?: React.RefObject<HTMLVideoElement>;
  annotationMode?: 'view' | 'comment' | 'draw';
  drawingTool?: string;
  drawingColor?: string;
  className?: string;
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const DRAWING_COLORS = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF', '#000000'];

export default function EnhancedProfessionalVideoPlayer({
  src,
  poster,
  title,
  assetDetails,
  onClose,
  enableAnnotations = true,
  annotations = [],
  onAnnotationAdd,
  onAnnotationUpdate,
  onAnnotationDelete,
  onCommentReply,
  onTimeUpdate,
  onPlayPause,
  onDurationChange,
  videoRef: externalVideoRef,
  annotationMode: externalAnnotationMode,
  drawingTool: externalDrawingTool,
  drawingColor: externalDrawingColor,
  className = ""
}: VideoPlayerProps) {
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalVideoRef || internalVideoRef;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 1920, height: 1080 });
  const [videoDisplayDimensions, setVideoDisplayDimensions] = useState({ width: 0, height: 0, left: 0, top: 0 });

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
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);

  // Annotation states - Two-step draw mode
  const [internalAnnotationMode, setInternalAnnotationMode] = useState<'view' | 'comment' | 'draw'>('view');
  const annotationMode = externalAnnotationMode || internalAnnotationMode;
  const setAnnotationMode = externalAnnotationMode ? () => {} : setInternalAnnotationMode;
  
  const [showDrawingTools, setShowDrawingTools] = useState(false);
  const [canStartDrawing, setCanStartDrawing] = useState(false);
  
  const [internalDrawingTool, setInternalDrawingTool] = useState<DrawingData['tool']>('rectangle');
  const drawingTool = (externalDrawingTool as DrawingData['tool']) || internalDrawingTool;
  const setDrawingTool = externalDrawingTool ? () => {} : setInternalDrawingTool;
  
  const [internalDrawingColor, setInternalDrawingColor] = useState('#FF0000');
  const drawingColor = externalDrawingColor || internalDrawingColor;
  const setDrawingColor = externalDrawingColor ? () => {} : setInternalDrawingColor;
  
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDrawing, setCurrentDrawing] = useState<Partial<DrawingData> | null>(null);
  const [penPoints, setPenPoints] = useState<{ x: number; y: number }[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(false);
  const [showDetailsOverlay, setShowDetailsOverlay] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [videoQuality, setVideoQuality] = useState('auto');

  // Handle external annotation mode changes
  useEffect(() => {
    if (externalAnnotationMode === 'draw' && externalDrawingTool && externalDrawingColor) {
      setShowDrawingTools(true);
      setCanStartDrawing(true);
      console.log('Activated drawing mode from panel:', { tool: externalDrawingTool, color: externalDrawingColor });
    } else if (externalAnnotationMode === 'view') {
      setShowDrawingTools(false);
      setCanStartDrawing(false);
    }
  }, [externalAnnotationMode, externalDrawingTool, externalDrawingColor]);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [highlightedAnnotation, setHighlightedAnnotation] = useState<string | null>(null);

  const hideControlsTimeout = useRef<NodeJS.Timeout>();

  // Update canvas dimensions to match actual video display area
  useEffect(() => {
    const updateDimensions = () => {
      const video = videoRef.current;
      const container = containerRef.current;
      if (!video || !container) return;

      // Get container dimensions
      const containerRect = container.getBoundingClientRect();
      
      // Account for controls area (100px at bottom)
      const controlsHeight = 100;
      const availableHeight = containerRect.height - controlsHeight;
      
      // Calculate video display dimensions maintaining aspect ratio
      const videoAspectRatio = video.videoWidth / video.videoHeight;
      const containerAspectRatio = containerRect.width / availableHeight;
      
      let displayWidth, displayHeight, offsetX, offsetY;
      
      if (videoAspectRatio > containerAspectRatio) {
        // Video is wider than container
        displayWidth = containerRect.width;
        displayHeight = containerRect.width / videoAspectRatio;
        offsetX = 0;
        offsetY = (availableHeight - displayHeight) / 2;
      } else {
        // Video is taller than container
        displayHeight = availableHeight;
        displayWidth = availableHeight * videoAspectRatio;
        offsetX = (containerRect.width - displayWidth) / 2;
        offsetY = 0;
      }
      
      setVideoDisplayDimensions({
        width: displayWidth,
        height: displayHeight,
        left: offsetX,
        top: offsetY
      });
      
      // Set canvas to match video's natural dimensions for drawing resolution
      setCanvasDimensions({
        width: video.videoWidth || 1920,
        height: video.videoHeight || 1080
      });
    };

    // Update on video metadata load
    const video = videoRef.current;
    if (video) {
      video.addEventListener('loadedmetadata', updateDimensions);
      video.addEventListener('resize', updateDimensions);
    }

    // Update on window resize
    window.addEventListener('resize', updateDimensions);
    
    // Initial update
    updateDimensions();

    return () => {
      if (video) {
        video.removeEventListener('loadedmetadata', updateDimensions);
        video.removeEventListener('resize', updateDimensions);
      }
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      onDurationChange?.(video.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      onPlayPause?.(true);
    };
    const handlePause = () => {
      setIsPlaying(false);
      onPlayPause?.(false);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      onPlayPause?.(false);
    };
    const handleError = () => {
      setError('Failed to load video');
      setIsLoading(false);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
    };
  }, [onDurationChange, onTimeUpdate, onPlayPause]);

  // Set canvas element dimensions to match video display area
  useEffect(() => {
    const canvas = canvasRef.current;
    const videoContainer = containerRef.current;
    if (!canvas || !videoContainer) return;

    // Set canvas display size to match video container (excluding controls)
    const containerRect = videoContainer.getBoundingClientRect();
    const controlsHeight = 100;
    const availableHeight = containerRect.height - controlsHeight;
    
    canvas.style.width = `${containerRect.width}px`;
    canvas.style.height = `${availableHeight}px`;
    
    // Set canvas internal resolution to match video's natural dimensions for drawing accuracy
    canvas.width = canvasDimensions.width;
    canvas.height = canvasDimensions.height;
  }, [videoDisplayDimensions, canvasDimensions]);

  // Continuous canvas update for smooth annotation display
  useEffect(() => {
    const animate = () => {
      updateCanvas();
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    if (enableAnnotations) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [currentTime, annotations, isDrawing, currentDrawing, highlightedAnnotation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch(e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'm':
          toggleMute();
          break;
        case 'arrowleft':
          skip(e.shiftKey ? -1/30 : -10);
          break;
        case 'arrowright':
          skip(e.shiftKey ? 1/30 : 10);
          break;
        case 'arrowup':
          e.preventDefault();
          adjustVolume(0.1);
          break;
        case 'arrowdown':
          e.preventDefault();
          adjustVolume(-0.1);
          break;
        case 'd':
          if (enableAnnotations) {
            handleDrawModeToggle();
          }
          break;
        case 'c':
          if (enableAnnotations) {
            setAnnotationMode(annotationMode === 'comment' ? 'view' : 'comment');
          }
          break;
        case 'escape':
          exitDrawMode();
          break;
        case 'i':
          setShowDetailsOverlay(!showDetailsOverlay);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isPlaying, annotationMode, showDetailsOverlay]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    // Don't hide controls - keep them always visible
  }, []);

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
    const fps = assetDetails?.metadata?.fps || 30;
    const frameTime = 1 / fps;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + (frames * frameTime)));
  }, [assetDetails]);

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

  // Two-step draw mode implementation
  const handleDrawModeToggle = useCallback(() => {
    if (annotationMode === 'draw') {
      exitDrawMode();
    } else {
      // Step 1: Enter draw mode and show tools
      setAnnotationMode('draw');
      setShowDrawingTools(true);
      setCanStartDrawing(false);
      console.log('📐 Draw mode activated - Select a tool first');
    }
  }, [annotationMode]);

  const exitDrawMode = useCallback(() => {
    setAnnotationMode('view');
    setShowDrawingTools(false);
    setCanStartDrawing(false);
    setIsDrawing(false);
    setCurrentDrawing(null);
    setPenPoints([]);
    console.log('👁️ Exited draw mode');
  }, []);

  const handleToolSelect = useCallback((tool: DrawingData['tool']) => {
    setDrawingTool(tool);
    setCanStartDrawing(true);
    console.log(`🛠️ Tool selected: ${tool} - Click on video to start drawing`);
  }, []);

  const handleColorSelect = useCallback((color: string) => {
    setDrawingColor(color);
    if (!canStartDrawing && annotationMode === 'draw') {
      setCanStartDrawing(true);
    }
  }, [canStartDrawing, annotationMode]);

  const updateCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Display all annotations that should be visible at current time
    const visibleAnnotations = annotations.filter(a => {
      if (a.type === 'drawing') {
        // Show annotation for 10 seconds or until next annotation
        const nextAnnotation = annotations.find(nextA => 
          nextA.timestamp > a.timestamp && nextA.type === 'drawing'
        );
        const displayUntil = nextAnnotation 
          ? Math.min(a.timestamp + 10, nextAnnotation.timestamp)
          : a.timestamp + 10;
        
        return currentTime >= a.timestamp && currentTime <= displayUntil;
      }
      return false;
    });

    // Draw visible annotations
    visibleAnnotations.forEach(annotation => {
      if (annotation.type === 'drawing' && typeof annotation.content !== 'string') {
        const age = currentTime - annotation.timestamp;
        const fadeStartTime = 7;
        const fadeDuration = 3;
        
        let opacity = 1;
        if (age > fadeStartTime) {
          opacity = Math.max(0.3, 1 - ((age - fadeStartTime) / fadeDuration));
        }
        
        // Highlight effect for jumped-to annotations
        if (highlightedAnnotation === annotation.id) {
          const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;
          opacity = Math.min(1, opacity * pulse + 0.3);
          
          // Draw highlight border
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 5;
          ctx.globalAlpha = pulse;
          ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
          ctx.globalAlpha = 1;
        }
        
        ctx.globalAlpha = opacity;
        drawAnnotation(ctx, annotation.content as DrawingData);
        ctx.globalAlpha = 1;
      }
    });

    // Draw current drawing in progress
    if (isDrawing && currentDrawing) {
      ctx.globalAlpha = 1;
      drawAnnotation(ctx, currentDrawing as DrawingData);
    }

    // Visual feedback when in draw mode
    if (annotationMode === 'draw' && showDrawingTools) {
      ctx.strokeStyle = canStartDrawing ? '#00FF00' : '#FFA500';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.2;
      ctx.setLineDash([10, 10]);
      ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }, [currentTime, annotations, isDrawing, currentDrawing, annotationMode, highlightedAnnotation, showDrawingTools, canStartDrawing]);

  const drawAnnotation = (ctx: CanvasRenderingContext2D, drawing: DrawingData) => {
    ctx.strokeStyle = drawing.color || '#FF0000';
    ctx.lineWidth = (drawing.strokeWidth || 3) * 2;
    ctx.fillStyle = drawing.color || '#FF0000';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Strong shadow for visibility
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

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
      case 'pen':
        if (drawing.points && drawing.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(drawing.points[0].x, drawing.points[0].y);
          for (let i = 1; i < drawing.points.length; i++) {
            ctx.lineTo(drawing.points[i].x, drawing.points[i].y);
          }
          ctx.stroke();
        }
        break;
      case 'text':
        if (drawing.text) {
          ctx.font = `bold ${drawing.strokeWidth * 8}px Arial`;
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 4;
          ctx.strokeText(drawing.text, drawing.startX, drawing.startY);
          ctx.fillStyle = drawing.color;
          ctx.fillText(drawing.text, drawing.startX, drawing.startY);
        }
        break;
    }
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  };

  const drawArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
    const headLength = 20;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI/6), toY - headLength * Math.sin(angle - Math.PI/6));
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI/6), toY - headLength * Math.sin(angle + Math.PI/6));
    ctx.stroke();
  };

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (annotationMode !== 'draw' || !canStartDrawing) {
      if (annotationMode === 'draw' && !canStartDrawing) {
        console.log('⚠️ Please select a drawing tool first');
      }
      return;
    }
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    // Calculate position relative to actual video display area
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvasDimensions.width / videoDisplayDimensions.width;
    const scaleY = canvasDimensions.height / videoDisplayDimensions.height;
    
    const x = (e.clientX - rect.left - videoDisplayDimensions.left) * scaleX;
    const y = (e.clientY - rect.top - videoDisplayDimensions.top) * scaleY;
    
    // Ensure coordinates are within canvas bounds
    if (x < 0 || y < 0 || x > canvasDimensions.width || y > canvasDimensions.height) {
      console.log('Click outside video area');
      return;
    }
    
    console.log('🎨 Starting to draw:', { tool: drawingTool, color: drawingColor, position: { x, y } });

    // Handle text tool
    if (drawingTool === 'text') {
      const text = prompt('Enter text for annotation:');
      if (text) {
        const annotation: Annotation = {
          id: `annotation-${Date.now()}`,
          timestamp: currentTime,
          type: 'drawing',
          content: {
            tool: 'text',
            color: drawingColor,
            strokeWidth: strokeWidth,
            startX: x,
            startY: y,
            text: text
          } as DrawingData,
          user: assetDetails?.owner || 'Current User',
          userId: 'user-1',
          createdAt: new Date()
        };
        onAnnotationAdd?.(annotation);
        console.log('📝 Text annotation added:', text);
      }
      return;
    }

    // Start drawing for other tools
    setIsDrawing(true);
    
    if (drawingTool === 'pen') {
      setPenPoints([{ x, y }]);
      setCurrentDrawing({
        tool: 'pen',
        points: [{ x, y }],
        color: drawingColor,
        strokeWidth: strokeWidth,
        startX: x,
        startY: y
      });
    } else {
      setCurrentDrawing({
        tool: drawingTool,
        startX: x,
        startY: y,
        color: drawingColor,
        strokeWidth: strokeWidth
      });
    }
  }, [annotationMode, canStartDrawing, drawingTool, drawingColor, strokeWidth, currentTime, canvasDimensions, videoDisplayDimensions, onAnnotationAdd, assetDetails]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvasDimensions.width / videoDisplayDimensions.width;
    const scaleY = canvasDimensions.height / videoDisplayDimensions.height;
    
    const x = (e.clientX - rect.left - videoDisplayDimensions.left) * scaleX;
    const y = (e.clientY - rect.top - videoDisplayDimensions.top) * scaleY;

    if (drawingTool === 'pen') {
      const newPoints = [...(currentDrawing.points || []), { x, y }];
      setCurrentDrawing(prev => ({
        ...prev!,
        points: newPoints,
        endX: x,
        endY: y
      }));
    } else {
      setCurrentDrawing(prev => ({
        ...prev!,
        endX: x,
        endY: y
      }));
    }
  }, [isDrawing, currentDrawing, drawingTool, canvasDimensions, videoDisplayDimensions]);

  const handleCanvasMouseUp = useCallback(() => {
    if (!isDrawing || !currentDrawing) return;

    console.log('🎨 Finishing drawing:', currentDrawing);

    if ((currentDrawing.endX && currentDrawing.endY) || (drawingTool === 'pen' && currentDrawing.points)) {
      if (onAnnotationAdd) {
        const annotation: Annotation = {
          id: `annotation-${Date.now()}`,
          timestamp: currentTime,
          type: 'drawing',
          content: currentDrawing as DrawingData,
          user: assetDetails?.owner || 'Current User',
          userId: 'user-1',
          createdAt: new Date()
        };
        console.log('📝 Creating annotation:', annotation);
        onAnnotationAdd(annotation);
        
        // Force canvas update
        updateCanvas();
      }
    }

    setIsDrawing(false);
    setCurrentDrawing(null);
    setPenPoints([]);
  }, [isDrawing, currentDrawing, currentTime, onAnnotationAdd, drawingTool, assetDetails, updateCanvas]);

  const addComment = useCallback(() => {
    if (!commentText.trim() || !onAnnotationAdd) return;

    const annotation: Annotation = {
      id: `annotation-${Date.now()}`,
      timestamp: currentTime,
      type: 'comment',
      content: commentText,
      user: assetDetails?.owner || 'Current User',
      userId: 'user-1',
      createdAt: new Date(),
      replies: []
    };
    
    onAnnotationAdd(annotation);
    setCommentText('');
    setAnnotationMode('view');
  }, [commentText, currentTime, onAnnotationAdd, assetDetails]);

  const addReply = useCallback(() => {
    if (!replyText.trim() || !replyingTo || !onCommentReply) return;

    const reply: Comment = {
      id: `reply-${Date.now()}`,
      text: replyText,
      user: assetDetails?.owner || 'Current User',
      userId: 'user-1',
      createdAt: new Date()
    };

    onCommentReply(replyingTo, reply);
    setReplyText('');
    setReplyingTo(null);
  }, [replyText, replyingTo, onCommentReply, assetDetails]);

  const jumpToAnnotation = useCallback((annotation: Annotation) => {
    if (videoRef.current) {
      videoRef.current.currentTime = annotation.timestamp;
      setCurrentTime(annotation.timestamp);
      setHighlightedAnnotation(annotation.id);
      
      // Force immediate canvas update
      updateCanvas();
      
      // Remove highlight after 3 seconds
      setTimeout(() => setHighlightedAnnotation(null), 3000);
      
      console.log(`⏰ Jumped to annotation at ${annotation.timestamp}s`);
    }
  }, [updateCanvas]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`relative bg-black ${isFullscreen ? 'fixed inset-0 z-50' : ''} ${className}`}
      onMouseMove={showControlsTemporarily}
      onMouseEnter={showControlsTemporarily}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0, // Important for flex children
        position: 'relative'
      }}
    >
      {/* Video Container - Full size with controls overlaid */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          zIndex: 1
        }}
      >
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          style={{
            zIndex: 1,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block'
          }}
          controls={false}
          preload="metadata"
          onClick={togglePlay}
        />

        {/* Annotation Canvas - Only for drawing on video, positioned same as video container */}
        {/* Canvas is always rendered but only interactive in draw mode */}
        <canvas
          ref={canvasRef}
          className="absolute"
          style={{ 
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: enableAnnotations && annotationMode === 'draw' ? 10 : 2,
            cursor: enableAnnotations && annotationMode === 'draw' ? 'crosshair' : 'default',
            width: '100%',
            height: '100%',
            pointerEvents: enableAnnotations && annotationMode === 'draw' ? 'auto' : 'none' // Only block events in draw mode
          }}
          onMouseDown={enableAnnotations && annotationMode === 'draw' ? handleCanvasMouseDown : undefined}
          onMouseMove={enableAnnotations && annotationMode === 'draw' ? handleCanvasMouseMove : undefined}
          onMouseUp={enableAnnotations && annotationMode === 'draw' ? handleCanvasMouseUp : undefined}
          onMouseLeave={enableAnnotations && annotationMode === 'draw' ? handleCanvasMouseUp : undefined}
        />

        {/* Remove the Drawing Tools Panel - it's now in the right panel */}
        {false && annotationMode === 'draw' && showDrawingTools && (
          <div className="absolute top-4 right-4 bg-black/90 backdrop-blur-md rounded-lg p-4 z-60" style={{ zIndex: 60 }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">Drawing Tools</h3>
                <button
                  onClick={exitDrawMode}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              {/* Tool Selection */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { tool: 'rectangle' as const, icon: Square, label: 'Rectangle' },
                  { tool: 'circle' as const, icon: Circle, label: 'Circle' },
                  { tool: 'arrow' as const, icon: ArrowUpRight, label: 'Arrow' },
                  { tool: 'line' as const, icon: Minus, label: 'Line' },
                  { tool: 'pen' as const, icon: PenTool, label: 'Pen' },
                  { tool: 'text' as const, icon: Type, label: 'Text' }
                ].map(({ tool, icon: Icon, label }) => (
                  <button
                    key={tool}
                    onClick={() => handleToolSelect(tool)}
                    className={`p-2 rounded flex flex-col items-center gap-1 transition-colors ${
                      drawingTool === tool 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                    }`}
                    title={label}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs">{label}</span>
                  </button>
                ))}
              </div>
              
              {/* Color Selection */}
              <div className="mb-3">
                <label className="text-xs text-gray-400 block mb-1">Color</label>
                <div className="grid grid-cols-4 gap-1">
                  {DRAWING_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => handleColorSelect(color)}
                      className={`w-8 h-8 rounded border-2 ${
                        drawingColor === color ? 'border-white' : 'border-gray-600'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              
              {/* Stroke Width */}
              <div className="mb-3">
                <label className="text-xs text-gray-400 block mb-1">Stroke Width: {strokeWidth}px</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              
              {/* Status */}
              <div className={`text-xs text-center p-2 rounded ${
                canStartDrawing 
                  ? 'bg-green-900/50 text-green-400' 
                  : 'bg-yellow-900/50 text-yellow-400'
              }`}>
                {canStartDrawing 
                  ? '✓ Click on video to draw' 
                  : 'Select a tool to start'}
              </div>
            </div>
          )}

          {/* Annotation controls removed - they're in the right panel now */}

      {/* Comment Input Modal */}
      {annotationMode === 'comment' && (
        <div 
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/90 rounded-lg p-4 min-w-[300px]"
          style={{ 
            zIndex: 5000, // Lower than controls
            marginBottom: '60px' // Ensure it doesn't overlap controls area
          }}
        >
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

      {/* Enhanced Annotation Management Panel */}
      {enableAnnotations && showAnnotationPanel && (
        <div 
          className="absolute left-4 top-4 w-96 bg-black/90 backdrop-blur-md rounded-lg overflow-hidden"
          style={{ 
            bottom: '120px', // Position above controls (100px controls + 20px margin)
            zIndex: 5000, // Lower than controls but still visible
            maxHeight: 'calc(100% - 140px)' // Ensure it doesn't overlap controls
          }}
        >
          <div className="p-4 border-b border-gray-700">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-white font-semibold text-lg">Annotations & Comments</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">
                  {annotations.length} total
                </span>
                <button
                  onClick={() => setShowAnnotationPanel(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Quick Actions */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  if (confirm('Delete all annotations? This cannot be undone.')) {
                    annotations.forEach(ann => onAnnotationDelete?.(ann.id));
                    localStorage.removeItem(`annotations_${assetDetails?.id}`);
                    console.log('🗑️ All annotations deleted');
                  }
                }}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Clear All
              </button>
              <button
                onClick={() => {
                  const data = JSON.stringify(annotations, null, 2);
                  const blob = new Blob([data], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `annotations_${assetDetails?.name || 'video'}_${Date.now()}.json`;
                  a.click();
                  console.log('💾 Annotations exported');
                }}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                Export
              </button>
            </div>
          </div>
          
          <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
            <div className="space-y-2">
            {annotations.sort((a, b) => a.timestamp - b.timestamp).map(annotation => (
              <div
                key={annotation.id}
                className={`p-3 rounded bg-gray-800 cursor-pointer hover:bg-gray-700 ${
                  selectedAnnotation === annotation.id ? 'ring-2 ring-blue-500' : ''
                } ${highlightedAnnotation === annotation.id ? 'animate-pulse bg-blue-900/30' : ''}`}
                onClick={() => jumpToAnnotation(annotation)}
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
                        <div>
                          <div className="flex items-start gap-2">
                            <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>{annotation.content as string}</span>
                          </div>
                          
                          {annotation.replies && annotation.replies.length > 0 && (
                            <div className="ml-6 mt-2 space-y-1">
                              {annotation.replies.map(reply => (
                                <div key={reply.id} className="text-xs text-gray-400">
                                  <span className="text-gray-300">{reply.user}:</span> {reply.text}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {replyingTo === annotation.id ? (
                            <div className="ml-6 mt-2">
                              <input
                                type="text"
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && addReply()}
                                placeholder="Add reply..."
                                className="w-full px-2 py-1 bg-gray-900 text-white text-xs rounded"
                                autoFocus
                              />
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReplyingTo(annotation.id);
                              }}
                              className="ml-6 mt-1 text-xs text-blue-400 hover:text-blue-300"
                            >
                              Reply
                            </button>
                          )}
                        </div>
                      ) : annotation.type === 'drawing' ? (
                        <div className="flex items-center gap-2">
                          <Edit3 className="w-4 h-4 text-yellow-400" />
                          <span className="text-xs">
                            {(annotation.content as any).tool || 'Drawing'} - {(annotation.content as any).color}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Type className="w-4 h-4 text-green-400" />
                          <span>Text annotation</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {onAnnotationDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete this ${annotation.type}?`)) {
                            onAnnotationDelete(annotation.id);
                            console.log(`🗑️ Deleted annotation: ${annotation.id}`);
                          }
                        }}
                        className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-gray-700"
                        title="Delete annotation"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Video Controls - Fixed position ensures always visible at viewport bottom */}
      <div
        className="text-white"
        style={{
          position: isFullscreen ? 'fixed' : 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '120px',
          minHeight: '120px',
          maxHeight: '120px',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.7) 70%, transparent 100%)',
          pointerEvents: 'auto'
        }}
      >
        {/* ALWAYS show controls - no conditional rendering */}
        <div className="px-3 flex flex-col justify-between" style={{ height: '100%', position: 'relative', paddingTop: '4px', paddingBottom: '8px' }}>

          {/* Loading/Error overlay - shows ON TOP of controls, doesn't hide them */}
          {(isLoading || error) && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 5
            }}>
              {error ? (
                <div className="text-red-400 text-lg">{error}</div>
              ) : (
                <div className="text-gray-400 text-lg">Loading video...</div>
              )}
            </div>
          )}

          {/* ACTUAL CONTROLS - ALWAYS RENDERED */}
            <div 
              ref={timelineRef}
              className="relative h-8 bg-gray-900 rounded overflow-hidden flex-shrink-0"
            >
              {hoveredTime !== null && (
                <div 
                  className="absolute top-0 transform -translate-x-1/2 bg-black rounded p-1 pointer-events-none z-10"
                  style={{ left: `${(hoveredTime / duration) * 100}%` }}
                >
                  <div className="text-white text-xs">{formatTime(hoveredTime)}</div>
                </div>
              )}

              {annotations.map(annotation => (
                <div
                  key={annotation.id}
                  className="absolute top-0 bottom-0 w-1 bg-yellow-500 opacity-75"
                  style={{ left: `${(annotation.timestamp / duration) * 100}%` }}
                  title={`${annotation.type} at ${formatTime(annotation.timestamp)}`}
                />
              ))}

              <div 
                ref={seekBarRef}
                className="absolute inset-0 cursor-pointer"
                onClick={handleSeek}
                onMouseMove={handleSeekHover}
                onMouseLeave={() => setHoveredTime(null)}
              >
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>

                <button
                  onClick={() => skip(-10)}
                  className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                  title="Back 10s"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  onClick={() => skip(10)}
                  className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                  title="Forward 10s"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2 ml-3">
                  <button
                    onClick={toggleMute}
                    className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      const newVolume = parseFloat(e.target.value);
                      if (videoRef.current) {
                        videoRef.current.volume = newVolume;
                        setVolume(newVolume);
                        setIsMuted(newVolume === 0);
                      }
                    }}
                    className="w-24"
                  />
                </div>

                <div className="text-white text-xs ml-2">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Annotation Controls */}
                {enableAnnotations && (
                  <>
                    <button
                      onClick={() => setShowAnnotationPanel(!showAnnotationPanel)}
                      className={`p-1.5 rounded-full transition-colors ${
                        showAnnotationPanel ? 'bg-blue-600 text-white' : 'hover:bg-white/10 text-white'
                      }`}
                      title="Toggle Annotations Panel"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setAnnotationMode(annotationMode === 'comment' ? 'view' : 'comment')}
                      className={`p-1.5 rounded-full transition-colors ${
                        annotationMode === 'comment' ? 'bg-green-600 text-white' : 'hover:bg-white/10 text-white'
                      }`}
                      title="Add Comment (C)"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (annotationMode === 'draw') {
                          exitDrawMode();
                        } else {
                          setAnnotationMode('draw');
                          setShowDrawingTools(true);
                        }
                      }}
                      className={`p-1.5 rounded-full transition-colors ${
                        annotationMode === 'draw' ? 'bg-yellow-600 text-white' : 'hover:bg-white/10 text-white'
                      }`}
                      title="Drawing Mode (D)"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </>
                )}
                
                <select
                  value={playbackSpeed}
                  onChange={(e) => changePlaybackSpeed(parseFloat(e.target.value))}
                  className="bg-transparent text-white text-sm px-2 py-1 rounded hover:bg-white/10"
                >
                  {PLAYBACK_SPEEDS.map(speed => (
                    <option key={speed} value={speed} className="bg-black">
                      {speed}x
                    </option>
                  ))}
                </select>

                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                  title="Fullscreen (F)"
                >
                  {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </button>

                {onClose && (
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-full hover:bg-white/20 transition-colors ml-1"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}