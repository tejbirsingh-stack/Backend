import { useState, useCallback, useMemo, useEffect } from 'react';
import MediaViewer from '../MediaViewer';
import VideoThumbnail from './VideoThumbnail';

interface MediaBrowserProps {
  className?: string;
}

interface Asset {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadDate: string;
  url: string; // Required for MediaPreviewModal
  thumbnail?: string;
  duration?: number;
  dimensions?: { width: number; height: number };
  metadata?: Record<string, any>;
}

export default function MediaBrowser({ className = "" }: MediaBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Fetch assets from API
  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('http://localhost:3000/api/media');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Transform API data to match our Asset interface
        const transformedAssets = result.assets.map((item: any) => ({
          id: item.id,
          name: item.name,
          type: item.mimetype || item.type,
          size: typeof item.size === 'number' ? item.size : parseFileSize(item.size),
          uploadDate: item.uploadDate || new Date().toISOString(),
          url: item.url,
          thumbnail: item.thumbnail || (item.type?.startsWith('image/') ? item.url : undefined),
          duration: typeof item.duration === 'number' ? item.duration : parseDuration(item.duration),
          dimensions: item.dimensions,
          metadata: {
            resolution: item.dimensions ? `${item.dimensions.width}x${item.dimensions.height}` : item.resolution,
            mimetype: item.mimetype,
            uploadedBy: item.uploadedBy,
            tags: item.tags
          }
        }));
        setAssets(transformedAssets);
        setLastRefresh(new Date());
        console.log('📁 Loaded assets:', transformedAssets.length);
      } else {
        throw new Error(result.message || 'Failed to fetch media assets');
      }
    } catch (error) {
      console.error('Failed to fetch assets:', error);
      setError('Failed to load media assets. Please check if the API server is running.');
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Helper function to parse file size string to number
  const parseFileSize = (sizeStr: string): number => {
    if (typeof sizeStr === 'number') return sizeStr;
    if (!sizeStr) return 0;
    
    const match = sizeStr.match(/([0-9.]+)\s*([KMGT]?B)/i);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    switch (unit) {
      case 'KB': return value * 1024;
      case 'MB': return value * 1024 * 1024;
      case 'GB': return value * 1024 * 1024 * 1024;
      case 'TB': return value * 1024 * 1024 * 1024 * 1024;
      default: return value;
    }
  };

  // Helper function to parse duration string to seconds
  const parseDuration = (duration: string | number | undefined): number | undefined => {
    if (!duration) return undefined;
    
    // If it's already a number (seconds), return it
    if (typeof duration === 'number') return duration;
    
    // If it's a string like "Unknown", return undefined
    if (duration === 'Unknown') return undefined;
    
    // Parse string format like "2:45"
    const parts = duration.toString().split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return undefined;
  };

  // Load assets on component mount
  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Auto-refresh every 2 minutes when enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      console.log('🔄 Auto-refreshing media assets...');
      fetchAssets();
    }, 120000); // 2 minutes (120 seconds)

    return () => clearInterval(interval);
  }, [fetchAssets, autoRefresh]);

  // Refresh function for after uploads
  const refreshAssets = useCallback(() => {
    fetchAssets();
  }, [fetchAssets]);

  const filteredAndSortedAssets = useMemo(() => {
    return assets
      .filter(asset => 
        asset.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => {
        let aVal: any;
        let bVal: any;
        
        if (sortBy === 'size') {
          aVal = a.size;
          bVal = b.size;
        } else if (sortBy === 'date') {
          aVal = new Date(a.uploadDate).getTime();
          bVal = new Date(b.uploadDate).getTime();
        } else {
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
        }
        
        if (sortOrder === 'desc') {
          return bVal > aVal ? 1 : -1;
        } else {
          return aVal > bVal ? 1 : -1;
        }
      });
  }, [assets, searchQuery, sortBy, sortOrder]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getMediaTypeFromMime = (mimeType: string): string => {
    if (mimeType.startsWith('video/')) return 'Video';
    if (mimeType.startsWith('image/')) return 'Image';
    if (mimeType.startsWith('audio/')) return 'Audio';
    return 'Document';
  };

  const getFileIcon = (mimeType: string): JSX.Element => {
    const iconStyle = { width: '24px', height: '24px', color: '#5D8DE1' };
    
    if (mimeType.startsWith('video/')) {
      return (
        <svg style={iconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.5a1.5 1.5 0 011.5 1.5v1a1.5 1.5 0 01-1.5 1.5H9m4.5-5H15a1.5 1.5 0 011.5 1.5v1a1.5 1.5 0 01-1.5 1.5h-1.5m-5-5v5a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-1a1.5 1.5 0 00-1.5-1.5h-1a1.5 1.5 0 00-1.5 1.5z" />
        </svg>
      );
    }
    
    if (mimeType.startsWith('image/')) {
      return (
        <svg style={iconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    }
    
    if (mimeType.startsWith('audio/')) {
      return (
        <svg style={iconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      );
    }
    
    if (mimeType.includes('pdf')) {
      return (
        <svg style={iconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }
    
    return (
      <svg style={iconStyle} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  };

  if (loading) {
    return (
      <div className={`media-browser ${className}`}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '200px',
          color: '#888'
        }}>
          <div>Loading media assets...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`media-browser ${className}`}>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '200px',
          color: '#ff6b6b',
          textAlign: 'center'
        }}>
          <div style={{ marginBottom: '10px' }}>⚠️ {error}</div>
          <button 
            onClick={refreshAssets}
            style={{
              padding: '8px 16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`media-browser ${className}`}>
      {/* Controls */}
      <div style={{ 
        display: 'flex', 
        gap: '15px', 
        marginBottom: '20px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search media assets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: '1',
            minWidth: '200px',
            padding: '8px 12px',
            border: '1px solid #333',
            borderRadius: '4px',
            backgroundColor: '#2a2a2a',
            color: '#e0e0e0',
            fontSize: '14px'
          }}
        />

        {/* View Mode */}
        <div style={{ display: 'flex', gap: '5px' }}>
          <button
            onClick={() => setViewMode('grid')}
            style={{
              padding: '8px',
              backgroundColor: viewMode === 'grid' ? '#007bff' : '#333',
              color: '#e0e0e0',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            ⊞
          </button>
          <button
            onClick={() => setViewMode('list')}
            style={{
              padding: '8px',
              backgroundColor: viewMode === 'list' ? '#007bff' : '#333',
              color: '#e0e0e0',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            ☰
          </button>
        </div>

        {/* Sort Controls */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'size')}
          style={{
            padding: '8px',
            backgroundColor: '#333',
            color: '#e0e0e0',
            border: '1px solid #444',
            borderRadius: '4px'
          }}
        >
          <option value="date">Sort by Date</option>
          <option value="name">Sort by Name</option>
          <option value="size">Sort by Size</option>
        </select>

        <button
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          style={{
            padding: '8px',
            backgroundColor: '#333',
            color: '#e0e0e0',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {sortOrder === 'desc' ? '↓' : '↑'}
        </button>

        {/* Refresh Button */}
        <button
          onClick={refreshAssets}
          style={{
            padding: '8px 12px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '8px'
          }}
        >
          🔄 Refresh
        </button>

        {/* Auto-refresh Toggle */}
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          style={{
            padding: '8px 12px',
            backgroundColor: autoRefresh ? '#007bff' : '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '8px'
          }}
        >
          {autoRefresh ? '⏸️ Auto' : '▶️ Auto'}
        </button>

        {/* Last Refresh Time */}
        <span style={{ 
          color: '#666', 
          fontSize: '12px',
          alignSelf: 'center'
        }}>
          Last: {lastRefresh.toLocaleTimeString()}
        </span>
      </div>

      {/* Assets Display */}
      {filteredAndSortedAssets.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          color: '#888', 
          padding: '40px',
          border: '2px dashed #333',
          borderRadius: '8px'
        }}>
          {searchQuery ? 'No assets match your search.' : 'No media assets found. Upload some files to get started!'}
        </div>
      ) : (
        <div style={{
          display: viewMode === 'grid' ? 'grid' : 'flex',
          flexDirection: viewMode === 'list' ? 'column' : undefined,
          gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(200px, 1fr))' : undefined,
          gap: '15px'
        }}>
          {filteredAndSortedAssets.map((asset) => (
            <div
              key={asset.id}
              onClick={() => setSelectedAsset(asset)}
              style={{
                backgroundColor: '#2a2a2a',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: viewMode === 'grid' ? '15px' : '10px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: viewMode === 'list' ? 'flex' : 'block',
                alignItems: viewMode === 'list' ? 'center' : undefined,
                gap: viewMode === 'list' ? '15px' : undefined
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#333';
                e.currentTarget.style.borderColor = '#007bff';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#2a2a2a';
                e.currentTarget.style.borderColor = '#333';
              }}
            >
              {/* File Icon/Thumbnail */}
              <div style={{ 
                fontSize: viewMode === 'grid' ? '48px' : '24px',
                textAlign: viewMode === 'grid' ? 'center' : 'left',
                marginBottom: viewMode === 'grid' ? '10px' : '0',
                flexShrink: 0
              }}>
                {asset.type.startsWith('video/') ? (
                  <VideoThumbnail
                    videoUrl={asset.url}
                    width={viewMode === 'grid' ? 60 : 30}
                    height={viewMode === 'grid' ? 60 : 30}
                    seekTime={2}
                  />
                ) : asset.type.startsWith('image/') ? (
                  <img 
                    src={asset.url} 
                    alt={asset.name}
                    style={{ 
                      width: viewMode === 'grid' ? '60px' : '30px',
                      height: viewMode === 'grid' ? '60px' : '30px',
                      objectFit: 'cover',
                      borderRadius: '4px'
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : asset.thumbnail ? (
                  <img 
                    src={asset.thumbnail} 
                    alt={asset.name}
                    style={{ 
                      width: viewMode === 'grid' ? '60px' : '30px',
                      height: viewMode === 'grid' ? '60px' : '30px',
                      objectFit: 'cover',
                      borderRadius: '4px'
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      // Show fallback icon when image fails to load
                    }}
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    {getFileIcon(asset.type)}
                  </div>
                )}
              </div>

              {/* File Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ 
                  fontWeight: 'bold',
                  color: '#e0e0e0',
                  marginBottom: '5px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {asset.name}
                </div>
                <div style={{ 
                  fontSize: '12px',
                  color: '#888',
                  marginBottom: '3px'
                }}>
                  {getMediaTypeFromMime(asset.type)} • {formatFileSize(asset.size)}
                </div>
                {asset.duration && (
                  <div style={{ 
                    fontSize: '12px',
                    color: '#888'
                  }}>
                    Duration: {(() => {
                      const duration = parseDuration(asset.duration);
                      return duration ? `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` : 'Unknown';
                    })()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Media Viewer Modal */}
      {selectedAsset && (
        <MediaViewer
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
        />
      )}
    </div>
  );
}
