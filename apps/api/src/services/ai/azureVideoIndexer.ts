import { getSecret } from '../secrets/awsSecretsManager.js';

export type ViPersonAppearance = {
  viFaceId: string;
  displayLabel: string;
  startMs: number;
  endMs: number;
  thumbnailUrl: string | null;
  ordinal: number;
};

export type ViSceneInsight = {
  label: string;
  description: string | null;
  startMs: number;
  endMs: number;
  confidence: number | null;
  ordinal: number;
};

export type ViIndexResult = {
  people: ViPersonAppearance[];
  scenes: ViSceneInsight[];
};

const POLL_MS = 5000;
const MAX_WAIT_MS = 30 * 60 * 1000;

async function getAzureViConfig() {
  const [
    accountId,
    accountName,
    location,
    subscriptionId,
    resourceGroup,
    tenantId,
    clientId,
    clientSecret,
  ] = await Promise.all([
    getSecret('AZURE_VI_ACCOUNT_ID'),
    getSecret('AZURE_VI_ACCOUNT_NAME'),
    getSecret('AZURE_VI_LOCATION'),
    getSecret('AZURE_VI_SUBSCRIPTION_ID'),
    getSecret('AZURE_VI_RESOURCE_GROUP'),
    getSecret('AZURE_VI_TENANT_ID'),
    getSecret('AZURE_VI_CLIENT_ID'),
    getSecret('AZURE_VI_CLIENT_SECRET'),
  ]);

  return {
    accountId,
    accountName,
    location,
    subscriptionId,
    resourceGroup,
    tenantId,
    clientId,
    clientSecret,
  };
}

async function getAadToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://management.azure.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json().catch(() => null)) as { access_token?: string; error_description?: string } | null;
  if (!res.ok || !json?.access_token) {
    throw new Error(`Azure AD token failed: ${json?.error_description || res.statusText}`);
  }
  return json.access_token;
}

async function getViAccessToken(cfg: Awaited<ReturnType<typeof getAzureViConfig>>, aadToken: string): Promise<string> {
  const url =
    `https://management.azure.com/subscriptions/${cfg.subscriptionId}` +
    `/resourceGroups/${cfg.resourceGroup}` +
    `/providers/Microsoft.VideoIndexer/accounts/${cfg.accountName}` +
    `/generateAccessToken?api-version=2024-01-01`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${aadToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ permissionType: 'Contributor', scope: 'Account' }),
  });
  const json = (await res.json().catch(() => null)) as { accessToken?: string; error?: { message?: string } } | null;
  if (!res.ok || !json?.accessToken) {
    throw new Error(`VI access token failed: ${json?.error?.message || res.statusText}`);
  }
  return json.accessToken;
}

function secondsToMs(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 1000);
}

function mapPeople(insights: any, location: string, accountId: string, videoId: string, accessToken: string): ViPersonAppearance[] {
  const faces = Array.isArray(insights?.faces) ? insights.faces : [];
  const people: ViPersonAppearance[] = [];

  faces.forEach((face: any, index: number) => {
    const appearances = Array.isArray(face?.appearances) ? face.appearances : [];
    if (appearances.length === 0) return;

    let startMs = Number.POSITIVE_INFINITY;
    let endMs = 0;
    for (const app of appearances) {
      const s = secondsToMs(app?.startSeconds ?? app?.start);
      const e = secondsToMs(app?.endSeconds ?? app?.end ?? app?.startSeconds ?? app?.start);
      startMs = Math.min(startMs, s);
      endMs = Math.max(endMs, e);
    }
    if (!Number.isFinite(startMs)) startMs = 0;

    const rawName = String(face?.name || '').trim();
    const unknown = !rawName || /^unknown$/i.test(rawName);
    const displayLabel = unknown ? `Person ${index + 1}` : rawName;
    const viFaceId = face?.id != null ? String(face.id) : `face-${index}`;
    const thumbnailId = face?.thumbnailId ? String(face.thumbnailId) : null;
    const thumbnailUrl = thumbnailId
      ? `https://api.videoindexer.ai/${location}/Accounts/${accountId}/Videos/${videoId}/Thumbnails/${thumbnailId}?accessToken=${encodeURIComponent(accessToken)}`
      : null;

    people.push({
      viFaceId,
      displayLabel,
      startMs,
      endMs: Math.max(endMs, startMs),
      thumbnailUrl,
      ordinal: index,
    });
  });

  return people;
}

