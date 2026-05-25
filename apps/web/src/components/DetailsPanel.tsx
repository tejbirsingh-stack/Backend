import React, { useState } from 'react';
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
  MoreVertical
} from 'lucide-react';

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

interface Comment {
  id: string;
  text: string;
  user: string;
  timestamp: string;
  likes: number;
  replies?: Comment[];
}

interface DetailsPanelProps {
  asset: MediaAsset;
}

export default function DetailsPanel({ asset }: DetailsPanelProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'comments'>('details');
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState<Comment[]>([
    {
      id: '1',
      text: 'Great quality video! The color grading looks perfect.',
      user: 'John Doe',
      timestamp: '2 hours ago',
      likes: 5,
      replies: [
        {
          id: '1-1',
          text: 'I agree! The contrast is spot on.',
          user: 'Jane Smith',
          timestamp: '1 hour ago',
          likes: 2,
        }
      ]
    },
    {
      id: '2',
      text: 'Can we get a 4K version of this?',
      user: 'Mike Johnson',
      timestamp: '5 hours ago',
      likes: 3,
    }
  ]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const getFileIcon = () => {
    const type = asset.type?.toLowerCase();
    if (type?.includes('video')) return <Film className="w-5 h-5" />;
    if (type?.includes('image')) return <Image className="w-5 h-5" />;
    if (type?.includes('audio')) return <Music className="w-5 h-5" />;
    return <FileIcon className="w-5 h-5" />;
  };

  const handleAddComment = () => {
    if (newComment.trim()) {
      const comment: Comment = {
        id: Date.now().toString(),
        text: newComment,
        user: 'Current User',
        timestamp: 'Just now',
        likes: 0,
      };
      setComments([comment, ...comments]);
      setNewComment('');
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('details')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'details'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4 inline-block mr-2" />
          Details
        </button>
        <button
          onClick={() => setActiveTab('comments')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'comments'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <MessageSquare className="w-4 h-4 inline-block mr-2" />
          Comments & Annotations
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'details' ? (
          <div className="p-6 space-y-6">
            {/* Basic Info */}
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                {getFileIcon()}
                Basic Information
              </h3>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm text-slate-600">File Name</dt>
                  <dd className="text-sm font-medium text-slate-900 max-w-[200px] truncate" title={asset.name}>
                    {asset.name}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-slate-600">File Size</dt>
                  <dd className="text-sm font-medium text-slate-900">{formatFileSize(asset.size)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-slate-600">Type</dt>
                  <dd className="text-sm font-medium text-slate-900">{asset.type}</dd>
                </div>
                {asset.duration && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-slate-600">Duration</dt>
                    <dd className="text-sm font-medium text-slate-900">{formatDuration(asset.duration)}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Technical Details */}
            {asset.metadata && (
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  Technical Details
                </h3>
                <dl className="space-y-3">
                  {asset.metadata.width && asset.metadata.height && (
                    <div className="flex justify-between">
                      <dt className="text-sm text-slate-600">Dimensions</dt>
                      <dd className="text-sm font-medium text-slate-900">
                        {asset.metadata.width} × {asset.metadata.height}
                      </dd>
                    </div>
                  )}
                  {asset.metadata.fps && (
                    <div className="flex justify-between">
                      <dt className="text-sm text-slate-600">Frame Rate</dt>
                      <dd className="text-sm font-medium text-slate-900">{asset.metadata.fps} FPS</dd>
                    </div>
                  )}
                  {asset.metadata.codec && (
                    <div className="flex justify-between">
                      <dt className="text-sm text-slate-600">Codec</dt>
                      <dd className="text-sm font-medium text-slate-900">{asset.metadata.codec}</dd>
                    </div>
                  )}
                  {asset.metadata.bitrate && (
                    <div className="flex justify-between">
                      <dt className="text-sm text-slate-600">Bitrate</dt>
                      <dd className="text-sm font-medium text-slate-900">{asset.metadata.bitrate}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Metadata */}
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Hash className="w-5 h-5" />
                Metadata
              </h3>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm text-slate-600">Upload Date</dt>
                  <dd className="text-sm font-medium text-slate-900">
                    {new Date(asset.uploadDate || asset.uploadedAt || asset.createdAt || Date.now()).toLocaleDateString()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-slate-600">Owner</dt>
                  <dd className="text-sm font-medium text-slate-900">Current User</dd>
                </div>
                {asset.compressionStatus && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-slate-600">Compression</dt>
                    <dd className="text-sm font-medium text-slate-900">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        asset.compressionStatus === 'completed' 
                          ? 'bg-green-100 text-green-800'
                          : asset.compressionStatus === 'processing'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {asset.compressionStatus}
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Tags */}
            {asset.tags && asset.tags.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Tag className="w-5 h-5" />
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {asset.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Comments List */}
            <div className="flex-1 overflow-y-auto p-6">
              {comments.length === 0 ? (
                <div className="text-center text-slate-500 py-8">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p>No comments yet</p>
                  <p className="text-sm mt-1">Be the first to comment!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="border-b border-slate-100 pb-4 last:border-0">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                          {comment.user[0]}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm">{comment.user}</span>
                            <span className="text-xs text-slate-500">{comment.timestamp}</span>
                          </div>
                          <p className="text-sm text-slate-700 mb-2">{comment.text}</p>
                          <div className="flex items-center gap-4 text-xs">
                            <button className="flex items-center gap-1 text-slate-500 hover:text-purple-600">
                              <Heart className="w-3 h-3" />
                              {comment.likes}
                            </button>
                            <button className="flex items-center gap-1 text-slate-500 hover:text-purple-600">
                              <Reply className="w-3 h-3" />
                              Reply
                            </button>
                            <button className="text-slate-500 hover:text-purple-600">
                              <MoreVertical className="w-3 h-3" />
                            </button>
                          </div>
                          
                          {/* Replies */}
                          {comment.replies && comment.replies.length > 0 && (
                            <div className="mt-3 ml-6 space-y-3">
                              {comment.replies.map((reply) => (
                                <div key={reply.id} className="flex items-start gap-2">
                                  <div className="w-6 h-6 bg-slate-400 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                                    {reply.user[0]}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-medium text-xs">{reply.user}</span>
                                      <span className="text-xs text-slate-500">{reply.timestamp}</span>
                                    </div>
                                    <p className="text-xs text-slate-600">{reply.text}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Comment */}
            <div className="border-t border-slate-200 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
                  placeholder="Add a comment..."
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}