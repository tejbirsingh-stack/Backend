import { create } from 'zustand';
import axios from 'axios';

export interface MediaAsset {
  id: string;
  name: string;
  type: 'video' | 'image' | 'audio' | 'document';
  size: number;
  duration?: number;
  uploadDate: string;
  thumbnail?: string;
  url: string;
  tags: string[];
  metadata: {
    width?: number;
    height?: number;
    codec?: string;
    bitrate?: number;
    fps?: number;
  };
  compressionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  compressionRatio?: number;
}

interface MediaStore {
  assets: MediaAsset[];
  folders: any[];
  isLoading: boolean;
  uploadProgress: { [key: string]: number };
  searchQuery: string;
  selectedAssets: string[];
  viewMode: 'grid' | 'list';
  storageSource: 'local' | 'b2' | 'all';
  lastFetchTime: number;
  currentFolder: string | null;
  isSearchMode: boolean;
  
  // Actions
  fetchAssets: (forceRefresh?: boolean, source?: 'local' | 'b2' | 'all') => Promise<void>;
  fetchFolderAssets: (folderPath: string | null, forceRefresh?: boolean) => Promise<void>;
  searchAssets: (query: string, source?: 'local' | 'b2' | 'all') => Promise<void>;
  setStorageSource: (source: 'local' | 'b2' | 'all') => void;
  setCurrentFolder: (folder: string | null) => void;
  clearCache: () => void;
  uploadFiles: (files: File[], options?: UploadOptions) => Promise<void>;
  deleteAssets: (assetIds: string[]) => Promise<void>;
  updateAsset: (assetId: string, updates: Partial<MediaAsset>) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setSelectedAssets: (assetIds: string[]) => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  getFilteredAssets: () => MediaAsset[];
}

interface UploadOptions {
  folder?: string;
  tags?: string[];
  compressionQuality?: 'low' | 'medium' | 'high';
  autoCompress?: boolean;
}

// Use relative URL to leverage Vite's proxy configuration
// Determine API URL based on environment
const getApiUrl = () => {
  // Check for environment variable first
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // In production, use the backend Railway URL directly
  if (window.location.hostname.includes('railway.app') ||
      window.location.hostname.includes('vercel.app')) {
    return 'https://noah-production-e15c.up.railway.app/api';
  }

  // In development, use proxy
  return '/api';
};

const API_BASE_URL = getApiUrl();

