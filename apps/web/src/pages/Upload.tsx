import { useState, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import { useMediaStore } from '../stores/mediaStore';
import { 
  Upload as UploadIcon, 
  X, 
  Check, 
  AlertCircle, 
  FileVideo, 
  FileImage, 
  FileAudio, 
  File,
  Folder,
  Tag,
  Settings,
  Loader2
} from 'lucide-react';

export default function Upload() {
  const { uploadFiles, uploadProgress } = useMediaStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('root');
  const [tags, setTags] = useState('');
  const [compressionSettings, setCompressionSettings] = useState({
    quality: 'high' as 'low' | 'medium' | 'high',
    format: 'auto',
    optimize: true
  });
  const [currentFiles, setCurrentFiles] = useState<File[]>([]);

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
    handleFiles(files);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  };

  const handleFiles = async (files: File[]) => {
    setCurrentFiles(files);
    
    const uploadOptions = {
      folder: selectedFolder,
      tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
      compressionQuality: compressionSettings.quality,
      autoCompress: compressionSettings.optimize
    };

    await uploadFiles(files, uploadOptions);
    setCurrentFiles([]);
  };

  const getFileIcon = (file: File) => {
    const type = file.type.split('/')[0];
    switch (type) {
      case 'video': return FileVideo;
      case 'image': return FileImage;
      case 'audio': return FileAudio;
      default: return File;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalSize = currentFiles.reduce((acc, file) => acc + file.size, 0);
  const progressEntries = Object.entries(uploadProgress);
  const isUploading = progressEntries.length > 0;

  return (
    <div className="flex h-screen">
      <Sidebar />
      
      <div className="flex-1 flex flex-col">
        <Navbar />
        
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">Upload Media</h1>
              <p className="text-gray-300">Drag and drop files or click to browse</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Upload Area */}
              <div className="lg:col-span-2">
                <div className="glass-card p-6 mb-6">
                  <div
                    className={`border-2 border-dashed rounded-lg p-12 text-center transition-all ${
                      isDragOver
                        ? 'border-purple-400 bg-purple-400/10'
                        : 'border-white/30 hover:border-white/50'
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <UploadIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">
                      Drop files here to upload
                    </h3>
                    <p className="text-gray-400 mb-6">
                      Supports video, audio, images, and documents up to 2GB each
                    </p>
                    <label className="btn-primary cursor-pointer">
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleFileSelect}
                        accept="video/*,audio/*,image/*,.pdf,.doc,.docx"
                      />
                      Browse Files
                    </label>
                  </div>
                </div>

                {/* Upload Progress */}
                {(isUploading || currentFiles.length > 0) && (
                  <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold text-white">Upload Progress</h3>
                      <div className="flex items-center space-x-4 text-sm">
                        <span className="text-purple-400">{progressEntries.length} uploading</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {currentFiles.map((file, index) => {
                        const FileIcon = getFileIcon(file);
                        const fileId = `file-${index}`;
                        const progress = uploadProgress[fileId] || 0;
                        
                        return (
                          <div key={fileId} className="border border-white/10 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center space-x-3">
                                <FileIcon className="w-6 h-6 text-gray-400" />
                                <div>
                                  <p className="text-white font-medium">{file.name}</p>
                                  <p className="text-gray-400 text-sm">
                                    {formatFileSize(file.size)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                {progress === 100 ? (
                                  <Check className="w-5 h-5 text-green-400" />
                                ) : progress > 0 ? (
                                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                                ) : (
                                  <AlertCircle className="w-5 h-5 text-gray-400" />
                                )}
                              </div>
                            </div>

                            {/* Progress Bar */}
                            {progress > 0 && progress < 100 && (
                              <div className="mb-2">
                                <div className="w-full bg-white/10 rounded-full h-2">
                                  <div 
                                    className="bg-blue-500 h-2 rounded-full transition-all"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                                <p className="text-sm text-gray-400 mt-1">{progress}% uploaded</p>
                              </div>
                            )}

                            {/* Status Text */}
                            <p className="text-sm text-gray-400">
                              {progress === 100 ? 'Upload completed' : 
                               progress > 0 ? 'Uploading...' : 'Pending...'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Upload Settings */}
              <div className="space-y-6">
                {/* Destination Folder */}
                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Destination</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        <Folder className="w-4 h-4 inline mr-2" />
                        Folder
                      </label>
                      <select 
                        value={selectedFolder}
                        onChange={(e) => setSelectedFolder(e.target.value)}
                        className="input-field w-full"
                      >
                        <option value="root">Root Folder</option>
                        <option value="projects">Projects</option>
                        <option value="assets">Assets</option>
                        <option value="archive">Archive</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        <Tag className="w-4 h-4 inline mr-2" />
                        Tags
                      </label>
                      <input 
                        type="text"
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="Add tags (comma separated)"
                        className="input-field w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Compression Settings */}
                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    <Settings className="w-5 h-5 inline mr-2" />
                    Compression Settings
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Quality</label>
                      <select 
                        value={compressionSettings.quality}
                        onChange={(e) => setCompressionSettings(prev => ({ 
                          ...prev, 
                          quality: e.target.value as 'low' | 'medium' | 'high'
                        }))}
                        className="input-field w-full"
                      >
                        <option value="low">Low (Fast, Larger files)</option>
                        <option value="medium">Medium (Balanced)</option>
                        <option value="high">High (Slow, Smaller files)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Output Format</label>
                      <select 
                        value={compressionSettings.format}
                        onChange={(e) => setCompressionSettings(prev => ({ ...prev, format: e.target.value }))}
                        className="input-field w-full"
                      >
                        <option value="auto">Auto (Recommended)</option>
                        <option value="mp4">MP4</option>
                        <option value="webm">WebM</option>
                        <option value="mov">MOV</option>
                      </select>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="optimize"
                        checked={compressionSettings.optimize}
                        onChange={(e) => setCompressionSettings(prev => ({ ...prev, optimize: e.target.checked }))}
                        className="mr-2"
                      />
                      <label htmlFor="optimize" className="text-sm text-gray-300">
                        Optimize for web streaming
                      </label>
                    </div>
                  </div>
                </div>

                {/* Upload Stats */}
                <div className="glass-card p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Upload Stats</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Current Files</span>
                      <span className="text-white">{currentFiles.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">In Progress</span>
                      <span className="text-blue-400">{progressEntries.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Size</span>
                      <span className="text-white">
                        {formatFileSize(totalSize)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
