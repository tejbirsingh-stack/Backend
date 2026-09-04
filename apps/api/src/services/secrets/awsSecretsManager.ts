import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

const cache = new Map<string, { value: string; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

let bundleCache: { data: Record<string, string>; expiresAt: number } | null = null;
let client: SecretsManagerClient | null = null;

function secretsManagerEnabled(): boolean {
  return String(process.env.AWS_SECRETS_MANAGER_ENABLED || '').toLowerCase() === 'true';
}

function getClient(): SecretsManagerClient {
  if (!client) {
    client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }
  return client;
}

async function loadBundle(): Promise<Record<string, string>> {
  if (bundleCache && bundleCache.expiresAt > Date.now()) {
    return bundleCache.data;
  }

  if (!secretsManagerEnabled()) {
    return {};
  }

  const bundle: Record<string, string> = {};

  // 1. Try single master secret bundle (AWS_APP_SECRET_ID: noah/uat/app-config-all, noah/prod/app-config-all, etc.)
  const uatSecretId = process.env.AWS_APP_SECRET_ID || process.env.AWS_UAT_SECRET_ID || 'noah/uat/app-config-all';
  try {
    const out = await getClient().send(new GetSecretValueCommand({ SecretId: uatSecretId }));
    if (out.SecretString) {
      const parsed = JSON.parse(out.SecretString);
      if (parsed.ai_credentials) Object.assign(bundle, parsed.ai_credentials);
      if (parsed.azure_vi) Object.assign(bundle, parsed.azure_vi);
      // Top level fallbacks if flat
      if (parsed.ASSEMBLY_API_KEY) bundle.ASSEMBLY_API_KEY = parsed.ASSEMBLY_API_KEY;
      if (parsed.OPENAI_API_KEY) bundle.OPENAI_API_KEY = parsed.OPENAI_API_KEY;
    }
  } catch {
    // Ignore master fetch error, try legacy AI secret
  }

  // 2. Try legacy AI secret (AWS_AI_SECRET_ID: noah/qa/ai/credentials)
  const aiSecretId = process.env.AWS_AI_SECRET_ID;
  if (aiSecretId) {
    try {
      const out = await getClient().send(new GetSecretValueCommand({ SecretId: aiSecretId }));
      if (out.SecretString) {
        const parsed = JSON.parse(out.SecretString) as Record<string, string>;
        Object.assign(bundle, parsed);
      }
    } catch {
      // Ignore legacy fetch error
    }
  }

  bundleCache = { data: bundle, expiresAt: Date.now() + TTL_MS };
  return bundle;
}

/** Logical keys: ASSEMBLY_API_KEY, OPENAI_API_KEY, AZURE_VI_*. Env wins when set (local keys already in .env). */
export async function getSecret(logicalKey: string): Promise<string> {
  const hit = cache.get(logicalKey);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value;
  }

  const fromEnv = process.env[logicalKey]?.trim();
  if (fromEnv) {
    cache.set(logicalKey, { value: fromEnv, expiresAt: Date.now() + TTL_MS });
    return fromEnv;
  }

  const bundle = await loadBundle();
  const fromSm = bundle[logicalKey]?.trim();
  if (fromSm) {
    cache.set(logicalKey, { value: fromSm, expiresAt: Date.now() + TTL_MS });
    return fromSm;
  }

  throw new Error(`Secret missing: ${logicalKey}`);
}
