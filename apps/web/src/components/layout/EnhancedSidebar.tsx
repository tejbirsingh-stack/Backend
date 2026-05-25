import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Star, 
  Share2, 
  Trash2, 
  Folder,
  FolderOpen,
  Video,
  Image,
  Music,
  FileText,
  File,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Upload,
  Loader2
} from 'lucide-react';
import { useMediaStore } from '../../stores/mediaStore';
import UploadModal from '../UploadModal';
import axios from 'axios';

interface FileItem {
  name: string;
  type: 'file' | 'folder';
  size?: number;
  modified?: string;
  path: string;
  extension?: string;
  children?: FileItem[];
}

interface SidebarSection {
  id: string;
  label: string;
  icon: React.ElementType;
  action?: () => void;
  badge?: number | string;
}

interface EnhancedSidebarProps {
  selectedAsset?: any;
  onFileSelect?: (asset: any) => void;
}

export default function EnhancedSidebar({ selectedAsset, onFileSelect }: EnhancedSidebarProps = {}) {
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<string>('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [directories, setDirectories] = useState<FileItem[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const { assets, fetchAssets } = useMediaStore();

  // Load directory structure
  useEffect(() => {
    loadDirectoryStructure();
  }, []);

  const loadDirectoryStructure = async () => {
    setIsLoadingDirectory(true);
    try {
      // Try to fetch actual files from the media API
      const filesResponse = await axios.get('/api/media');
      const files = filesResponse.data.assets || filesResponse.data.files || [];
      
      // Convert files to FileItem format and organize by type
      const videoFiles = files.filter((f: any) => f.type?.includes('video')).map((f: any) => ({
        name: f.name || f.fileName,
        type: 'file' as const,
        path: `/Videos/${f.name || f.fileName}`,
        size: f.size || f.fileSize,
        modified: f.uploadedAt || f.createdAt,
        extension: `.${(f.name || f.fileName).split('.').pop()}`
      }));
      
      const imageFiles = files.filter((f: any) => f.type?.includes('image')).map((f: any) => ({
        name: f.name || f.fileName,
        type: 'file' as const,
        path: `/Images/${f.name || f.fileName}`,
        size: f.size || f.fileSize,
        modified: f.uploadedAt || f.createdAt,
        extension: `.${(f.name || f.fileName).split('.').pop()}`
      }));
      
      const audioFiles = files.filter((f: any) => f.type?.includes('audio')).map((f: any) => ({
        name: f.name || f.fileName,
        type: 'file' as const,
        path: `/Audio/${f.name || f.fileName}`,
        size: f.size || f.fileSize,
        modified: f.uploadedAt || f.createdAt,
        extension: `.${(f.name || f.fileName).split('.').pop()}`
      }));
      
      // Create directory structure with actual files
      const allFiles = [...videoFiles, ...imageFiles, ...audioFiles];
      
      setDirectories([
        {
          name: 'All Files',
          type: 'folder',
          path: '/All Files',
          children: allFiles
        },
        {
          name: 'By Type',
          type: 'folder',
          path: '/By Type',
          children: [
            { name: 'Videos', type: 'folder', path: '/By Type/Videos', children: videoFiles },
            { name: 'Images', type: 'folder', path: '/By Type/Images', children: imageFiles },
            { name: 'Audio', type: 'folder', path: '/By Type/Audio', children: audioFiles }
          ]
        },
        {
          name: 'Projects',
          type: 'folder',
          path: '/Projects',
          children: [
            {
              name: 'Product Launch',
              type: 'folder',
              path: '/Projects/Product Launch',
              children: [
                { name: 'Presentations', type: 'folder', path: '/Projects/Product Launch/Presentations', children: [] },
                { name: 'Marketing', type: 'folder', path: '/Projects/Product Launch/Marketing', children: [] }
              ]
            }
          ]
        },
        {
          name: 'Personal',
          type: 'folder',
          path: '/Personal',
          children: [
            { name: 'Photos', type: 'folder', path: '/Personal/Photos', children: [] },
            { name: 'Videos', type: 'folder', path: '/Personal/Videos', children: [] }
          ]
        },
        {
          name: 'Archive',
          type: 'folder',
          path: '/Archive',
          children: [
            { name: '2024', type: 'folder', path: '/Archive/2024', children: [] },
            { name: '2023', type: 'folder', path: '/Archive/2023', children: [] }
          ]
        }
      ]);
    } finally {
      setIsLoadingDirectory(false);
    }
  };

  const toggleFolder = (folderPath: string) => {
    setOpenFolders(prev => 
      prev.includes(folderPath) 
        ? prev.filter(f => f !== folderPath)
        : [...prev, folderPath]
    );
  };

  const handleSectionClick = (sectionId: string) => {
    setActiveSection(sectionId);
    
    switch(sectionId) {
      case 'recent':
        // Filter to show recent files
        fetchAssets();
        break;
      case 'favorites':
        // Show favorited files
        console.log('Showing favorites');
        break;
      case 'shared':
        // Show shared files
        console.log('Showing shared files');
        break;
      case 'trash':
        // Show deleted files
        console.log('Showing trash');
        break;
      case 'upload':
        setShowUploadModal(true);
        break;
    }
  };

  const getFileIcon = (file: FileItem) => {
    if (file.type === 'folder') {
      return openFolders.includes(file.path) ? FolderOpen : Folder;
    }
    
    const ext = file.extension?.toLowerCase() || file.name.split('.').pop()?.toLowerCase();
    switch(ext) {
      case 'mp4':
      case 'mov':
      case 'avi':
      case 'webm':
        return Video;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
        return Image;
      case 'mp3':
      case 'wav':
      case 'ogg':
        return Music;
      case 'pdf':
      case 'doc':
      case 'docx':
      case 'txt':
        return FileText;
      default:
        return File;
    }
  };

  // These functions are no longer needed as we're using the UploadModal component
  // The upload functionality is handled by the UploadModal

  const handleFileClick = async (item: FileItem) => {
    if (item.type === 'file' && onFileSelect) {
      try {
        // Fetch the actual file data from the API
        const response = await axios.get('/api/media');
        const files = response.data.assets || response.data.files || [];
        
        // Find the matching file by name
        const fileData = files.find((f: any) => 
          (f.name || f.fileName) === item.name
        );
        
        if (fileData) {
          // Use the actual file data from the server
          const asset = {
            id: fileData.id || item.path,
            name: fileData.name || fileData.fileName,
            type: fileData.type || getFileType(item.extension || ''),
            size: fileData.size || fileData.fileSize || 0,
            url: fileData.url || `/uploads/${fileData.name || fileData.fileName}`,
            uploadedAt: fileData.uploadedAt || fileData.createdAt || item.modified,
            path: item.path,
            thumbnail: fileData.thumbnail,
            duration: fileData.duration,
            metadata: fileData.metadata
          };
          
          onFileSelect(asset);
          console.log('File selected from sidebar:', asset.name);
        } else {
          // Fallback if file not found in API response
          const asset = {
            id: item.path,
            name: item.name,
            type: getFileType(item.extension || ''),
            size: item.size || 0,
            url: `/uploads/${item.name}`,
            uploadedAt: item.modified || new Date().toISOString(),
            path: item.path
          };
          
          onFileSelect(asset);
          console.log('File selected from sidebar (fallback):', asset.name);
        }
      } catch (error) {
        console.error('Error fetching file data:', error);
        // Fallback on error
        const asset = {
          id: item.path,
          name: item.name,
          type: getFileType(item.extension || ''),
          size: item.size || 0,
          url: `/uploads/${item.name}`,
          uploadedAt: item.modified || new Date().toISOString(),
          path: item.path
        };
        
        onFileSelect(asset);
      }
    }
  };

  const getFileType = (extension: string): string => {
    const ext = extension.toLowerCase();
    if (['.mp4', '.webm', '.mov', '.avi'].includes(ext)) return 'video';
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return 'image';
    if (['.mp3', '.wav', '.ogg'].includes(ext)) return 'audio';
    if (['.pdf', '.doc', '.docx', '.txt'].includes(ext)) return 'document';
    return 'file';
  };

  const renderDirectory = (items: FileItem[], level = 0) => {
    return items.map(item => (
      <div key={item.path} style={{ marginLeft: `${level * 12}px` }}>
        <button
          onClick={() => item.type === 'folder' ? toggleFolder(item.path) : handleFileClick(item)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            padding: '6px 8px',
            background: 'transparent',
            border: 'none',
            borderRadius: '6px',
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: '13px',
            fontWeight: '400',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
          }}
        >
          {item.type === 'folder' && (
            openFolders.includes(item.path) ? 
              <ChevronDown size={14} /> : 
              <ChevronRight size={14} />
          )}
          {React.createElement(getFileIcon(item), { size: 16 })}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.name}
          </span>
        </button>
        
        {item.type === 'folder' && openFolders.includes(item.path) && item.children && (
          <div>
            {renderDirectory(item.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  const sections: SidebarSection[] = [
    { id: 'recent', label: 'Recent', icon: Clock },
    { id: 'favorites', label: 'Favorites', icon: Star },
    { id: 'shared', label: 'Shared', icon: Share2 },
    { id: 'trash', label: 'Trash', icon: Trash2 },
    { id: 'upload', label: 'Upload', icon: Upload }
  ];

  return (
    <>
      <aside style={{
        position: 'fixed',
        left: 0,
        top: '64px',
        bottom: 0,
        width: '280px',
        background: '#1a1a1e',
        borderRight: '1px solid #2a2a2e',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10
      }}>
        {/* Workspace Section */}
        <div style={{ padding: '16px 16px 0 16px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px'
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#34d399'
            }} />
            <span style={{
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              NOAH WORKSPACE
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ padding: '0 16px 16px 16px' }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {sections.map(section => (
              <button
                key={section.id}
                onClick={() => handleSectionClick(section.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: activeSection === section.id ? 'rgba(79, 172, 254, 0.1)' : 'transparent',
                  border: 'none',
                  color: activeSection === section.id ? '#4facfe' : 'rgba(255, 255, 255, 0.7)',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  width: '100%',
                  textAlign: 'left'
                }}
                onMouseOver={(e) => {
                  if (activeSection !== section.id) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.color = 'white';
                  }
                }}
                onMouseOut={(e) => {
                  if (activeSection !== section.id) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                  }
                }}
              >
                <section.icon size={16} />
                <span>{section.label}</span>
                {section.badge && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '11px',
                    padding: '2px 6px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '10px'
                  }}>
                    {section.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Separator */}
        <div style={{
          height: '1px',
          background: '#2a2a2e',
          margin: '0 16px 16px 16px'
        }} />

        {/* Directory Section */}
        <div style={{ padding: '0 16px', flex: 1, overflow: 'auto' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <span style={{
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '12px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              FILES & FOLDERS
            </span>
            <button
              onClick={loadDirectoryStructure}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.5)',
                cursor: 'pointer',
                padding: '2px'
              }}
              title="Refresh"
            >
              {isLoadingDirectory ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
            </button>
          </div>

          {/* Search Box */}
          <div style={{
            position: 'relative',
            marginBottom: '12px'
          }}>
            <Search size={14} style={{
              position: 'absolute',
              left: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(255, 255, 255, 0.4)'
            }} />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px 6px 28px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                color: 'white',
                fontSize: '12px',
                outline: 'none'
              }}
            />
          </div>

          {/* Directory Tree */}
          {isLoadingDirectory ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
              color: 'rgba(255, 255, 255, 0.5)'
            }}>
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : (
            <div style={{ fontSize: '13px' }}>
              {renderDirectory(directories)}
            </div>
          )}

          {/* Special Sections Content */}
          {activeSection === 'shared' && (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              color: 'rgba(255, 255, 255, 0.5)'
            }}>
              <Share2 size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
              <p style={{ fontSize: '14px' }}>No shared files</p>
              <p style={{ fontSize: '12px', marginTop: '4px' }}>
                Files shared with you will appear here
              </p>
            </div>
          )}

          {activeSection === 'trash' && (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              color: 'rgba(255, 255, 255, 0.5)'
            }}>
              <Trash2 size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
              <p style={{ fontSize: '14px' }}>Trash is empty</p>
              <p style={{ fontSize: '12px', marginTop: '4px' }}>
                Deleted files will appear here for 30 days
              </p>
            </div>
          )}
        </div>

      </aside>

      {/* Upload Modal - Use the shared component */}
      <UploadModal 
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadComplete={() => {
          fetchAssets(true);
          console.log('✅ Upload complete from sidebar');
        }}
      />
    </>
  );
}