// Media Controller code

const fs = require("fs");
const { createNotification, notifyRole } = require("./notificationController");
const path = require("path");
const { extractServerSideMetadata } = require("../utils/extractMediaMetadata");

const { Queue } = require("bullmq");
const Redis = require("ioredis");

const { imageHash } = require('image-hash');
const { promisify } = require('util');
const imageHashAsync = promisify(imageHash);

// Initialize Redis connection for the Queue
const queueRedisConnection = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD || undefined,
});

// Initialize the BullMQ queue
const compressionQueue = new Queue("compression-jobs", {
  connection: queueRedisConnection
});

// Initialize "Heavy" Queue for massive 5GB+ files
const heavyCompressionQueue = new Queue("compression-jobs-heavy", {
  connection: queueRedisConnection,
});

// Dedicated Redis Client for resumable upload sessions *****
const redisClient = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD || undefined,
});
// *****

const B2StorageService = require("../b2-storage.cjs");

const b2Storage = new B2StorageService({
  keyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
});

function sanitizeB2ErrorMessage(message) {
  if (!message) return "Unknown B2 error";
  let sanitized = message.replace(/The key '[^']+' is not valid/gi, "The key is not valid");
  sanitized = sanitized.replace(/\b[a-zA-Z0-9]{20,35}\b/g, "[MASKED]");
  return sanitized;
}


// 1. Move any utility functions needed by the routes here
function normalizeAssetType(mimeType = "", filename = "") {
  const cleanStr = (filename || "").toLowerCase();
  const mime = (mimeType || "").toLowerCase();

  // Audio Formats (Check FIRST so 3g2/3gpp2 are always audio even if MIME is video/3gpp2)
  if (cleanStr.includes("3g2") || cleanStr.endsWith(".3g2") || mime.includes("3gpp2") || mime.includes("3g2") || cleanStr.endsWith(".m4b") || cleanStr.endsWith(".flac") || cleanStr.endsWith(".aiff") || cleanStr.endsWith(".aif") || cleanStr.endsWith(".aifc") || cleanStr.endsWith(".ape") || cleanStr.endsWith(".au") || cleanStr.endsWith(".mp2") || cleanStr.endsWith(".oga") || mime.startsWith("audio/")) {
    return "audio";
  }

  // Video Formats (mxf, mp4, mov, avi, mkv, webm, ts, etc.)
  if (cleanStr.includes("mxf") || cleanStr.endsWith(".mxf") || mime.includes("mxf") || cleanStr.endsWith(".mp4") || cleanStr.endsWith(".m4v") || cleanStr.endsWith(".mov") || cleanStr.endsWith(".qt") || cleanStr.endsWith(".avi") || cleanStr.endsWith(".mkv") || cleanStr.endsWith(".webm") || cleanStr.endsWith(".ogg") || cleanStr.endsWith(".mpeg") || cleanStr.endsWith(".m2v") || cleanStr.endsWith(".mpg") || cleanStr.endsWith(".ts") || cleanStr.endsWith(".gxf") || mime.startsWith("video/")) {
    return "video";
  }

  // Still Image & Deep Raster / Vector Formats
  if (
    cleanStr.endsWith(".jpg") || cleanStr.endsWith(".jpeg") || cleanStr.endsWith(".jpf") || cleanStr.endsWith(".png") || cleanStr.endsWith(".gif") || cleanStr.endsWith(".webp") || cleanStr.endsWith(".svg") || cleanStr.endsWith(".avif") || cleanStr.endsWith(".bmp") || cleanStr.endsWith(".psd") || cleanStr.endsWith(".psb") || cleanStr.endsWith(".ai") || cleanStr.endsWith(".eps") || cleanStr.endsWith(".exr") || cleanStr.endsWith(".openexr") || cleanStr.endsWith(".dpx") || cleanStr.endsWith(".cin") || cleanStr.endsWith(".tiff") || cleanStr.endsWith(".tif") || cleanStr.endsWith(".pcx") || cleanStr.endsWith(".mpo") ||
    cleanStr.includes("openexr") || cleanStr.includes("exr") || cleanStr.includes("psd") || cleanStr.includes("psb") || cleanStr.includes("tiff") || cleanStr.includes("tif") || cleanStr.includes("avif") || cleanStr.includes("pcx") || cleanStr.includes("mpo") || cleanStr.includes("jpf") ||
    mime.startsWith("image/") || mime === "application/postscript" || mime === "application/vnd.adobe.photoshop" || mime.includes("exr") || mime.includes("tiff") || mime.includes("psd")
  ) {
    return "image";
  }

  return "document";
}

function determineAssetType(asset, originalFile) {
  if (asset?.type && asset.type !== 'document') {
    return asset.type;
  }

  const mime = originalFile?.mimeType || asset?.mimeType || '';
  const names = [
    originalFile?.fileName,
    originalFile?.filePath,
    asset?.title,
    asset?.name,
    asset?.path
  ].filter(Boolean);

  for (const name of names) {
    const type = normalizeAssetType(mime, name);
    if (type !== 'document') {
      return type;
    }
  }

  return 'document';
}

function inferMimeType(filename = "") {
  const ext = filename.toLowerCase();
  // Video Formats
  if (ext.endsWith(".mp4") || ext.endsWith(".m4v")) return "video/mp4";
  if (ext.endsWith(".mov") || ext.endsWith(".qt")) return "video/quicktime";
  if (ext.endsWith(".avi")) return "video/x-msvideo";
  if (ext.endsWith(".webm")) return "video/webm";
  if (ext.endsWith(".mkv")) return "video/x-matroska";
  if (ext.endsWith(".mxf")) return "application/mxf";
  if (ext.endsWith(".ts")) return "video/mp2t";
  if (ext.endsWith(".mpeg") || ext.endsWith(".m2v") || ext.endsWith(".mpg")) return "video/mpeg";
  if (ext.endsWith(".ogg")) return "video/ogg";
  if (ext.endsWith(".gxf")) return "video/gxf";

  // Still Images & Professional Design / Deep Raster Formats
  if (ext.endsWith(".png")) return "image/png";
  if (ext.endsWith(".jpg") || ext.endsWith(".jpeg") || ext.endsWith(".jpf")) return "image/jpeg";
  if (ext.endsWith(".gif")) return "image/gif";
  if (ext.endsWith(".webp")) return "image/webp";
  if (ext.endsWith(".svg")) return "image/svg+xml";
  if (ext.endsWith(".avif")) return "image/avif";
  if (ext.endsWith(".bmp")) return "image/bmp";
  if (ext.endsWith(".psd") || ext.endsWith(".psb")) return "image/vnd.adobe.photoshop";
  if (ext.endsWith(".ai")) return "application/postscript";
  if (ext.endsWith(".eps")) return "image/x-eps";
  if (ext.endsWith(".exr") || ext.endsWith(".openexr")) return "image/x-exr";
  if (ext.endsWith(".tiff") || ext.endsWith(".tif")) return "image/tiff";
  if (ext.endsWith(".dpx")) return "image/x-dpx";
  if (ext.endsWith(".cin")) return "image/x-cineon";
  if (ext.endsWith(".pcx")) return "image/x-pcx";
  if (ext.endsWith(".mpo")) return "image/mpo";

  // Audio Formats (Compressed, Uncompressed, Lossless)
  if (ext.endsWith(".mp3") || ext.endsWith(".mp2")) return "audio/mpeg";
  if (ext.endsWith(".wav")) return "audio/wav";
  if (ext.endsWith(".m4a") || ext.endsWith(".m4b")) return "audio/mp4";
  if (ext.endsWith(".aac")) return "audio/aac";
  if (ext.endsWith(".flac")) return "audio/flac";
  if (ext.endsWith(".aiff") || ext.endsWith(".aif") || ext.endsWith(".aifc")) return "audio/aiff";
  if (ext.endsWith(".3g2")) return "audio/3gpp2";
  if (ext.endsWith(".ape")) return "audio/x-ape";
  if (ext.endsWith(".au")) return "audio/basic";
  if (ext.endsWith(".oga")) return "audio/ogg";

  if (ext.endsWith(".pdf")) return "application/pdf";
  if (ext.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext.endsWith(".doc")) return "application/msword";
  if (ext.endsWith(".rtf")) return "application/rtf";
  if (ext.endsWith(".txt")) return "text/plain";
  if (ext.endsWith(".pproj")) return "application/vnd.adobe.premiere";
  if (ext.endsWith(".drp")) return "application/x-resolve-project";
  if (ext.endsWith(".aep")) return "application/vnd.adobe.aftereffects.project";
  if (ext.endsWith(".fcp") || ext.endsWith(".fcpxmld")) return "application/x-final-cut-pro";
  return "application/octet-stream";
}

function toFrontendAssetShape(asset) {
  const mimeType = asset.mimeType || inferMimeType(asset.name || asset.fileName || asset.filePath || "");
  const normalizedType = determineAssetType(asset, { mimeType, fileName: asset.name || asset.fileName || asset.filePath });
  const uploadDate = asset.uploadDate || asset.createdAt || new Date().toISOString();
  const streamUrl =
    asset.url || (asset.id ? `/api/media/${encodeURIComponent(asset.id)}/stream` : null);
  const thumbnail =
    normalizedType === "image"
      ? streamUrl
      : asset.thumbnail || null;

  return {
    id: asset.id,
    name: asset.name,
    type: normalizedType,
    size: asset.size,
    uploadDate,
    url: streamUrl,
    thumbnail,
    tags: asset.tags || [],
    metadata: asset.metadata || {},
    transcodingStatus: asset.transcodingStatus || "completed",
    transcodingProgress: asset.customMetadata?.transcodingProgress || null,
  };
}

function getUploadsDir() {
  return path.join(__dirname, "../../uploads");
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach(function (file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  });
  return arrayOfFiles;
}

function resolveMediaFilename(id) {
  const uploadsDir = getUploadsDir();
  if (!fs.existsSync(uploadsDir)) return null;

  const files = getAllFiles(uploadsDir);
  const cleanId = (id || "").toLowerCase().trim().replace(/[\s_.-]+/g, "");

  let matched = files.find((filepath) => {
    const filename = path.basename(filepath);
    if (filename === id) return true;
    const originalName = filename.replace(/^\d+-/, "");
    if (originalName === id) return true;

    const baseNorm = filename.toLowerCase().replace(/[\s_.-]+/g, "");
    const origNorm = originalName.toLowerCase().replace(/[\s_.-]+/g, "");

    if (baseNorm === cleanId || origNorm === cleanId) return true;
    if (baseNorm.startsWith(cleanId) || origNorm.startsWith(cleanId)) return true;
    if (cleanId.startsWith(origNorm) || cleanId.startsWith(baseNorm)) return true;

    return false;
  });

  if (!matched && cleanId.length >= 3) {
    matched = files.find((filepath) => {
      const filename = path.basename(filepath).toLowerCase();
      return filename.includes('openexr') || filename.includes('exr');
    }) && (cleanId.includes('exr') || cleanId.includes('oexr')) ? files.find(f => f.includes('exr')) : null;

    if (!matched) {
      matched = files.find((filepath) => {
        const filename = path.basename(filepath).toLowerCase().replace(/[\s_.-]+/g, "");
        return filename.includes(cleanId) || cleanId.includes(filename.replace(/\.[^/.]+$/, ""));
      });
    }
  }

  return matched ? matched : null;
}

