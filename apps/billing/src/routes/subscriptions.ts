import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

// Validation schemas
const createSubscriptionSchema = z.object({
  organizationId: z.string().uuid(),
  planId: z.string(),
  paymentMethodId: z.string(),
  billingInterval: z.enum(['monthly', 'yearly']),
});

const updateSubscriptionSchema = z.object({
  planId: z.string().optional(),
  billingInterval: z.enum(['monthly', 'yearly']).optional(),
  quantity: z.number().int().positive().optional(),
});

export const subscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  
  // Get organization subscriptions
  fastify.get('/', async (request, reply) => {
    const { organizationId } = request.user as any;
    
    try {
      const subscriptions = await fastify.prisma.subscription.findMany({
        where: { organizationId },
        include: {
          plan: true,
          organization: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return { subscriptions };
    } catch (error) {
      fastify.log.error('Error fetching subscriptions:', error);
      reply.code(500).send({ error: 'Failed to fetch subscriptions' });
    }
  });

  // Create new subscription
  fastify.post('/', async (request, reply) => {
    const validation = createSubscriptionSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({ 
        error: 'Invalid request data',
        details: validation.error.issues 
      });
    }

    const { organizationId, planId, paymentMethodId, billingInterval } = validation.data;
    const userId = (request.user as any).id;

    try {
      // Get plan details
      const plan = await fastify.prisma.plan.findUnique({
        where: { id: planId }
      });

      if (!plan) {
        return reply.code(404).send({ error: 'Plan not found' });
      }

      // Check if organization already has an active subscription
      const existingSubscription = await fastify.prisma.subscription.findFirst({
        where: {
          organizationId,
          status: { in: ['active', 'trialing', 'past_due'] }
        }
      });

      if (existingSubscription) {
        return reply.code(400).send({ 
          error: 'Organization already has an active subscription' 
        });
      }

      // Create Stripe subscription
      const priceId = billingInterval === 'yearly' ? plan.yearlyPriceId : plan.monthlyPriceId;
      
      const stripeSubscription = await fastify.stripe.subscriptions.create({
        customer: await getOrCreateStripeCustomer(fastify, organizationId),
        items: [{ price: priceId }],
        default_payment_method: paymentMethodId,
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          organizationId,
          planId,
          createdBy: userId,
        },
      });

      // Create subscription in database
      const subscription = await fastify.prisma.subscription.create({
        data: {
          id: stripeSubscription.id,
          organizationId,
          planId,
          status: stripeSubscription.status,
          billingInterval,
          currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
          currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
          cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
          createdBy: userId,
        },
        include: {
          plan: true,
          organization: true,
        },
      });

      // Update organization subscription status
      await fastify.prisma.organization.update({
        where: { id: organizationId },
        data: { 
          subscriptionStatus: 'active',
          currentPlanId: planId,
        },
      });

      return { 
        subscription,
        paymentStatus: stripeSubscription.latest_invoice?.payment_intent?.status 
      };

    } catch (error) {
      fastify.log.error('Error creating subscription:', error);
      
      if (error.type === 'StripeCardError') {
        return reply.code(400).send({
          error: 'Payment failed',
          message: error.message,
        });
      }

      reply.code(500).send({ error: 'Failed to create subscription' });
    }
  });

  // Update subscription
  fastify.put('/:subscriptionId', async (request, reply) => {
    const { subscriptionId } = request.params as { subscriptionId: string };
    const validation = updateSubscriptionSchema.safeParse(request.body);
    
    if (!validation.success) {
      return reply.code(400).send({ 
        error: 'Invalid request data',
        details: validation.error.issues 
      });
    }

    const { planId, billingInterval, quantity } = validation.data;
    const { organizationId } = request.user as any;

    try {
      // Verify subscription ownership
      const subscription = await fastify.prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          organizationId,
        },
        include: { plan: true },
      });

      if (!subscription) {
        return reply.code(404).send({ error: 'Subscription not found' });
      }

      // Update Stripe subscription
      const updateData: any = {};
      
      if (planId) {
        const newPlan = await fastify.prisma.plan.findUnique({
          where: { id: planId }
        });

        if (!newPlan) {
          return reply.code(404).send({ error: 'Plan not found' });
        }

        const newPriceId = billingInterval === 'yearly' ? 
          newPlan.yearlyPriceId : newPlan.monthlyPriceId;

        updateData.items = [{
          id: subscription.id,
          price: newPriceId,
          quantity: quantity || 1,
        }];
      }

      const stripeSubscription = await fastify.stripe.subscriptions.update(
        subscriptionId,
        updateData
      );

      // Update database
      const updatedSubscription = await fastify.prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          ...(planId && { planId }),
          ...(billingInterval && { billingInterval }),
          status: stripeSubscription.status,
          currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
          currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        },
        include: {
          plan: true,
          organization: true,
        },
      });

      return { subscription: updatedSubscription };

    } catch (error) {
      fastify.log.error('Error updating subscription:', error);
      reply.code(500).send({ error: 'Failed to update subscription' });
    }
  });

  // Cancel subscription
  fastify.delete('/:subscriptionId', async (request, reply) => {
    const { subscriptionId } = request.params as { subscriptionId: string };
    const { organizationId } = request.user as any;
    const { immediate = false } = request.query as { immediate?: boolean };

    try {
      // Verify subscription ownership
      const subscription = await fastify.prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          organizationId,
        },
      });

      if (!subscription) {
        return reply.code(404).send({ error: 'Subscription not found' });
      }

      if (immediate) {
        // Cancel immediately
        const stripeSubscription = await fastify.stripe.subscriptions.cancel(subscriptionId);
        
        await fastify.prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'canceled',
            canceledAt: new Date(),
          },
        });

        await fastify.prisma.organization.update({
          where: { id: organizationId },
          data: { subscriptionStatus: 'canceled' },
        });

        return { message: 'Subscription canceled immediately' };
      } else {
        // Cancel at period end
        const stripeSubscription = await fastify.stripe.subscriptions.update(
          subscriptionId,
          { cancel_at_period_end: true }
        );

        await fastify.prisma.subscription.update({
          where: { id: subscriptionId },
          data: { cancelAtPeriodEnd: true },
        });

        return { 
          message: 'Subscription will be canceled at the end of the current period',
          periodEnd: new Date(stripeSubscription.current_period_end * 1000)
        };
      }

    } catch (error) {
      fastify.log.error('Error canceling subscription:', error);
      reply.code(500).send({ error: 'Failed to cancel subscription' });
    }
  });

  // Get subscription usage and billing info
  fastify.get('/:subscriptionId/usage', async (request, reply) => {
    const { subscriptionId } = request.params as { subscriptionId: string };
    const { organizationId } = request.user as any;

    try {
      const subscription = await fastify.prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          organizationId,
        },
        include: {
          plan: true,
          organization: true,
        },
      });

      if (!subscription) {
        return reply.code(404).send({ error: 'Subscription not found' });
      }

      // Get current period usage
      const startDate = subscription.currentPeriodStart;
      const endDate = subscription.currentPeriodEnd;

      const usage = await fastify.prisma.usage.aggregate({
        where: {
          organizationId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          storageBytes: true,
          bandwidthBytes: true,
          compressionMinutes: true,
          apiRequests: true,
        },
      });

      // Get upcoming invoice
      const upcomingInvoice = await fastify.stripe.invoices.retrieveUpcoming({
        subscription: subscriptionId,
      });

      return {
        subscription,
        currentPeriod: {
          start: startDate,
          end: endDate,
        },
        usage: {
          storage: usage._sum.storageBytes || 0,
          bandwidth: usage._sum.bandwidthBytes || 0,
          compression: usage._sum.compressionMinutes || 0,
          apiRequests: usage._sum.apiRequests || 0,
        },
        upcomingInvoice: {
          amount: upcomingInvoice.amount_due,
          currency: upcomingInvoice.currency,
          periodStart: new Date(upcomingInvoice.period_start * 1000),
          periodEnd: new Date(upcomingInvoice.period_end * 1000),
        },
      };

    } catch (error) {
      fastify.log.error('Error fetching subscription usage:', error);
      reply.code(500).send({ error: 'Failed to fetch usage information' });
    }
  });
};

// Helper function to get or create Stripe customer
async function getOrCreateStripeCustomer(fastify: any, organizationId: string) {
  const organization = await fastify.prisma.organization.findUnique({
    where: { id: organizationId }
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  if (organization.stripeCustomerId) {
    return organization.stripeCustomerId;
  }

  // Create new Stripe customer
  const customer = await fastify.stripe.customers.create({
    name: organization.name,
    email: organization.email,
    metadata: {
      organizationId,
    },
  });

  // Update organization with Stripe customer ID
  await fastify.prisma.organization.update({
    where: { id: organizationId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}
