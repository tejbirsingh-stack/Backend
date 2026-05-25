export interface MediaAsset {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadDate: string;
  tags: string[];
  metadata?: {
    duration?: number;
    dimensions?: {
      width: number;
      height: number;
    };
    format?: string;
    bitrate?: number;
  };
}
