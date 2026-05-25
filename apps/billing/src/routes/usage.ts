import { FastifyPluginAsync } from 'fastify';

export const usageRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (request, reply) => {
    return { status: 'usage stats running' };
  });
};
