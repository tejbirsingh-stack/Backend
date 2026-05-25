import { FastifyPluginAsync } from 'fastify';

export const billingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (request, reply) => {
    return { status: 'billing service running' };
  });
};