async function resolveMediaFilePath(request, id) {
  if (!id) return null;

  const isUuid = id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

  try {
    const asset = await request.server.prisma.asset.findFirst({
      where: isUuid
        ? { id: id }
        : { title: { contains: id, mode: "insensitive" } },
      include: { files: true }
    });
    if (asset && asset.files.length > 0) {
      const orig = asset.files.find(f => f.fileClass === "original");
      if (orig) {
        const found = resolveMediaFilename(orig.filePath || orig.fileName);
        if (found) return found;
      }
    }
  } catch (err) {
    console.error("Error in resolveMediaFilePath:", err.message);
  }

  return resolveMediaFilename(id);
}

const { execFile } = require("child_process");

const NON_WEB_IMAGE_EXTS = new Set([
  "exr", "openexr", "dpx", "cin", "tiff", "tif", "psd", "psb", "ai", "eps", "pcx", "jpf", "bmp", "mpo"
]);

async function getOrGenerateWebImagePreview(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace(".", "");
  if (!NON_WEB_IMAGE_EXTS.has(ext)) {
    return { previewPath: filePath, isConverted: false };
  }

  const previewsDir = path.join(getUploadsDir(), "web_previews");
  if (!fs.existsSync(previewsDir)) {
    try { fs.mkdirSync(previewsDir, { recursive: true }); } catch (e) { }
  }

  const fileHashName = path.basename(filePath) + "_preview.png";
  const previewPath = path.join(previewsDir, fileHashName);

  if (fs.existsSync(previewPath) && fs.statSync(previewPath).size > 0) {
    return { previewPath, isConverted: true };
  }

  let inputPath = filePath;
  let tempPatchedPsd = null;
  if (ext === "psb") {
    try {
      const buffer = fs.readFileSync(filePath);
      if (buffer.length > 26 && (buffer.readUInt16BE(4) === 2 || buffer.toString("utf8", 0, 4) === "8BPS")) {
        const patched = Buffer.from(buffer);
        patched.writeUInt16BE(1, 4);
        tempPatchedPsd = path.join(previewsDir, path.basename(filePath) + ".temp.psd");
        fs.writeFileSync(tempPatchedPsd, patched);
        inputPath = tempPatchedPsd;
      }
    } catch (err) {
      console.warn("[MediaController] PSB patch warning:", err.message);
    }
  }

  const attemptFFmpeg = () => {
    return new Promise((resolve) => {
      execFile(
        "ffmpeg",
        ["-y", "-i", inputPath, "-vframes", "1", "-update", "1", previewPath],
        (err) => {
          if (tempPatchedPsd && fs.existsSync(tempPatchedPsd)) {
            try { fs.unlinkSync(tempPatchedPsd); } catch (e) { }
          }
          if (!err && fs.existsSync(previewPath) && fs.statSync(previewPath).size > 0) {
            resolve(true);
          } else {
            resolve(false);
          }
        }
      );
    });
  };

  const attemptGhostscriptOrPython = () => {
    return new Promise((resolve) => {
      execFile(
        "gs",
        ["-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=png16m", "-r150", `-sOutputFile=${previewPath}`, filePath],
        (gsErr) => {
          if (!gsErr && fs.existsSync(previewPath) && fs.statSync(previewPath).size > 0) {
            resolve(true);
          } else {
            const pyScript = `from PIL import Image; img = Image.open("${filePath}"); img.save("${previewPath}")`;
            execFile("python3", ["-c", pyScript], (pyErr) => {
              if (!pyErr && fs.existsSync(previewPath) && fs.statSync(previewPath).size > 0) {
                resolve(true);
              } else {
                resolve(false);
              }
            });
          }
        }
      );
    });
  };

  let success = await attemptFFmpeg();
  if (!success && (ext === "ai" || ext === "eps" || ext === "psb")) {
    success = await attemptGhostscriptOrPython();
  }

  if (success && fs.existsSync(previewPath) && fs.statSync(previewPath).size > 0) {
    return { previewPath, isConverted: true };
  } else {
    console.warn("[MediaController] Image preview generation skipped for:", filePath);
    return { previewPath: filePath, isConverted: false };
  }
}

async function serveMediaFile(request, reply, filePath, options = {}) {
  const { download = false, displayName } = options;

  let targetFilePath = filePath;
  if (!download) {
    const previewRes = await getOrGenerateWebImagePreview(filePath);
    targetFilePath = previewRes.previewPath;
  }

  const stat = fs.statSync(targetFilePath);
  const fileSize = stat.size;
  const mimeType = inferMimeType(path.basename(targetFilePath));
  const name = displayName || path.basename(filePath);

  reply.header("Accept-Ranges", "bytes");
  reply.header(
    "Content-Disposition",
    download ? `attachment; filename="${name}"` : "inline"
  );
  reply.type(mimeType);

  const range = request.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    reply.code(206);
    reply.header("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    reply.header("Content-Length", chunkSize);
    return reply.send(fs.createReadStream(targetFilePath, { start, end }));
  }

  reply.header("Content-Length", fileSize);
  return reply.send(fs.createReadStream(targetFilePath));
}

async function handleMediaRedirectOrServe(request, reply, filename, download = false) {
  let b2Key = null;
  let assetId = null;

  if (filename && filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    assetId = filename;
    const asset = await request.server.prisma.asset.findUnique({
      where: { id: filename },
      include: { files: true }
    });
    if (asset && asset.files.length > 0) {
      const proxy = asset.files.find(f => f.fileClass === 'proxy');
      const original = asset.files.find(f => f.fileClass === 'original');
      b2Key = proxy ? proxy.filePath : original?.filePath;
    }
  } else {
    const file = await request.server.prisma.assetFile.findFirst({
      where: {
        OR: [
          { filePath: filename },
          { fileName: filename },
          { filePath: { endsWith: '/' + filename } }
        ]
      }
    });
    if (file) {
      b2Key = file.filePath;
      assetId = file.assetId;
    } else if (filename.match(/_thumb\d+\.jpg$/)) {
      b2Key = filename;
    }
  }

  let targetExt = path.extname(b2Key || filename || "").toLowerCase().replace(".", "");
  if (!targetExt && b2Key) {
    targetExt = path.extname(b2Key).toLowerCase().replace(".", "");
  }
  const isNonWebImage = NON_WEB_IMAGE_EXTS.has(targetExt);

  if (b2Key && b2Storage.isEnabled() && (download || !isNonWebImage)) {
    const freshUrl = await b2Storage.getPresignedUrl(b2Key);
    if (freshUrl) {
      console.log(`Redirecting request for ${filename} to fresh B2 URL`);
      return reply.code(307).redirect(freshUrl);
    }
  }

  if (b2Key && b2Storage.isEnabled() && isNonWebImage && !download) {
    try {
      const previewsDir = path.join(getUploadsDir(), "web_previews");
      if (!fs.existsSync(previewsDir)) fs.mkdirSync(previewsDir, { recursive: true });

      const fileHashName = (assetId || path.basename(b2Key)) + "_preview.png";
      const previewPath = path.join(previewsDir, fileHashName);

      if (fs.existsSync(previewPath) && fs.statSync(previewPath).size > 0) {
        return serveMediaFile(request, reply, previewPath, { download: false, displayName: `${filename}.png` });
      }

      const tempRawDir = path.join(getUploadsDir(), "b2_temp");
      if (!fs.existsSync(tempRawDir)) fs.mkdirSync(tempRawDir, { recursive: true });
      const tempRawPath = path.join(tempRawDir, path.basename(b2Key));

      if (!fs.existsSync(tempRawPath)) {
        const fileStream = await b2Storage.downloadFile(b2Key);
        const writeStream = fs.createWriteStream(tempRawPath);
        await new Promise((res, rej) => {
          fileStream.pipe(writeStream);
          writeStream.on('finish', res);
          writeStream.on('error', rej);
        });
      }

      const { previewPath: genPreviewPath } = await getOrGenerateWebImagePreview(tempRawPath);
      if (fs.existsSync(genPreviewPath) && fs.statSync(genPreviewPath).size > 0) {
        return serveMediaFile(request, reply, genPreviewPath, { download: false, displayName: `${filename}.png` });
      }
    } catch (b2PreviewErr) {
      console.error("B2 non-web image preview generation error:", b2PreviewErr.message);
    }
  }

  const filePath = await resolveMediaFilePath(request, filename);
  if (!filePath || !fs.existsSync(filePath)) {
    return reply.code(404).send({ success: false, error: "File not found" });
  }

  const displayName = filename.replace(/^\d+-/, "");
  return serveMediaFile(request, reply, filePath, {
    download,
    displayName,
  });
}


