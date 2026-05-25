import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, X, Check, Users, Search, Filter, Grid3X3, List, 
  MoreVertical, Download, Share2, Eye, FileVideo, FileImage, 
  FileAudio, File, Loader2, Heart, Calendar
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import { useMediaStore } from '../stores/mediaStore';

// Mock data generation for demonstration
const generateMockAssets = (count: number) => {
  const types = ['image', 'video', 'audio', 'document'];
  const names = ['Project Alpha', 'Brand Campaign', 'Product Demo', 'Conference Talk', 'Tutorial Series'];
  
  return Array.from({ length: count }, (_, i) => ({
    id: `asset-${i}`,
    name: `${names[i % names.length]} ${i + 1}`,
    type: types[i % types.length],
    size: Math.floor(Math.random() * 100000000) + 1000000,
    duration: types[i % types.length] === 'video' ? Math.floor(Math.random() * 3600) : null,
    thumbnail: `https://picsum.photos/400/300?random=${i}`,
    url: `https://example.com/assets/${i}`,
    uploadedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
    tags: ['important', 'project', 'brand'].slice(0, Math.floor(Math.random() * 3) + 1),
    likes: Math.floor(Math.random() * 100),
    comments: Math.floor(Math.random() * 20),
    views: Math.floor(Math.random() * 1000),
    collections: ['Main Project', 'Archive'].slice(0, Math.floor(Math.random() * 2) + 1),
    aiTags: ['person', 'outdoor', 'technology'].slice(0, Math.floor(Math.random() * 3) + 1),
    metadata: {
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'H.264',
      bitrate: '5 Mbps'
    }
  }));
};

