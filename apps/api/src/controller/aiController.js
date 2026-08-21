const { enqueueAiAnalyze, isAiEnabledForOrg } = require('../services/ai/enqueueAiAnalyze');

function orgIdFromUser(request) {
  return request.user?.orgId;
}

async function loadAssetForOrg(prisma, assetId, orgId) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.orgId !== orgId) {
    return null;
  }
  return asset;
}

module.exports.getAiStatus = async function getAiStatus(request, reply) {
  const orgId = orgIdFromUser(request);
  if (!orgId) {
    return reply.status(403).send({ success: false, error: 'No organization attached to user.' });
  }

  const assetId = request.params.id;
  const asset = await loadAssetForOrg(request.server.prisma, assetId, orgId);
  if (!asset) {
    return reply.status(404).send({ success: false, error: 'Media asset not found' });
  }

  const job = await request.server.prisma.aiAnalysisJob.findUnique({
    where: { assetId },
  });

  const aiEnabled = await isAiEnabledForOrg(orgId, request.server.prisma);

  return reply.send({
    success: true,
    assetId,
    status: job?.status || 'idle',
    steps: job?.steps || {},
    error: job?.error || null,
    aiEnabled,
  });
};

module.exports.retryAiAnalyze = async function retryAiAnalyze(request, reply) {
  const orgId = orgIdFromUser(request);
  if (!orgId) {
    return reply.status(403).send({ success: false, error: 'No organization attached to user.' });
  }

  const assetId = request.params.id;
  const force = Boolean(request.body?.force);
  const asset = await loadAssetForOrg(request.server.prisma, assetId, orgId);
  if (!asset) {
    return reply.status(404).send({ success: false, error: 'Media asset not found' });
  }

  if (asset.type !== 'video' && asset.type !== 'audio') {
    return reply.status(400).send({ success: false, error: 'AI transcript is only available for video and audio.' });
  }

  if (!(await isAiEnabledForOrg(orgId, request.server.prisma))) {
    return reply.status(403).send({ success: false, error: 'AI is not enabled for this organization.' });
  }

  await request.server.prisma.aiAnalysisJob.upsert({
    where: { assetId },
    create: { assetId, orgId, status: 'queued', force, steps: { asr: 'queued', highlights: 'queued', embeddings: 'queued' } },
    update: { status: 'queued', force, error: null, steps: { asr: 'queued', highlights: 'queued', embeddings: 'queued' } },
  });

  await enqueueAiAnalyze({ assetId, orgId, force });

  return reply.send({ success: true, assetId, status: 'queued' });
};

module.exports.getTranscript = async function getTranscript(request, reply) {
  const orgId = orgIdFromUser(request);
  if (!orgId) {
    return reply.status(403).send({ success: false, error: 'No organization attached to user.' });
  }

  const assetId = request.params.id;
  const asset = await loadAssetForOrg(request.server.prisma, assetId, orgId);
  if (!asset) {
    return reply.status(404).send({ success: false, error: 'Media asset not found' });
  }

  if (!(await isAiEnabledForOrg(orgId, request.server.prisma))) {
    return reply.send({
      success: true,
      assetId,
      status: 'idle',
      asr: 'idle',
      error: null,
      segments: [],
    });
  }

  const job = await request.server.prisma.aiAnalysisJob.findUnique({
    where: { assetId },
  });

  const segments = await request.server.prisma.aiTranscriptSegment.findMany({
    where: { assetId, orgId },
    orderBy: { ordinal: 'asc' },
    select: { id: true, text: true, startMs: true, endMs: true, ordinal: true },
  });

  const asrStep = job?.steps && typeof job.steps === 'object' ? job.steps.asr : undefined;

  return reply.send({
    success: true,
    assetId,
    status: job?.status || (segments.length ? 'completed' : 'idle'),
    asr: asrStep || (segments.length ? 'completed' : 'idle'),
    error: job?.error || null,
    segments,
  });
};

module.exports.searchTranscript = async function searchTranscript(request, reply) {
  const orgId = orgIdFromUser(request);
  if (!orgId) {
    return reply.status(403).send({ success: false, error: 'No organization attached to user.' });
  }

  const q = String(request.query?.q || '').trim();
  const page = Math.max(1, parseInt(String(request.query?.page || '1'), 10) || 1);
  const pageSize = Math.min(24, Math.max(1, parseInt(String(request.query?.pageSize || '24'), 10) || 24));

  if (!q) {
    return reply.send({ success: true, items: [], total: 0, page, pageSize });
  }

  if (!(await isAiEnabledForOrg(orgId, request.server.prisma))) {
    return reply.send({ success: true, items: [], total: 0, page, pageSize });
  }

  const { hybridSearch } = await import('../services/ai/search.js');
  const result = await hybridSearch({
    prisma: request.server.prisma,
    orgId,
    q,
    page,
    pageSize,
  });

  return reply.send({ success: true, ...result });
};

module.exports.getHighlights = async function getHighlights(request, reply) {
  const orgId = orgIdFromUser(request);
  if (!orgId) {
    return reply.status(403).send({ success: false, error: 'No organization attached to user.' });
  }

  const assetId = request.params.id;
  const asset = await loadAssetForOrg(request.server.prisma, assetId, orgId);
  if (!asset) {
    return reply.status(404).send({ success: false, error: 'Media asset not found' });
  }

  if (!(await isAiEnabledForOrg(orgId, request.server.prisma))) {
    return reply.send({
      success: true,
      assetId,
      status: 'idle',
      summary: null,
      tags: [],
    });
  }

  const job = await request.server.prisma.aiAnalysisJob.findUnique({
    where: { assetId },
  });
  const highlight = await request.server.prisma.aiHighlight.findUnique({
    where: { assetId },
    select: { summary: true, tags: true },
  });

  const highlightsStep =
    job?.steps && typeof job.steps === 'object' ? job.steps.highlights : undefined;
  const tags = Array.isArray(highlight?.tags)
    ? highlight.tags.filter((t) => typeof t === 'string')
    : Array.isArray(asset.aiTags)
      ? asset.aiTags.filter((t) => typeof t === 'string')
      : [];

  return reply.send({
    success: true,
    assetId,
    status: highlight ? 'completed' : (highlightsStep || job?.status || 'idle'),
    summary: highlight?.summary || null,
    tags,
  });
};

module.exports.listAiTags = async function listAiTags(request, reply) {
  const orgId = orgIdFromUser(request);
  if (!orgId) {
    return reply.status(403).send({ success: false, error: 'No organization attached to user.' });
  }

  if (!(await isAiEnabledForOrg(orgId, request.server.prisma))) {
    return reply.send({ success: true, tags: [] });
  }

  const rows = await request.server.prisma.$queryRaw`
    SELECT DISTINCT tag
    FROM "assets",
    LATERAL jsonb_array_elements_text(COALESCE("aiTags", '[]'::jsonb)) AS tag
    WHERE "orgId" = ${orgId}::uuid
      AND ("status" IS NULL OR "status" NOT IN ('trash', 'deleted'))
      AND "deletedAt" IS NULL
      AND jsonb_typeof(COALESCE("aiTags", '[]'::jsonb)) = 'array'
      AND length(trim(tag)) > 0
    ORDER BY tag ASC
    LIMIT 200
  `;

  const tags = (rows || [])
    .map((r) => (typeof r.tag === 'string' ? r.tag.trim() : ''))
    .filter(Boolean);

  return reply.send({ success: true, tags });
};
