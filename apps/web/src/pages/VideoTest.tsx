import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

export default function VideoTest() {
  const [videos, setVideos] = useState<any[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // Fetch videos from API
    fetch('/api/media')
      .then(res => res.json())
      .then(data => {
        console.log('Fetched media data:', data);
        if (data.success && data.assets) {
          const videoAssets = data.assets.filter((a: any) => 
            a.type === 'video' || a.name?.toLowerCase().endsWith('.mp4')
          );
          console.log('Filtered videos:', videoAssets);
          setVideos(videoAssets);
          if (videoAssets.length > 0) {
            setSelectedVideo(videoAssets[0]);
          }
        }
      })
      .catch(err => {
        console.error('Failed to fetch videos:', err);
        setError(err.message);
      });
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <h1 className="text-3xl font-bold">Video Player Test</h1>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 mb-4">
            Error: {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Video List */}
          <div className="lg:col-span-1">
            <h2 className="text-xl font-semibold mb-4">Available Videos ({videos.length})</h2>
            <div className="space-y-2">
              {videos.map((video, idx) => (
                <div
                  key={video.id || idx}
                  onClick={() => setSelectedVideo(video)}
                  className={`p-3 rounded-lg cursor-pointer transition ${
                    selectedVideo?.id === video.id 
                      ? 'bg-purple-600' 
                      : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  <div className="font-medium">{video.name}</div>
                  <div className="text-sm text-gray-400">
                    Type: {video.type} | Size: {(video.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Video Player */}
          <div className="lg:col-span-2">
            {selectedVideo ? (
              <div>
                <h2 className="text-xl font-semibold mb-4">
                  Playing: {selectedVideo.name}
                </h2>
                
                {/* Debug Info */}
                <div className="bg-gray-800 rounded-lg p-4 mb-4 text-xs font-mono">
                  <div>URL: {selectedVideo.url}</div>
                  <div>Type: {selectedVideo.type}</div>
                  <div>ID: {selectedVideo.id}</div>
                </div>

                {/* Native HTML5 Video Player */}
                <div className="bg-black rounded-lg overflow-hidden">
                  <video
                    key={selectedVideo.url}
                    controls
                    autoPlay
                    className="w-full"
                    style={{ maxHeight: '500px' }}
                  >
                    <source src={selectedVideo.url} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </div>

                {/* Test Different URL Formats */}
                <div className="mt-4 space-y-2">
                  <h3 className="font-semibold">Test Direct Access:</h3>
                  <a 
                    href={selectedVideo.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline block"
                  >
                    Open video in new tab: {selectedVideo.url}
                  </a>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-400">
                {videos.length === 0 ? 'Loading videos...' : 'Select a video to play'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}