//2. Get media assets - return real uploaded files
module.exports.getMediaAssets = async (request, reply) => {
  console.log("getMediaAssets called");

  try {
    const {
      query,
      type,
      sortOrder,
      limit = 500,
      offset = 0,
      orgId,
    } = request.query;



    const effectiveOrgId = orgId || request.user?.orgId;

    // Build where condition for New Architecture
    const where = {
      deletedAt: null,
    };

    if (effectiveOrgId) {
      where.orgId = effectiveOrgId;
    }

    if (query) {
      where.title = {
        contains: query,
        mode: "insensitive",
      };
    }

    if (type && type !== "All") {
      if (type === "Video") {
        where.type = "video";
      } else if (type === "Images") {
        where.type = "image";
      } else if (type === "Audio") {
        where.type = "audio";
      } else if (type === "Document") {
        where.type = "document";
      }
    }


    // Fetch data based on orgId (New Architecture)
    const dbAssets = await request.server.prisma.asset.findMany({
      where,
      orderBy: {
        createdAt: sortOrder === "asc" ? "asc" : "desc",
      },
      take: Number(limit),
      skip: Number(offset),
      include: {
        files: true,
        metadata: true,
        uploadedBy: { select: { id: true, name: true, email: true } },
        assetTags: { include: { tag: true } },
        transcodeJobs: {
          where: { provider: 'coconut' },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
    });

    const transformedAssets = dbAssets.map((asset) => {
      const originalFile = asset.files.find(f => f.fileClass === 'original');
      const proxyFile = asset.files.find(f => f.fileClass === 'proxy');
      const transcodeJob = asset.transcodeJobs[0];

      const fileUrl = `/api/media/${encodeURIComponent(asset.id)}/stream`;

      const dbTags = (asset.assetTags && asset.assetTags.length > 0)
        ? asset.assetTags.map(at => at.tag?.name).filter(Boolean)
        : [];
      const customProps = asset.metadata?.customProperties
        ? (typeof asset.metadata.customProperties === 'string' ? JSON.parse(asset.metadata.customProperties) : asset.metadata.customProperties)
        : {};
      const tagList = dbTags.length > 0
        ? dbTags
        : (Array.isArray(asset.aiTags) && asset.aiTags.length > 0
          ? asset.aiTags
          : (Array.isArray(customProps.tags) ? customProps.tags : []));

      return {
        id: asset.id,
        name: asset.title,
        path: proxyFile ? proxyFile.filePath : originalFile?.filePath || '',
        type: determineAssetType(asset, originalFile),
        size: Number(originalFile?.sizeBytes || 0),
        uploadDate: asset.createdAt.toISOString(),
        url: fileUrl,
        thumbnail: `/api/media/${encodeURIComponent(asset.id)}/thumbnail`,
        uploadedBy: asset.uploadedBy || null,
        tags: tagList,
        metadata: {
          duration: asset.metadata?.technicalSpecs?.durationSeconds,
          b2Key: proxyFile ? proxyFile.filePath : originalFile?.filePath,
          storageLocation: 'b2',
          technicalSpecs: asset.metadata?.technicalSpecs || {}
        },
        status: asset.status,
        customMetadata: {
          ...(asset.metadata?.customProperties ? (typeof asset.metadata.customProperties === 'string' ? JSON.parse(asset.metadata.customProperties) : asset.metadata.customProperties) : {}),
          technicalSpecs: asset.metadata?.technicalSpecs || {},
          originalFilePath: originalFile?.filePath,
          transcodingProgress: transcodeJob?.status === 'processing'
            ? (transcodeJob.providerMetadata?.progress ? `${transcodeJob.providerMetadata.progress}` : 'processing')
            : null,
        },
        transcodingStatus: transcodeJob?.status || null,
        uploadedByUserId: asset.uploadedByUserId,
      };
    });


    return reply.send({
      success: true,
      orgId,
      total: transformedAssets.length,
      assets: transformedAssets,
    });


  } catch (error) {
    console.error("Error reading media assets:", error);

    return reply.code(500).send({
      success: false,
      error: "Failed to retrieve media assets",
      message: error.message,
    });
  }
};

//3. Search media assets
module.exports.searchMediaAssets = async (request, reply) => {
  try {
    const { q: query = "" } = request.query;
    const userId = request.user.id;

    if (!query || !String(query).trim()) {
      return reply.code(400).send({
        success: false,
        error: "Search query is required",
        assets: [],
      });
    }

    // Query database for assets matching the search string, scoped to the logged-in user
    const dbAssets = await request.server.prisma.asset.findMany({
      where: {
        uploadedByUserId: userId,
        deletedAt: null,
        title: {
          contains: String(query),
          mode: 'insensitive'
        }
      },
      include: { files: true, metadata: true, transcodeJobs: true },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const transformedAssets = dbAssets.map(asset => {
      const originalFile = asset.files.find(f => f.fileClass === 'original');
      const proxyFile = asset.files.find(f => f.fileClass === 'proxy');
      const transcodeJob = asset.transcodeJobs.find(j => j.provider === 'coconut');

      const fileSize = Number(originalFile?.sizeBytes || 0);
      const fileUrl = `/api/media/${encodeURIComponent(asset.id)}/stream`;
      const normalizedType = asset.type;

      return {
        id: asset.id,
        name: asset.title,
        type: normalizedType,
        size: fileSize,
        uploadDate: asset.createdAt.toISOString(),
        url: fileUrl,
        thumbnail: `/api/media/${encodeURIComponent(asset.id)}/thumbnail`,
        tags: asset.aiTags || [],
        metadata: asset.metadata || {},
        customMetadata: {
          ...(asset.metadata?.customProperties ? (typeof asset.metadata.customProperties === 'string' ? JSON.parse(asset.metadata.customProperties) : asset.metadata.customProperties) : {}),
          transcodingProgress: transcodeJob?.status === 'processing'
            ? (transcodeJob.providerMetadata?.progress ? `${transcodeJob.providerMetadata.progress}` : 'processing')
            : null,
        },
        compressionStatus: transcodeJob?.status || "completed",
        transcodingStatus: transcodeJob?.status || null,
      };
    });

    return reply.send({
      success: true,
      assets: transformedAssets,
      query: String(query),
      count: transformedAssets.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return reply.code(500).send({
      success: false,
      error: error.message,
      assets: [],
    });
  }
};

//4. Stream file for preview/playback (video player uses this URL)
module.exports.fileStreamPreview = async (request, reply) => {
  try {
    const { filename } = request.params;
    return await handleMediaRedirectOrServe(request, reply, filename, false);
  } catch (error) {
    return reply.code(500).send({
      success: false,
      error: "Failed to stream file",
      message: error.message,
    });
  }
};

// 4b. Stream thumbnail image directly by asset ID
module.exports.getThumbnail = async (request, reply) => {
  try {
    const { id } = request.params;

    // Fast path for non-UUIDs (e.g. if an old client sends a file path)
    if (!id || !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return reply.code(404).send({ error: "Invalid Asset ID" });
    }

    const asset = await request.server.prisma.asset.findUnique({
      where: { id },
      include: { files: true }
    });

    if (!asset) {
      return reply.code(404).send({ error: "Asset not found" });
    }

    let thumbKey = null;
    if (asset.type === 'image') {
      const original = asset.files.find(f => f.fileClass === 'original');
      thumbKey = original?.filePath;
    } else {
      const proxy = asset.files.find(f => f.fileClass === 'proxy');
      if (proxy) thumbKey = `${proxy.filePath}_thumb1.jpg`;
    }

    if (!thumbKey) {
      return reply.code(404).send({ error: "Thumbnail not found" });
    }

    if (b2Storage.isEnabled()) {
      const ext = path.extname(thumbKey || "").toLowerCase().replace(".", "");
      if (!NON_WEB_IMAGE_EXTS.has(ext)) {
        const freshUrl = await b2Storage.getPresignedUrl(thumbKey);
        if (freshUrl) {
          return reply.code(307).redirect(freshUrl);
        }
      }
    }

    return await handleMediaRedirectOrServe(request, reply, thumbKey, false);
  } catch (error) {
    return reply.code(500).send({
      success: false,
      error: "Failed to stream thumbnail",
      message: error.message,
    });
  }
};

//5. Download file (browser saves to disk)
module.exports.downloadFile = async (request, reply) => {
  try {
    const { filename } = request.params;
    const { raw } = request.query;

    let b2Key = null;

    if (filename && filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // Look up the Asset and get its file (proxy or original depending on raw flag)
      const asset = await request.server.prisma.asset.findUnique({
        where: { id: filename },
        include: { files: true }
      });
      if (asset && asset.files.length > 0) {
        const original = asset.files.find(f => f.fileClass === 'original');
        const proxy = asset.files.find(f => f.fileClass === 'proxy');

        if (raw === 'true') {
          b2Key = original ? original.filePath : null;
        } else {
          b2Key = proxy ? proxy.filePath : original?.filePath;
        }
      }
    }

    if (b2Key) {
      return await handleMediaRedirectOrServe(request, reply, b2Key, true);
    }

    return await handleMediaRedirectOrServe(request, reply, filename, true);
  } catch (error) {
    return reply.code(500).send({
      success: false,
      error: "Failed to download file",
      message: error.message,
    });
  }
};

//6. List soft-deleted files (Trash)
module.exports.softDelete = async (request, reply) => {
  try {
    const userId = request.user.id;

    const liveUser = await request.server.prisma.user.findUnique({
      where: { id: userId },
      include: { roleRelation: true }
    });
    const rawRoleName = liveUser?.roleRelation?.name || liveUser?.role || 'Viewer';
    const userRole = rawRoleName.trim().toLowerCase();

    let whereClause = {
      orgId: request.user.orgId,
      status: { in: ['trash'] },
      deletedAt: { not: null }
    };

    if (userRole === 'editor' || userRole === 'collaborator' || userRole === 'viewer') {
      whereClause.OR = [
        { uploadedByUserId: userId },
        { deletedByUserId: userId }
      ];
    } else {
      whereClause.OR = [
        { uploadedByUserId: userId },
        { deletedByUserId: userId } // Admin sees files they deleted, or they uploaded
      ];
    }

    // Fetch soft-deleted assets from PostgreSQL database
    const dbAssets = await request.server.prisma.asset.findMany({
      where: whereClause,
      include: { files: true, metadata: true, transcodeJobs: true },
      orderBy: {
        deletedAt: 'desc'
      }
    });

    // Transform files using the same structure as active files
    const transformed = dbAssets.map(asset => {
      const originalFile = asset.files.find(f => f.fileClass === 'original');
      const proxyFile = asset.files.find(f => f.fileClass === 'proxy');
      const transcodeJob = asset.transcodeJobs.find(j => j.provider === 'coconut');

      const fileSize = Number(originalFile?.sizeBytes || 0);
      const fileUrl = `/api/media/${encodeURIComponent(asset.id)}/stream`;
      const normalizedType = asset.type;

      return {
        id: asset.id,
        name: asset.title,
        type: normalizedType,
        size: fileSize,
        uploadDate: asset.createdAt.toISOString(),
        deletedAt: asset.deletedAt ? asset.deletedAt.toISOString() : new Date().toISOString(),
        url: fileUrl,
        thumbnail: `/api/media/${encodeURIComponent(asset.id)}/thumbnail`,
        tags: asset.aiTags || [],
        metadata: asset.metadata || {},
        compressionStatus: asset.transcodingStatus || "completed",
        storageLocation: asset.metadata?.storageLocation || "local",
        isTrash: true,
      };
    });

    return reply.send({
      success: true,
      assets: transformed,
    });
  } catch (error) {
    console.error("Error retrieving trash assets:", error);
    return reply.code(500).send({
      success: false,
      error: "Failed to retrieve trash assets",
      message: error.message,
    });
  }
};

//7. Restore a soft-deleted file------used for restoring soft deleted files
module.exports.restoreSoftDelete = async (request, reply) => {
  try {
    const { filename } = request.params;

    let restoredFromDb = false;

    // 1. If it's a database UUID, restore in PostgreSQL database
    if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      try {
        const asset = await request.server.prisma.asset.findUnique({ where: { id: filename } });
        if (asset) {
          let updateData = {
            deletedAt: null,
            status: "active",
            deletedByUserId: null
          };

          await request.server.prisma.asset.update({
            where: { id: filename },
            data: updateData
          });
          restoredFromDb = true;
        }
      } catch (dbErr) {
        console.warn("Could not restore asset in database:", dbErr.message);
      }

    }

    // 2. Also try restoring from B2 if B2 is enabled
    if (b2Storage.isEnabled()) {
      try {
        const b2Files = [
          ...(await b2Storage.listTrashFiles("noah-uploads/")),
          ...(await b2Storage.listTrashFiles("uploads/"))
        ];
        const exactMatch = b2Files.find(f => f.id === filename || f.name === filename || f.key.endsWith(filename));

        if (exactMatch) {
          await b2Storage.restoreFile(exactMatch.key);
        }
      } catch (b2Error) {
        console.warn("Could not restore file from B2:", b2Error.message);
      }
    }

    return reply.send({
      success: true,
      message: restoredFromDb ? "File restored successfully" : "File restore attempted"
    });
  } catch (error) {
    console.error("Error restoring file:", error);
    return reply.code(500).send({
      success: false,
      error: error.message
    });
  }
}

//8. Permanently delete a file from B2
module.exports.deletePermanently = async (request, reply) => {
  try {
    const { filename } = request.params;

    let deletedFromLocal = false;
    let deletedFromB2 = false;

    if (b2Storage.isEnabled()) {
      try {
        const b2Files = [
          ...(await b2Storage.listTrashFiles("noah-uploads/")),
          ...(await b2Storage.listTrashFiles("uploads/"))
        ];
        const activeFiles = await b2Storage.searchFiles(filename);

        const allB2Files = [...b2Files, ...activeFiles];
        const exactMatch = allB2Files.find(f => f.id === filename || f.key === filename || f.key.endsWith(filename));

        if (exactMatch) {
          await b2Storage.permanentlyDeleteFile(exactMatch.key);
          deletedFromB2 = true;
        } else {
          const cleanKey = filename.startsWith("noah-uploads/") || filename.startsWith("uploads/") ? filename : `noah-uploads/${filename}`;
          await b2Storage.permanentlyDeleteFile(cleanKey);
          deletedFromB2 = true;
        }
      } catch (b2Error) {
        console.warn(`Failed to permanently delete key ${filename} from B2:`, b2Error.message);
      }
    }

    let dbDeleted = false;
    let assetToDelete = null;

    // First delete from database if it's a UUID
    if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      try {
        assetToDelete = await request.server.prisma.asset.findUnique({ where: { id: filename } });
        if (assetToDelete) {
          await request.server.prisma.asset.delete({
            where: { id: filename }
          });
          dbDeleted = true;
          if (assetToDelete.deletedByUserId) {
            await createNotification(request.server, assetToDelete.deletedByUserId, assetToDelete.orgId, 'deletion_approved', 'Permanently Deleted', `Your asset ${assetToDelete.title} has been permanently deleted.`, assetToDelete.id);
          }
        }
      } catch (dbErr) {
        console.warn("Could not delete asset from database during permanent delete:", dbErr.message);
      }
    }

    if (!deletedFromLocal && !deletedFromB2 && !dbDeleted) {
      return reply.code(404).send({
        success: false,
        error: "File not found on local disk, B2 storage, or Database",
      });
    }


    return reply.send({
      success: true,
      message: "File permanently deleted",
      deletedFrom: {
        local: deletedFromLocal,
        b2: deletedFromB2,
      }
    });
  } catch (error) {
    return reply.code(500).send({
      success: false,
      error: error.message,
    });
  }
}

//9. GET /api/media/:filename — file bytes for players
module.exports.getMediaFile = async (request, reply) => {
  try {
    const { filename } = request.params;
    const wantsMeta =
      request.query.meta === "true" || request.query.meta === "1";

    if (wantsMeta) {
      let fetchedAsset;
      if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        fetchedAsset = await request.server.prisma.asset.findUnique({
          where: { id: filename },
          include: {
            files: true,
            metadata: true,
            transcodeJobs: true,
            uploadedBy: { select: { id: true, name: true, email: true } },
            assetTags: { include: { tag: true } },
            collectionAssets: { include: { collection: true } }
          }
        });
      }

      if (!fetchedAsset) {
        const cleanTitle = filename.replace(/\.[^/.]+$/, '');
        fetchedAsset = await request.server.prisma.asset.findFirst({
          where: { OR: [{ title: filename }, { title: cleanTitle }] },
          include: {
            files: true,
            metadata: true,
            transcodeJobs: true,
            uploadedBy: { select: { id: true, name: true, email: true } },
            assetTags: { include: { tag: true } },
            collectionAssets: { include: { collection: true } }
          }
        });
      }

      if (fetchedAsset) {
        const originalFile = fetchedAsset.files.find(f => f.fileClass === 'original');
        const proxyFile = fetchedAsset.files.find(f => f.fileClass === 'proxy');
        const transcodeJob = fetchedAsset.transcodeJobs.find(j => j.provider === 'coconut');

        const fileSize = Number(originalFile?.sizeBytes || 0);
        const fileUrl = `/api/media/${encodeURIComponent(fetchedAsset.id)}/stream`;
        const normalizedType = determineAssetType(fetchedAsset, originalFile);

        const dbTags = (fetchedAsset.assetTags && fetchedAsset.assetTags.length > 0)
          ? fetchedAsset.assetTags.map(at => at.tag?.name).filter(Boolean)
          : [];
        const customProps = fetchedAsset.metadata?.customProperties
          ? (typeof fetchedAsset.metadata.customProperties === 'string' ? JSON.parse(fetchedAsset.metadata.customProperties) : fetchedAsset.metadata.customProperties)
          : {};
        const tagList = dbTags.length > 0
          ? dbTags
          : (Array.isArray(fetchedAsset.aiTags) && fetchedAsset.aiTags.length > 0
            ? fetchedAsset.aiTags
            : (Array.isArray(customProps.tags) ? customProps.tags : []));
        const folderInfo = fetchedAsset.collectionAssets?.[0]?.collection || null;

        return reply.send({
          success: true,
          asset: {
            id: fetchedAsset.id,
            name: fetchedAsset.title,
            type: normalizedType,
            size: fileSize,
            uploadDate: fetchedAsset.createdAt.toISOString(),
            url: fileUrl,
            thumbnail: `/api/media/${encodeURIComponent(fetchedAsset.id)}/thumbnail`,
            tags: tagList,
            metadata: fetchedAsset.metadata || {},
            status: fetchedAsset.status,
            uploadedBy: fetchedAsset.uploadedBy || null,
            folder: folderInfo,
            customMetadata: {
              ...(fetchedAsset.metadata?.customProperties ? (typeof fetchedAsset.metadata.customProperties === 'string' ? JSON.parse(fetchedAsset.metadata.customProperties) : fetchedAsset.metadata.customProperties) : {}),
              transcodingProgress: transcodeJob?.status === 'processing'
                ? (transcodeJob.providerMetadata?.progress ? `${transcodeJob.providerMetadata.progress}` : 'processing')
                : null,
            },
            transcodingStatus: transcodeJob?.status || "completed",
            compressionStatus: transcodeJob?.status || "completed",
          }
        });
      }

      const storedName = resolveMediaFilename(filename);
      const filePath = await resolveMediaFilePath(request, filename);
      if (!filePath || !fs.existsSync(filePath)) {
        return reply.code(404).send({ success: false, error: "File not found" });
      }

      const stats = fs.statSync(filePath);
      const mimeType = inferMimeType(storedName || filename);
      const asset = toFrontendAssetShape({
        id: storedName || filename,
        name: (storedName || filename).replace(/^\d+-/, ""),
        mimeType,
        size: stats.size,
        uploadDate: stats.mtime.toISOString(),
        tags: [],
        metadata: {},
        compressionStatus: "completed",
      });

      return reply.send({ success: true, asset });
    }

    return await handleMediaRedirectOrServe(request, reply, filename, false);
  } catch (error) {
    return reply.code(500).send({
      success: false,
      error: "Failed to serve file",
      message: error.message,
    });
  }
};

//10. Upload media asset
module.exports.uploadMediaFile = async (request, reply) => {
  try {
    if (!b2Storage.isEnabled()) {
      return reply.code(500).send({
        success: false,
        message: "Cloud storage is not configured. Local storage is disabled.",
      });

    }

    const totalFileSize = Number(request.query.fileSize) || Number(request.headers['x-file-size']) || 0;
    const durationSeconds = request.query.durationSeconds ? Number(request.query.durationSeconds) : null;

    // Write headers for NDJSON streaming immediately to flush them to the browser
    reply.raw.writeHead(200, {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": request.headers.origin || "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-File-Size, X-Request-Id",
    });

    const sendProgress = (loaded, total) => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(JSON.stringify({ type: "progress", loaded, total }) + "\n");
      }
    };

    // Send initial progress immediately to flush the stream connection
    sendProgress(0, totalFileSize);

    const role = (request.user && request.user.role) ? request.user.role : "member";
    const isolationTier = (role === "super_admin" || role === "admin" || role === "system_admin") ? "internal" : "external";

    // Generate data-based subfolder (YYYY-MM-DD)
    const today = new Date().toISOString().split("T")[0];

    // Fetch organization info to use in the B2 path
    let orgSlug = 'unknown-org';
    if (request.user && request.user.orgId) {
      try {
        const org = await request.server.prisma.organization.findUnique({
          where: { id: request.user.orgId },
          select: { name: true }
        });
        if (org && org.name) {
          // Create a URL-safe version of the organization name
          orgSlug = org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        }
      } catch (err) {
        console.warn("Failed to fetch organization name for upload path:", err.message);
      }
    }

    const parts = request.parts();
    const uploadedFiles = [];

    for await (const part of parts) {
      if (part.file) {
        const userId = request.user?.id || 'unknown';
        const shortUserId = userId.split('-')[0];
        const usernameSlug = request.user?.name ? request.user.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : 'user';
        const userIdentifier = `${usernameSlug}-${shortUserId}`;
        const uniqueId = Date.now().toString();
        const filename = `${uniqueId}-raw-${part.filename}`;
        
        let actualMimeType = part.mimetype;
        if (!actualMimeType || actualMimeType === 'application/octet-stream') {
          actualMimeType = inferMimeType(part.filename);
        }
        
        const isImage = actualMimeType.startsWith("image/");
        const isMimeAudio = actualMimeType.startsWith("audio/");
        const isMimeVideo = actualMimeType.startsWith("video/");
        const subFolder = isImage ? "images" : isMimeAudio ? "audios" : isMimeVideo ? "videos" : "files";
        
        const b2Key = `noah-uploads/${orgSlug}/${subFolder}/${userIdentifier}/${uniqueId}/${filename}`;

        console.log(`Streaming directly to B2: ${b2Key}`);

        let size = 0;
        part.file.on('data', (chunk) => {
          size += chunk.length;
        });

        let b2Result;
        try {
          b2Result = await b2Storage.uploadStream(
            part.file,
            b2Key,
            part.mimetype,
            {
              originalName: part.filename,
            },
            (progress) => {
              console.log(`[B2 Upload Progress] ${part.filename}: ${progress.loaded} / ${totalFileSize || size}`);
              sendProgress(progress.loaded, totalFileSize || progress.total || size || 0);
            }
          );
        } catch (err) {
          console.error("Direct B2 stream failed:", err);
          throw new Error(`B2 upload failed: ${sanitizeB2ErrorMessage(err.message)}`);
        }

        const b2Url = b2Result?.url || null;
        const fileUrl = b2Url ? b2Url : `/api/media/${filename}/stream`;

        const inferredMime = inferMimeType(part.filename);
        const assetType = normalizeAssetType(actualMimeType || part.mimetype, part.filename) !== "document"
          ? normalizeAssetType(actualMimeType || part.mimetype, part.filename)
          : normalizeAssetType(inferredMime, part.filename);
        const isVideo = assetType === "video";
        const isAudio = assetType === "audio";
        const isActuallyVideo = isVideo;
        const isActuallyAudio = isAudio;

        let specs = durationSeconds ? { durationSeconds } : {};
        if (request.query.technicalSpecs) {
          try { specs = { ...specs, ...JSON.parse(request.query.technicalSpecs) }; } catch (e) { }
        }

        try {
          if (b2Storage.isEnabled()) {
            const presignedUrl = await b2Storage.getPresignedUrl(b2Key, 3600);
            if (presignedUrl) {
              const serverExif = await extractServerSideMetadata(presignedUrl);
              if (serverExif && Object.keys(serverExif).length > 0) {
                Object.assign(specs, serverExif);
                if (serverExif.exif) {
                  specs.exif = { ...(specs.exif || {}), ...serverExif.exif };
                }
              }
            }
          }
        } catch (exifErr) {
          console.warn("[ExifTool] Could not extract EXIF in single upload:", exifErr.message);
        }

        // Write to the New Architecture
        const newAsset = await request.server.prisma.asset.create({
          data: {
            orgId: request.user.orgId,
            title: part.filename,
            type: assetType,
            status: (isActuallyVideo || isActuallyAudio) ? "processing" : "active",
            uploadedByUserId: request.user.id,
            files: {
              create: {
                fileClass: "original",
                fileName: filename,
                filePath: b2Key,
                sizeBytes: BigInt(size),
                mimeType: part.mimetype,
                cdnUrl: fileUrl
              }
            },
            metadata: {
              create: {
                technicalSpecs: specs
              }
            }
          }
        });

        // If it's a video, queue a compression job in Redis
        if (isVideo) {
          try {
            // Create TranscodeJob in new architecture
            await request.server.prisma.transcodeJob.create({
              data: {
                assetId: newAsset.id,
                provider: "coconut",
                status: "queued"
              }
            });

            // 5GB threshold for heavy queue
            const fiveGB = 5 * 1024 * 1024 * 1024;
            const queueToUse = size >= fiveGB ? heavyCompressionQueue : compressionQueue;

            await queueToUse.add("compress", {
              assetId: newAsset.id, // For new webhook
              key: b2Key,
              preset: "medium", // Default to balanced H.264
            });
            console.log(`[Queue] Added video compression job for asset ${newAsset.id} to ${size >= fiveGB ? 'heavy' : 'standard'} queue`);
          } catch (queueErr) {
            console.error(`[Queue] Failed to add job to compression queue:`, queueErr.message);
          }
        }

        const fileInfo = {
          id: newAsset.id,
          name: newAsset.title,
          type: newAsset.type,
          size: Number(size),
          uploadDate: newAsset.createdAt.toISOString(),
          url: `/api/media/${encodeURIComponent(newAsset.id)}/stream`,
          thumbnail: newAsset.type === "image" ? `/api/media/${encodeURIComponent(newAsset.id)}/stream` : null,
          tags: [],
          metadata: { technicalSpecs: specs },
          // Report correct status to the frontend
          compressionStatus: isVideo ? "queued" : "completed",
          storageLocation: "b2",
        };


        uploadedFiles.push(fileInfo);
        console.log(`File streamed directly to B2 and saved to DB: ${part.filename} (${size} bytes)`);
      }
    }

    if (uploadedFiles.length === 0) {
      if (!reply.raw.writableEnded) {
        reply.raw.write(JSON.stringify({ type: "error", message: "No files uploaded" }) + "\n");
        reply.raw.end();
      }
      reply.sent = true;
      return;
    }

    if (!reply.raw.writableEnded) {
      reply.raw.write(JSON.stringify({
        type: "complete",
        asset: uploadedFiles[0],
        files: uploadedFiles,
        uploadedTo: {
          local: false,
          b2: true,
        },
      }) + "\n");
      reply.raw.end();
    }
    reply.sent = true;

  } catch (error) {
    console.error("Upload error:", error);
    if (!reply.raw.writableEnded) {
      reply.raw.write(JSON.stringify({
        type: "error",
        message: "Upload failed",
        error: error.message,
      }) + "\n");
      reply.raw.end();
    }
    reply.sent = true;
  }
}


//11. Delete media asset
module.exports.deleteMediaFile = async (request, reply) => {
  try {
    const { filename } = request.params;
    const userRole = request.user?.role || 'Viewer';

    // If it's a database UUID, handle deletion logic based on role
    if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      try {
        // Find the asset first to get uploadedByUserId
        const assetToUpdate = await request.server.prisma.asset.findUnique({ where: { id: filename } });

        if (!assetToUpdate) {
          return reply.code(404).send({ success: false, error: "Asset not found" });
        }

        const liveUser = await request.server.prisma.user.findUnique({
          where: { id: request.user.id },
          include: { roleRelation: true }
        });
        const rawRoleName = liveUser?.roleRelation?.name || liveUser?.role || 'Viewer';
        const userRole = rawRoleName.trim().toLowerCase();

        // 1. Super Admin: Permanent Delete Directly
        if (userRole === 'super admin' || userRole === 'superadmin') {
          return await module.exports.deletePermanently(request, reply);
        }

        // Admin and Editor will fall through to Soft Delete

        // 3. Editor: Soft Delete (goes to Trash normally)
        const asset = await request.server.prisma.asset.update({
          where: { id: filename },
          data: {
            status: "trash",
            deletedAt: new Date(),
            deletedByUserId: request.user.id
          }
        });

        // Notify the original uploader if someone else deleted it
        if (asset.uploadedByUserId && asset.uploadedByUserId !== request.user.id) {
          await createNotification(
            request.server,
            asset.uploadedByUserId,
            asset.orgId,
            'deletion_alert',
            'File Moved to Trash',
            `${request.user.name} (${userRole}) moved your file '${asset.title}' to the Trash.`,
            asset.id
          );
        }

        return reply.send({
          success: true,
          message: "File deleted successfully",
        });
      } catch (dbErr) {
        console.warn("Could not soft delete asset in database:", dbErr.message);
        return reply.code(500).send({
          success: false,
          error: "Failed to soft delete asset in database",
        });
      }
    } else {
      return reply.code(400).send({
        success: false,
        error: "Invalid file ID for soft delete",
      });
    }
  } catch (error) {
    return reply.code(500).send({
      success: false,
      error: error.message,
    });
  }
};

