const { enqueueAiAnalyze, isAiEnabled } = require('../services/ai/enqueueAiAnalyze');

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

  return reply.send({
    success: true,
    assetId,
    status: job?.status || 'idle',
    steps: job?.steps || {},
    error: job?.error || null,
    aiEnabled: isAiEnabled(),
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

  if (!isAiEnabled()) {
    return reply.status(400).send({ success: false, error: 'AI_ENABLED is false' });
  }

  await request.server.prisma.aiAnalysisJob.upsert({
    where: { assetId },
    create: { assetId, orgId, status: 'queued', force, steps: { asr: 'queued' } },
    update: { status: 'queued', force, error: null, steps: { asr: 'queued' } },
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

  const segments = await request.server.prisma.aiTranscriptSegment.findMany({
    where: {
      orgId,
      text: { contains: q, mode: 'insensitive' },
    },
    orderBy: { startMs: 'asc' },
    take: pageSize,
    skip: (page - 1) * pageSize,
    select: {
      assetId: true,
      text: true,
      startMs: true,
      endMs: true,
    },
  });

  const items = segments.map((s) => ({
    assetId: s.assetId,
    score: 1,
    matchType: 'transcript',
    startMs: s.startMs,
    endMs: s.endMs,
    snippet: s.text,
  }));

  return reply.send({ success: true, items, total: items.length, page, pageSize });
};
