import { useEffect, useState } from 'react';
import { X, Download, Share2, Info } from 'lucide-react';
import EnhancedProfessionalVideoPlayer from './EnhancedProfessionalVideoPlayer';

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
  dimensions?: { width: number; height: number };
  metadata?: Record<string, any>;
}

interface MediaViewerProps {
  asset: MediaAsset | null;
  onClose: () => void;
  onDownload?: (asset: MediaAsset) => void;
  onShare?: (asset: MediaAsset) => void;
}

export default function MediaViewer({ 
  asset, 
  onClose, 
  onDownload, 
  onShare 
}: MediaViewerProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (asset) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [asset, onClose]);

  if (!asset) return null;

  const isVideo = asset.type.startsWith('video/');
  const isImage = asset.type.startsWith('image/');

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'Unknown';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center justify-between p-6">
          <div className="flex-1">
            <h2 className="text-white text-xl font-semibold truncate">{asset.name}</h2>
            <div className="flex items-center space-x-4 mt-2 text-gray-300 text-sm">
              <span>{formatFileSize(asset.size)}</span>
              {isVideo && asset.duration && (
                <span>{formatDuration(asset.duration)}</span>
              )}
              <span>{new Date(asset.createdAt || asset.uploadDate || Date.now()).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onDownload && (
              <button
                onClick={() => onDownload(asset)}
                className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Download"
              >
                <Download className="w-5 h-5" />
              </button>
            )}
            {onShare && (
              <button
                onClick={() => onShare(asset)}
                className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Share"
              >
                <Share2 className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="h-full flex p-6 pt-24">
        <div className="flex-1 flex items-center justify-center max-h-full">
          {isVideo ? (
            <EnhancedProfessionalVideoPlayer
             src={
                asset.url.startsWith('http') || asset.url.startsWith('/api/')
                  ? asset.url
                  : `/uploads${asset.url.startsWith('/') ? asset.url : `/${asset.url}`}`
              }
              poster={
                asset.thumbnail
                  ? asset.thumbnail.startsWith('http') || asset.thumbnail.startsWith('/api/')
                    ? asset.thumbnail
                    : `/uploads${asset.thumbnail.startsWith('/') ? asset.thumbnail : `/${asset.thumbnail}`}`
                  : undefined
              }
              title={asset.name}
              assetDetails={{
                id: asset.id,
                name: asset.name,
                type: asset.type,
                size: asset.size,
                uploadDate: asset.createdAt || asset.uploadDate || new Date().toISOString(),
                owner: 'Current User',
                tags: ['media', 'video'],
                metadata: {
                  duration: asset.duration,
                  width: 1920,
                  height: 1080,
                  fps: 30,
                  codec: 'H.264',
                  bitrate: '5 Mbps'
                },
                analytics: {
                  views: 125,
                  downloads: 23,
                  shares: 8
                },
                permissions: {
                  canEdit: true,
                  canDelete: true,
                  canShare: true,
                  canDownload: true
                }
              }}
              enableAnnotations={true}
              className="w-full h-full"
              onClose={onClose}
            />
          ) : isImage ? (
            <div className="max-w-full max-h-full flex items-center justify-center">
              <img
                src={asset.url}
                alt={asset.name}
                className="max-w-full max-h-full object-contain rounded-lg"
                onLoad={(e) => {
                  // Center the image if it's smaller than the container
                  const img = e.target as HTMLImageElement;
                  const container = img.parentElement;
                  if (container) {
                    if (img.naturalWidth < container.clientWidth && img.naturalHeight < container.clientHeight) {
                      img.style.width = 'auto';
                      img.style.height = 'auto';
                    }
                  }
                }}
              />
            </div>
          ) : (
            <div className="text-center text-white">
              <Info className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-xl font-semibold mb-2">Preview not available</h3>
              <p className="text-gray-400 mb-4">This file type cannot be previewed in the browser.</p>
              {onDownload && (
                <button
                  onClick={() => onDownload(asset)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  Download File
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Click outside to close */}
      <div
        className="absolute inset-0 -z-10"
        onClick={onClose}
      />
    </div>
  );
}
