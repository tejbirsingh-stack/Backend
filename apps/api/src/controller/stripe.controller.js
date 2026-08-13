const stripeService = require('../services/stripe.service.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class StripeController {

  /**
   * Generates a checkout session URL for a given plan
   */
  async createCheckoutSession(request, reply) {
    try {
      // In a real app, you get this from `request.user.orgId` 
      // and look up the customer ID and plan ID.
      const { priceId } = request.body;
      const orgId = request.user?.orgId;
      if (!orgId || !priceId) {
        return reply.code(400).send({ error: 'Missing orgId or priceId' });
      }

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) return reply.code(404).send({ error: 'Organization not found' });

      let customerId = org.stripeCustomerId;
      if (!customerId) {
        // Create one if it doesn't exist
        const customer = await stripeService.createCustomer(
          request.user.email,
          org.name,
          { orgId: org.id }
        );
        customerId = customer.id;
        await prisma.organization.update({
          where: { id: org.id },
          data: { stripeCustomerId: customerId }
        });
      }

      const session = await stripeService.createCheckoutSession(
        customerId,
        priceId,
        `${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings/accounts/billing?success=true`,
        `${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings/accounts/billing?canceled=true`
      );

      return reply.send({ url: session.url });
    } catch (error) {
      request.log.error(error);
      console.error('[StripeController Error]', error);
      return reply.code(500).send({ error: 'Failed to create checkout session', details: error.message });
    }
  }

  /**
   * Generates a Customer Portal URL
   */
  async createPortalSession(request, reply) {
    try {
      const orgId = request.user?.orgId;
      if (!orgId) return reply.code(400).send({ error: 'Missing orgId' });

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) return reply.code(404).send({ error: 'Organization not found' });

      let customerId = org.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(
          request.user.email,
          org.name,
          { orgId: org.id }
        );
        customerId = customer.id;
        await prisma.organization.update({
          where: { id: org.id },
          data: { stripeCustomerId: customerId }
        });
      }

      const session = await stripeService.createBillingPortalSession(
        customerId,
        `${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings/accounts/billing`
      );

      return reply.send({ url: session.url });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to create portal session', details: error.message });
    }
  }

  /**
   * Stripe Webhook Handler
   */
  async handleWebhook(request, reply) {
    const signature = request.headers['stripe-signature'];

    let event;
    try {
      // Fastify automatically parses JSON, but Stripe needs the raw body to verify the signature.
      // Assuming you configure this route to receive raw bodies:
      event = stripeService.constructWebhookEvent(request.rawBody, signature);
    } catch (err) {
      request.log.error(`Webhook signature verification failed: ${err.message}`);
      return reply.code(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          if (session.mode === 'subscription') {
            const customerId = session.customer;
            // Update the DB to mark as active
            await prisma.organization.updateMany({
              where: { stripeCustomerId: customerId },
              data: { subscriptionStatus: 'active' }
            });
          }
          break;
        }
        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          const customerId = subscription.customer;
          await prisma.organization.updateMany({
            where: { stripeCustomerId: customerId },
            data: { subscriptionStatus: 'canceled', currentPlanId: null }
          });
          break;
        }
        // Add more event handlers as needed
      }

      return reply.send({ received: true });
    } catch (err) {
      request.log.error(`Error processing webhook: ${err.message}`);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  }
}

module.exports = new StripeController();
