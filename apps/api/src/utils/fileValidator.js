/**
 * fileValidator.js
 * Security utility for server-side file upload validation (CWE-434 mitigation).
 * 
 * Enforces:
 * 1. Strict extension and MIME type allowlists (rejecting dangerous script/executable extensions).
 * 2. Magic byte (file signature) validation on raw buffer/stream headers to prevent file extension spoofing.
 * 3. Sanitization of active content in XML/SVG files.
 */

const path = require('path');

// Dangerous file extensions that must NEVER be accepted under any circumstance
const DANGEROUS_EXTENSIONS = new Set([
  'html', 'htm', 'xhtml', 'shtml', 'dhtml',
  'php', 'php3', 'php4', 'php5', 'phtml', 'pht',
  'asp', 'aspx', 'jsp', 'jspx', 'cgi', 'pl', 'py',
  'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'psm1', 'vbs', 'vbe', 'wsf',
  'exe', 'com', 'scr', 'pif', 'msi', 'msp', 'dll', 'so', 'dylib', 'bin',
  'jar', 'war', 'ear',
  'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx',
  'htaccess', 'htpasswd', 'env', 'config', 'ini'
]);

// Allowed media and document extensions on the Noah platform
const ALLOWED_EXTENSIONS = new Set([
  // Videos
  'mp4', 'm4v', 'mov', 'qt', 'avi', 'mkv', 'webm', 'ogg', 'ogv',
  'mxf', 'mpeg', 'm2v', 'mpg', 'ts', 'gxf', '3gp', 'flv', 'vob', 'wmv',

  // Images
  'jpg', 'jpeg', 'jpf', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp',
  'psd', 'psb', 'ai', 'eps', 'exr', 'openexr', 'tiff', 'tif', 'pcx',
  'mpo', 'dpx', 'cin', 'ico', 'heic', 'heif', 'cr2', 'nef', 'arw',

  // Audio
  'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'aiff', 'aif', 'aifc',
  '3g2', 'ape', 'au', 'mp2', 'oga', 'wma',

  // Documents & Editing Project Files
  'pdf', 'doc', 'docx', 'rtf', 'txt', 'csv',
  'pproj', 'drp', 'aep', 'fcp', 'fcpxmld', 'srt', 'vtt'
]);

// Allowed MIME types
const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/'];

const ALLOWED_EXACT_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'text/plain',
  'text/csv',
  'application/mxf',
  'video/mxf',
  'image/vnd.adobe.photoshop',
  'application/postscript',
  'application/x-eps',
  'image/x-eps',
  'application/vnd.adobe.premiere',
  'application/x-resolve-project',
  'application/vnd.adobe.aftereffects.project',
  'application/x-final-cut-pro',
  'application/octet-stream' // permitted only if extension is strictly whitelisted
]);

/**
 * Extract clean lowercase file extension without leading dot
 */
function getFileExtension(filename = '') {
  const base = path.basename(filename || '').trim();
  const parts = base.split('.');
  if (parts.length < 2) return '';
  return parts.pop().toLowerCase();
}

/**
 * Validate upload metadata (fileName and client-reported mimeType).
 * Called at upload session initiation and direct upload pre-processing.
 *
 * @param {string} fileName
 * @param {string} mimeType
 * @returns {{ valid: boolean, error?: string }}
 */
