import React, { useState, useCallback } from 'react';
import { 
  FileText, 
  MessageSquare, 
  Calendar, 
  HardDrive, 
  Tag, 
  User, 
  Film, 
  Image, 
  Music, 
  FileIcon,
  Hash,
  Clock,
  Layers,
  Send,
  Heart,
  Reply,
  MoreVertical,
  Edit3,
  Square,
  Circle,
  Type,
  MousePointer,
  Trash2,
  Play,
  Pause,
  PenTool,
  Minus,
  ArrowUpRight,
  X,
  Check
} from 'lucide-react';
import type { Annotation, Comment, DrawingData } from './InPageMediaViewer';

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

interface DetailsPanelProps {
  asset: MediaAsset;
  annotations?: Annotation[];
  currentTime?: number;
  isPlaying?: boolean;
  onAnnotationAdd?: (annotation: Annotation) => void;
  onAnnotationDelete?: (id: string) => void;
  onAnnotationSelect?: (annotation: Annotation) => void;
  onSeek?: (timestamp: number) => void;
  onStartAnnotation?: (type: 'comment' | 'drawing', tool?: string, color?: string) => void;
}

const DRAWING_COLORS = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF', '#000000'];
const STROKE_WIDTHS = [2, 4, 6, 8];

export default function DetailsPanelWithAnnotationsEnhanced({ 
  asset, 
  annotations = [],
  currentTime = 0,
  isPlaying = false,
  onAnnotationAdd,
  onAnnotationDelete,
  onAnnotationSelect,
  onSeek,
  onStartAnnotation
}: DetailsPanelProps) {
  // Default to Comments & Annotations tab
  const [activeTab, setActiveTab] = useState<'details' | 'comments'>('comments');
  const [newComment, setNewComment] = useState('');
  const [showAnnotationTools, setShowAnnotationTools] = useState(false);
  const [annotationType, setAnnotationType] = useState<'comment' | 'drawing'>('comment');
  const [selectedTool, setSelectedTool] = useState<string>('rectangle');
  const [selectedColor, setSelectedColor] = useState('#FF0000');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [annotationText, setAnnotationText] = useState('');

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatTimestamp = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getFileIcon = () => {
    const type = asset.type?.toLowerCase() || '';
    if (type.includes('video')) return <Film className="w-5 h-5" />;
    if (type.includes('image')) return <Image className="w-5 h-5" />;
    if (type.includes('audio')) return <Music className="w-5 h-5" />;
    return <FileIcon className="w-5 h-5" />;
  };

  const handleAddComment = () => {
    if (newComment.trim() && onAnnotationAdd) {
      const annotation: Annotation = {
        id: Date.now().toString(),
        timestamp: currentTime,
        type: 'comment',
        content: newComment,
        user: 'Current User',
        userId: 'current-user-id',
        createdAt: new Date(),
        color: selectedColor
      };
      onAnnotationAdd(annotation);
      setNewComment('');
    }
  };

  const handleShowAnnotationTools = () => {
    setShowAnnotationTools(true);
  };

  const handleSelectTool = (tool: string) => {
    setSelectedTool(tool);
    setAnnotationType('drawing');
  };

  const handleSelectColor = (color: string) => {
    setSelectedColor(color);
  };

  const handleStartAnnotation = () => {
    if (annotationType === 'comment' && annotationText.trim()) {
      // Add text annotation
      const annotation: Annotation = {
        id: Date.now().toString(),
        timestamp: currentTime,
        content: annotationText,
        type: 'comment',
        user: 'Current User',
        userId: 'current-user-id',
        createdAt: new Date(),
        color: selectedColor
      };
      onAnnotationAdd?.(annotation);
      setAnnotationText('');
      setShowAnnotationTools(false);
    } else if (annotationType === 'drawing') {
      // Notify parent to start drawing mode on video
      onStartAnnotation?.('drawing', selectedTool, selectedColor);
      setShowAnnotationTools(false);
    }
  };

  const handleAnnotationClick = (annotation: Annotation) => {
    if (onSeek) {
      onSeek(annotation.timestamp);
    }
    if (onAnnotationSelect) {
      onAnnotationSelect(annotation);
    }
  };

  const getAnnotationIcon = (annotation: Annotation) => {
    if (annotation.type === 'drawing') {
      const drawingData = annotation.content as DrawingData;
      if (drawingData?.tool === 'rectangle') return '▢';
      if (drawingData?.tool === 'circle') return '○';
      if (drawingData?.tool === 'arrow') return '→';
      if (drawingData?.tool === 'pen') return '✏️';
      if (drawingData?.tool === 'text') return 'T';
      return '✏️';
    }
    return '📝';
  };

  // Sort annotations by timestamp
  const sortedAnnotations = [...annotations].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div className="w-[400px] bg-slate-900 border-l border-slate-700 flex flex-col h-full">
      {/* Tab Navigation */}
      <div className="flex border-b border-slate-700">
        <button
          onClick={() => setActiveTab('comments')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'comments'
              ? 'text-purple-400 border-b-2 border-purple-400 bg-slate-800/50'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/30'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Comments & Annotations
          </div>
        </button>
        <button
          onClick={() => setActiveTab('details')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'details'
              ? 'text-purple-400 border-b-2 border-purple-400 bg-slate-800/50'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/30'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <FileText className="w-4 h-4" />
            Details
          </div>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'details' ? (
          <div className="p-4 space-y-4">
            {/* File Info */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                {getFileIcon()}
                File Information
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Name:</span>
                  <span className="text-slate-200 font-medium">{asset.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Size:</span>
                  <span className="text-slate-200">{formatFileSize(asset.size)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Type:</span>
                  <span className="text-slate-200">{asset.type}</span>
                </div>
                {asset.duration && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Duration:</span>
                    <span className="text-slate-200">{formatDuration(asset.duration)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Technical Details */}
            {asset.metadata && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Technical Details
                </h3>
                <div className="space-y-2 text-sm">
                  {asset.metadata.width && asset.metadata.height && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Dimensions:</span>
                      <span className="text-slate-200">{asset.metadata.width} × {asset.metadata.height}</span>
                    </div>
                  )}
                  {asset.metadata.fps && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Frame Rate:</span>
                      <span className="text-slate-200">{asset.metadata.fps} fps</span>
                    </div>
                  )}
                  {asset.metadata.codec && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Codec:</span>
                      <span className="text-slate-200">{asset.metadata.codec}</span>
                    </div>
                  )}
                  {asset.metadata.bitrate && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Bitrate:</span>
                      <span className="text-slate-200">{asset.metadata.bitrate}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tags */}
            {asset.tags && asset.tags.length > 0 && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {asset.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded-md text-xs"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Annotations Section for Video */}
            {asset.type?.toLowerCase().includes('video') && (
              <div className="border-b border-slate-700">
                <div className="p-4">
                  <h3 className="text-white font-semibold mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Edit3 className="w-4 h-4" />
                      Annotations ({sortedAnnotations.length})
                    </span>
                    <span className="text-xs text-slate-400">
                      {isPlaying ? <Play className="w-3 h-3 inline" /> : <Pause className="w-3 h-3 inline" />}
                      {' '}{formatTimestamp(currentTime)}
                    </span>
                  </h3>
                  
                  {/* Add Annotation Button */}
                  <div className="mb-3">
                    {!showAnnotationTools ? (
                      <button
                        onClick={handleShowAnnotationTools}
                        className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <Edit3 className="w-4 h-4" />
                        Add Annotation at {formatTimestamp(currentTime)}
                      </button>
                    ) : (
                      <div className="bg-slate-800 rounded-lg p-3 space-y-3">
                        {/* Annotation Type Selection */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => setAnnotationType('comment')}
                            className={`flex-1 px-3 py-2 rounded-lg transition-colors ${
                              annotationType === 'comment'
                                ? 'bg-purple-600 text-white'
                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                          >
                            <MessageSquare className="w-4 h-4 inline mr-1" />
                            Comment
                          </button>
                          <button
                            onClick={() => setAnnotationType('drawing')}
                            className={`flex-1 px-3 py-2 rounded-lg transition-colors ${
                              annotationType === 'drawing'
                                ? 'bg-purple-600 text-white'
                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                          >
                            <PenTool className="w-4 h-4 inline mr-1" />
                            Drawing
                          </button>
                        </div>

                        {/* Comment Input */}
                        {annotationType === 'comment' && (
                          <input
                            type="text"
                            value={annotationText}
                            onChange={(e) => setAnnotationText(e.target.value)}
                            placeholder="Enter annotation text..."
                            className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                            autoFocus
                          />
                        )}

                        {/* Drawing Tools */}
                        {annotationType === 'drawing' && (
                          <>
                            <div className="space-y-2">
                              <div className="text-xs text-slate-400 mb-1">Drawing Tools:</div>
                              <div className="grid grid-cols-6 gap-1">
                                <button
                                  onClick={() => handleSelectTool('rectangle')}
                                  className={`p-2 rounded transition-colors ${
                                    selectedTool === 'rectangle' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                  }`}
                                  title="Rectangle"
                                >
                                  <Square className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleSelectTool('circle')}
                                  className={`p-2 rounded transition-colors ${
                                    selectedTool === 'circle' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                  }`}
                                  title="Circle"
                                >
                                  <Circle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleSelectTool('arrow')}
                                  className={`p-2 rounded transition-colors ${
                                    selectedTool === 'arrow' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                  }`}
                                  title="Arrow"
                                >
                                  <ArrowUpRight className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleSelectTool('line')}
                                  className={`p-2 rounded transition-colors ${
                                    selectedTool === 'line' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                  }`}
                                  title="Line"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleSelectTool('pen')}
                                  className={`p-2 rounded transition-colors ${
                                    selectedTool === 'pen' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                  }`}
                                  title="Pen"
                                >
                                  <PenTool className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleSelectTool('text')}
                                  className={`p-2 rounded transition-colors ${
                                    selectedTool === 'text' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                  }`}
                                  title="Text"
                                >
                                  <Type className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="text-xs text-slate-400 mb-1">Colors:</div>
                              <div className="flex gap-1">
                                {DRAWING_COLORS.map((color) => (
                                  <button
                                    key={color}
                                    onClick={() => handleSelectColor(color)}
                                    className={`w-8 h-8 rounded border-2 transition-all ${
                                      selectedColor === color ? 'border-white scale-110' : 'border-transparent'
                                    }`}
                                    style={{ backgroundColor: color }}
                                  />
                                ))}
                              </div>
                            </div>

                            <div className="text-xs text-slate-400">
                              Click "Start Drawing" then draw on the video
                            </div>
                          </>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          <button
                            onClick={handleStartAnnotation}
                            disabled={annotationType === 'comment' && !annotationText.trim()}
                            className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-1"
                          >
                            <Check className="w-4 h-4" />
                            {annotationType === 'drawing' ? 'Start Drawing' : 'Add'}
                          </button>
                          <button
                            onClick={() => {
                              setShowAnnotationTools(false);
                              setAnnotationText('');
                            }}
                            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Annotations List */}
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {sortedAnnotations.length > 0 ? (
                      sortedAnnotations.map((annotation) => (
                        <div
                          key={annotation.id}
                          className="bg-slate-800/50 rounded-lg p-2 cursor-pointer hover:bg-slate-800 transition-colors group"
                          onClick={() => handleAnnotationClick(annotation)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs text-purple-400 font-medium">
                                  {formatTimestamp(annotation.timestamp)}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {getAnnotationIcon(annotation)}
                                </span>
                                {annotation.color && (
                                  <span 
                                    className="w-3 h-3 rounded-full border border-slate-600"
                                    style={{ backgroundColor: annotation.color }}
                                  />
                                )}
                              </div>
                              <p className="text-sm text-slate-200">
                                {typeof annotation.content === 'string' ? annotation.content : (annotation.type === 'drawing' ? 'Drawing annotation' : 'Annotation')}
                              </p>
                              <p className="text-xs text-slate-500 mt-1">{annotation.user}</p>
                            </div>
                            {onAnnotationDelete && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAnnotationDelete(annotation.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-400 transition-all"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-500 text-sm text-center py-4">
                        No annotations yet. Click the button above to add one!
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Comments Section */}
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Comments ({annotations.filter(a => a.type === 'comment').length})
              </h3>
              
              {/* Add Comment */}
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
                    placeholder="Add a comment..."
                    className="flex-1 px-3 py-2 bg-slate-800 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    onClick={handleAddComment}
                    className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Comments List */}
              <div className="space-y-3">
                {annotations.filter(a => a.type === 'comment').map((annotation) => (
                  <div key={annotation.id} className="bg-slate-800/50 rounded-lg p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                        {annotation.user.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-white">{annotation.user}</span>
                          <span className="text-xs text-slate-500">
                            {annotation.createdAt instanceof Date 
                              ? annotation.createdAt.toLocaleString() 
                              : annotation.createdAt}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300 mb-2">
                          {typeof annotation.content === 'string' ? annotation.content : ''}
                        </p>
                        <div className="flex items-center gap-3 text-xs">
                          <button className="flex items-center gap-1 text-slate-400 hover:text-purple-400 transition-colors">
                            <Heart className="w-3 h-3" />
                            0
                          </button>
                          <button className="flex items-center gap-1 text-slate-400 hover:text-purple-400 transition-colors">
                            <Reply className="w-3 h-3" />
                            Reply
                          </button>
                          {onAnnotationDelete && (
                            <button 
                              onClick={() => onAnnotationDelete(annotation.id)}
                              className="text-slate-400 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        
                        {/* Replies */}
                        {annotation.replies && annotation.replies.length > 0 && (
                          <div className="mt-3 space-y-2 pl-4 border-l-2 border-slate-700">
                            {annotation.replies.map((reply) => (
                              <div key={reply.id} className="flex items-start gap-2">
                                <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-xs">
                                  {reply.user.charAt(0)}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-medium text-white">{reply.user}</span>
                                    <span className="text-xs text-slate-500">
                                      {reply.createdAt instanceof Date 
                                        ? reply.createdAt.toLocaleString() 
                                        : reply.createdAt}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-300">{reply.text}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {annotations.filter(a => a.type === 'comment').length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-4">
                    No comments yet. Add the first comment above!
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}