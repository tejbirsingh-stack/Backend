'use strict';

/**
 * sendgridConfig.js — Central SendGrid / Email credential resolver
 *
 * Fetches from AWS Secrets Manager (noah/uat/app-config-all):
 *  - apiKey: parsed.email_crm.sendgrid_key
 *  - fromEmail: parsed.app_config.smtp_from_email
 *  - fromName: parsed.app_config.smtp_from_name || 'Noah Platform'
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
    const emailCrm = parsed.email_crm || {};
    const appConfig = parsed.app_config || {};

    const sendgridKey = emailCrm.sendgrid_key || process.env.SENDGRID_API_KEY || null;
    const fromEmail = appConfig.smtp_from_email || process.env.SMTP_FROM_EMAIL || process.env.EMAIL_FROM || 'noreply@noah-dev.local';
    const fromName = appConfig.smtp_from_name || process.env.SMTP_FROM_NAME || 'Noah Platform';

    return {
      apiKey: sendgridKey ? String(sendgridKey).replace(/^["']|["']$/g, '').trim() : null,
      fromEmail: fromEmail ? String(fromEmail).replace(/^["']|["']$/g, '').trim() : 'noreply@noah-dev.local',
      fromName: fromName ? String(fromName).replace(/^["']|["']$/g, '').trim() : 'Noah Platform',
    };
  } catch (err) {
    console.warn(`[sendgridConfig] AWS Secrets Manager fetch failed (${err.message}). Falling back to .env.`);
    const rawKey = process.env.SENDGRID_API_KEY;
    const rawEmail = process.env.SMTP_FROM_EMAIL || process.env.EMAIL_FROM || 'noreply@noah-dev.local';
    const rawName = process.env.SMTP_FROM_NAME || 'Noah Platform';
    return {
      apiKey: rawKey ? String(rawKey).replace(/^["']|["']$/g, '').trim() : null,
      fromEmail: rawEmail ? String(rawEmail).replace(/^["']|["']$/g, '').trim() : 'noreply@noah-dev.local',
      fromName: rawName ? String(rawName).replace(/^["']|["']$/g, '').trim() : 'Noah Platform',
    };
  }
}

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * Returns SendGrid and SMTP email configuration. Cached for 5 minutes.
 * Reads directly from AWS Secrets Manager.
 *
 * @returns {Promise<{apiKey: string|null, fromEmail: string, fromName: string}>}
 */
async function getSendgridConfig() {
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
function invalidateSendgridCache() {
  _cachedConfig = null;
  _cacheExpiresAt = 0;
}

module.exports = { getSendgridConfig, invalidateSendgridCache };
