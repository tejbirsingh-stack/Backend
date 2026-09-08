const crypto = require('crypto');

/**
 * Generate a signed URL for media streaming
 * @param {string} assetId - The asset ID
 * @param {number} expiresInMinutes - URL expiration time in minutes (default: 5)
 * @param {string} secret - Secret key for signing (default: JWT_SECRET from env)
 * @returns {string} Signed URL with signature and expiration
 */
function generateSignedUrl(assetId, expiresInMinutes = 5, secret = process.env.JWT_SECRET) {
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required for signed URLs');
  }

  const expiresAt = Math.floor(Date.now() / 1000) + (expiresInMinutes * 60);
  const data = `${assetId}:${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');

  return `/api/media/${encodeURIComponent(assetId)}/stream?expires=${expiresAt}&signature=${signature}`;
}

/**
 * Verify a signed URL
 * @param {string} assetId - The asset ID from the URL
 * @param {string} expiresAt - Expiration timestamp from the URL
 * @param {string} signature - Signature from the URL
 * @param {string} secret - Secret key for verification (default: JWT_SECRET from env)
 * @returns {boolean} True if signature is valid and not expired
 */
function verifySignedUrl(assetId, expiresAt, signature, secret = process.env.JWT_SECRET) {
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required for signed URL verification');
  }

  // Check if URL has expired
  const now = Math.floor(Date.now() / 1000);
  if (now > parseInt(expiresAt)) {
    return false;
  }

  // Verify signature
  const data = `${assetId}:${expiresAt}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

module.exports = {
  generateSignedUrl,
  verifySignedUrl
};
