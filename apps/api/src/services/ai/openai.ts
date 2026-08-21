import { getSecret } from '../secrets/awsSecretsManager.js';

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const HIGHLIGHT_MODEL = 'gpt-5-mini';
const BATCH_SIZE = 64;
const MAX_TRANSCRIPT_CHARS = 12_000;
const MAX_SUMMARY_CHARS = 280;
const MAX_TAGS = 8;
const MIN_TAGS = 3;
const MAX_TAG_LENGTH = 40;

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
  error?: { message?: string };
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const apiKey = await getSecret('OPENAI_API_KEY');
  const results: number[][] = new Array(texts.length);

  for (let offset = 0; offset < texts.length; offset += BATCH_SIZE) {
    const batch = texts.slice(offset, offset + BATCH_SIZE);
    const res = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        dimensions: 1536,
        input: batch,
      }),
    });

    const body = (await res.json().catch(() => null)) as OpenAIEmbeddingResponse | null;
    if (!res.ok) {
      const message = body?.error?.message || res.statusText;
      throw new Error(`OpenAI embeddings ${res.status}: ${message}`);
    }

    const rows = [...(body?.data || [])].sort((a, b) => (a.index || 0) - (b.index || 0));
    if (rows.length !== batch.length) {
      throw new Error('OpenAI embeddings response length mismatch');
    }

    rows.forEach((row, i) => {
      const vector = row.embedding;
      if (!vector || vector.length === 0) {
        throw new Error('OpenAI embeddings returned an empty vector');
      }
      results[offset + i] = vector;
    });
  }

  return results;
}

export function toPgVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = item
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-_/]/g, '')
      .slice(0, MAX_TAG_LENGTH);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

function parseHighlightsJson(content: string): { summary: string; tags: string[] } {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1]?.trim() || trimmed;
  const parsed = JSON.parse(jsonText) as { summary?: unknown; tags?: unknown };
  const summary =
    typeof parsed.summary === 'string'
      ? parsed.summary.trim().slice(0, MAX_SUMMARY_CHARS)
      : '';
  const tags = normalizeTags(parsed.tags);
  if (!summary) {
    throw new Error('OpenAI highlights response missing summary');
  }
  if (tags.length < MIN_TAGS) {
    throw new Error('OpenAI highlights response returned too few tags');
  }
  return { summary, tags };
}

export async function generateHighlights(input: {
  transcript: string;
  sceneLabels?: string[];
}): Promise<{ summary: string; tags: string[] }> {
  const transcript = (input.transcript || '').trim().slice(0, MAX_TRANSCRIPT_CHARS);
  if (!transcript) {
    throw new Error('Transcript is empty; cannot generate highlights');
  }

  const sceneLabels = (input.sceneLabels || [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

  const apiKey = await getSecret('OPENAI_API_KEY');
  const system = [
    'You generate media library highlights for a professional MAM system.',
    'Return ONLY valid JSON with keys "summary" and "tags".',
    `summary: 1-2 sentences, max ${MAX_SUMMARY_CHARS} characters, factual, no PII speculation.`,
    `tags: ${MIN_TAGS}-${MAX_TAGS} lowercase kebab-case or single-word topic tags from spoken content.`,
    'Do not invent people identities. Prefer concrete topics, places, activities, and themes.',
  ].join(' ');

  const userParts = [`Transcript:\n${transcript}`];
  if (sceneLabels.length > 0) {
    userParts.push(`Optional scene labels:\n${sceneLabels.join(', ')}`);
  }

  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: HIGHLIGHT_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userParts.join('\n\n') },
      ],
    }),
  });

  const body = (await res.json().catch(() => null)) as OpenAIChatResponse | null;
  if (!res.ok) {
    const message = body?.error?.message || res.statusText;
    throw new Error(`OpenAI highlights ${res.status}: ${message}`);
  }

  const content = body?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI highlights returned empty content');
  }

  return parseHighlightsJson(content);
}
