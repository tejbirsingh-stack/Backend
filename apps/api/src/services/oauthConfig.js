'use strict';

/**
 * oauthConfig.js — Central OAuth (Google & Microsoft) credential resolver
 *
 * Always fetches from AWS Secrets Manager (noah/uat/app-config-all).
 * OAuth credentials live under the "oauth" key:
 *   { google_client_id, google_client_secret, microsoft_client_id, microsoft_client_secret, microsoft_tenant_id }
 *
 * Cached for 5 minutes per process.
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// ─── Cache ────────────────────────────────────────────────────────────────────
const TTL_MS = 5 * 60 * 1000; // 5 minutes
let _cachedConfig = null;
let _cacheExpiresAt = 0;

// ─── AWS client (shared singleton) ───────────────────────────────────────────
let _awsClient = null;
function getAwsClient() {
  if (!_awsClient) {
    _awsClient = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-2',
    });
  }
  return _awsClient;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function fetchFromSecretsManager() {
  const secretId = process.env.AWS_UAT_SECRET_ID || 'noah/uat/app-config-all';

  try {
    const response = await getAwsClient().send(
      new GetSecretValueCommand({ SecretId: secretId })
    );

    if (!response.SecretString) {
      throw new Error('SecretString is empty');
    }

    const parsed = JSON.parse(response.SecretString);
    const oauth = parsed.oauth || {};

    return {
      googleClientId: oauth.google_client_id || process.env.GOOGLE_CLIENT_ID || '',
      googleClientSecret: oauth.google_client_secret || process.env.GOOGLE_CLIENT_SECRET || '',
      microsoftClientId: oauth.microsoft_client_id || process.env.MICROSOFT_CLIENT_ID || '',
      microsoftClientSecret: oauth.microsoft_client_secret || process.env.MICROSOFT_CLIENT_SECRET || '',
      microsoftTenantId: oauth.microsoft_tenant_id || process.env.MICROSOFT_TENANT_ID || '',
    };
  } catch (err) {
    console.warn(`[oauthConfig] AWS Secrets Manager fetch failed (${err.message}). Falling back to .env.`);
    return {
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      microsoftClientId: process.env.MICROSOFT_CLIENT_ID || '',
      microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
      microsoftTenantId: process.env.MICROSOFT_TENANT_ID || '',
    };
  }
}

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * Returns OAuth credentials. Cached for 5 minutes.
 * Reads directly from AWS Secrets Manager.
 *
 * @returns {Promise<{googleClientId: string, googleClientSecret: string, microsoftClientId: string, microsoftClientSecret: string, microsoftTenantId: string}>}
 */
async function getOauthConfig() {
  if (_cachedConfig && Date.now() < _cacheExpiresAt) {
    return _cachedConfig;
  }

  const config = await fetchFromSecretsManager();
  _cachedConfig = config;
  _cacheExpiresAt = Date.now() + TTL_MS;
  return config;
}

/**
 * Invalidates cached configuration.
 */
function invalidateOauthCache() {
  _cachedConfig = null;
  _cacheExpiresAt = 0;
}

module.exports = { getOauthConfig, invalidateOauthCache };
