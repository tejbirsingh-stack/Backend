import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';

// Adobe CEP Interface
declare global {
  interface Window {
    CSInterface: any;
  }
}

interface MediaAsset {
  id: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  size: number;
  duration?: number;
  url: string;
  thumbnail?: string;
  metadata: {
    width?: number;
    height?: number;
    fps?: number;
    codec?: string;
  };
}

const NoahPanel: React.FC = () => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [apiUrl, setApiUrl] = useState('http://localhost:3000');

  useEffect(() => {
    checkConnection();
    if (isConnected) {
      fetchAssets();
    }
  }, [isConnected]);

  const checkConnection = async () => {
    try {
      await axios.get(`${apiUrl}/health`);
      setIsConnected(true);
    } catch (error) {
      setIsConnected(false);
      console.error('Noah API not available:', error);
    }
    setIsLoading(false);
  };

  const fetchAssets = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/media/assets`);
      setAssets(response.data.assets || []);
    } catch (error) {
      console.error('Failed to fetch assets:', error);
    }
  };

  const importAssetToPremiere = (asset: MediaAsset) => {
    if (window.CSInterface) {
      const script = `
        var importFile = function(filePath, fileName) {
          var project = app.project;
          if (project) {
            var importedItem = project.importFiles([filePath], 
              true, // suppress UI
              project.getInsertionBin(),
              false // import as numbered stills
            );
            if (importedItem && importedItem.length > 0) {
              return "SUCCESS: Imported " + fileName;
            }
          }
          return "ERROR: Failed to import " + fileName;
        };
        importFile("${asset.url}", "${asset.name}");
      `;
      
      window.CSInterface.evalScript(script, (result: string) => {
        if (result.startsWith('SUCCESS')) {
          alert(`Successfully imported ${asset.name} to Premiere Pro!`);
        } else {
          alert(`Failed to import ${asset.name}: ${result}`);
        }
      });
    }
  };

  const downloadAsset = async (asset: MediaAsset) => {
    try {
      const response = await axios.get(asset.url, { responseType: 'blob' });
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      
      if (window.CSInterface) {
        // For Premiere, we'll try to import directly
        importAssetToPremiere(asset);
      } else {
        // Fallback: trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = asset.name;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Download failed:', error);
      alert('Download failed. Please try again.');
    }
  };

  const filteredAssets = assets.filter(asset =>
    asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    asset.type.includes(searchQuery.toLowerCase())
  );

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 10px' }}></div>
        <p>Connecting to Noah...</p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2 style={{ color: '#ef4444', marginBottom: '10px' }}>⚠️ Connection Failed</h2>
        <p style={{ marginBottom: '20px' }}>Unable to connect to Noah API</p>
        <div style={{ marginBottom: '15px' }}>
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="API URL"
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #374151',
              background: 'rgba(255,255,255,0.1)',
              color: 'white'
            }}
          />
        </div>
        <button
          onClick={checkConnection}
          style={{
            background: 'linear-gradient(to right, #3b82f6, #8b5cf6)',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ 
        padding: '15px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(0,0,0,0.2)'
      }}>
        <h1 style={{ margin: '0 0 10px 0', fontSize: '18px', color: '#8b5cf6' }}>
          Noah Media Manager
        </h1>
        <input
          type="text"
          placeholder="Search media assets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.1)',
            color: 'white',
            fontSize: '14px'
          }}
        />
      </div>

      {/* Asset List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px' }}>
        {filteredAssets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
            {searchQuery ? `No assets found for "${searchQuery}"` : 'No media assets available'}
          </div>
        ) : (
          filteredAssets.map((asset) => (
            <div
              key={asset.id}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ 
                  width: '40px', 
                  height: '40px', 
                  background: asset.type === 'video' ? '#ef4444' : asset.type === 'image' ? '#10b981' : '#f59e0b',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '12px',
                  fontSize: '18px'
                }}>
                  {asset.type === 'video' ? (
                    <svg width="18" height="18" fill="white" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  ) : asset.type === 'image' ? (
                    <svg width="18" height="18" fill="white" viewBox="0 0 24 24">
                      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" fill="white" viewBox="0 0 24 24">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    fontWeight: '500', 
                    fontSize: '14px', 
                    marginBottom: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {asset.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                    {formatFileSize(asset.size)}
                    {asset.duration && ` • ${formatDuration(asset.duration)}`}
                    {asset.metadata.width && ` • ${asset.metadata.width}x${asset.metadata.height}`}
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => importAssetToPremiere(asset)}
                  style={{
                    flex: 1,
                    background: 'linear-gradient(to right, #059669, #10b981)',
                    color: 'white',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  Import to Premiere
                </button>
                <button
                  onClick={() => downloadAsset(asset)}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.2)',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Download
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{ 
        padding: '10px 15px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(0,0,0,0.2)',
        fontSize: '12px',
        color: '#9ca3af',
        textAlign: 'center'
      }}>
        {filteredAssets.length} assets • Connected to Noah API
      </div>
    </div>
  );
};

// Initialize the panel
const root = document.getElementById('root');
if (root) {
  ReactDOM.render(<NoahPanel />, root);
}
