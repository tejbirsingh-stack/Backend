import React from 'react';
import { Play, Image, Music, FileText, Download, Share2, Edit } from 'lucide-react';
import { MediaAsset } from '../../types/media';

interface MediaCardProps {
  asset: MediaAsset;
  viewMode: 'grid' | 'list';
  onClick: () => void;
}

export default function MediaCard({ asset, viewMode, onClick }: MediaCardProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getTypeIcon = () => {
    if (asset.type.startsWith('video')) return <Play className="w-8 h-8" />;
    if (asset.type.startsWith('image')) return <Image className="w-8 h-8" />;
    if (asset.type.startsWith('audio')) return <Music className="w-8 h-8" />;
    return <FileText className="w-8 h-8" />;
  };

  const getTypeColor = () => {
    if (asset.type.startsWith('video')) return 'from-blue-500 to-purple-600';
    if (asset.type.startsWith('image')) return 'from-green-500 to-emerald-600';
    if (asset.type.startsWith('audio')) return 'from-red-500 to-pink-600';
    return 'from-gray-500 to-gray-600';
  };

  if (viewMode === 'list') {
    return (
      <div className="flex items-center gap-4 p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors group">
        <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getTypeColor()} flex items-center justify-center text-white`}>
          {getTypeIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium truncate">{asset.name}</h3>
          <p className="text-gray-400 text-sm">
            {formatFileSize(asset.size)} • {new Date(asset.uploadDate).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              // Handle download
            }}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              // Handle share
            }}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg"
          >
            <Share2 className="w-5 h-5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              // Handle edit
            }}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg"
          >
            <Edit className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="group relative aspect-video bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
      onClick={onClick}
    >
      {asset.type.startsWith('video') || asset.type.startsWith('image') ? (
        <>
          <img 
            src={asset.url} 
            alt={asset.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </>
      ) : (
        <div className={`w-full h-full bg-gradient-to-br ${getTypeColor()} flex items-center justify-center`}>
          {getTypeIcon()}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 p-4">
        <h3 className="text-white font-medium truncate">{asset.name}</h3>
        <p className="text-gray-300 text-sm">
          {formatFileSize(asset.size)} • {new Date(asset.uploadDate).toLocaleDateString()}
        </p>
      </div>

      <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            // Handle download
          }}
          className="p-2 bg-black/50 text-white hover:bg-black/70 rounded-lg backdrop-blur-sm"
        >
          <Download className="w-5 h-5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            // Handle share
          }}
          className="p-2 bg-black/50 text-white hover:bg-black/70 rounded-lg backdrop-blur-sm"
        >
          <Share2 className="w-5 h-5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            // Handle edit
          }}
          className="p-2 bg-black/50 text-white hover:bg-black/70 rounded-lg backdrop-blur-sm"
        >
          <Edit className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