//11.1 Request Permanent Delete (From Trash, user initiates or cron does)
module.exports.requestPermanentDelete = async (request, reply) => {
  try {
    const { filename } = request.params;
    if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const asset = await request.server.prisma.asset.update({
        where: { id: filename },
        data: { status: "pending_admin_review" },
        include: { deletedBy: { include: { roleRelation: true } } }
      });
      const userName = asset.deletedBy?.name || request.user?.name || 'User';
      const roleName = asset.deletedBy?.roleRelation?.name || request.user?.role || 'Unknown Role';
      await notifyRole(request.server, asset.orgId, 'Admin', 'approval_request', 'Manual Deletion Request', `${userName} (${roleName}) requested permanent deletion for file: '${asset.title}'. Please review.`, asset.id);
      return reply.send({ success: true, message: "Deletion requested for admin review" });
    }
    return reply.code(400).send({ success: false, error: "Invalid file ID" });
  } catch (error) {
    return reply.code(500).send({ success: false, error: error.message });
  }
};

//11.1.1 Get Pending Deletions
module.exports.getPendingDeletions = async (request, reply) => {
  try {
    const liveUser = await request.server.prisma.user.findUnique({
      where: { id: request.user.id },
      include: { roleRelation: true }
    });
    const rawRoleName = liveUser?.roleRelation?.name || liveUser?.role || 'Viewer';
    const userRole = rawRoleName.trim().toLowerCase();

    let statusFilter = null;

    if (userRole === 'super admin' || userRole === 'superadmin') {
      statusFilter = 'pending_super_admin';
    } else if (userRole === 'admin') {
      statusFilter = 'pending_admin_review';
    } else {
      return reply.code(403).send({ success: false, error: 'Unauthorized to view pending deletions' });
    }

    const assets = await request.server.prisma.asset.findMany({
      where: {
        status: statusFilter,
        orgId: request.user?.orgId
      },
      include: {
        deletedBy: {
          include: { roleRelation: true }
        }
      },
      orderBy: { deletedAt: 'desc' }
    });

    return reply.send({ success: true, data: assets });
  } catch (error) {
    return reply.code(500).send({ success: false, error: error.message });
  }
};

