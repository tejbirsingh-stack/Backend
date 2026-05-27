import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, X, Check, Users, Search, Filter, Grid3X3, List,
  MoreVertical, Download, Share2, Eye, FileVideo, FileImage,
  FileAudio, File, Loader2, Heart, Calendar, ArrowUp, ArrowDown, Trash, RefreshCw, Folder, ChevronLeft
} from 'lucide-react';
import InPageMediaViewer from '../components/InPageMediaViewer';
import UploadModal from '../components/UploadModal';
import { useMediaStore } from '../stores/mediaStore';


interface MediaBrowserProps {
  selectedAsset?: any;
  onSelectAsset?: (asset: any) => void;
}

export default function MediaBrowser({ selectedAsset: externalSelectedAsset, onSelectAsset: externalOnSelectAsset }: MediaBrowserProps = {}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [viewingAsset, setViewingAsset] = useState<any>(null);
  const [internalSelectedAsset, setInternalSelectedAsset] = useState<any>(null); // For InPageMediaViewer

  // Use external state if provided, otherwise use internal
  const selectedAsset = externalSelectedAsset !== undefined ? externalSelectedAsset : internalSelectedAsset;
  const setSelectedAsset = externalOnSelectAsset || setInternalSelectedAsset;
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [folders, setFolders] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    type: 'all',
    dateRange: 'all',
    tags: [],
    collections: [],
  });

  const {
    assets,
    folders: storeFolders,
    isLoading,
    fetchAssets,
    deleteAssets,
    fetchFolderAssets,
    searchAssets,
    storageSource,
    setStorageSource,
    currentFolder,
    setCurrentFolder,
    isSearchMode
  } = useMediaStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Don't use mock assets anymore - only use real assets from API
  const displayAssets = assets;

  // Update folders when store updates
  useEffect(() => {
    setFolders(storeFolders || []);
  }, [storeFolders]);

  useEffect(() => {
    // Initialize with root folder on mount
    // fetchFolderAssets(null);
    fetchAssets(true);
  }, []);

  // Refresh when folder changes
  useEffect(() => {
    console.log('Folder changed to:', currentFolder);
  }, [currentFolder]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (isSearchMode && searchQuery) {
      await searchAssets(searchQuery);
    } else {
      await fetchFolderAssets(currentFolder, true); // Force refresh current folder
    }
    setIsRefreshing(false);
  };

  // In search mode, don't show folders. Otherwise, all folders returned by API are for current level
  const currentFolders = useMemo(() => {
    if (isSearchMode) {
      return []; // Don't show folders in search mode
    }
    return folders; // API already filters to current level
  }, [folders, isSearchMode]);

  // Enhanced filtered and sorted assets
  const filteredAssets = useMemo(() => {
    // Debug logging
    console.log('Current folder:', currentFolder);
    console.log('Is search mode:', isSearchMode);
    console.log('Search query:', searchQuery);
    console.log('Total assets:', displayAssets.length);
    console.log('Sample asset folders:', displayAssets.slice(0, 5).map((a: any) => ({ name: a.name, folder: a.folder })));

    let filtered = displayAssets;

    // In search mode, assets are already filtered by the search API
    // Otherwise, they're already filtered by folder in fetchFolderAssets
    if (!isSearchMode && searchQuery && !searchQuery.trim()) {
      // If there's a search query but we're not in search mode, filter locally
      const searchLower = searchQuery.toLowerCase();
      filtered = displayAssets.filter((asset: any) => {
        return asset.name.toLowerCase().includes(searchLower) ||
          asset.type.toLowerCase().includes(searchLower) ||
          asset.tags?.some((tag: string) => tag.toLowerCase().includes(searchLower));
      });
    }

    // Type filtering with proper mapping
    if (filters.type !== 'all') {
      filtered = filtered.filter((asset: any) => {
        const assetType = asset.type.toLowerCase();
        if (filters.type === 'video' && !assetType.includes('video')) return false;
        if (filters.type === 'image' && !assetType.includes('image')) return false;
        if (filters.type === 'audio' && !assetType.includes('audio')) return false;
        if (filters.type === 'document' && !assetType.includes('pdf') && !assetType.includes('doc')) return false;
        return true;
      });
    }

    // Sorting
    filtered.sort((a: any, b: any) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'date':
        default:
          const dateA = new Date(a.uploadDate || a.uploadedAt || 0).getTime();
          const dateB = new Date(b.uploadDate || b.uploadedAt || 0).getTime();
          comparison = dateA - dateB;
          break;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    console.log('Filtered assets count:', filtered.length);
    console.log('Filtered assets in folder:', filtered.slice(0, 3).map((a: any) => ({ name: a.name, folder: a.folder })));

    return filtered;
  }, [displayAssets, searchQuery, filters, sortBy, sortOrder, currentFolder, isSearchMode]);

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
    const typeStr = type.toLowerCase();
    if (typeStr.includes('video') || typeStr === 'video') return FileVideo;
    if (typeStr.includes('image') || typeStr === 'image') return FileImage;
    if (typeStr.includes('audio') || typeStr === 'audio') return FileAudio;
    return File;
  };

  const getFileIconColor = (type: string) => {
    const typeStr = type.toLowerCase();
    if (typeStr.includes('video') || typeStr === 'video') return 'text-red-500';
    if (typeStr.includes('image') || typeStr === 'image') return 'text-green-500';
    if (typeStr.includes('audio') || typeStr === 'audio') return 'text-blue-500';
    return 'text-slate-500';
  };

  const handleDeleteSelected = async () => {
    const assetIds = Array.from(selectedAssets);
    if (assetIds.length === 0) return;
    try {
      await deleteAssets(assetIds);
      setSelectedAssets(new Set());
      // Reload list from API so UI matches disk without a full page refresh
      if (isSearchMode && searchQuery) {
        await searchAssets(searchQuery);
      } else {
        await fetchAssets(true);
      }
    } catch (error) {
      console.error('Failed to delete assets:', error);
    }
  };

  // If an asset is selected, show the in-page viewer
  if (selectedAsset) {
    return (
      <InPageMediaViewer
        asset={selectedAsset}
        onClose={() => setSelectedAsset(null)}
      />
    );
  }

  // Otherwise, show the media browser
  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          {/* Enhanced Header */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2">
                  {currentFolder && (
                    <button
                      onClick={() => {
                        // Navigate to parent folder
                        const parts = currentFolder.split('/');
                        if (parts.length > 1) {
                          parts.pop();
                          setCurrentFolder(parts.join('/'));
                        } else {
                          setCurrentFolder(null);
                        }
                      }}
                      className="flex items-center gap-1 text-purple-600 hover:text-purple-700"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </button>
                  )}
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                    {isSearchMode
                      ? `Search Results: "${searchQuery}"`
                      : currentFolder
                        ? currentFolder.split('/').pop()
                        : 'Media Library - Your Ark'
                    }
                  </h1>
                </div>
                <p className="text-slate-600 mt-1">
                  {filteredAssets.length} assets • {selectedAssets.size} selected
                  {!isSearchMode && ` • ${currentFolders.length} folders`}
                  {isSearchMode && ` • Searching across all folders`}
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

                <button
                  onClick={() => setShowUploadModal(true)}
                  className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:from-purple-600 hover:to-blue-600 transition-all shadow-lg hover:shadow-xl flex items-center gap-2">
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
                  placeholder="Search across all folders by name, type, or tags..."
                  value={searchQuery}
                  onChange={(e) => {
                    const newQuery = e.target.value;
                    setSearchQuery(newQuery);

                    // Trigger search in the store
                    if (newQuery.trim()) {
                      searchAssets(newQuery);
                    } else {
                      fetchFolderAssets(currentFolder, true);
                    }
                  }}
                  className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      // This will trigger return to folder view in the store
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-4 py-3 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 bg-white min-w-[140px] outline-none"
                >
                  <option value="date">Sort by Date</option>
                  <option value="name">Sort by Name</option>
                  <option value="size">Sort by Size</option>
                  <option value="type">Sort by Type</option>
                </select>

                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="px-3 py-3 rounded-xl border border-slate-200 hover:border-slate-300 transition-all flex items-center"
                  title={`Sort ${sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                >
                  {sortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                </button>

                {/* Storage Source Selector */}
                <select
                  value={storageSource}
                  onChange={(e) => setStorageSource(e.target.value as 'local' | 'b2' | 'all')}
                  className="px-4 py-3 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 bg-white min-w-[140px] outline-none"
                  title="Select storage source"
                >
                  <option value="all">📁 All Storage</option>
                  <option value="local">💾 Local Only</option>
                  <option value="b2">☁️ B2 Cloud</option>
                </select>

                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className={`px-4 py-3 rounded-xl border transition-all flex items-center gap-2 ${isRefreshing
                      ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  title="Refresh media list"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </button>

                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`px-4 py-3 rounded-xl border transition-all flex items-center gap-2 ${showFilters
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

          {/* Enhanced Filters Panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-white/90 backdrop-blur-sm rounded-2xl mt-6 p-6 shadow-lg border border-white/20"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-800">Filters</h3>
                  <button
                    onClick={() => setFilters({ type: 'all', dateRange: 'all', tags: [], collections: [] })}
                    className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                  >
                    Clear All
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Media Type</label>
                    <select
                      value={filters.type}
                      onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                    >
                      <option value="all">All Types</option>
                      <option value="video">Videos</option>
                      <option value="image">Images</option>
                      <option value="audio">Audio Files</option>
                      <option value="document">Documents</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Date Range</label>
                    <select
                      value={filters.dateRange}
                      onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
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

          {/* Media Grid / List */}
          <div className="mt-6">
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                {/* Display folders for current level */}
                {currentFolders.map((folder: any) => (
                  <motion.div
                    key={folder.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.02 }}
                    className="group relative bg-white rounded-2xl overflow-hidden shadow-lg border-2 border-transparent hover:border-purple-200 transition-all duration-200 cursor-pointer"
                    onClick={() => setCurrentFolder(folder.path)}
                  >
                    <div className="aspect-video bg-gradient-to-br from-purple-100 to-blue-100 relative overflow-hidden flex items-center justify-center">
                      <Folder className="w-16 h-16 text-purple-500" />
                      <div className="absolute top-2 right-2 flex gap-1">
                        {folder.fileCount > 0 && (
                          <div className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
                            {folder.fileCount} {folder.fileCount === 1 ? 'file' : 'files'}
                          </div>
                        )}
                        {folder.folderCount > 0 && (
                          <div className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
                            {folder.folderCount} {folder.folderCount === 1 ? 'folder' : 'folders'}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2">
                        <Folder className="w-5 h-5 text-purple-500 flex-shrink-0" />
                        <h3 className="font-semibold text-slate-800 truncate">{folder.name}</h3>
                      </div>
                    </div>
                  </motion.div>
                ))}

                {/* Display assets */}
                {filteredAssets.map((asset: any) => {
                  const IconComponent = getFileIcon(asset.type);
                  const iconColor = getFileIconColor(asset.type);
                  const isSelected = selectedAssets.has(asset.id);

                  return (
                    <motion.div
                      key={asset.id}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.02 }}
                      className={`group relative bg-white rounded-2xl overflow-hidden shadow-lg border-2 transition-all duration-200 ${isSelected ? 'border-purple-500 ring-4 ring-purple-200' : 'border-transparent hover:border-purple-200'
                        }`}
                    >
                      <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden" onClick={() => setSelectedAsset(asset)}>
                        {(asset.type === 'image' || asset.type?.includes('image')) ? (
                          <img
                            src={asset.url}
                            alt={asset.name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.parentElement?.querySelector('.icon-fallback')?.classList.remove('hidden');
                            }}
                          />
                        ) : (asset.type === 'video' || asset.type?.includes('video')) ? (
                          <video
                            src={asset.url}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            muted
                            preload="metadata"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.parentElement?.querySelector('.icon-fallback')?.classList.remove('hidden');
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <IconComponent className="w-12 h-12 text-slate-400" />
                          </div>
                        )}
                        <div className="icon-fallback hidden w-full h-full flex items-center justify-center absolute top-0 left-0 bg-gradient-to-br from-slate-100 to-slate-200">
                          <IconComponent className="w-12 h-12 text-slate-400" />
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center gap-2">
                          <IconComponent className={`w-5 h-5 ${iconColor} flex-shrink-0`} />
                          <h3 className="font-semibold text-slate-800 truncate">{asset.name}</h3>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-lg">
                <table className="w-full text-left">
                  <thead className="border-b border-slate-200">
                    <tr>
                      <th className="p-4 w-12">
                        <input type="checkbox" />
                      </th>
                      <th className="p-4 font-semibold">Name</th>
                      <th className="p-4 font-semibold">Size</th>
                      <th className="p-4 font-semibold">Type</th>
                      <th className="p-4 font-semibold">Modified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map((asset: any) => (
                      <tr key={asset.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                        <td className="p-4">
                          <input type="checkbox" checked={selectedAssets.has(asset.id)} onChange={(e) => { e.stopPropagation(); toggleAssetSelection(asset.id); }} />
                        </td>
                        <td className="p-4 cursor-pointer hover:bg-purple-50" onClick={() => setSelectedAsset(asset)}>{asset.name}</td>
                        <td className="p-4 cursor-pointer hover:bg-purple-50" onClick={() => setSelectedAsset(asset)}>{formatFileSize(asset.size)}</td>
                        <td className="p-4 cursor-pointer hover:bg-purple-50" onClick={() => setSelectedAsset(asset)}>{asset.type}</td>
                        <td className="p-4 cursor-pointer hover:bg-purple-50" onClick={() => setSelectedAsset(asset)}>{new Date(asset.uploadDate || asset.uploadedAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>


          {/* Bulk Actions */}
          <AnimatePresence>
            {selectedAssets.size > 0 && (
              <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white rounded-xl shadow-2xl p-4 flex items-center gap-6 z-50"
              >
                <p className="font-medium">{selectedAssets.size} item{selectedAssets.size > 1 ? 's' : ''} selected</p>
                <button
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
                  onClick={handleDeleteSelected}
                >
                  <Trash className="w-4 h-4" />
                  Delete
                </button>
                <button
                  onClick={() => setSelectedAssets(new Set())}
                  className="p-2 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadComplete={() => {
          handleRefresh();
          console.log('✅ Upload complete, refreshing media library...');
        }}
      />
    </div>
  );
}
