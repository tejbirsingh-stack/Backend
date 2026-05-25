import React from 'react';
import { X } from 'lucide-react';

interface UploadProgressProps {
  files: { id: string; name: string; progress: number }[];
  onCancel: (id: string) => void;
}

export default function UploadProgress({ files, onCancel }: UploadProgressProps) {
  if (files.length === 0) return null;

  return (
    <div 
      className="fixed bottom-4 right-4 w-80 bg-gray-800 rounded-lg shadow-lg overflow-hidden"
      data-testid="upload-progress"
    >
      <div className="p-3 bg-gray-700 text-white font-medium flex items-center justify-between">
        <span data-testid="upload-count">Uploading {files.length} files</span>
        <button
          onClick={() => files.forEach(file => onCancel(file.id))}
          className="text-gray-400 hover:text-white"
          aria-label="Cancel all uploads"
          data-testid="cancel-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {files.map(file => (
          <div 
            key={file.id} 
            className="p-3 border-t border-gray-700"
            data-testid={`upload-item-${file.id}`}
          >
            <div className="flex items-center justify-between text-sm text-white mb-1">
              <span className="truncate flex-1 mr-2" data-testid={`filename-${file.id}`}>{file.name}</span>
              <span className="text-gray-400" data-testid={`progress-text-${file.id}`}>{file.progress}%</span>
            </div>
            <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${file.progress}%` }}
                data-testid={`progress-bar-${file.id}`}
                role="progressbar"
                aria-valuenow={file.progress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
