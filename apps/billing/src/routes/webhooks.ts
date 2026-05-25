import { FastifyPluginAsync } from 'fastify';

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', async (request, reply) => {
    return { status: 'webhook received' };
  });
};
