import { useState, useCallback, useMemo } from 'react';

interface MediaBrowserProps {
  className?: string;
}

interface Asset {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadDate: string;
  url?: string;
}

export default function MediaBrowser({ className = "" }: MediaBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);

  // Sample data
  const assets: Asset[] = [
    { id: '1', name: 'Project Video.mp4', type: 'video/mp4', size: 125000000, uploadDate: '2025-07-31', url: '/sample-video.mp4' },
    { id: '2', name: 'Design Mockup.png', type: 'image/png', size: 2500000, uploadDate: '2025-07-30' },
    { id: '3', name: 'Audio Track.mp3', type: 'audio/mp3', size: 8200000, uploadDate: '2025-07-29' },
    { id: '4', name: 'Report.pdf', type: 'application/pdf', size: 1800000, uploadDate: '2025-07-28' },
  ];

  const filteredAndSortedAssets = useMemo(() => {
    return assets
      .filter(asset => 
        asset.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => {
        const order = sortOrder === 'asc' ? 1 : -1;
        switch (sortBy) {
          case 'name':
            return order * a.name.localeCompare(b.name);
          case 'size':
            return order * (a.size - b.size);
          default: // date
            return order * (new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
        }
      });
  }, [assets, searchQuery, sortBy, sortOrder]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('video/')) return '🎥';
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('audio/')) return '🎵';
    return '📄';
  };

  const cancelUpload = useCallback((file: File) => {
    setUploadingFiles(prev => prev.filter(f => f !== file));
  }, []);

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white mb-2">Media Browser</h1>
        <p className="text-gray-400">Your media files and folders</p>
      </div>

      {/* Actions Bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              placeholder="Search files..."
              className="w-64 bg-gray-700 text-gray-300 rounded-lg px-4 py-2 pl-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Sort Options */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'size')}
            className="bg-gray-700 text-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
            <option value="size">Sort by Size</option>
          </select>

          {/* View Mode Toggle */}
          <div className="flex rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* Media Grid/List */}
      <div className={viewMode === 'grid' 
        ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
        : 'space-y-2'
      }>
        {filteredAndSortedAssets.map((asset) => (
          <div
            key={asset.id}
            onClick={() => setSelectedAsset(asset)}
            className={`
              cursor-pointer transition-all duration-200 hover:scale-105
              ${viewMode === 'grid' 
                ? 'bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-blue-500'
                : 'bg-gray-800 rounded-lg p-4 flex items-center space-x-4 border border-gray-700 hover:border-blue-500'
              }
            `}
          >
            {viewMode === 'grid' ? (
              <>
                <div className="aspect-video bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-4xl">
                  {getFileIcon(asset.type)}
                </div>
                <div className="p-4">
                  <h3 className="text-white font-medium truncate">{asset.name}</h3>
                  <div className="flex justify-between text-sm text-gray-400 mt-1">
                    <span>{formatFileSize(asset.size)}</span>
                    <span>{asset.uploadDate}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl">{getFileIcon(asset.type)}</div>
                <div className="flex-1">
                  <h3 className="text-white font-medium">{asset.name}</h3>
                  <p className="text-sm text-gray-400">{formatFileSize(asset.size)} • {asset.uploadDate}</p>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* No Results */}
      {filteredAndSortedAssets.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📁</div>
          <h3 className="text-xl font-medium text-white mb-2">No files found</h3>
          <p className="text-gray-400">
            {searchQuery ? 'Try adjusting your search terms' : 'Upload some files to get started'}
          </p>
        </div>
      )}

      {/* Preview Modal */}
      {selectedAsset && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-700">
              <div>
                <h2 className="text-xl font-semibold text-white">{selectedAsset.name}</h2>
                <p className="text-gray-400">{formatFileSize(selectedAsset.size)} • {selectedAsset.uploadDate}</p>
              </div>
              <button
                onClick={() => setSelectedAsset(null)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>
            <div className="p-6 text-center">
              <div className="text-8xl mb-4">{getFileIcon(selectedAsset.type)}</div>
              <h3 className="text-2xl font-medium text-white mb-4">{selectedAsset.name}</h3>
              <div className="flex justify-center space-x-4">
                <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
                  Download
                </button>
                <button className="bg-gray-700 text-white px-6 py-2 rounded-lg hover:bg-gray-600">
                  Share
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
