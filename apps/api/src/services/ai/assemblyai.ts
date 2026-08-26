import { getSecret } from '../secrets/awsSecretsManager.js';

export interface TranscriptSegmentInput {
  text: string;
  startMs: number;
  endMs: number;
  ordinal: number;
}

const ASSEMBLYAI_BASE = 'https://api.assemblyai.com/v2';
const POLL_MS = 2000;
const MAX_WAIT_MS = 15 * 60 * 1000;

interface AssemblyWord {
  text?: string;
  start?: number;
  end?: number;
}

interface AssemblyUtterance {
  text?: string;
  start?: number;
  end?: number;
}

interface AssemblyTranscript {
  id: string;
  status: string;
  error?: string;
  text?: string | null;
  words?: AssemblyWord[] | null;
  utterances?: AssemblyUtterance[] | null;
}

async function assemblyFetch(path: string, apiKey: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${ASSEMBLYAI_BASE}${path}`, {
    ...init,
    headers: {
      authorization: apiKey,
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!res.ok) {
    const message = body?.error || body?.message || res.statusText;
    throw new Error(`AssemblyAI ${res.status}: ${message}`);
  }
  return body;
}

function mapUtterances(utterances: AssemblyUtterance[]): TranscriptSegmentInput[] {
  return utterances
    .filter((u) => (u.text || '').trim())
    .map((u, i) => ({
      text: String(u.text).trim(),
      startMs: Math.max(0, Math.round(u.start || 0)),
      endMs: Math.max(0, Math.round(u.end || u.start || 0)),
      ordinal: i,
    }));
}

function mapWordsToSegments(words: AssemblyWord[]): TranscriptSegmentInput[] {
  const segments: TranscriptSegmentInput[] = [];
  const chunkSize = 12;
  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize);
    const text = chunk.map((w) => w.text || '').join(' ').trim();
    if (!text) continue;
    segments.push({
      text,
      startMs: Math.max(0, Math.round(chunk[0]?.start || 0)),
      endMs: Math.max(0, Math.round(chunk.at(-1)?.end || chunk[0]?.start || 0)),
      ordinal: segments.length,
    });
  }
  return segments;
}

export async function transcribeProxy(proxyUrl: string): Promise<TranscriptSegmentInput[]> {
  const apiKey = await getSecret('ASSEMBLY_API_KEY');

  let created: AssemblyTranscript;
  try {
    created = await assemblyFetch('/transcript', apiKey, {
      method: 'POST',
      body: JSON.stringify({
        audio_url: proxyUrl,
        speech_model: 'universal-2',
      }),
    });
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (!msg.toLowerCase().includes('speech_model')) {
      throw err;
    }
    created = await assemblyFetch('/transcript', apiKey, {
      method: 'POST',
      body: JSON.stringify({ audio_url: proxyUrl }),
    });
  }

  const started = Date.now();
  let current = created;
  while (current.status === 'queued' || current.status === 'processing') {
    if (Date.now() - started > MAX_WAIT_MS) {
      throw new Error('AssemblyAI transcription timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    current = await assemblyFetch(`/transcript/${created.id}`, apiKey);
  }

  if (current.status === 'error') {
    throw new Error(current.error || 'AssemblyAI transcription failed');
  }

  if (current.utterances && current.utterances.length > 0) {
    return mapUtterances(current.utterances);
  }
  if (current.words && current.words.length > 0) {
    return mapWordsToSegments(current.words);
  }
  const fullText = (current.text || '').trim();
  if (!fullText) {
    return [];
  }
  return [{ text: fullText, startMs: 0, endMs: 0, ordinal: 0 }];
}