function mapScenes(insights: any): ViSceneInsight[] {
  const scenes: ViSceneInsight[] = [];
  let ordinal = 0;

  const viScenes = Array.isArray(insights?.scenes) ? insights.scenes : [];
  for (const scene of viScenes) {
    const startMs = secondsToMs(scene?.startSeconds ?? scene?.start);
    const endMs = secondsToMs(scene?.endSeconds ?? scene?.end ?? scene?.startSeconds ?? scene?.start);
    scenes.push({
      label: `Scene ${ordinal + 1}`,
      description: null,
      startMs,
      endMs: Math.max(endMs, startMs),
      confidence: null,
      ordinal: ordinal++,
    });
  }

  const labels = Array.isArray(insights?.labels) ? insights.labels : [];
  for (const label of labels) {
    const name = String(label?.name || '').trim();
    if (!name) continue;
    const appearances = Array.isArray(label?.appearances) ? label.appearances : [];
    if (appearances.length === 0) {
      scenes.push({
        label: name,
        description: name,
        startMs: 0,
        endMs: 0,
        confidence: typeof label?.confidence === 'number' ? label.confidence : null,
        ordinal: ordinal++,
      });
      continue;
    }
    for (const app of appearances.slice(0, 3)) {
      const startMs = secondsToMs(app?.startSeconds ?? app?.start);
      const endMs = secondsToMs(app?.endSeconds ?? app?.end ?? app?.startSeconds ?? app?.start);
      const confidence =
        typeof app?.confidence === 'number'
          ? app.confidence
          : typeof label?.confidence === 'number'
            ? label.confidence
            : null;
      scenes.push({
        label: name,
        description: name,
        startMs,
        endMs: Math.max(endMs, startMs),
        confidence,
        ordinal: ordinal++,
      });
    }
  }

  return scenes;
}

/**
 * Index a proxy media URL with Azure AI Video Indexer and map faces + scenes.
 * Does not persist face vectors / biometric templates.
 */
export async function indexProxyWithVideoIndexer(proxyUrl: string, videoName: string): Promise<ViIndexResult> {
  const cfg = await getAzureViConfig();
  const aadToken = await getAadToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  const accessToken = await getViAccessToken(cfg, aadToken);

  const uploadParams = new URLSearchParams({
    name: videoName.slice(0, 80) || 'noah-asset',
    videoUrl: proxyUrl,
    indexingPreset: 'Default',
    privacy: 'Private',
    accessToken,
  });

  const uploadUrl =
    `https://api.videoindexer.ai/${cfg.location}/Accounts/${cfg.accountId}/Videos?${uploadParams.toString()}`;

  const uploadRes = await fetch(uploadUrl, { method: 'POST' });
  const uploaded = (await uploadRes.json().catch(() => null)) as { id?: string; ErrorType?: string; Message?: string } | null;
  if (!uploadRes.ok || !uploaded?.id) {
    throw new Error(`VI upload failed: ${uploaded?.Message || uploaded?.ErrorType || uploadRes.statusText}`);
  }
  const videoId = uploaded.id;

  const started = Date.now();
  let state = 'Uploaded';
  while (Date.now() - started < MAX_WAIT_MS) {
    const stateParams = new URLSearchParams({ accessToken });
    const stateUrl =
      `https://api.videoindexer.ai/${cfg.location}/Accounts/${cfg.accountId}/Videos/${videoId}/Index` +
      `?${stateParams.toString()}`;
    const stateRes = await fetch(stateUrl);
    const indexJson = (await stateRes.json().catch(() => null)) as any;
    if (!stateRes.ok) {
      throw new Error(`VI index poll failed: ${indexJson?.Message || stateRes.statusText}`);
    }

    state = String(indexJson?.state || indexJson?.videos?.[0]?.state || '');
    if (state === 'Processed') {
      const insights = indexJson?.videos?.[0]?.insights || indexJson?.insights || {};
      return {
        people: mapPeople(insights, cfg.location, cfg.accountId, videoId, accessToken),
        scenes: mapScenes(insights),
      };
    }
    if (state === 'Failed') {
      throw new Error(`VI indexing failed for video ${videoId}`);
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  throw new Error(`VI indexing timed out (last state=${state})`);
}
