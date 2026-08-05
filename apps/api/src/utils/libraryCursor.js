const crypto = require('crypto');

function fingerprint(params) {
  const stable = JSON.stringify({
    view: params.view,
    workspaceId: params.workspaceId,
    folderId: params.folderId,
    projectId: params.projectId,
    q: params.q || '',
    mediaType: params.mediaType || 'all',
    dateRange: params.dateRange || 'all',
    dateFrom: params.dateFrom || '',
    dateTo: params.dateTo || '',
    tagIds: params.tagIds || '',
    aiTags: params.aiTags || '',
    sortBy: params.sortBy || 'date',
    sortOrder: params.sortOrder || 'desc',
  });
  return crypto.createHash('sha256').update(stable).digest('hex').slice(0, 16);
}

function encodeCursor({ sortValue, id, sortBy, sortOrder, fp }) {
  return Buffer.from(
    JSON.stringify({ v: 1, sv: sortValue, id, sb: sortBy, so: sortOrder, fp }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(token, expectedFp) {
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (payload.v !== 1 || payload.fp !== expectedFp) {
      const err = new Error('INVALID_PAGE_TOKEN');
      err.code = 'INVALID_PAGE_TOKEN';
      throw err;
    }
    return payload;
  } catch (e) {
    if (e.code === 'INVALID_PAGE_TOKEN') throw e;
    const err = new Error('INVALID_PAGE_TOKEN');
    err.code = 'INVALID_PAGE_TOKEN';
    throw err;
  }
}

module.exports = { fingerprint, encodeCursor, decodeCursor };
