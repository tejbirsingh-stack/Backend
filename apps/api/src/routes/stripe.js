const stripeController = require('../controller/stripe.controller.js');

async function stripeRoutes(fastify, options) {
  // We need the raw body for the webhook to verify the Stripe signature
  fastify.post('/webhook', { config: { rawBody: true } }, stripeController.handleWebhook);

  fastify.post('/checkout', { preHandler: [fastify.authenticate] }, stripeController.createCheckoutSession);

  fastify.post('/portal', { preHandler: [fastify.authenticate] }, stripeController.createPortalSession);

  fastify.post('/sync-session', { preHandler: [fastify.authenticate] }, stripeController.syncSession);

  fastify.get('/subscriptions', { preHandler: [fastify.authenticate] }, stripeController.getSubscriptions);

  fastify.post('/cancel-subscription', { preHandler: [fastify.authenticate] }, stripeController.cancelSubscription);

  fastify.post('/resume-subscription', { preHandler: [fastify.authenticate] }, stripeController.resumeSubscription);

  fastify.post('/setup-intent', { preHandler: [fastify.authenticate] }, stripeController.createSetupIntent);

  fastify.get('/payment-methods', { preHandler: [fastify.authenticate] }, stripeController.getPaymentMethods);

  fastify.post('/set-default-card', { preHandler: [fastify.authenticate] }, stripeController.setDefaultPaymentMethod);

  fastify.post('/delete-card', { preHandler: [fastify.authenticate] }, stripeController.deletePaymentMethod);

  fastify.get('/logs', { preHandler: [fastify.authenticate] }, stripeController.getPaymentLogs);
}

module.exports = stripeRoutes;
