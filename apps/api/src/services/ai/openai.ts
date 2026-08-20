import { getSecret } from '../secrets/awsSecretsManager.js';

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 64;

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
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
