const { listItems } = require('../services/libraryListService');

module.exports.listLibraryItems = async (request, reply) => {
  try {
    const params = {
      ...request.query,
      workspaceId: request.query.workspaceId,
      userId: request.user?.id,
      view: request.query.view || 'all',
      pageSize: request.query.pageSize ? parseInt(request.query.pageSize, 10) : 48,
    };
    
    const result = await listItems(request.server.prisma, params);
    return reply.code(200).send({ success: true, data: result });
  } catch (err) {
    if (err.code === 'INVALID_PAGE_TOKEN') {
      return reply.code(400).send({
        success: false,
        code: 'INVALID_PAGE_TOKEN',
        message: 'Restart pagination from the first page.',
      });
    }
    request.log.error(err);
    console.error("listLibraryItems Error:", err);
    return reply.code(500).send({ success: false, message: 'Internal Server Error' });
  }
};
