'use strict';

/**
 * stripeConfig.js — Central Stripe credential & secret resolver
 *
 * Always fetches from AWS Secrets Manager (noah/uat/app-config-all).
 * Stripe credentials live under the "stripe" key:
 *   { secret_key, publishable_key, stripe_webhook_secret, ... }
 *
 * Cached for 5 minutes per process.
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// ─── Cache ────────────────────────────────────────────────────────────────────
const TTL_MS = 5 * 60 * 1000; // 5 minutes
let _cachedConfig = null;
let _cacheExpiresAt = 0; // starts expired so first call always fetches fresh


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
    const stripe = parsed.stripe || {};

    const secretKey = stripe.secret_key || process.env.STRIPE_SECRET_KEY || process.env.TEST_STRIPE_SECRET_KEY || '';
    const publishableKey = stripe.publishable_key || process.env.VITE_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '';
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || stripe.stripe_webhook_secret || '';

    return {
      secretKey,
      publishableKey,
      webhookSecret,
      priceIds: {
        basicMonthly: stripe.basic_monthly_price_id || '',
        basicYearly: stripe.basic_yearly_price_id || '',
        premiumMonthly: stripe.premium_monthly_price_id || '',
        premiumYearly: stripe.premium_yearly_price_id || '',
        enterpriseMonthly: stripe.enterprise_monthly_price_id || '',
        enterpriseYearly: stripe.enterprise_yearly_price_id || '',
      }
    };
  } catch (err) {
    console.warn(`[stripeConfig] AWS Secrets Manager fetch failed (${err.message}). Falling back to .env.`);
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

    return {
      secretKey: process.env.STRIPE_SECRET_KEY || process.env.TEST_STRIPE_SECRET_KEY || '',
      publishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '',
      webhookSecret,
      priceIds: {}
    };
  }
}

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * Returns Stripe credentials. Cached for 5 minutes.
 * Reads directly from AWS Secrets Manager.
 *
 * @returns {Promise<{secretKey: string, publishableKey: string, webhookSecret: string, qaWebhookSecret: string, localWebhookSecret: string, priceIds: object}>}
 */
async function getStripeConfig() {
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
function invalidateStripeCache() {
  _cachedConfig = null;
  _cacheExpiresAt = 0;
}

module.exports = { getStripeConfig, invalidateStripeCache };
