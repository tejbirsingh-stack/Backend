import { 
  Home, 
  FolderOpen, 
  Upload, 
  Settings, 
  Users, 
  BarChart3, 
  HelpCircle,
  LogOut,
  Star,
  Share2,
  Trash2,
  Video,
  Image,
  Music,
  FileText,
  PlayCircle
} from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import Logo from './ui/Logo';

interface SidebarProps {
  className?: string;
}

export default function Sidebar({ className = '' }: SidebarProps) {
  const location = useLocation();
  const { logout } = useAuthStore();

  const mainItems = [
    { icon: FolderOpen, label: 'Ark', path: '/media', active: true },
    { icon: Star, label: 'Favorites', path: '/favorites' },
    { icon: Share2, label: 'Shared', path: '/shared' },
    { icon: Trash2, label: 'Trash', path: '/trash' },
    { icon: PlayCircle, label: 'Pro Video Player', path: '/video-demo', highlight: true }
  ];

  const directoryItems = [
    { icon: Video, label: 'Videos', path: '/media?type=video' },
    { icon: Image, label: 'Images', path: '/media?type=image' },
    { icon: Music, label: 'Audio', path: '/media?type=audio' },
    { icon: FileText, label: 'Documents', path: '/media?type=document' }
  ];

  return (
    <div className={`w-64 bg-[#2A2A2E] flex flex-col min-h-screen ${className}`}>
      {/* Logo */}
      <div className="p-6">
        <div className="flex items-center space-x-3">
          <Logo variant="icon" size="sm" />
          <div>
            <h1 className="text-white font-semibold text-lg">Noah</h1>
            <p className="text-[#A9A9B4] text-xs">Media Platform</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-6">
        {/* Main Section */}
        <div className="mb-6">
          <div className="text-[#A9A9B4] text-xs font-semibold mb-3 uppercase tracking-wider">Main</div>
          <ul className="space-y-1">
            {mainItems.map((item, index) => {
              const isActive = item.active || location.pathname === item.path;
              const isHighlight = item.highlight;
              return (
                <li key={index}>
                  <Link
                    to={item.path}
                    className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-all ${
                      isActive
                        ? 'bg-[#5D8DE1] text-white'
                        : isHighlight
                        ? 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 hover:text-purple-300 border border-purple-500/30'
                        : 'text-[#A9A9B4] hover:bg-[#3A3A3E] hover:text-white'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                    {isHighlight && (
                      <span className="ml-auto text-xs bg-purple-600 text-white px-2 py-0.5 rounded">Demo</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Directory Section */}
        <div className="mb-6">
          <div className="text-[#A9A9B4] text-xs font-semibold mb-3 uppercase tracking-wider">Directory</div>
          <ul className="space-y-1">
            {directoryItems.map((item, index) => {
              const isActive = location.pathname === item.path;
              return (
                <li key={index}>
                  <Link
                    to={item.path}
                    className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-all ${
                      isActive
                        ? 'bg-[#5D8DE1] text-white'
                        : 'text-[#A9A9B4] hover:bg-[#3A3A3E] hover:text-white'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Storage Info */}
      <div className="px-6 pb-6">
        <div className="bg-[#3A3A3E] rounded-lg p-4">
          <div className="text-white text-sm mb-2">Storage Used</div>
          <div className="w-full bg-[#1A1A1E] rounded-full h-2 mb-2">
            <div className="bg-[#5D8DE1] h-2 rounded-full" style={{ width: '65%' }}></div>
          </div>
          <div className="text-[#A9A9B4] text-xs">2.3 GB of 15 GB used</div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="px-6 pb-6 border-t border-[#3A3A3E] pt-4">
        <ul className="space-y-2">
          <li>
            <button className="flex items-center space-x-3 px-3 py-2 rounded-lg text-[#A9A9B4] hover:bg-[#3A3A3E] hover:text-white transition-all w-full text-left">
              <Settings className="w-5 h-5" />
              <span className="font-medium">Settings</span>
            </button>
          </li>
          <li>
            <button 
              onClick={logout}
              className="flex items-center space-x-3 px-3 py-2 rounded-lg text-[#A9A9B4] hover:bg-[#3A3A3E] hover:text-white transition-all w-full text-left"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Sign Out</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
