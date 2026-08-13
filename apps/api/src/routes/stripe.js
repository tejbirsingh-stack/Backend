const stripeController = require('../controller/stripe.controller.js');

async function stripeRoutes(fastify, options) {
  // We need the raw body for the webhook to verify the Stripe signature
  fastify.post('/webhook', { config: { rawBody: true } }, stripeController.handleWebhook);

  fastify.post('/checkout', { preHandler: [fastify.authenticate] }, stripeController.createCheckoutSession);
  
  fastify.post('/portal', { preHandler: [fastify.authenticate] }, stripeController.createPortalSession);
}

module.exports = stripeRoutes;