//11.2 Admin Approve Delete (Moves to Super Admin Review)
module.exports.adminApproveDelete = async (request, reply) => {
  try {
    const { filename } = request.params;

    const liveUser = await request.server.prisma.user.findUnique({
      where: { id: request.user.id },
      include: { roleRelation: true }
    });
    const rawRoleName = liveUser?.roleRelation?.name || liveUser?.role || 'Viewer';
    const userRole = rawRoleName.trim().toLowerCase();

    if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      if (userRole === 'admin') {
        const asset = await request.server.prisma.asset.update({
          where: { id: filename },
          data: { status: "pending_super_admin" }
        });
        const userName = request.user?.name || 'Admin';
        await notifyRole(request.server, asset.orgId, 'Super Admin', 'approval_request', 'Super Admin Deletion Review', `${userName} (Admin) approved deletion for file: '${asset.title}'. Final approval needed.`, asset.id);
        return reply.send({ success: true, message: "Approved by Admin, waiting for Super Admin" });
      } else if (userRole === 'super admin' || userRole === 'superadmin') {
        // If a Super Admin accepts, the file is permanently deleted.
        return await module.exports.deletePermanently(request, reply);
      } else {
        return reply.code(403).send({ success: false, error: "Unauthorized to approve deletion" });
      }
    }
    return reply.code(400).send({ success: false, error: "Invalid file ID" });
  } catch (error) {
    return reply.code(500).send({ success: false, error: error.message });
  }
};