export default function MediaBrowser() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [viewingAsset, setViewingAsset] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    type: 'all',
    dateRange: 'all',
    tags: [],
    collections: [],
  });

  const { assets, isLoading, fetchAssets } = useMediaStore();

  // Generate mock data for demonstration
  const mockAssets = useMemo(() => generateMockAssets(100), []);
  
  // Use mock data if real assets aren't loaded
  const displayAssets = assets.length > 0 ? assets : mockAssets;

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Filtered assets based on search and filters
  const filteredAssets = useMemo(() => {
    return displayAssets.filter((asset: any) => {
      const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          asset.tags?.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesType = filters.type === 'all' || asset.type === filters.type;
      
      return matchesSearch && matchesType;
    });
  }, [displayAssets, searchQuery, filters]);

  const toggleViewMode = () => {
    setViewMode(viewMode === 'grid' ? 'list' : 'grid');
  };

  const toggleAssetSelection = (assetId: string) => {
    const newSelected = new Set(selectedAssets);
    if (newSelected.has(assetId)) {
      newSelected.delete(assetId);
    } else {
      newSelected.add(assetId);
    }
    setSelectedAssets(newSelected);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'video': return FileVideo;
      case 'image': return FileImage;
      case 'audio': return FileAudio;
      default: return File;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Navbar />
      
      <div className="flex">
        <Sidebar />
        
        <main className="flex-1 p-6">
          {/* Enhanced Header */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  Media Library
                </h1>
                <p className="text-slate-600 mt-1">
                  {filteredAssets.length} assets • {selectedAssets.size} selected
                </p>
              </div>
              
              {/* Real-time collaboration avatars */}
              <div className="flex items-center gap-4">
                <div className="flex -space-x-2">
                  {[1, 2, 3].map((id) => (
                    <motion.div
                      key={id}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 border-2 border-white flex items-center justify-center text-xs font-semibold text-white"
                    >
                      {id}
                    </motion.div>
                  ))}
                  <motion.div 
                    className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center"
                    whileHover={{ scale: 1.1 }}
                  >
                    <Users className="w-4 h-4 text-slate-600" />
                  </motion.div>
                </div>
                
                <button className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Upload
                </button>
              </div>
            </div>
            
            {/* Search and filters */}
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search assets, tags, or collections..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`px-4 py-3 rounded-xl border transition-all flex items-center gap-2 ${
                    showFilters 
                      ? 'border-purple-500 bg-purple-50 text-purple-700' 
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  Filters
                </button>
                
                <button
                  onClick={toggleViewMode}
                  className="px-4 py-3 rounded-xl border border-slate-200 hover:border-slate-300 transition-all flex items-center gap-2"
                >
                  {viewMode === 'grid' ? <Grid3X3 className="w-4 h-4" /> : <List className="w-4 h-4" />}
                  {viewMode === 'grid' ? 'Grid' : 'List'}
                </button>
              </div>
            </div>
          </div>

          {/* Filters Panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-white/80 backdrop-blur-sm rounded-2xl mt-4 p-6 shadow-lg border border-white/20"
              >
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
                    <select
                      value={filters.type}
                      onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-purple-500 outline-none"
                    >
                      <option value="all">All Types</option>
                      <option value="image">Images</option>
                      <option value="video">Videos</option>
                      <option value="audio">Audio</option>
                      <option value="document">Documents</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Date Range</label>
                    <select
                      value={filters.dateRange}
                      onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-purple-500 outline-none"
                    >
                      <option value="all">All Time</option>
                      <option value="today">Today</option>
                      <option value="week">This Week</option>
                      <option value="month">This Month</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Tags</label>
                    <div className="flex flex-wrap gap-1">
                      {['important', 'project', 'brand', 'archived'].map((tag) => (
                        <button
                          key={tag}
                          className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">AI Tags</label>
                    <div className="flex flex-wrap gap-1">
                      {['person', 'outdoor', 'technology'].map((tag) => (
                        <button
                          key={tag}
                          className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-purple-500 animate-spin mb-4" />
              <span className="text-slate-600">Loading your media...</span>
            </div>
          )}

          {/* Media Grid */}
          <div className="mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {filteredAssets.map((asset: any) => {
                const IconComponent = getFileIcon(asset.type);
                const isSelected = selectedAssets.has(asset.id);
                
                return (
                  <motion.div
                    key={asset.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.02 }}
                    className={`group relative bg-white rounded-2xl overflow-hidden shadow-lg border-2 transition-all duration-200 ${
                      isSelected ? 'border-purple-500 ring-4 ring-purple-200' : 'border-transparent hover:border-purple-200'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden">
                      {asset.type === 'image' || asset.type === 'video' ? (
                        <img 
                          src={asset.thumbnail} 
                          alt={asset.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <IconComponent className="w-12 h-12 text-slate-400" />
                        </div>
                      )}
                      
                      {/* Overlay actions */}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button 
                          onClick={() => setViewingAsset(asset)}
                          className="p-2 bg-white/20 backdrop-blur-sm rounded-full hover:bg-white/30 transition-colors"
                        >
                          <Eye className="w-4 h-4 text-white" />
                        </button>
                        <button className="p-2 bg-white/20 backdrop-blur-sm rounded-full hover:bg-white/30 transition-colors">
                          <Download className="w-4 h-4 text-white" />
                        </button>
                        <button className="p-2 bg-white/20 backdrop-blur-sm rounded-full hover:bg-white/30 transition-colors">
                          <Share2 className="w-4 h-4 text-white" />
                        </button>
                      </div>
                      
                      {/* Selection checkbox */}
                      <button
                        onClick={() => toggleAssetSelection(asset.id)}
                        className={`absolute top-3 right-3 w-6 h-6 rounded-full border-2 transition-all ${
                          isSelected 
                            ? 'bg-purple-500 border-purple-500' 
                            : 'bg-white/80 border-white hover:border-purple-300'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white mx-auto" />}
                      </button>
                      
                      {/* Duration for videos */}
                      {asset.duration && (
                        <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/70 text-white text-xs rounded">
                          {formatDuration(asset.duration)}
                        </div>
                      )}
                    </div>
                    
                    {/* Content */}
                    <div className="p-4">
                      <h3 className="font-semibold text-slate-800 truncate mb-1">{asset.name}</h3>
                      <p className="text-sm text-slate-500 mb-3">{formatFileSize(asset.size)}</p>
                      
                      {/* Tags */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {asset.tags?.slice(0, 2).map((tag: string, index: number) => (
                          <span
                            key={index}
                            className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      
                      {/* Stats */}
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {asset.views}
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="w-3 h-3" />
                            {asset.likes}
                          </span>
                        </div>
                        <button>
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Asset Viewer Modal */}
          <AnimatePresence>
            {viewingAsset && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={() => setViewingAsset(null)}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">{viewingAsset.name}</h2>
                      <p className="text-slate-600">{viewingAsset.type} • {formatFileSize(viewingAsset.size)}</p>
                    </div>
                    <button
                      onClick={() => setViewingAsset(null)}
                      className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                  
                  <div className="p-6">
                    <div className="aspect-video bg-slate-100 rounded-xl overflow-hidden mb-6">
                      {viewingAsset.type === 'image' || viewingAsset.type === 'video' ? (
                        <img 
                          src={viewingAsset.thumbnail} 
                          alt={viewingAsset.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {React.createElement(getFileIcon(viewingAsset.type), { className: "w-24 h-24 text-slate-400" })}
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h3 className="font-semibold text-slate-800 mb-3">Details</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-600">Type:</span>
                            <span className="text-slate-800">{viewingAsset.type}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Size:</span>
                            <span className="text-slate-800">{formatFileSize(viewingAsset.size)}</span>
                          </div>
                          {viewingAsset.duration && (
                            <div className="flex justify-between">
                              <span className="text-slate-600">Duration:</span>
                              <span className="text-slate-800">{formatDuration(viewingAsset.duration)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-slate-600">Uploaded:</span>
                            <span className="text-slate-800">{new Date(viewingAsset.uploadedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="font-semibold text-slate-800 mb-3">Tags & Collections</h3>
                        <div className="space-y-3">
                          <div>
                            <span className="text-sm text-slate-600 block mb-2">Tags:</span>
                            <div className="flex flex-wrap gap-1">
                              {viewingAsset.tags?.map((tag: string, index: number) => (
                                <span
                                  key={index}
                                  className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                          
                          <div>
                            <span className="text-sm text-slate-600 block mb-2">AI Tags:</span>
                            <div className="flex flex-wrap gap-1">
                              {viewingAsset.aiTags?.map((tag: string, index: number) => (
                                <span
                                  key={index}
                                  className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
