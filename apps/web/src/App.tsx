import React, { useState, useRef, useEffect, useCallback } from 'react';
// MediaPreviewModal removed - using InPageMediaViewer instead
// import MediaBrowser from './components/media/MediaBrowser';
import MediaBrowser from './pages/MediaBrowser'; // Use pages version with video player
import Logo from './components/ui/Logo';
import EnhancedSidebar from './components/layout/EnhancedSidebar';
// import Sidebar from './components/Sidebar';
import { useMediaStore } from './stores/mediaStore';
// import { useAuthStore } from './stores/authStore'; // Old complex auth
import { useSimpleAuthStore } from './stores/simpleAuthStore'; // Simple auth - no database needed
import './config/axios'; // Setup axios interceptors
import './styles/noah-design-system.css';

// Toast Notifications Component
function ToastNotifications() {
  return null; // Placeholder for now
}

// Upload component with drag & drop functionality
function UploadArea({ onFilesUploaded }: { onFilesUploaded: (files: File[]) => void }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleUpload(files);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleUpload(files);
    }
  }, []);

  const handleUpload = useCallback((files: File[]) => {
    setIsUploading(true);
    setUploadProgress(0);

    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          onFilesUploaded(files);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  }, [onFilesUploaded]);

  return (
    <div className="upload-area">
      <div
        className={`upload-zone ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: '2px dashed rgba(79, 172, 254, 0.4)',
          borderRadius: '20px',
          padding: '48px 32px',
          textAlign: 'center',
          background: isDragOver 
            ? 'rgba(79, 172, 254, 0.1)' 
            : 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.3s ease',
          color: 'rgba(255, 255, 255, 0.8)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background gradient overlay */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: isDragOver 
            ? 'radial-gradient(circle at center, rgba(79, 172, 254, 0.15) 0%, transparent 70%)'
            : 'radial-gradient(circle at center, rgba(255, 255, 255, 0.05) 0%, transparent 70%)',
          pointerEvents: 'none',
          transition: 'all 0.3s ease',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ 
            fontSize: '48px', 
            marginBottom: '24px', 
            color: isDragOver ? '#4facfe' : 'rgba(79, 172, 254, 0.8)',
            transition: 'all 0.3s ease'
          }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
          </div>
          <h3 style={{ 
            fontSize: '24px', 
            marginBottom: '12px',
            color: 'white',
            fontWeight: '600',
            letterSpacing: '-0.01em'
          }}>
            {isDragOver ? 'Drop files here' : 'Drag & drop files here'}
          </h3>
          <p style={{ 
            fontSize: '16px', 
            color: 'rgba(255, 255, 255, 0.7)',
            marginBottom: '24px',
            fontWeight: '400'
          }}>
            or click to browse your computer
          </p>
          <p style={{ 
            fontSize: '14px', 
            color: 'rgba(255, 255, 255, 0.5)',
            fontWeight: '400'
          }}>
            Supports video, audio, images, and documents
          </p>
        </div>

        <input
          type="file"
          multiple
          onChange={handleFileSelect}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
          }}
        />

        {isUploading && (
          <div style={{ 
            marginTop: '32px',
            position: 'relative',
            zIndex: 2
          }}>
            <div style={{
              width: '100%',
              height: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '3px',
              overflow: 'hidden',
              marginBottom: '16px',
            }}>
              <div style={{
                width: `${uploadProgress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #4facfe 0%, #00f2fe 100%)',
                borderRadius: '3px',
                transition: 'width 0.3s ease',
                boxShadow: '0 0 10px rgba(79, 172, 254, 0.5)',
              }} />
            </div>
            <p style={{ 
              marginTop: '12px', 
              fontSize: '16px',
              color: 'white',
              fontWeight: '500'
            }}>
              Uploading... {uploadProgress}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Main App Component
export default function App() {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<any>(null); // Shared state for selected media
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { clearCache, fetchAssets } = useMediaStore();
  const { isAuthenticated, user, isLoading, error, login, logout, clearError } = useSimpleAuthStore();

  const handleLogin = async (email: string, password: string) => {
    console.log('🔐 Simple login attempt:', email);
    const success = await login(email, password);

    if (success) {
      // Clear cache and refresh media when logging in
      clearCache();
      await fetchAssets(true); // Force refresh
      console.log('✅ Login successful, media refreshed');
    }
  };

  const handleLogout = () => {
    logout();
    clearCache(); // Clear cache on logout
    setUploadedFiles([]);
    console.log('User logged out, cache cleared');
  };

  const handleFilesUploaded = (files: File[]) => {
    try {
      if (files && Array.isArray(files) && files.length > 0) {
        setUploadedFiles(prev => [...prev, ...files]);
      }
    } catch (error) {
      console.error('File upload error:', error);
    }
  };

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        padding: '20px'
      }}>
        {/* Background Elements */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `
            radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 40% 40%, rgba(120, 119, 198, 0.2) 0%, transparent 50%)
          `,
          zIndex: 1
        }} />

        <div style={{
          position: 'relative',
          zIndex: 2,
          width: '100%',
          maxWidth: '420px',
          margin: '0 auto', // Ensure horizontal centering
          padding: '48px 40px',
          borderRadius: '24px',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: `
            0 8px 32px rgba(0, 0, 0, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.2),
            inset 0 -1px 0 rgba(0, 0, 0, 0.1)
          `,
        }}>
          {/* Logo Section */}
          <div style={{ 
            textAlign: 'center', 
            marginBottom: '40px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <div style={{ 
              marginBottom: '24px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <Logo variant="full" size="lg" />
            </div>
            <h1 style={{ 
              color: 'white', 
              fontSize: '32px', 
              fontWeight: '700',
              margin: '0 0 8px 0',
              letterSpacing: '-0.02em'
            }}>
              LOGIN
            </h1>
            <p style={{ 
              color: 'rgba(255, 255, 255, 0.8)', 
              margin: 0, 
              fontSize: '16px',
              fontWeight: '400'
            }}>
              Cloud-based media asset management
            </p>
          </div>

          {/* Error Message Display */}
          {error && (
            <div style={{
              marginBottom: '20px',
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(244, 67, 54, 0.15)',
              border: '1px solid rgba(244, 67, 54, 0.3)',
              color: '#ff6b6b',
              fontSize: '14px',
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          {/* Test Credentials Display */}
          <div style={{
            marginBottom: '20px',
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: 'rgba(79, 172, 254, 0.15)',
            border: '1px solid rgba(79, 172, 254, 0.3)',
            color: '#4facfe',
            fontSize: '13px',
            textAlign: 'left',
            fontFamily: 'monospace'
          }}>
            <div style={{ marginBottom: '8px', fontWeight: 'bold', textAlign: 'center', fontFamily: 'inherit' }}>Test Credentials:</div>
            <div>admin@visitdetroit.com / admin123</div>
            <div>test@example.com / test123</div>
            <div>demo@demo.com / demo</div>
          </div>

          <form onSubmit={(e) => {
            e.preventDefault();
            clearError(); // Clear any previous error
            handleLogin(email, password);
          }}>
            <div style={{ marginBottom: '24px' }}>
              <input
                type="email"
                name="email"
                required
                placeholder="admin@visitdetroit.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearError();
                }}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  fontSize: '16px',
                  fontWeight: '400',
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(10px)',
                  transition: 'all 0.3s ease',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.4)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <div style={{ marginBottom: '32px' }}>
              <input
                type="password"
                name="password"
                required
                placeholder="Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearError();
                }}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  fontSize: '16px',
                  fontWeight: '400',
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(10px)',
                  transition: 'all 0.3s ease',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.4)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '16px 20px',
                borderRadius: '12px',
                border: 'none',
                background: isLoading
                  ? 'linear-gradient(135deg, #999 0%, #777 100%)'
                  : 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                color: 'white',
                fontSize: '16px',
                fontWeight: '600',
                cursor: isLoading ? 'wait' : 'pointer',
                opacity: isLoading ? 0.7 : 1,
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 20px rgba(79, 172, 254, 0.3)',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}
              onMouseOver={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 30px rgba(79, 172, 254, 0.4)';
                  e.currentTarget.style.background = 'linear-gradient(135deg, #5bb5ff 0%, #11f3fe 100%)';
                }
              }}
              onMouseOut={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(79, 172, 254, 0.3)';
                  e.currentTarget.style.background = 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)';
                }
              }}
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>

        </div>
      </div>
    );
  }

  // Main Application Interface
  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a1f 0%, #2a2a2e 100%)',
      color: '#A9A9B4',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '16px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(20px)',
        height: '64px',
        position: 'relative',
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Logo variant="full" size="md" />
          <div style={{
            height: '24px',
            width: '1px',
            background: 'rgba(255, 255, 255, 0.2)',
            margin: '0 8px'
          }} />
          <span style={{ 
            color: 'rgba(255, 255, 255, 0.8)', 
            fontSize: '14px',
            fontWeight: '500'
          }}>
            Media Manager
          </span>
          <div style={{
            marginLeft: '20px',
            padding: '4px 12px',
            background: 'rgba(79, 172, 254, 0.2)',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#4facfe',
            fontWeight: '500'
          }}>
            {user?.organization?.name || 'Visit Detroit'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={{ 
            fontSize: '14px',
            color: 'rgba(255, 255, 255, 0.7)'
          }}>
            Welcome, <strong style={{ color: 'white' }}>{user?.name || user?.email}</strong>
          </span>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: 'rgba(255, 255, 255, 0.8)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.3s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.color = 'white';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div style={{ 
        display: 'flex', 
        flex: 1, 
        overflow: 'hidden',
        position: 'relative'
      }}>
        {/* Enhanced Sidebar */}
        <EnhancedSidebar 
          selectedAsset={selectedAsset}
          onFileSelect={setSelectedAsset}
        />

        {/* Media Browser Section - Positioned next to sidebar */}
        <div style={{
          position: 'absolute',
          left: '280px',  // Width of sidebar
          right: 0,
          top: 0,
          bottom: 0,
          overflow: 'hidden',
          background: '#1a1a1f'
        }}>
          <MediaBrowser 
            selectedAsset={selectedAsset}
            onSelectAsset={setSelectedAsset}
          />
        </div>
      </div>

      {/* Toast Notifications */}
      <ToastNotifications />
    </div>
  );
}