function validateUploadMetadata(fileName, mimeType) {
  if (!fileName || typeof fileName !== 'string' || !fileName.trim()) {
    return { valid: false, error: 'A valid fileName is required' };
  }

  const cleanExt = getFileExtension(fileName);
  if (!cleanExt) {
    return { valid: false, error: 'File must have a valid extension' };
  }

  // 1. Check against explicitly dangerous extensions
  if (DANGEROUS_EXTENSIONS.has(cleanExt)) {
    return {
      valid: false,
      error: `File type '.${cleanExt}' is restricted for security reasons.`
    };
  }

  // 2. Ensure extension is in the permitted whitelist
  if (!ALLOWED_EXTENSIONS.has(cleanExt)) {
    return {
      valid: false,
      error: `File type '.${cleanExt}' is not permitted.`
    };
  }

  // 3. Validate MIME type if provided
  if (mimeType && typeof mimeType === 'string') {
    const normalizedMime = mimeType.toLowerCase().trim().split(';')[0];
    
    // Explicitly reject dangerous MIME types
    if (
      normalizedMime === 'text/html' ||
      normalizedMime === 'application/xhtml+xml' ||
      normalizedMime === 'text/javascript' ||
      normalizedMime === 'application/javascript' ||
      normalizedMime === 'application/x-php' ||
      normalizedMime === 'application/x-httpd-php' ||
      normalizedMime === 'application/x-sh' ||
      normalizedMime === 'application/x-msdownload'
    ) {
      return {
        valid: false,
        error: `MIME type '${normalizedMime}' is restricted for security reasons.`
      };
    }

    const isPrefixAllowed = ALLOWED_MIME_PREFIXES.some(prefix => normalizedMime.startsWith(prefix));
    const isExactAllowed = ALLOWED_EXACT_MIMES.has(normalizedMime);

    if (!isPrefixAllowed && !isExactAllowed) {
      return {
        valid: false,
        error: `MIME type '${normalizedMime}' is not permitted.`
      };
    }
  }

  return { valid: true };
}

/**
 * Validate binary magic bytes / file signatures on raw buffer chunk.
 * Inspects first 32-64 bytes to ensure the payload matches the expected file format.
 *
 * @param {Buffer} buffer - Initial chunk of the file
 * @param {string} fileName - File name with extension
 * @returns {{ valid: boolean, error?: string }}
 */
