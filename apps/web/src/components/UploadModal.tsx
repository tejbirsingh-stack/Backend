import React, { useState, useCallback } from 'react';
import { Upload, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import axios from 'axios';
import { useMediaStore } from '../stores/mediaStore';

interface UploadFile {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  id: string;
  error?: string;
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete?: () => void;
}

export default function UploadModal({ isOpen, onClose, onUploadComplete }: UploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadFile[]>([]);
  const [uploadDestination, setUploadDestination] = useState<'local' | 'b2' | 'both'>('b2');
  const { fetchAssets } = useMediaStore();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      addFilesToQueue(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      addFilesToQueue(files);
    }
  };

  const addFilesToQueue = (files: File[]) => {
    const newUploads: UploadFile[] = files.map(file => ({
      file,
      progress: 0,
      status: 'pending' as const,
      id: `upload-${Date.now()}-${Math.random()}`
    }));

    setUploadQueue(prev => [...prev, ...newUploads]);

    // Start uploading each file
    newUploads.forEach(upload => {
      uploadFile(upload);
    });
  };

  const uploadFile = async (upload: UploadFile) => {
    // Update status to uploading
    setUploadQueue(prev => prev.map(u =>
      u.id === upload.id ? { ...u, status: 'uploading' } : u
    ));

    try {
      const formData = new FormData();
      formData.append('destination', uploadDestination);
      formData.append('file', upload.file);

      // Upload to the API
      const response = await axios.post('/api/media/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = progressEvent.total
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;

          setUploadQueue(prev => prev.map(u =>
            u.id === upload.id ? { ...u, progress: percentCompleted } : u
          ));
        }
      });

      // Mark as complete
      setUploadQueue(prev => prev.map(u =>
        u.id === upload.id ? { ...u, status: 'complete', progress: 100 } : u
      ));

      console.log('✅ File uploaded successfully:', upload.file.name);

      // Refresh media assets after successful upload
      setTimeout(() => {
        fetchAssets(true);
        onUploadComplete?.();
      }, 500);

    } catch (error: any) {
      console.error('❌ Upload error:', error);

      setUploadQueue(prev => prev.map(u =>
        u.id === upload.id ? {
          ...u,
          status: 'error',
          error: error.response?.data?.error || error.message || 'Upload failed'
        } : u
      ));
    }
  };

  const removeFromQueue = (uploadId: string) => {
    setUploadQueue(prev => prev.filter(u => u.id !== uploadId));
  };

  const clearCompletedUploads = () => {
    setUploadQueue(prev => prev.filter(u => u.status !== 'complete'));
  };

  const clearAll = () => {
    setUploadQueue([]);
  };

  const hasActiveUploads = uploadQueue.some(u => u.status === 'uploading');
  const hasCompletedUploads = uploadQueue.some(u => u.status === 'complete');

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        background: '#2a2a2e',
        borderRadius: '16px',
        padding: '32px',
        width: '90%',
        maxWidth: '600px',
        maxHeight: '80vh',
        overflow: 'auto',
        position: 'relative',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
      }}>
        <button
          onClick={onClose}
          disabled={hasActiveUploads}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'none',
            border: 'none',
            color: hasActiveUploads ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.6)',
            cursor: hasActiveUploads ? 'not-allowed' : 'pointer',
            padding: '4px',
            borderRadius: '4px',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            if (!hasActiveUploads) {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = 'white';
            }
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'none';
            e.currentTarget.style.color = hasActiveUploads ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.6)';
          }}
        >
          <X size={24} />
        </button>

        <h2 style={{
          color: 'white',
          fontSize: '24px',
          fontWeight: '600',
          marginBottom: '24px',
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          Upload Media Files
        </h2>

        {/* Upload Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${isDragging ? '#4facfe' : 'rgba(79, 172, 254, 0.3)'}`,
            borderRadius: '12px',
            padding: '48px 32px',
            textAlign: 'center',
            background: isDragging
              ? 'rgba(79, 172, 254, 0.05)'
              : 'rgba(255, 255, 255, 0.02)',
            transition: 'all 0.3s ease',
            cursor: 'pointer',
            position: 'relative',
            marginBottom: uploadQueue.length > 0 ? '24px' : '0'
          }}
        >
          <Upload size={56} style={{
            color: isDragging ? '#4facfe' : 'rgba(79, 172, 254, 0.6)',
            marginBottom: '20px',
            margin: '0 auto 20px'
          }} />
          <h3 style={{
            color: 'white',
            fontSize: '20px',
            marginBottom: '8px',
            fontWeight: '500'
          }}>
            {isDragging ? 'Drop files here' : 'Drag & drop files here'}
          </h3>
          <p style={{
            color: 'rgba(255, 255, 255, 0.6)',
            fontSize: '14px',
            marginBottom: '24px'
          }}>
            or click to browse your computer
          </p>

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
              cursor: 'pointer'
            }}
          />

          <button
            style={{
              padding: '12px 32px',
              background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              position: 'relative',
              zIndex: 1,
              boxShadow: '0 4px 15px rgba(79, 172, 254, 0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(79, 172, 254, 0.4)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(79, 172, 254, 0.3)';
            }}
            onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
          >
            Browse Files
          </button>
        </div>

        {/* Storage Destination Selector */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '16px',
          marginTop: '20px',
          padding: '16px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '8px',
          border: '1px solid rgba(79, 172, 254, 0.2)'
        }}>
          <span style={{
            color: 'rgba(255, 255, 255, 0.8)',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            Upload to:
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setUploadDestination('local')}
              style={{
                padding: '8px 16px',
                background: uploadDestination === 'local'
                  ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
                  : 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(79, 172, 254, 0.3)',
                borderRadius: '6px',
                color: 'white',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              📁 Local Only
            </button>
            <button
              onClick={() => setUploadDestination('b2')}
              style={{
                padding: '8px 16px',
                background: uploadDestination === 'b2'
                  ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
                  : 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(79, 172, 254, 0.3)',
                borderRadius: '6px',
                color: 'white',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              ☁️ B2 Cloud
            </button>
            <button
              onClick={() => setUploadDestination('both')}
              style={{
                padding: '8px 16px',
                background: uploadDestination === 'both'
                  ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
                  : 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(79, 172, 254, 0.3)',
                borderRadius: '6px',
                color: 'white',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              🔄 Both (Recommended)
            </button>
          </div>
        </div>

        <p style={{
          color: 'rgba(255, 255, 255, 0.4)',
          fontSize: '12px',
          textAlign: 'center',
          marginTop: '12px',
          marginBottom: uploadQueue.length > 0 ? '20px' : '0'
        }}>
          Supported: Images (JPG, PNG, GIF), Videos (MP4, MOV, AVI), Audio (MP3, WAV), Documents (PDF, DOC)
        </p>

        {/* Upload Queue */}
        {uploadQueue.length > 0 && (
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px'
            }}>
              <h3 style={{
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: '16px',
                fontWeight: '600'
              }}>
                Upload Queue ({uploadQueue.length})
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {hasCompletedUploads && (
                  <button
                    onClick={clearCompletedUploads}
                    style={{
                      background: 'none',
                      border: '1px solid rgba(52, 211, 153, 0.3)',
                      color: '#34d399',
                      fontSize: '12px',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(52, 211, 153, 0.1)';
                      e.currentTarget.style.borderColor = '#34d399';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'none';
                      e.currentTarget.style.borderColor = 'rgba(52, 211, 153, 0.3)';
                    }}
                  >
                    Clear Completed
                  </button>
                )}
                {uploadQueue.length > 0 && !hasActiveUploads && (
                  <button
                    onClick={clearAll}
                    style={{
                      background: 'none',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#ef4444',
                      fontSize: '12px',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                      e.currentTarget.style.borderColor = '#ef4444';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'none';
                      e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                    }}
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            <div style={{ maxHeight: '300px', overflow: 'auto' }}>
              {uploadQueue.map(upload => (
                <div key={upload.id} style={{
                  marginBottom: '12px',
                  padding: '12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px'
                  }}>
                    <span style={{
                      color: 'rgba(255, 255, 255, 0.9)',
                      fontSize: '13px',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginRight: '8px'
                    }}>
                      {upload.file.name}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {upload.status === 'complete' && (
                        <Check size={16} color="#34d399" />
                      )}
                      {upload.status === 'error' && (
                        <span title={upload.error}>
                          <AlertCircle size={16} color="#ef4444" />
                        </span>
                      )}
                      {upload.status === 'uploading' && (
                        <>
                          <Loader2 size={16} color="#4facfe" className="animate-spin" />
                          <span style={{ color: '#4facfe', fontSize: '12px', minWidth: '35px', textAlign: 'right' }}>
                            {upload.progress}%
                          </span>
                        </>
                      )}
                      <button
                        onClick={() => removeFromQueue(upload.id)}
                        disabled={upload.status === 'uploading'}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: upload.status === 'uploading' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.4)',
                          cursor: upload.status === 'uploading' ? 'not-allowed' : 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '4px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '2px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${upload.progress}%`,
                      height: '100%',
                      background: upload.status === 'error'
                        ? '#ef4444'
                        : upload.status === 'complete'
                          ? '#34d399'
                          : 'linear-gradient(90deg, #4facfe 0%, #00f2fe 100%)',
                      transition: 'width 0.3s ease',
                      boxShadow: upload.status === 'uploading'
                        ? '0 0 10px rgba(79, 172, 254, 0.5)'
                        : 'none'
                    }} />
                  </div>
                  {upload.error && (
                    <p style={{
                      color: '#ef4444',
                      fontSize: '11px',
                      marginTop: '4px'
                    }}>
                      {upload.error}
                    </p>
                  )}
                  <p style={{
                    color: 'rgba(255, 255, 255, 0.4)',
                    fontSize: '11px',
                    marginTop: '4px'
                  }}>
                    {(upload.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}