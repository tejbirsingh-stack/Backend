const { exiftool } = require('exiftool-vendored');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');

async function downloadFileToTemp(url) {
  const tempPath = path.join(os.tmpdir(), `media_exif_${Date.now()}_${Math.random().toString(36).substring(2)}.tmp`);
  const fileStream = fs.createWriteStream(tempPath);

  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFileToTemp(response.headers.location).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download file for EXIF: Status ${response.statusCode}`));
      }
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(() => resolve(tempPath));
      });
    }).on('error', (err) => {
      fs.unlink(tempPath, () => { });
      reject(err);
    });
  });
}

async function extractServerSideMetadata(filePathOrUrl) {
  let tempPathToCleanup = null;
  let targetPath = filePathOrUrl;

  try {
    if (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://')) {
      targetPath = await downloadFileToTemp(filePathOrUrl);
      tempPathToCleanup = targetPath;
    }

    if (!fs.existsSync(targetPath)) {
      console.warn(`[ExifTool] File does not exist for EXIF extraction: ${targetPath}`);
      return {};
    }

    const tags = await exiftool.read(targetPath);
    if (!tags) return {};



    let iso = null;
    if (tags.ISO != null) {
      const rawIso = String(tags.ISO);
      iso = rawIso.startsWith('ISO') ? rawIso : `ISO ${rawIso}`;
    } else if (tags.PhotographicSensitivity != null) {
      const rawIso = String(tags.PhotographicSensitivity);
      iso = rawIso.startsWith('ISO') ? rawIso : `ISO ${rawIso}`;
    }

    let exposureTime = null;
    if (tags.ExposureTime != null) {
      const expStr = typeof tags.ExposureTime === 'number' ? `${tags.ExposureTime}` : String(tags.ExposureTime);
      exposureTime = expStr.includes('sec') || expStr.includes('s') ? expStr : `${expStr} sec`;
    } else if (tags.ShutterSpeed != null) {
      const ssStr = String(tags.ShutterSpeed);
      exposureTime = ssStr.includes('sec') || ssStr.includes('s') ? ssStr : `${ssStr} sec`;
    }

    let fNumber = null;
    if (tags.FNumber != null) {
      const fnStr = String(tags.FNumber);
      fNumber = fnStr.startsWith('f/') ? fnStr : `f/${fnStr}`;
    } else if (tags.Aperture != null) {
      const apStr = String(tags.Aperture);
      fNumber = apStr.startsWith('f/') ? apStr : `f/${apStr}`;
    }

    let focalLength = null;
    if (tags.FocalLength != null) {
      const flStr = typeof tags.FocalLength === 'number' ? `${tags.FocalLength}` : String(tags.FocalLength);
      focalLength = flStr.includes('mm') ? flStr : `${flStr} mm`;
    }

    const make = tags.Make || tags['com.apple.quicktime.make'] || tags.Manufacturer;
    const model = tags.Model || tags['com.apple.quicktime.model'] || tags.DeviceModel;
    const lens = tags.LensModel || tags['Lens Model'] || tags.Lens || tags['com.apple.quicktime.lens-model'] || tags.LensMake;
    const width = tags.ImageWidth || tags.SourceImageWidth || tags.Width;
    const height = tags.ImageHeight || tags.SourceImageHeight || tags.Height;
    const resolution = (width && height) ? `${width} × ${height} px` : null;
    const orientation = (width && height) ? (width >= height ? 'Landscape' : 'Portrait') : (tags.Orientation ? String(tags.Orientation) : null);
    let resolutionTier = null;
    if (width && height) {
      const maxDim = Math.max(width, height);
      const minDim = Math.min(width, height);
      if (maxDim >= 3840 || minDim >= 2160) resolutionTier = '4K UHD';
      else if (maxDim >= 2560 || minDim >= 1440) resolutionTier = '2K QHD';
      else if (maxDim >= 1920 || minDim >= 1080) resolutionTier = '1080p HD';
      else if (maxDim >= 1280 || minDim >= 720) resolutionTier = '720p HD';
      else resolutionTier = 'SD';
    }

    const rawDur = tags.Duration ? (typeof tags.Duration === 'number' ? tags.Duration : parseFloat(tags.Duration)) : null;
    const durationSec = rawDur && !isNaN(rawDur) ? Math.round(rawDur) : null;
    let formattedDuration = null;
    if (durationSec !== null && !isNaN(durationSec)) {
      const min = Math.floor(durationSec / 60);
      const sec = String(durationSec % 60).padStart(2, '0');
      formattedDuration = `${min}:${sec}`;
    }

    const sampleRate = tags.SampleRate ? (typeof tags.SampleRate === 'number' ? `${(tags.SampleRate / 1000).toFixed(1)} kHz` : String(tags.SampleRate)) : null;
    const channels = tags.AudioChannels || tags.Channels ? (tags.AudioChannels === 2 || tags.Channels === 2 ? 'Stereo' : tags.AudioChannels === 1 || tags.Channels === 1 ? 'Mono' : `${tags.AudioChannels || tags.Channels} channels`) : null;
    const bitrate = tags.AudioBitrate || tags.Bitrate ? (typeof tags.AudioBitrate === 'number' ? `${Math.round(tags.AudioBitrate / 1000)} kbps` : String(tags.AudioBitrate || tags.Bitrate)) : null;
    const audioCodec = tags.AudioEncoding || tags.AudioCodec || (tags.MIMEType && tags.MIMEType.startsWith('audio/') ? tags.FileType : null);
    const artist = tags.Artist || tags.Band || tags.Composer;
    const album = tags.Album;
    const title = tags.Title;
    const year = tags.Year || tags.ReleaseDate || tags.Date;
    const genre = tags.Genre;
    const containerFormat = tags.FileType || tags.FileTypeExtension;

    const dateTimeOriginal = tags.DateTimeOriginal || tags.CreateDate || tags.CreationDate;

    const exif = {};
    if (make) exif.make = String(make).trim();
    if (model) exif.model = String(model).trim();
    if (lens) exif.lens = String(lens).trim();
    if (exposureTime) exif.exposureTime = String(exposureTime).trim();
    if (fNumber) exif.fNumber = String(fNumber).trim();
    if (iso) exif.iso = String(iso).trim();
    if (focalLength) exif.focalLength = String(focalLength).trim();
    if (resolution) exif.resolution = resolution;
    if (orientation) exif.orientation = orientation;
    if (dateTimeOriginal) exif.dateTimeOriginal = String(dateTimeOriginal);

    return {
      ...(make ? { make: String(make).trim() } : {}),
      ...(model ? { model: String(model).trim() } : {}),
      ...(lens ? { lens: String(lens).trim() } : {}),
      ...(exposureTime ? { exposureTime: String(exposureTime).trim() } : {}),
      ...(fNumber ? { fNumber: String(fNumber).trim() } : {}),
      ...(iso ? { iso: String(iso).trim() } : {}),
      ...(focalLength ? { focalLength: String(focalLength).trim() } : {}),
      ...(resolution ? { resolution } : {}),
      ...(resolutionTier ? { resolutionTier, resolution_tier: resolutionTier } : {}),
      ...(orientation ? { orientation } : {}),
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      ...(durationSec ? { durationSeconds: durationSec } : {}),
      ...(formattedDuration ? { duration: formattedDuration } : {}),
      ...(sampleRate ? { sampleRate } : {}),
      ...(channels ? { channels } : {}),
      ...(bitrate ? { estimatedBitrate: bitrate, bitrate } : {}),
      ...(audioCodec ? { audioCodec } : {}),
      ...(artist ? { artist: String(artist).trim() } : {}),
      ...(album ? { album: String(album).trim() } : {}),
      ...(title ? { title: String(title).trim() } : {}),
      ...(year ? { year: String(year).trim() } : {}),
      ...(genre ? { genre: String(genre).trim() } : {}),
      ...(containerFormat ? { containerFormat: String(containerFormat).toUpperCase(), container: String(containerFormat).toUpperCase() } : {}),
      exif,
    };
  } catch (err) {
    console.warn('[ExifTool] Metadata extraction error:', err.message);
    return {};
  } finally {
    if (tempPathToCleanup && fs.existsSync(tempPathToCleanup)) {
      try { fs.unlinkSync(tempPathToCleanup); } catch (e) { }
    }
  }
}

module.exports = { extractServerSideMetadata };
