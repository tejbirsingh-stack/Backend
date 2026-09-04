'use strict';

/**
 * hubspotConfig.js — Central HubSpot credential resolver
 *
 * Always fetches from AWS Secrets Manager (noah/uat/app-config-all).
 * HubSpot credentials live under the "email_crm" key:
 *   { hubspot_portal_id, hubspot_form_id, hubspot_token }
 *
 * No local .env fallback — HubSpot is only needed in non-local environments.
 * If Secrets Manager is unreachable, returns nulls so callers can skip the sync gracefully.
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
  const secretId = process.env.AWS_APP_SECRET_ID || process.env.AWS_UAT_SECRET_ID || 'noah/uat/app-config-all';

  try {
    const response = await getAwsClient().send(
      new GetSecretValueCommand({ SecretId: secretId })
    );

    if (!response.SecretString) {
      throw new Error('SecretString is empty');
    }

    const parsed = JSON.parse(response.SecretString);
    const crm = parsed.email_crm;

    if (!crm) {
      throw new Error(`"email_crm" block missing in secret ${secretId}`);
    }

    return {
      portalId:    crm.hubspot_portal_id  || null,
      formId:      crm.hubspot_form_id    || null,
      accessToken: crm.hubspot_token      || null,
      // Demo-specific form (platform landing page)
      demoFormId:  crm.hubspot_demo_form_id || crm.hubspot_form_id || null,
    };
  } catch (err) {
    console.warn(`[hubspotConfig] AWS Secrets Manager fetch failed (${err.message}). HubSpot sync will be skipped.`);
    return { portalId: null, formId: null, accessToken: null, demoFormId: null };
  }
}

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * Returns HubSpot credentials. Cached for 5 minutes.
 * Always reads from AWS Secrets Manager — no .env fallback.
 *
 * @returns {Promise<{portalId: string|null, formId: string|null, accessToken: string|null, demoFormId: string|null}>}
 */
async function getHubspotConfig() {
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
 * Invalidates the cached config. Useful in tests.
 */
function invalidateHubspotCache() {
  _cachedConfig = null;
  _cacheExpiresAt = 0;
}

module.exports = { getHubspotConfig, invalidateHubspotCache };