export const useMediaStore = create<MediaStore>((set, get) => ({
  assets: [],
  folders: [],
  isLoading: false,
  uploadProgress: {},
  searchQuery: '',
  selectedAssets: [],
  viewMode: 'grid',
  storageSource: 'all',
  lastFetchTime: 0,
  currentFolder: null,
  isSearchMode: false,

  clearCache: () => {
    set({ assets: [], lastFetchTime: 0 });
    console.log('Media cache cleared');
  },

  setStorageSource: (source) => {
    set({ storageSource: source });
    // Fetch assets from the new source
    const { currentFolder, isSearchMode, searchQuery } = get();
    if (isSearchMode && searchQuery) {
      get().searchAssets(searchQuery, source);
    } else {
      get().fetchFolderAssets(currentFolder, true);
    }
  },
  
  setCurrentFolder: (folder) => {
    set({ currentFolder: folder, isSearchMode: false });
    // Fetch assets for the new folder
    get().fetchFolderAssets(folder, true);
  },

  fetchAssets: async (forceRefresh = false, source) => {
    const now = Date.now();
    const lastFetch = get().lastFetchTime;
    
    // Skip if fetched within last 5 seconds (unless force refresh)
    if (!forceRefresh && lastFetch && (now - lastFetch) < 5000) {
      console.log('Using cached assets (fetched less than 5 seconds ago)');
      return;
    }
    
    set({ isLoading: true });
    
    // Use the source from parameter or from store state
    const storageSource = source || get().storageSource;
    
    try {
      console.log('Fetching assets from:', `${API_BASE_URL}/media`, `source: ${storageSource}`, forceRefresh ? '(force refresh)' : '');
      
      // Add cache-busting query parameter to force fresh data
      const response = await axios.get(`${API_BASE_URL}/media`, {
        params: {
          source: storageSource,
          _t: Date.now() // Cache buster
        },
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        withCredentials: false, // Don't send credentials for now
      });
      
      console.log('API Response:', response.data);
      
      // Handle the enhanced media server response format
<<<<<<< HEAD
      // const assets = response.data.assets || response.data.data || response. data; -> fix
      const assets = response.data.assets || response.data;
=======
      const assets = response.data.assets || response.data.data || response.data;
>>>>>>> 03aac1217714e2d9dcedb1e77e7d4d45f954e7ec
      const folders = response.data.folders || [];
      
      // Transform the assets to match the expected format
      const transformedAssets = assets.map((asset: any) => ({
        ...asset,
        uploadDate: asset.createdAt || asset.uploadDate || new Date().toISOString(),
        tags: asset.tags || [],
        metadata: asset.metadata || {},
        compressionStatus: asset.compressionStatus || 'completed'
      }));
      
      console.log('Transformed assets:', transformedAssets);
      console.log('Folders:', folders);
      set({ 
        assets: transformedAssets,
        folders: folders,
        isLoading: false,
        lastFetchTime: Date.now(),
        isSearchMode: false
      });
    } catch (error: any) {
      console.error('Failed to fetch assets:', error);
      console.error('Error details:', error.response?.data || error.message);
      set({ isLoading: false });
      
      // Fallback to mock data for development
      const mockAssets: MediaAsset[] = [
        {
          id: '1',
          name: 'Product Demo Video.mp4',
          type: 'video',
          size: 256 * 1024 * 1024, // 256 MB
          duration: 222, // 3:42 in seconds
          uploadDate: new Date().toISOString(),
          thumbnail: '/api/placeholder/300/200',
          url: '/api/media/1/stream',
          tags: ['product', 'demo', 'marketing'],
          metadata: {
            width: 1920,
            height: 1080,
            codec: 'h264',
            bitrate: 5000,
            fps: 30
          },
          compressionStatus: 'completed',
          compressionRatio: 12.5
        },
        {
          id: '2',
          name: 'Brand Logo Variants.png',
          type: 'image',
          size: 12 * 1024 * 1024, // 12 MB
          uploadDate: new Date(Date.now() - 86400000).toISOString(),
          thumbnail: '/api/placeholder/300/200',
          url: '/api/media/2/download',
          tags: ['logo', 'brand', 'assets'],
          metadata: {
            width: 4096,
            height: 4096
          },
          compressionStatus: 'completed'
        },
        {
          id: '3',
          name: 'Background Music.mp3',
          type: 'audio',
          size: 8.5 * 1024 * 1024, // 8.5 MB
          duration: 135, // 2:15 in seconds
          uploadDate: new Date(Date.now() - 172800000).toISOString(),
          thumbnail: '/api/placeholder/300/200',
          url: '/api/media/3/stream',
          tags: ['music', 'background', 'royalty-free'],
          metadata: {
            codec: 'mp3',
            bitrate: 320
          },
          compressionStatus: 'completed'
        },
        {
          id: '4',
          name: 'Interview Recording.mov',
          type: 'video',
          size: 1.2 * 1024 * 1024 * 1024, // 1.2 GB
          duration: 2730, // 45:30 in seconds
          uploadDate: new Date(Date.now() - 259200000).toISOString(),
          thumbnail: '/api/placeholder/300/200',
          url: '/api/media/4/stream',
          tags: ['interview', 'raw', 'editing'],
          metadata: {
            width: 3840,
            height: 2160,
            codec: 'prores',
            bitrate: 100000,
            fps: 24
          },
          compressionStatus: 'processing'
        }
      ];
      set({ assets: mockAssets });
    }
  },

  uploadFiles: async (files: File[], options: UploadOptions = {}) => {
    const uploadPromises = files.map(async (file) => {
      const fileId = Math.random().toString(36).substr(2, 9);
      
      // Initialize progress tracking
      set(state => ({
        uploadProgress: { ...state.uploadProgress, [fileId]: 0 }
      }));

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', options.folder || 'root');
        formData.append('tags', JSON.stringify(options.tags || []));
        formData.append('compressionQuality', options.compressionQuality || 'high');
        formData.append('autoCompress', String(options.autoCompress ?? true));

        const response = await axios.post(`${API_BASE_URL}/media/upload`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              set(state => ({
                uploadProgress: { ...state.uploadProgress, [fileId]: progress }
              }));
            }
          }
        });

        // Add uploaded asset to store - handle enhanced media server response
        const uploadedAsset = response.data.asset || response.data;
        const newAsset: MediaAsset = {
          ...uploadedAsset,
          uploadDate: uploadedAsset.createdAt || uploadedAsset.uploadDate || new Date().toISOString(),
          tags: uploadedAsset.tags || options.tags || [],
          metadata: uploadedAsset.metadata || {},
          compressionStatus: uploadedAsset.compressionStatus || 'completed'
        };
        set(state => ({
          assets: [newAsset, ...state.assets],
          uploadProgress: { ...state.uploadProgress, [fileId]: 100 }
        }));

        // Clean up progress tracking after delay
        setTimeout(() => {
          set(state => {
            const { [fileId]: removed, ...remaining } = state.uploadProgress;
            return { uploadProgress: remaining };
          });
        }, 2000);

      } catch (error) {
        console.error('Upload failed:', error);
        
        // For development, simulate successful upload
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const mockAsset: MediaAsset = {
          id: fileId,
          name: file.name,
          type: file.type.startsWith('video/') ? 'video' :
                file.type.startsWith('image/') ? 'image' :
                file.type.startsWith('audio/') ? 'audio' : 'document',
          size: file.size,
          uploadDate: new Date().toISOString(),
          thumbnail: '/api/placeholder/300/200',
          url: `/api/media/${fileId}/download`,
          tags: options.tags || [],
          metadata: {},
          compressionStatus: 'pending'
        };

        set(state => ({
          assets: [mockAsset, ...state.assets],
          uploadProgress: { ...state.uploadProgress, [fileId]: 100 }
        }));

        setTimeout(() => {
          set(state => {
            const { [fileId]: removed, ...remaining } = state.uploadProgress;
            return { uploadProgress: remaining };
          });
        }, 2000);
      }
    });

    await Promise.all(uploadPromises);
  },

  deleteAssets: async (assetIds: string[]) => {
    try {
      // For enhanced media server, we need to delete by filename
      const assetsToDelete = get().assets.filter(asset => assetIds.includes(asset.id));
      await Promise.all(
        assetsToDelete.map(asset => {
          // Extract filename from URL or use name
          const filename = asset.url?.split('/').pop() || asset.name;
          return axios.delete(`${API_BASE_URL}/media/${filename}`);
        })
      );
      
      set(state => ({
        assets: state.assets.filter(asset => !assetIds.includes(asset.id)),
        selectedAssets: state.selectedAssets.filter(id => !assetIds.includes(id))
      }));
    } catch (error) {
      console.error('Failed to delete assets:', error);
      
      // Fallback for development
      set(state => ({
        assets: state.assets.filter(asset => !assetIds.includes(asset.id)),
        selectedAssets: state.selectedAssets.filter(id => !assetIds.includes(id))
      }));
    }
  },

  updateAsset: async (assetId: string, updates: Partial<MediaAsset>) => {
    try {
      const response = await axios.patch(`${API_BASE_URL}/media/${assetId}`, updates);
      
      set(state => ({
        assets: state.assets.map(asset => 
          asset.id === assetId ? { ...asset, ...response.data } : asset
        )
      }));
    } catch (error) {
      console.error('Failed to update asset:', error);
      
      // Fallback for development
      set(state => ({
        assets: state.assets.map(asset => 
          asset.id === assetId ? { ...asset, ...updates } : asset
        )
      }));
    }
  },

  fetchFolderAssets: async (folderPath: string | null, forceRefresh = false) => {
    const now = Date.now();
    const lastFetch = get().lastFetchTime;
    
    // Skip if fetched within last 5 seconds (unless force refresh)
    if (!forceRefresh && lastFetch && (now - lastFetch) < 5000) {
      console.log('Using cached folder assets');
      return;
    }
    
    set({ isLoading: true });
    
    const storageSource = get().storageSource;
    
    try {
      console.log('Fetching folder assets:', folderPath, `source: ${storageSource}`);
      
      const response = await axios.get(`${API_BASE_URL}/media/folder`, {
        params: {
          path: folderPath || '',
          source: storageSource,
          _t: Date.now()
        },
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        withCredentials: false,
      });
      
      console.log('Folder API Response:', response.data);
      
      const assets = response.data.assets || [];
      const folders = response.data.folders || [];
      
      const transformedAssets = assets.map((asset: any) => ({
        ...asset,
        uploadDate: asset.createdAt || asset.uploadDate || new Date().toISOString(),
        tags: asset.tags || [],
        metadata: asset.metadata || {},
        compressionStatus: asset.compressionStatus || 'completed'
      }));
      
      set({ 
        assets: transformedAssets,
        folders: folders,
        currentFolder: folderPath,
        isLoading: false,
        lastFetchTime: Date.now(),
        isSearchMode: false
      });
    } catch (error: any) {
      console.error('Failed to fetch folder assets:', error);
      set({ isLoading: false });
    }
  },
  
  searchAssets: async (query: string, source) => {
    if (!query.trim()) {
      // If query is empty, go back to current folder view
      get().fetchFolderAssets(get().currentFolder, true);
      return;
    }
    
    set({ isLoading: true, searchQuery: query, isSearchMode: true });
    
    const storageSource = source || get().storageSource;
    
    try {
      console.log('Searching assets:', query, `source: ${storageSource}`);
      
      const response = await axios.get(`${API_BASE_URL}/media/search`, {
        params: {
          q: query,
          source: storageSource,
          _t: Date.now()
        },
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        withCredentials: false,
      });
      
      console.log('Search API Response:', response.data);
      
      const assets = response.data.assets || [];
      
      const transformedAssets = assets.map((asset: any) => ({
        ...asset,
        uploadDate: asset.createdAt || asset.uploadDate || new Date().toISOString(),
        tags: asset.tags || [],
        metadata: asset.metadata || {},
        compressionStatus: asset.compressionStatus || 'completed'
      }));
      
      set({ 
        assets: transformedAssets,
        folders: [], // Don't show folders in search results
        isLoading: false,
        lastFetchTime: Date.now(),
        isSearchMode: true
      });
    } catch (error: any) {
      console.error('Failed to search assets:', error);
      set({ isLoading: false });
    }
  },
  
  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
    
    // Perform search if query is not empty
    if (query.trim()) {
      get().searchAssets(query);
    } else {
      // Return to folder view if query is cleared
      get().fetchFolderAssets(get().currentFolder, true);
    }
  },

  setSelectedAssets: (assetIds: string[]) => {
    set({ selectedAssets: assetIds });
  },

  setViewMode: (mode: 'grid' | 'list') => {
    set({ viewMode: mode });
  },

  getFilteredAssets: () => {
    const { assets, searchQuery } = get();
    if (!searchQuery) return assets;
    
    const query = searchQuery.toLowerCase();
    return assets.filter(asset =>
      asset.name.toLowerCase().includes(query) ||
      asset.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }
}));
