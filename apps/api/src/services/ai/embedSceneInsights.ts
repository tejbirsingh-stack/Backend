import { PrismaClient } from '@prisma/client';
import { embedTexts } from './openai.js';
import { replaceAssetEmbeddings } from './embedTranscript.js';

export async function embedSceneInsightsForAsset(
  prisma: PrismaClient,
  assetId: string,
  orgId: string,
  force: boolean,
): Promise<'completed' | 'skipped'> {
  if (!force) {
    const existing = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "ai_embeddings"
      WHERE "assetId" = ${assetId}::uuid AND source_type = 'scene'
    `;
    if (Number(existing[0]?.count || 0) > 0) {
      return 'skipped';
    }
  }

  const insights = await prisma.aiSceneInsight.findMany({
    where: { assetId, orgId },
    orderBy: { ordinal: 'asc' },
    select: { label: true, description: true, startMs: true, endMs: true },
  });

  const chunks = insights
    .map((row) => {
      const text = (row.description || row.label || '').trim();
      if (!text) return null;
      return { text, startMs: row.startMs, endMs: row.endMs };
    })
    .filter((c): c is { text: string; startMs: number; endMs: number } => Boolean(c));

  if (chunks.length === 0) {
    return 'skipped';
  }

  // Deduplicate identical labels to limit embedding cost
  const seen = new Set<string>();
  const uniqueChunks = chunks.filter((c) => {
    const key = c.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const vectors = await embedTexts(uniqueChunks.map((c) => c.text));
  await replaceAssetEmbeddings(prisma, {
    assetId,
    orgId,
    sourceType: 'scene',
    chunks: uniqueChunks,
    vectors,
  });
  return 'completed';
}
