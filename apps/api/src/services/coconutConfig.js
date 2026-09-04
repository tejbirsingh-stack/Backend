'use strict';

/**
 * coconutConfig.js — Central Coconut API credential resolver
 *
 * Always fetches from AWS Secrets Manager (noah/uat/app-config-all).
 * Coconut credentials live under the "misc" key:
 *   { coconut_api_key }
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
    const misc = parsed.misc || {};

    return {
      apiKey: misc.coconut_api_key || process.env.COCONUT_API_KEY || '',
      maxDurationSeconds: Number(process.env.COCONUT_MAX_DURATION_SECONDS || 60),
    };
  } catch (err) {
    console.warn(`[coconutConfig] AWS Secrets Manager fetch failed (${err.message}). Falling back to .env.`);
    return {
      apiKey: process.env.COCONUT_API_KEY || '',
      maxDurationSeconds: Number(process.env.COCONUT_MAX_DURATION_SECONDS || 60),
    };
  }
}

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * Returns Coconut API configuration. Cached for 5 minutes.
 * Reads directly from AWS Secrets Manager.
 *
 * @returns {Promise<{apiKey: string, maxDurationSeconds: number}>}
 */
async function getCoconutConfig() {
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
function invalidateCoconutCache() {
  _cachedConfig = null;
  _cacheExpiresAt = 0;
}

module.exports = { getCoconutConfig, invalidateCoconutCache };
