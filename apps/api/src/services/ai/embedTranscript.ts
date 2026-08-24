import { Prisma, PrismaClient } from '@prisma/client';
import { embedTexts, toPgVectorLiteral } from './openai.js';

export type TranscriptChunk = {
  text: string;
  startMs: number;
  endMs: number;
};

const TARGET_CHARS = 600;

export function chunkTranscriptSegments(
  segments: Array<{ text: string; startMs: number; endMs: number }>,
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let buffer = '';
  let startMs = 0;
  let endMs = 0;

  for (const segment of segments) {
    const piece = segment.text.trim();
    if (!piece) continue;
    if (!buffer) {
      buffer = piece;
      startMs = segment.startMs;
      endMs = segment.endMs;
      continue;
    }
    if (buffer.length + 1 + piece.length > TARGET_CHARS) {
      chunks.push({ text: buffer, startMs, endMs });
      buffer = piece;
      startMs = segment.startMs;
      endMs = segment.endMs;
    } else {
      buffer = `${buffer} ${piece}`;
      endMs = segment.endMs;
    }
  }

  if (buffer) {
    chunks.push({ text: buffer, startMs, endMs });
  }

  return chunks;
}

export async function replaceAssetEmbeddings(
  prisma: PrismaClient,
  params: {
    assetId: string;
    orgId: string;
    sourceType: string;
    chunks: TranscriptChunk[];
    vectors: number[][];
  },
): Promise<void> {
  const { assetId, orgId, sourceType, chunks, vectors } = params;
  if (chunks.length !== vectors.length) {
    throw new Error('Embedding count does not match chunk count');
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`DELETE FROM "ai_embeddings" WHERE "assetId" = ${assetId}::uuid`,
    );
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      const literal = toPgVectorLiteral(vectors[i]);
      await tx.$executeRaw(
        Prisma.sql`
          INSERT INTO "ai_embeddings" ("assetId", "orgId", source_type, chunk_text, start_ms, end_ms, embedding)
          VALUES (
            ${assetId}::uuid,
            ${orgId}::uuid,
            ${sourceType},
            ${chunk.text},
            ${chunk.startMs},
            ${chunk.endMs},
            ${Prisma.raw(`'${literal}'::vector`)}
          )
        `,
      );
    }
  });
}

export async function embedTranscriptForAsset(
  prisma: PrismaClient,
  assetId: string,
  orgId: string,
  force: boolean,
): Promise<'completed' | 'skipped'> {
  const existing = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM "ai_embeddings" WHERE "assetId" = ${assetId}::uuid
  `;
  if (!force && Number(existing[0]?.count || 0) > 0) {
    return 'skipped';
  }

  const segments = await prisma.aiTranscriptSegment.findMany({
    where: { assetId },
    orderBy: { ordinal: 'asc' },
    select: { text: true, startMs: true, endMs: true },
  });
  const chunks = chunkTranscriptSegments(segments);
  if (chunks.length === 0) {
    return 'skipped';
  }

  const vectors = await embedTexts(chunks.map((c) => c.text));
  await replaceAssetEmbeddings(prisma, {
    assetId,
    orgId,
    sourceType: 'transcript',
    chunks,
    vectors,
  });
  return 'completed';
}
