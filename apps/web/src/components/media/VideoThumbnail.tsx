import React, { useRef, useEffect, useState } from 'react';

interface VideoThumbnailProps {
  videoUrl: string;
  width: number;
  height: number;
  seekTime?: number; // Time in seconds to capture thumbnail from
  className?: string;
  onThumbnailGenerated?: (thumbnailUrl: string) => void;
}

export default function VideoThumbnail({ 
  videoUrl, 
  width, 
  height, 
  seekTime = 1,
  className = "",
  onThumbnailGenerated 
}: VideoThumbnailProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas) return;

    const generateThumbnail = () => {
      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas dimensions
        canvas.width = width;
        canvas.height = height;

        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, width, height);

        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setThumbnailUrl(dataUrl);
        setLoading(false);
        onThumbnailGenerated?.(dataUrl);
      } catch (err) {
        console.error('Error generating thumbnail:', err);
        setError(true);
        setLoading(false);
      }
    };

    const handleLoadedData = () => {
      // Seek to specified time and generate thumbnail
      video.currentTime = seekTime;
    };

    const handleSeeked = () => {
      // Small delay to ensure frame is ready
      setTimeout(generateThumbnail, 100);
    };

    const handleError = () => {
      setError(true);
      setLoading(false);
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
    };
  }, [videoUrl, width, height, seekTime, onThumbnailGenerated]);

  if (error) {
    return (
      <div 
        className={`flex items-center justify-center bg-gray-700 text-white text-xs ${className}`}
        style={{ width, height }}
      >
        🎥
      </div>
    );
  }

  if (loading || !thumbnailUrl) {
    return (
      <div 
        className={`flex items-center justify-center bg-gray-800 text-white text-xs ${className}`}
        style={{ width, height }}
      >
        <div className="animate-spin">⏳</div>
        <video
          ref={videoRef}
          src={videoUrl}
          style={{ display: 'none' }}
          preload="metadata"
          muted
          playsInline
        />
        <canvas
          ref={canvasRef}
          style={{ display: 'none' }}
        />
      </div>
    );
  }

  return (
    <>
      <img
        src={thumbnailUrl}
        alt="Video thumbnail"
        className={className}
        style={{ 
          width, 
          height, 
          objectFit: 'cover',
          borderRadius: '4px'
        }}
      />
      <video
        ref={videoRef}
        src={videoUrl}
        style={{ display: 'none' }}
        preload="metadata"
        muted
        playsInline
      />
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
      />
    </>
  );
}
