'use strict';

/**
 * b2Config.js — Central B2 (Backblaze) credential resolver
 *
 * Resolution strategy:
 *  - All environments                   → fetch from AWS Secrets Manager
 *                                         secret: process.env.AWS_UAT_SECRET_ID (noah/uat/app-config-all)
 *                                         key inside secret: "b2"
 *  - Secrets Manager unreachable        → fall back to .env B2_* vars with a warning
 *
 * The resolved config object shape matches what B2StorageService constructor expects:
 *   { keyId, applicationKey, bucketName, endpoint, region }
 *
 * getB2Storage(B2StorageService) returns a lazily-initialized, cached singleton instance
 * of B2StorageService so all controllers share one connection per process.
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// ─── Cache ────────────────────────────────────────────────────────────────────
const TTL_MS = 5 * 60 * 1000; // 5 minutes
let _cachedConfig = null;
let _cacheExpiresAt = 0;

// Lazy singleton B2StorageService instance
let _b2StorageInstance = null;
let _b2StoragePromise = null;

// ─── AWS client (created once) ────────────────────────────────────────────────
let _awsClient = null;
function getAwsClient() {
  if (!_awsClient) {
    _awsClient = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-2',
      // On EC2/ECS the role provides credentials automatically.
      // Locally, AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY from .env are picked up by the SDK.
    });
  }
  return _awsClient;
}

// ─── Env-var fallback (local dev or Secrets Manager unavailable) ──────────────
function configFromEnv() {
  return {
    keyId:          process.env.B2_KEY_ID          || process.env.B2_APPLICATION_KEY_ID || '',
    applicationKey: process.env.B2_APPLICATION_KEY || '',
    bucketName:     process.env.B2_BUCKET_NAME     || '',
    endpoint:       process.env.B2_ENDPOINT        || '',
    region:         process.env.B2_REGION          || '',
  };
}

// ─── Secrets Manager fetch ────────────────────────────────────────────────────
async function fetchFromSecretsManager() {
  const secretId = process.env.AWS_UAT_SECRET_ID || 'noah/uat/app-config-all';

  try {
    // Add a 3-second timeout to prevent indefinite hanging if IAM role/network is missing in UAT
    const fetchPromise = getAwsClient().send(
      new GetSecretValueCommand({ SecretId: secretId })
    );
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('AWS Secrets Manager connection timed out')), 3000)
    );
    
    const response = await Promise.race([fetchPromise, timeoutPromise]);

    if (!response.SecretString) {
      throw new Error('SecretString is empty');
    }

    const parsed = JSON.parse(response.SecretString);

    // The UAT secret stores B2 creds under the "b2" key
    const b2 = parsed.b2;
    if (!b2 || !b2.key_id || !b2.app_key) {
      throw new Error(`"b2" key missing or incomplete in secret ${secretId}`);
    }

    return {
      keyId:          b2.key_id,
      applicationKey: b2.app_key,
      bucketName:     b2.bucket   || '',
      endpoint:       b2.endpoint || '',
      region:         b2.region   || '',
    };
  } catch (err) {
    console.warn(`[b2Config] AWS Secrets Manager fetch failed (${err.message}). Falling back to .env B2_* vars.`);
    return configFromEnv();
  }
}

// ─── Public: get resolved B2 config ──────────────────────────────────────────

/**
 * Returns the B2 config object. Cached for 5 minutes.
 *
 * In development: reads directly from .env (no AWS call).
 * In all other envs: fetches from AWS Secrets Manager, falls back to .env on error.
 *
 * @returns {Promise<{keyId: string, applicationKey: string, bucketName: string, endpoint: string, region: string}>}
 */
async function getB2Config() {
  // Return cached value if still valid
  if (_cachedConfig && Date.now() < _cacheExpiresAt) {
    return _cachedConfig;
  }

  const config = await fetchFromSecretsManager();
  _cachedConfig = config;
  _cacheExpiresAt = Date.now() + TTL_MS;
  return config;
}

/**
 * Returns a lazily-initialized, shared B2StorageService singleton.
 * Pass in the B2StorageService constructor (to avoid circular require issues).
 *
 * Usage in a controller:
 *   const { getB2Storage } = require('../services/b2Config');
 *   const B2StorageService = require('../b2-storage.cjs');
 *   ...
 *   const b2 = await getB2Storage(B2StorageService);
 *   await b2.uploadStream(...);
 *
 * @param {Function} B2StorageService - The B2StorageService constructor
 * @returns {Promise<InstanceType<B2StorageService>>}
 */
async function getB2Storage(B2StorageService) {
  if (_b2StorageInstance) {
    return _b2StorageInstance;
  }

  // Deduplicate concurrent first-time calls
  if (_b2StoragePromise) {
    return _b2StoragePromise;
  }

  _b2StoragePromise = getB2Config().then((config) => {
    _b2StorageInstance = new B2StorageService(config);
    _b2StoragePromise = null;
    return _b2StorageInstance;
  });

  return _b2StoragePromise;
}

/**
 * Invalidates the cached config + storage singleton.
 * Useful in tests or if you need to force a credentials refresh.
 */
function invalidateB2Cache() {
  _cachedConfig = null;
  _cacheExpiresAt = 0;
  _b2StorageInstance = null;
  _b2StoragePromise = null;
}

module.exports = { getB2Config, getB2Storage, invalidateB2Cache };