//11.3 Reject Delete (Moves back to Trash or Active depending on role)
module.exports.rejectDelete = async (request, reply) => {
  try {
    const { filename } = request.params;

    const liveUser = await request.server.prisma.user.findUnique({
      where: { id: request.user.id },
      include: { roleRelation: true }
    });
    const rawRoleName = liveUser?.roleRelation?.name || liveUser?.role || 'Viewer';
    const userRole = rawRoleName.trim().toLowerCase();

    if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {

      let updateData = {};
      let message = "";

      if (userRole === 'super admin' || userRole === 'superadmin') {
        // User requested that if Super Admin rejects an Editor's file, it goes to Editor's trash, not Admin's.
        // By setting status to 'trash', it will appear in the trash of whoever deleted it (Editor or Admin).
        updateData = {
          status: "trash",
          deletedAt: new Date()
        };
        message = "Deletion rejected by Super Admin, returned to Trash";
      } else if (userRole === 'admin') {
        // If Admin rejects, it goes back to Trash with a reset 30-day timer
        updateData = {
          status: "trash",
          deletedAt: new Date()
        };
        message = "Deletion rejected by Admin, returned to Trash";
      } else {
        return reply.code(403).send({ success: false, error: "Unauthorized to reject deletion" });
      }

      const asset = await request.server.prisma.asset.update({
        where: { id: filename },
        data: updateData
      });

      if (asset.deletedByUserId) {
        await createNotification(request.server, asset.deletedByUserId, asset.orgId, 'deletion_rejected', 'Deletion Rejected', `Your permanent deletion request for ${asset.title} was rejected.`, asset.id);
      }

      // Also notify the original uploader if it was made active
      if (updateData.status === 'active' && asset.uploadedByUserId && asset.uploadedByUserId !== asset.deletedByUserId) {
        await createNotification(request.server, asset.uploadedByUserId, asset.orgId, 'deletion_rejected', 'File Restored', `Your file ${asset.title} has been restored to Active status by Super Admin.`, asset.id);
      }

      return reply.send({ success: true, message });
    }
    return reply.code(400).send({ success: false, error: "Invalid file ID" });
  } catch (error) {
    return reply.code(500).send({ success: false, error: error.message });
  }
};

//12. Initialize a Resumable Multipart Upload Session
module.exports.initiateResumableUpload = async (request, reply) => {
  const { fileName, fileSize, mimeType, durationSeconds, title, summary, tagIds, folderId, technicalSpecs } = request.body || {};
  if (!fileName || !fileSize || !mimeType) {
    return reply.status(400).send({ message: "fileName, fileSize, and mimeType are required" });
  }

  try {
    const sessionId = require("uuid").v4();

    // Fetch organization info to use in the B2 path
    let orgSlug = 'unknown-org';
    if (request.user && request.user.orgId) {
      try {
        const org = await request.server.prisma.organization.findUnique({
          where: { id: request.user.orgId },
          select: { name: true }
        });
        if (org && org.name) {
          // Create a URL-safe version of the organization name
          orgSlug = org.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        }
      } catch (err) {
        console.warn("Failed to fetch organization name for resumable upload path:", err.message);
      }
    }

    const userId = request.user?.id || 'unknown';
    const shortUserId = userId.split('-')[0];
    const usernameSlug = request.user?.name ? request.user.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : 'user';
    const userIdentifier = `${usernameSlug}-${shortUserId}`;
    
    let actualSessionMimeType = mimeType;
    if (!actualSessionMimeType || actualSessionMimeType === 'application/octet-stream') {
      actualSessionMimeType = inferMimeType(fileName);
    }
    const isImage = actualSessionMimeType.startsWith("image/");
    const isAudio = actualSessionMimeType.startsWith("audio/");
    const isVideo = actualSessionMimeType.startsWith("video/");
    const subFolder = isImage ? "images" : isAudio ? "audios" : isVideo ? "videos" : "files";

    const uniqueId = Date.now().toString();
    const b2Key = `noah-uploads/${orgSlug}/${subFolder}/${userIdentifier}/${uniqueId}/${uniqueId}-raw-${fileName}`;

    // Initiate upload session with Backblaze B2 S3
    const { uploadId } = await b2Storage.initiateMultipartUpload(b2Key, mimeType);

    const sessionData = {
      sessionId,
      uploadId,
      key: b2Key,
      fileName,
      fileSize: Number(fileSize),
      mimeType,
      durationSeconds: durationSeconds ? Number(durationSeconds) : null,
      title: title || fileName,
      summary: summary || "",
      tagIds: tagIds || [],
      folderId: folderId || null,
      technicalSpecs: technicalSpecs || {},
      parts: [],
    };

    // Save session in Redis with 24 hours TTL
    await redisClient.setex(`upload:session:${sessionId}`, 86400, JSON.stringify(sessionData));
    return { sessionId, uploadId, key: b2Key };

  } catch (error) {
    console.error("Failed to initiate resumable upload:", error);
    return reply.status(500).send({ message: "Failed to initiate upload session", error: error.message });
  }
}

//13.  Upload an individual raw binary chunk
module.exports.uploadChunk = async (request, reply) => {
  const { sessionId } = request.query;

  const partNumber = parseInt(request.query.partNumber, 10);

  if (!sessionId || isNaN(partNumber)) {
    return reply.status(400).send({ message: "sessionId and valid partNumber query parameters are required" });
  }

  try {
    const sessionRaw = await redisClient.get(`upload:session:${sessionId}`);
    if (!sessionRaw) {
      return reply.status(404).send({ message: "Upload session not found or expired" });
    }
    const session = JSON.parse(sessionRaw);

    let chunkBuffer;
    if (Buffer.isBuffer(request.body)) {
      chunkBuffer = request.body;
    } else {
      const chunks = [];
      const stream = request.body || request.raw;
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      chunkBuffer = Buffer.concat(chunks);
    }

    if (chunkBuffer.length === 0) {
      return reply.status(400).send({ message: "Empty chunk payload received" });
    }

    // Upload chunk to B2
    const partResult = await b2Storage.uploadPart(session.key, session.uploadId, partNumber, chunkBuffer);

    // Add ETag to session parts
    session.parts = session.parts.filter(p => p.PartNumber !== partNumber);
    session.parts.push({ PartNumber: partNumber, ETag: partResult.ETag });

    // Save updated session to Redis
    await redisClient.setex(`upload:session:${sessionId}`, 86400, JSON.stringify(session));

    return { success: true, partNumber, etag: partResult.ETag };

  } catch (error) {
    console.error(`Failed to upload chunk ${partNumber}:`, error);
    return reply.status(500).send({ message: `Failed to upload chunk ${partNumber}`, error: error.message });
  }
}

//13b. Get Presigned URL for chunk upload (Direct to B2)
module.exports.getChunkUploadUrl = async (request, reply) => {
  const { sessionId } = request.query;
  const partNumber = parseInt(request.query.partNumber, 10);

  if (!sessionId || isNaN(partNumber)) {
    return reply.status(400).send({ message: "sessionId and valid partNumber query parameters are required" });
  }

  try {
    const sessionRaw = await redisClient.get(`upload:session:${sessionId}`);
    if (!sessionRaw) {
      return reply.status(404).send({ message: "Upload session not found or expired" });
    }
    const session = JSON.parse(sessionRaw);

    // Get Presigned URL for this chunk directly to B2
    const presignedUrl = await b2Storage.getPresignedPartUrl(session.key, session.uploadId, partNumber);

    return { success: true, partNumber, presignedUrl };
  } catch (error) {
    console.error(`Failed to generate upload URL for chunk ${partNumber}:`, error);
    return reply.status(500).send({ message: `Failed to generate upload URL for chunk ${partNumber}`, error: error.message });
  }
}

//14. Check which chunks have been successfully uploaded
module.exports.getUploadStatus = async (request, reply) => {
  const { sessionId } = request.params;
  try {
    const sessionRaw = await redisClient.get(`upload:session:${sessionId}`);
    if (!sessionRaw) {
      return reply.status(404).send({ message: "Upload session not found" });
    }
    const session = JSON.parse(sessionRaw);

    return {
      sessionId: session.sessionId,
      fileName: session.fileName,
      fileSize: session.fileSize,
      parts: session.parts,
    };
  } catch (error) {
    console.error("❌ Failed to fetch upload status:", error);
    return reply.status(500).send({ message: "Failed to get upload status" });
  }
}