function validateMagicBytes(buffer, fileName) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { valid: true }; // Nothing to inspect yet
  }

  const ext = getFileExtension(fileName);

  // 1. Check for immediate dangerous binary signatures (executable headers)
  // Windows MZ header (EXE, DLL)
  if (buffer.length >= 2 && buffer[0] === 0x4D && buffer[1] === 0x5A) {
    return { valid: false, error: 'Disallowed file content: Executable binary signature detected (MZ).' };
  }

  // Linux ELF executable header
  if (buffer.length >= 4 && buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) {
    return { valid: false, error: 'Disallowed file content: Executable binary signature detected (ELF).' };
  }

  // Shell script shebang (#!...)
  if (buffer.length >= 2 && buffer[0] === 0x23 && buffer[1] === 0x21) {
    return { valid: false, error: 'Disallowed file content: Script shebang detected.' };
  }

  // Check for HTML/Script injection in media files (e.g. HTML disguised as image/video/pdf)
  const headerSample = buffer.subarray(0, Math.min(buffer.length, 512)).toString('latin1').toLowerCase().trim();
  if (
    headerSample.startsWith('<!doctype html') ||
    headerSample.startsWith('<html') ||
    headerSample.startsWith('<script') ||
    headerSample.startsWith('<body')
  ) {
    return { valid: false, error: 'Disallowed file content: HTML/Script markup detected in media upload.' };
  }

  // 2. Specific file signature validations by extension:
  switch (ext) {
    case 'jpg':
    case 'jpeg':
    case 'jpf':
      // JPEG starts with FF D8 FF
      if (buffer.length >= 3) {
        if (!(buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF)) {
          return { valid: false, error: 'File content does not match JPEG image signature.' };
        }
      }
      break;

    case 'png':
      // PNG starts with 89 50 4E 47 0D 0A 1A 0A
      if (buffer.length >= 8) {
        const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
                      buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A;
        if (!isPng) {
          return { valid: false, error: 'File content does not match PNG image signature.' };
        }
      }
      break;

    case 'gif':
      // GIF starts with GIF87a or GIF89a
      if (buffer.length >= 4) {
        const isGif = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
        if (!isGif) {
          return { valid: false, error: 'File content does not match GIF image signature.' };
        }
      }
      break;

    case 'webp':
      // WebP starts with RIFF....WEBP
      if (buffer.length >= 12) {
        const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
        const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
        if (!isRiff || !isWebp) {
          return { valid: false, error: 'File content does not match WebP image signature.' };
        }
      }
      break;

    case 'bmp':
      // BMP starts with BM (42 4D)
      if (buffer.length >= 2) {
        if (!(buffer[0] === 0x42 && buffer[1] === 0x4D)) {
          return { valid: false, error: 'File content does not match BMP image signature.' };
        }
      }
      break;

    case 'pdf':
      // PDF starts with %PDF- (25 50 44 46)
      if (buffer.length >= 4) {
        const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
        if (!isPdf) {
          return { valid: false, error: 'File content does not match PDF document signature.' };
        }
      }
      break;

    case 'mp4':
    case 'm4v':
    case 'mov':
    case 'qt':
      // MP4 / MOV containers typically have 'ftyp', 'moov', 'wide', 'mdat', or 'free' starting at offset 4
      if (buffer.length >= 12) {
        const boxType = buffer.subarray(4, 8).toString('latin1');
        const validBoxes = ['ftyp', 'moov', 'wide', 'mdat', 'free', 'skip', 'pnot', 'qt  '];
        if (!validBoxes.includes(boxType) && !buffer.subarray(0, 4).includes('moov')) {
          return { valid: false, error: 'File content does not match MP4/QuickTime video signature.' };
        }
      }
      break;

    case 'webm':
    case 'mkv':
      // Matroska / WebM EBML header: 1A 45 DF A3
      if (buffer.length >= 4) {
        const isEbml = buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3;
        if (!isEbml) {
          return { valid: false, error: 'File content does not match WebM/MKV video signature.' };
        }
      }
      break;

    case 'wav':
      // WAV starts with RIFF....WAVE
      if (buffer.length >= 12) {
        const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
        const isWave = buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45;
        if (!isRiff || !isWave) {
          return { valid: false, error: 'File content does not match WAV audio signature.' };
        }
      }
      break;

    case 'mp3':
      // MP3 starts with ID3 (49 44 33) or sync word 0xFF 0xFB/F3/F2/E3
      if (buffer.length >= 3) {
        const isId3 = buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33;
        const isSync = buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0;
        if (!isId3 && !isSync) {
          return { valid: false, error: 'File content does not match MP3 audio signature.' };
        }
      }
      break;

    case 'flac':
      // FLAC starts with 'fLaC' (66 4C 61 43)
      if (buffer.length >= 4) {
        const isFlac = buffer[0] === 0x66 && buffer[1] === 0x4C && buffer[2] === 0x61 && buffer[3] === 0x43;
        if (!isFlac) {
          return { valid: false, error: 'File content does not match FLAC audio signature.' };
        }
      }
      break;

    case 'svg':
      // SVG must contain <svg and must NOT contain active script tags or event handlers
      if (buffer.length > 0) {
        const svgContent = buffer.toString('utf8').toLowerCase();
        if (!svgContent.includes('<svg')) {
          return { valid: false, error: 'File content does not match SVG image structure.' };
        }
        if (
          svgContent.includes('<script') ||
          svgContent.includes('javascript:') ||
          svgContent.includes('onload=') ||
          svgContent.includes('onerror=') ||
          svgContent.includes('<iframe') ||
          svgContent.includes('<object') ||
          svgContent.includes('<embed')
        ) {
          return { valid: false, error: 'Disallowed SVG content: Embedded scripts or active HTML elements detected.' };
        }
      }
      break;

    default:
      // Other allowed formats (like PSD, TIFF, specialized video containers, XML/zip project archives)
      break;
  }

  return { valid: true };
}

module.exports = {
  DANGEROUS_EXTENSIONS,
  ALLOWED_EXTENSIONS,
  getFileExtension,
  validateUploadMetadata,
  validateMagicBytes
};
