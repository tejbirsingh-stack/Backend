import { Prisma, PrismaClient } from '@prisma/client';
import { embedTexts, toPgVectorLiteral } from './openai.js';

export type AiSearchHit = {
  assetId: string;
  score: number;
  matchType: 'semantic' | 'transcript' | 'title';
  startMs?: number;
  endMs?: number;
  snippet?: string;
  createdAt?: Date;
};

type HybridSearchParams = {
  prisma: PrismaClient;
  orgId: string;
  q: string;
  page: number;
  pageSize: number;
};

async function searchByTitle(prisma: PrismaClient, orgId: string, q: string): Promise<AiSearchHit[]> {
  const assets = await prisma.asset.findMany({
    where: {
      orgId,
      status: 'active',
      title: { contains: q, mode: 'insensitive' },
    },
    select: { id: true, title: true, createdAt: true },
    take: 50,
  });
  return assets.map((a) => ({
    assetId: a.id,
    score: 1,
    matchType: 'title' as const,
    snippet: a.title,
    createdAt: a.createdAt,
  }));
}

async function searchByTranscript(prisma: PrismaClient, orgId: string, q: string): Promise<AiSearchHit[]> {
  const segments = await prisma.aiTranscriptSegment.findMany({
    where: {
      orgId,
      text: { contains: q, mode: 'insensitive' },
    },
    orderBy: { startMs: 'asc' },
    take: 50,
    select: { assetId: true, text: true, startMs: true, endMs: true },
  });
  return segments.map((s) => ({
    assetId: s.assetId,
    score: 1,
    matchType: 'transcript' as const,
    startMs: s.startMs,
    endMs: s.endMs,
    snippet: s.text,
  }));
}

async function searchByEmbedding(prisma: PrismaClient, orgId: string, q: string): Promise<AiSearchHit[]> {
  try {
    const [vector] = await embedTexts([q]);
    if (!vector) return [];
    const literal = toPgVectorLiteral(vector);
    const vectorSql = Prisma.raw(`'${literal}'::vector`);
    const rows = await prisma.$queryRaw<
      Array<{ asset_id: string; chunk_text: string; start_ms: number | null; end_ms: number | null; score: number }>
    >(Prisma.sql`
      SELECT
        "assetId"::text AS asset_id,
        chunk_text,
        start_ms,
        end_ms,
        (1 - (embedding <=> ${vectorSql}))::float AS score
      FROM "ai_embeddings"
      WHERE "orgId" = ${orgId}::uuid
      ORDER BY embedding <=> ${vectorSql}
      LIMIT 50
    `);
    return rows
      .filter((row) => Number(row.score) >= 0.25)
      .map((row) => ({
        assetId: row.asset_id,
        score: Number(row.score) || 0,
        matchType: 'semantic' as const,
        startMs: row.start_ms ?? undefined,
        endMs: row.end_ms ?? undefined,
        snippet: row.chunk_text,
      }));
  } catch (err) {
    console.warn('[AI] semantic search unavailable:', err instanceof Error ? err.message : err);
    return [];
  }
}

function mergeAndRank(hits: AiSearchHit[], page: number, pageSize: number): {
  items: AiSearchHit[];
  total: number;
} {
  const byAsset = new Map<string, AiSearchHit & { keyword: number; vector: number }>();

  for (const hit of hits) {
    const current = byAsset.get(hit.assetId) || {
      assetId: hit.assetId,
      score: 0,
      matchType: hit.matchType,
      keyword: 0,
      vector: 0,
      createdAt: hit.createdAt,
    };
    if (hit.matchType === 'semantic') {
      current.vector = Math.max(current.vector, hit.score);
      if (!current.snippet) {
        current.snippet = hit.snippet;
        current.startMs = hit.startMs;
        current.endMs = hit.endMs;
      }
      if (current.matchType === 'title') {
        current.matchType = 'semantic';
        current.snippet = hit.snippet;
        current.startMs = hit.startMs;
        current.endMs = hit.endMs;
      }
    } else {
      current.keyword = 1;
      if (hit.matchType === 'transcript' && current.matchType !== 'semantic') {
        current.matchType = 'transcript';
        current.snippet = hit.snippet;
        current.startMs = hit.startMs;
        current.endMs = hit.endMs;
      }
    }
    if (hit.createdAt && (!current.createdAt || hit.createdAt > current.createdAt)) {
      current.createdAt = hit.createdAt;
    }
    byAsset.set(hit.assetId, current);
  }

  const ranked = [...byAsset.values()]
    .map((row) => ({
      assetId: row.assetId,
      score: 0.7 * row.vector + 0.3 * row.keyword,
      matchType: row.matchType,
      startMs: row.startMs,
      endMs: row.endMs,
      snippet: row.snippet,
      createdAt: row.createdAt,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = a.createdAt?.getTime() || 0;
      const bTime = b.createdAt?.getTime() || 0;
      return bTime - aTime;
    });

  const start = (page - 1) * pageSize;
  return {
    items: ranked.slice(start, start + pageSize),
    total: ranked.length,
  };
}

export async function hybridSearch(params: HybridSearchParams): Promise<{
  items: AiSearchHit[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const { prisma, orgId, q, page, pageSize } = params;
  const [titleHits, transcriptHits, semanticHits] = await Promise.all([
    searchByTitle(prisma, orgId, q).catch(() => [] as AiSearchHit[]),
    searchByTranscript(prisma, orgId, q).catch(() => [] as AiSearchHit[]),
    searchByEmbedding(prisma, orgId, q),
  ]);
  const merged = mergeAndRank([...titleHits, ...transcriptHits, ...semanticHits], page, pageSize);
  const ids = merged.items.map((item) => item.assetId);
  if (ids.length > 0) {
    const assets = await prisma.asset.findMany({
      where: { id: { in: ids }, orgId },
      select: { id: true, createdAt: true },
    });
    const createdAtById = new Map(assets.map((a) => [a.id, a.createdAt]));
    merged.items = merged.items.filter((item) => createdAtById.has(item.assetId));
    for (const item of merged.items) {
      item.createdAt = createdAtById.get(item.assetId);
    }
    merged.items.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
    });
  }
  return { items: merged.items, total: merged.total, page, pageSize };
}