//15. Complete Multipart Upload Session and Create Database Record
module.exports.completeResumableUpload = async (request, reply) => {
  const { sessionId, parts, title, summary, tagIds, folderId, technicalSpecs } = request.body || {};
  if (!sessionId) {
    return reply.status(400).send({ message: "sessionId is required" })
  }

  try {
    const sessionRaw = await redisClient.get(`upload:session:${sessionId}`);
    if (!sessionRaw) {
      return reply.status(404).send({ message: "Upload session not found or expired" });
    }

    const session = JSON.parse(sessionRaw);

    // Use parts sent from frontend if available, otherwise fallback to session parts
    const finalParts = parts && parts.length > 0 ? parts : session.parts;

    // Complete the multipart upload on B2
    console.log(`Completing multipart upload in B2 for key ${session.key}...`);

    await b2Storage.completeMultipartUpload(session.key, session.uploadId, finalParts);

    let actualSessionMimeType = session.mimeType;
    if (!actualSessionMimeType || actualSessionMimeType === 'application/octet-stream') {
      actualSessionMimeType = inferMimeType(session.fileName || session.key || "");
    }
    const inferredMime = inferMimeType(session.fileName || session.key || "");
    const assetType = normalizeAssetType(actualSessionMimeType || session.mimeType, session.fileName || session.key) !== "document"
      ? normalizeAssetType(actualSessionMimeType || session.mimeType, session.fileName || session.key)
      : normalizeAssetType(inferredMime, session.fileName || session.key);
    const isVideo = assetType === "video";
    const isAudio = assetType === "audio";
    const shouldQueueTranscode = isVideo || isAudio;
    const cdnUrl = `/api/media/${session.key}/stream`;
    // Merge technical specs from request body and upload session
    const mergedTechSpecs = {
      fileSize: Number(session.fileSize),
      sizeBytes: Number(session.fileSize),
      ...(session.technicalSpecs || {}),
      ...(session.durationSeconds ? { durationSeconds: session.durationSeconds } : {}),
      ...(technicalSpecs || {})
    };

    // Extract EXIF & camera metadata server-side using ExifTool
    try {
      if (b2Storage.isEnabled()) {
        const presignedUrl = await b2Storage.getPresignedUrl(session.key, 3600);
        if (presignedUrl) {
          const serverExif = await extractServerSideMetadata(presignedUrl);
          if (serverExif && Object.keys(serverExif).length > 0) {
            Object.assign(mergedTechSpecs, serverExif);
            if (serverExif.exif) {
              mergedTechSpecs.exif = {
                ...(mergedTechSpecs.exif || {}),
                ...serverExif.exif
              };
            }
          }
        }
      }
    } catch (exifErr) {
      console.warn("[ExifTool] Could not extract server-side EXIF metadata during upload:", exifErr.message);
    }

    const assetTitle = title || session.title || session.fileName;
    const assetSummary = summary || session.summary || "";

    // Save the asset metadata in PostgreSQL via Prisma (New Architecture)
    const newAsset = await request.server.prisma.asset.create({
      data: {
        orgId: request.user.orgId,
        title: assetTitle,
        type: assetType,
        status: shouldQueueTranscode ? "processing" : "active",
        uploadedByUserId: request.user.id,
        files: {
          create: {
            fileClass: "original",
            fileName: session.fileName,
            filePath: session.key,
            sizeBytes: BigInt(session.fileSize),
            mimeType: session.mimeType,
            cdnUrl: cdnUrl
          }
        },
        metadata: {
          create: {
            technicalSpecs: mergedTechSpecs,
            customProperties: {
              summary: assetSummary,
              originallyCreated: mergedTechSpecs.originallyCreated || null
            }
          }
        }
      }
    });

    // Link Tags if provided
    const resolvedTagNames = [];
    const finalTagIds = tagIds || session.tagIds;
    if (Array.isArray(finalTagIds) && finalTagIds.length > 0) {
      try {
        for (const tagItem of finalTagIds) {
          if (!tagItem || typeof tagItem !== 'string') continue;
          let targetTagId = tagItem;
          let tagName = tagItem.trim();

          // If tagItem is a tag name rather than a UUID, find or create the Tag record
          if (!tagItem.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            const tagRecord = await request.server.prisma.tag.upsert({
              where: {
                unique_tag_per_org: { orgId: request.user.orgId, name: tagItem.trim() }
              },
              update: {},
              create: {
                orgId: request.user.orgId,
                name: tagItem.trim()
              }
            });
            targetTagId = tagRecord.id;
            tagName = tagRecord.name;
          } else {
            const tagRecord = await request.server.prisma.tag.findUnique({ where: { id: tagItem } });
            if (tagRecord) tagName = tagRecord.name;
          }

          resolvedTagNames.push(tagName);

          // Link asset with tag in asset_tags table
          await request.server.prisma.assetTag.upsert({
            where: {
              assetId_tagId: {
                assetId: newAsset.id,
                tagId: targetTagId
              }
            },
            update: {},
            create: {
              assetId: newAsset.id,
              tagId: targetTagId,
              addedById: request.user.id
            }
          });
        }
      } catch (tagErr) {
        console.warn(`[AssetTag] Could not associate tags with asset ${newAsset.id}:`, tagErr.message);
      }
    }

    // Link Collection / Folder if provided
    const finalFolderId = folderId || session.folderId;
    if (finalFolderId && finalFolderId !== "none" && finalFolderId !== "root") {
      try {
        await request.server.prisma.collectionAsset.create({
          data: {
            assetId: newAsset.id,
            collectionId: finalFolderId,
            addedById: request.user.id
          }
        });
      } catch (folderErr) {
        console.warn(`[CollectionAsset] Could not associate folder with asset ${newAsset.id}:`, folderErr.message);
      }
    }

    // Queue compression if it's a video or audio
    if (shouldQueueTranscode) {
      try {
        await request.server.prisma.transcodeJob.create({
          data: {
            assetId: newAsset.id,
            provider: "coconut",
            status: "queued"
          }
        });

        const fiveGB = BigInt(5 * 1024 * 1024 * 1024);
        const queueToUse = (isVideo && BigInt(session.fileSize) >= fiveGB) ? heavyCompressionQueue : compressionQueue;
        await queueToUse.add("compress", {
          assetId: newAsset.id,
          key: session.key,
          preset: "medium",
        });
        console.log(`[Queue] Added ${isAudio ? 'audio' : 'video'} compression job for asset ${newAsset.id} to ${(isVideo && BigInt(session.fileSize) >= fiveGB) ? 'heavy' : 'fast'} queue`);
      } catch (queueErr) {
        console.error(`[Queue] Failed to queue job for asset ${newAsset.id}:`, queueErr.message);
      }
    }

    // Clean up Redis Sessions
    await redisClient.del(`upload:session:${sessionId}`);

    const fileInfo = {
      id: newAsset.id,
      name: newAsset.title,
      type: newAsset.type,
      size: Number(session.fileSize),
      uploadDate: newAsset.createdAt.toISOString(),
      url: `/api/media/${encodeURIComponent(newAsset.id)}/stream`,
      thumbnail: null,
      tags: resolvedTagNames,
      metadata: { technicalSpecs: mergedTechSpecs },
      compressionStatus: shouldQueueTranscode ? "queued" : "completed",
      storageLocation: "b2",
    };

    return { success: true, asset: fileInfo };

  } catch (error) {
    console.error("❌ Failed to complete resumable upload:", error);
    return reply.status(500).send({ message: "Failed to complete upload session", error: error.message });
  }
}

//16. Abort Multipart Upload Session and clear chunks from B2
module.exports.abortResumableUpload = async (request, reply) => {
  const { sessionId } = request.params;

  if (!sessionId) {
    return reply.status(400).send({ message: "sessionId parameter is required" });
  }

  try {
    const sessionRaw = await redisClient.get(`upload:session:${sessionId}`);

    if (sessionRaw) {
      const session = JSON.parse(sessionRaw);

      // Tell B2 to delete the partial uploaded chunks
      try {
        await b2Storage.abortMultipartUpload(session.key, session.uploadId);
        console.log(`[Upload Aborted] Cleaned up B2 chunks for key: ${session.key}`);
      } catch (b2Err) {
        console.error(`[Upload Aborted] Failed to clean up B2 chunks:`, b2Err.message);
        // Continue anyway to clean up Redis
      }

      // Clean up Redis Session
      await redisClient.del(`upload:session:${sessionId}`);
    }

    return { success: true, message: "Upload session aborted and cleaned up successfully" };
  } catch (error) {
    console.error("❌ Failed to abort resumable upload:", error);
    return reply.status(500).send({ message: "Failed to abort upload session", error: error.message });
  }
}

