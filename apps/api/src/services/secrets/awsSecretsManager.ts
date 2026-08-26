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

  const secretId = process.env.AWS_AI_SECRET_ID;
  if (!secretsManagerEnabled() || !secretId) {
    return {};
  }

  try {
    const out = await getClient().send(new GetSecretValueCommand({ SecretId: secretId }));
    const raw = out.SecretString;
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, string>;
    bundleCache = { data: parsed, expiresAt: Date.now() + TTL_MS };
    return parsed;
  } catch {
    console.warn('[Secrets] AWS Secrets Manager unavailable; using process.env fallback');
    return {};
  }
}

/** Logical keys: ASSEMBLY_API_KEY, OPENAI_API_KEY. Env wins when set (local keys already in .env). */
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
