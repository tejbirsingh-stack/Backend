import React from 'react';
import { 
  Home, 
  Clock, 
  Star, 
  Share2, 
  Trash2, 
  Folder,
  Video,
  ChevronDown,
  Plus,
  Search
} from 'lucide-react';

export default function Sidebar() {
  const [openFolders, setOpenFolders] = React.useState<string[]>(['ARK']);

  const toggleFolder = (folder: string) => {
    setOpenFolders(prev => 
      prev.includes(folder) 
        ? prev.filter(f => f !== folder)
        : [...prev, folder]
    );
  };

  return (
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
            ARK COMPASS
          </span>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ padding: '0 16px 16px 16px' }}>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {/* Recent */}
          <a href="#" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 12px',
            borderRadius: '6px',
            color: 'rgba(255, 255, 255, 0.7)',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
          }}>
            <Clock size={16} />
            <span>Recent</span>
          </a>

          {/* Favorites */}
          <a href="#" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 12px',
            borderRadius: '6px',
            color: 'rgba(255, 255, 255, 0.7)',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
          }}>
            <Star size={16} />
            <span>Favorites</span>
          </a>

          {/* Shared */}
          <a href="#" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 12px',
            borderRadius: '6px',
            color: 'rgba(255, 255, 255, 0.7)',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
          }}>
            <Share2 size={16} />
            <span>Shared</span>
          </a>

          {/* Trash */}
          <a href="#" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 12px',
            borderRadius: '6px',
            color: 'rgba(255, 255, 255, 0.7)',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
          }}>
            <Trash2 size={16} />
            <span>Trash</span>
          </a>
        </nav>
      </div>

      {/* Separator */}
      <div style={{
        height: '1px',
        background: '#2a2a2e',
        margin: '0 16px 16px 16px'
      }} />

      {/* Directory Section */}
      <div style={{ padding: '0 16px', flex: 1 }}>
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
            DIRECTORY
          </span>
          <button style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.5)',
            cursor: 'pointer',
            padding: '2px'
          }}>
            <Plus size={14} />
          </button>
        </div>

        {/* ARK Folder */}
        <div style={{ marginBottom: '4px' }}>
          <button
            onClick={() => toggleFolder('ARK')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '6px 8px',
              background: openFolders.includes('ARK') ? 'rgba(93, 141, 225, 0.1)' : 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: openFolders.includes('ARK') ? '#5d8de1' : 'rgba(255, 255, 255, 0.7)',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              if (!openFolders.includes('ARK')) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }
            }}
            onMouseOut={(e) => {
              if (!openFolders.includes('ARK')) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            <ChevronDown 
              size={14} 
              style={{
                transform: openFolders.includes('ARK') ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.2s ease'
              }}
            />
            <Folder size={16} />
            <span>ARK</span>
          </button>

          {/* ARK Submenu */}
          {openFolders.includes('ARK') && (
            <div style={{ marginLeft: '24px', marginTop: '4px' }}>
              <a href="#" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '6px',
                color: 'rgba(255, 255, 255, 0.7)',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.color = 'white';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
              }}>
                <Video size={16} />
                <span>Videos</span>
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Upload Progress (if any) */}
      <div style={{
        padding: '16px',
        borderTop: '1px solid #2a2a2e',
        background: '#1a1a1e'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px'
        }}>
          <span style={{
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: '12px',
            fontWeight: '500'
          }}>
            Envira6_CofRollunmu.mp4
          </span>
          <span style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '11px'
          }}>
            100%
          </span>
        </div>
        <div style={{
          width: '100%',
          height: '4px',
          background: '#2a2a2e',
          borderRadius: '2px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: '100%',
            height: '100%',
            background: '#34d399',
            transition: 'width 0.3s ease'
          }} />
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '4px'
        }}>
          <span style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '11px'
          }}>
            Progress
          </span>
          <span style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '11px'
          }}>
            4.24 MB / 4.24 MB
          </span>
        </div>
      </div>
    </aside>
  );
}
