import { FastifyPluginAsync } from 'fastify';

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (request, reply) => {
    return { status: 'analytics running' };
  });
};