//17. Handle Coconut Webhook
module.exports.handleCoconutWebhook = async (request, reply) => {
  const event = request.body;
  const newAssetId = request.query.newAssetId;

  if (!newAssetId) {
    return reply.status(400).send("newAssetId query parameter is missing");
  }

  if (event && event.event === 'job.completed') {
    try {
      const compressedKey = request.query.compressedKey;

      await request.server.prisma.transcodeJob.updateMany({
        where: { assetId: newAssetId, provider: "coconut" },
        data: { status: 'completed' }
      });

      const asset = await request.server.prisma.asset.findUnique({
        where: { id: newAssetId },
        include: { metadata: true, files: true }
      });

      if (!asset) {
        throw new Error(`Asset ${newAssetId} not found`);
      }

      const isAudio = asset.type === 'audio';

      if (compressedKey) {
        // Retrieve actual proxy file size via HEAD request (microscopic bandwidth)
        const proxySize = await b2Storage.getFileSize(compressedKey);

        await request.server.prisma.assetFile.create({
          data: {
            assetId: newAssetId,
            fileClass: "proxy",
            fileName: compressedKey.split('/').pop() || (isAudio ? 'compressed.mp3' : 'compressed.mp4'),
            filePath: compressedKey,
            sizeBytes: BigInt(proxySize || 0),
            mimeType: isAudio ? 'audio/mpeg' : 'video/mp4',
            cdnUrl: `/api/media/${encodeURIComponent(compressedKey)}/stream`
          }
        });
      }

      // -- DUPLICATE VERIFICATION TIER 1, 2, 3 --

      let duplicateOf = [];
      const originalFile = asset.files.find(f => f.fileClass === 'original');
      const durationSeconds = asset.metadata?.technicalSpecs?.durationSeconds;
      const checksum = asset.metadata?.checksum;

      // Tier 1: Exact Checksum Match
      if (checksum && originalFile?.sizeBytes) {
        const exactMatch = await request.server.prisma.asset.findFirst({
          where: {
            id: { not: newAssetId },
            orgId: asset.orgId,
            deletedAt: null,
            metadata: { checksum: checksum },
            files: { some: { fileClass: 'original', sizeBytes: originalFile.sizeBytes } }
          }
        });
        if (exactMatch) duplicateOf.push(exactMatch.id);
      }

      // If not an exact match, run the visual check (only for non-audio assets)
      if (duplicateOf.length === 0 && asset.type !== 'audio') {
        // Tier 2: Metadata Filter (Find Suspects)
        const whereClause = {
          id: { not: newAssetId },
          orgId: asset.orgId,
          deletedAt: null
        };

        const potentialSuspects = await request.server.prisma.asset.findMany({
          where: whereClause,
          include: { metadata: true }
        });

        const suspectIds = potentialSuspects.filter(s => {
          if (!durationSeconds) return true;
          const sDuration = s.metadata?.technicalSpecs?.durationSeconds;
          if (!sDuration) return true;
          return Number(sDuration) >= Number(durationSeconds) - 2 && Number(sDuration) <= Number(durationSeconds) + 2;
        }).map(s => s.id);

        // Tier 3: Storyboard pHash (The Visual Math)
        const baseKey = compressedKey || originalFile?.filePath;

        if (baseKey) {
          // 1. Download and Hash the 5 thumbnails Coconut just created
          for (let i = 1; i <= 5; i++) {
            const thumbKey = `${baseKey}_thumb${i}.jpg`;
            const thumbUrl = await b2Storage.getPresignedUrl(thumbKey, 3600); // 1-hour link

            if (thumbUrl) {
              try {
                let fetchResponse = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                  const res = await fetch(thumbUrl);
                  if (res.ok) {
                    fetchResponse = res;
                    break;
                  }
                  if (res.status === 404 && attempt < 3) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                  } else {
                    throw new Error(`Failed to fetch thumbnail (Status: ${res.status})`);
                  }
                }

                if (!fetchResponse) throw new Error("Thumbnail not found in B2 after 3 attempts");

                const arrayBuffer = await fetchResponse.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                const hashStr = await imageHashAsync({ data: buffer, name: 'thumb.jpg' }, 16, true);

                await request.server.prisma.videoFrameHash.create({
                  data: {
                    assetId: newAssetId,
                    frameIndex: i,
                    hashValue: hashStr
                  }
                });
              } catch (e) {
                console.error(`[Webhook] Failed to hash thumb ${i}:`, e.message);
              }
            }
          }

          // 2. PostgreSQL Hamming Distance Calculation
          if (suspectIds.length > 0) {
            const duplicateMatches = await request.server.prisma.$queryRawUnsafe(`
              SELECT vfh."assetId", COUNT(*) as match_count
              FROM video_frame_hashes vfh
              JOIN video_frame_hashes new_vfh ON new_vfh."frameIndex" = vfh."frameIndex"
              WHERE new_vfh."assetId" = $1::uuid 
                AND vfh."assetId" = ANY($2::uuid[])
                AND length(replace((('x' || vfh."hashValue")::bit(256) # ('x' || new_vfh."hashValue")::bit(256))::text, '0', '')) <= 15
              GROUP BY vfh."assetId"
              HAVING COUNT(*) >= 3
            `, newAssetId, suspectIds);

            duplicateMatches.forEach(match => duplicateOf.push(match.assetId));
          }
        }
      }

      // Determine final status and metadata
      const newStatus = duplicateOf.length > 0 ? 'duplicate' : 'active';
      const currentCustomProps = typeof asset.metadata?.customProperties === 'object' ? asset.metadata.customProperties : {};

      const updatedCustomProps = {
        ...currentCustomProps,
        duplicates: duplicateOf
      };

      await request.server.prisma.asset.update({
        where: { id: newAssetId },
        data: { status: newStatus }
      });

      if (asset.metadata) {
        await request.server.prisma.assetMetadata.update({
          where: { assetId: newAssetId },
          data: { customProperties: updatedCustomProps }
        });
      } else {
        await request.server.prisma.assetMetadata.create({
          data: {
            assetId: newAssetId,
            customProperties: updatedCustomProps
          }
        });
      }

      console.log(`[Webhook] Asset ${newAssetId} marked ${newStatus}. Duplicates found: ${duplicateOf.length}`);

      // 3. Auto-Cleanup: Delete the extra temporary thumbnails from B2 to save storage, EXCEPT thumb1! (Only for non-audio assets)
      if (asset.type !== 'audio' && baseKey) {
        for (let i = 2; i <= 5; i++) {
          try {
            await b2Storage.deleteFile(`${baseKey}_thumb${i}.jpg`);
          } catch (delErr) {
            console.error(`[Webhook] Failed to delete thumb ${i}:`, delErr.message);
          }
        }
        console.log(`[Webhook] Auto-cleaned temporary storyboard thumbnails for asset ${newAssetId}`);
      }

    } catch (err) {
      console.error(`[Webhook] Failed to update DB for asset ${newAssetId}:`, err);
    }
  } else if (event && (event.progress || (event.data && event.data.progress))) {
    const progressVal = event.progress || (event.data && event.data.progress);
    console.log(`[Webhook] Asset ${newAssetId} transcoding progress: ${progressVal}`);
    try {
      await request.server.prisma.transcodeJob.updateMany({
        where: { assetId: newAssetId, provider: "coconut", status: "processing" },
        data: {
          providerMetadata: { progress: progressVal }
        }
      });
    } catch (err) {
      console.error(`[Webhook] Failed to update progress for asset ${newAssetId}:`, err);
    }
  } else if (event && event.event === 'job.failed') {
    try {
      await request.server.prisma.transcodeJob.updateMany({
        where: { assetId: newAssetId, provider: "coconut" },
        data: {
          status: 'failed',
          providerMetadata: event
        }
      });
      await request.server.prisma.asset.update({
        where: { id: newAssetId },
        data: { status: 'failed' }
      });

      console.log(`[Webhook] Asset ${newAssetId} marked as failed.`);
    } catch (err) {
      console.error(`[Webhook] Failed to update DB for asset ${newAssetId}:`, err);
    }
  }

  // Always reply 200 OK to Coconut so it doesn't retry
  return reply.status(200).send("OK");
}

module.exports.checkDuplicateMediaFile = async (request, reply) => {
  try {
    const { orgId } = request.user;
    const { fileName, fileSize } = request.body;

    if (!fileName || fileSize === undefined) {
      return reply.code(400).send({ error: "fileName and fileSize are required" });
    }

    // Check if an active file with the exact same name and size exists
    const existingAsset = await request.server.prisma.asset.findFirst({
      where: {
        orgId: orgId,
        deletedAt: null,
        title: fileName,
        files: {
          some: {
            fileClass: "original",
            sizeBytes: BigInt(fileSize)
          }
        }
      }
    });

    if (existingAsset) {
      return reply.send({ isDuplicate: true, message: "Duplicate video: video already exists" });
    }

    return reply.send({ isDuplicate: false });
  } catch (error) {
    console.error("Error checking duplicate media file:", error);
    return reply.code(500).send({ error: "Failed to check duplicate file" });
  }
};

module.exports.updateAssetTags = async (request, reply) => {
  try {
    const { filename: assetId } = request.params;
    const { tags = [] } = request.body || {};

    const tagIds = [];
    for (const rawTag of tags) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawTag);
      let tagObj = null;
      if (isUuid) {
        tagObj = await request.server.prisma.tag.findUnique({ where: { id: rawTag } });
      }
      if (!tagObj) {
        const orgId = request.user?.orgId;
        if (orgId) {
          tagObj = await request.server.prisma.tag.upsert({
            where: {
              unique_tag_per_org: {
                orgId: orgId,
                name: rawTag.trim()
              }
            },
            update: {},
            create: {
              orgId: orgId,
              name: rawTag.trim()
            }
          });
        } else {
          tagObj = await request.server.prisma.tag.findFirst({ where: { name: rawTag.trim() } });
        }
      }
      if (tagObj) tagIds.push(tagObj.id);
    }

    // Delete existing links for asset
    await request.server.prisma.assetTag.deleteMany({ where: { assetId } });

    // Insert new link rows
    if (tagIds.length > 0) {
      await request.server.prisma.assetTag.createMany({
        data: tagIds.map(tId => ({
          assetId,
          tagId: tId,
          addedById: request.user?.id || null
        })),
        skipDuplicates: true
      });
    }

    return reply.send({ success: true, tags });
  } catch (error) {
    console.error("Failed to update asset tags:", error);
    return reply.status(500).send({ success: false, error: error.message });
  }
};

module.exports.retryTranscode = async (request, reply) => {
  try {
    const { id } = request.params;
    const orgId = request.user?.orgId;
    if (!orgId) {
      return reply.status(403).send({ error: "No organization attached to user." });
    }

    const asset = await request.server.prisma.asset.findUnique({
      where: { id },
      include: { files: true, metadata: true }
    });

    if (!asset || asset.orgId !== orgId) {
      return reply.status(404).send({ error: "Media asset not found" });
    }

    if (asset.type !== 'video' && asset.type !== 'audio') {
      return reply.status(400).send({ error: "Only video and audio assets can be transcoded." });
    }

    const job = await request.server.prisma.transcodeJob.findFirst({
      where: { assetId: id, provider: "coconut" }
    });

    // Duration Check
    const maxDurationStr = process.env.COCONUT_MAX_DURATION_SECONDS;
    if (asset.type !== 'audio' && maxDurationStr) {
      const maxDuration = parseInt(maxDurationStr, 10);
      if (!isNaN(maxDuration)) {
        let metadata = asset.metadata;
        if (typeof metadata?.customProperties === 'string') {
           // Prisma stringified it, so try to parse if needed, but technicalSpecs should be an object
        }
        const technicalSpecs = metadata?.technicalSpecs;
        const durationSeconds = technicalSpecs?.durationSeconds;
        if (durationSeconds && durationSeconds > maxDuration) {
          // Immediately set asset and job to failed, and return error
          if (job) {
            await request.server.prisma.transcodeJob.update({
              where: { id: job.id },
              data: { status: 'failed', providerMetadata: { error: 'Duration limit exceeded' } }
            });
          }
          await request.server.prisma.asset.update({
            where: { id },
            data: { status: 'failed', compressedKey: null }
          });
          return reply.status(400).send({ error: `Asset duration exceeds maximum allowed limit of ${maxDuration} seconds for free tier.` });
        }
      }
    }
    
    if (job) {
      await request.server.prisma.transcodeJob.update({
        where: { id: job.id },
        data: { status: "queued", jobId: null, providerMetadata: {} }
      });
    } else {
      await request.server.prisma.transcodeJob.create({
        data: { assetId: id, provider: "coconut", status: "queued" }
      });
    }

    // Reset asset status to active so it can be retried
    await request.server.prisma.asset.update({
      where: { id },
      data: { status: "active" }
    });

    const originalFile = asset.files.find(f => f.fileClass === "original");
    if (!originalFile) {
      return reply.status(400).send({ error: "Original file not found for this asset." });
    }

    const size = Number(originalFile.sizeBytes);
    const fiveGB = 5 * 1024 * 1024 * 1024;
    const queueToUse = size >= fiveGB ? heavyCompressionQueue : compressionQueue;

    await queueToUse.add("compress", {
      assetId: id,
      key: originalFile.filePath,
      preset: "medium"
    });
    
    console.log(`[Queue] Re-added compression job for asset ${id} to ${size >= fiveGB ? 'heavy' : 'standard'} queue`);

    return reply.send({ success: true, message: "Transcode job queued" });
  } catch (error) {
    console.error("Failed to retry transcode:", error);
    return reply.status(500).send({ success: false, error: error.message });
  }
};