const stripeService = require('../services/stripe.service.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function getFrontendUrl() {
  const url = process.env.FRONTEND_URL || 'http://localhost:3002';
  return url.replace(/\/$/, '');
}

/**
 * Parent/Child Payment Audit Logger Helper
 * Ensures 1 row in payments_log (Parent) and detailed event rows in payment_events_log (Child)
 */
async function recordPaymentEvent({
  orgId,
  userId = null,
  stripeCustomerId = null,
  stripeSessionId = null,
  stripePaymentIntentId = null,
  stripeSubscriptionId = null,
  eventType,
  status = 'PENDING',
  amountCents = 0,
  currency = 'usd',
  planId = null,
  planName = null,
  invoicePdf = null,
  invoiceUrl = null,
  failureReason = null,
  metadata = {},
}) {
  try {
    let paymentLog = null;
    if (stripeSessionId || stripeSubscriptionId) {
      const conditions = [];
      if (stripeSessionId) conditions.push({ stripeSessionId });
      if (stripeSubscriptionId) conditions.push({ stripeSubscriptionId });

      paymentLog = await prisma.paymentLog.findFirst({
        where: { OR: conditions },
      });
    }

    if (!paymentLog) {
      paymentLog = await prisma.paymentLog.create({
        data: {
          orgId,
          userId,
          stripeCustomerId,
          stripeSessionId,
          stripePaymentIntentId,
          stripeSubscriptionId,
          status,
          amountCents,
          currency,
          planId,
          planName,
          invoicePdf,
          invoiceUrl,
          metadata,
        },
      });
    } else {
      paymentLog = await prisma.paymentLog.update({
        where: { id: paymentLog.id },
        data: {
          orgId: orgId || paymentLog.orgId,
          userId: userId || paymentLog.userId,
          stripeCustomerId: stripeCustomerId || paymentLog.stripeCustomerId,
          stripeSubscriptionId: stripeSubscriptionId || paymentLog.stripeSubscriptionId,
          status: status !== 'PENDING' ? status : paymentLog.status,
          amountCents: amountCents || paymentLog.amountCents,
          currency: currency || paymentLog.currency,
          planId: planId || paymentLog.planId,
          planName: planName || paymentLog.planName,
          invoicePdf: invoicePdf || paymentLog.invoicePdf,
          invoiceUrl: invoiceUrl || paymentLog.invoiceUrl,
          metadata: { ...(paymentLog.metadata || {}), ...metadata },
        },
      });
    }

    await prisma.paymentEventLog.create({
      data: {
        paymentLogId: paymentLog.id,
        eventType,
        status,
        failureReason,
        metadata,
      },
    });

    return paymentLog;
  } catch (err) {
    console.error('[PaymentLogger Error]', err);
    return null;
  }
}

class StripeController {

  /**
   * Generates a checkout session URL for a given plan
   */
  async createCheckoutSession(request, reply) {
    try {
      const { priceId, useSavedCard = true } = request.body;
      const orgId = request.user?.orgId;
      if (!orgId || !priceId) {
        return reply.code(400).send({ error: 'Missing orgId or priceId' });
      }

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) return reply.code(404).send({ error: 'Organization not found' });

      let customerId = org.stripeCustomerId;
      if (customerId) {
        try {
          const cust = await stripeService.getCustomer(customerId);
          if (cust?.deleted) {
            customerId = null;
          }
        } catch (err) {
          if (err?.code === 'resource_missing' || err?.message?.includes('No such customer') || err?.status === 404) {
            console.log(`[Stripe] Customer ${customerId} deleted in Stripe dashboard, resetting local reference...`);
            customerId = null;
            await prisma.organization.update({
              where: { id: org.id },
              data: { stripeCustomerId: null, subscriptionStatus: null }
            });
          }
        }
      }

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

      // Check if user wants to use saved card and has an active subscription/card to perform smart upgrade
      if (customerId && useSavedCard) {
        try {
          const activeSubs = await stripeService.listActiveSubscriptions(customerId);
          const activeSub = activeSubs?.data?.find((s) => !s.cancel_at_period_end) || activeSubs?.data?.[0];
          if (activeSub) {
            const currentItem = activeSub.items?.data?.[0];
            const currentPrice = currentItem?.price;
            const currentPriceCents = currentPrice?.unit_amount || 0;
            const currentInterval = currentPrice?.recurring?.interval || 'month';

            const plans = await prisma.plan.findMany();
            const matchingPlan = plans.find(
              (p) =>
                p.monthlyPriceId === priceId ||
                p.yearlyPriceId === priceId ||
                p.id.toLowerCase() === priceId.toLowerCase()
            ) || { id: 'custom', name: 'Custom Plan' };

            const isYearly = matchingPlan.yearlyPriceId === priceId;
            const newInterval = isYearly ? 'year' : 'month';

            // Determine if this plan change is an upgrade or a downgrade
            let isDowngrade = false;
            if (currentInterval === 'year' && newInterval === 'month') {
              isDowngrade = true;
            } else if (currentInterval === newInterval) {
              const newPriceCents = isYearly
                ? (matchingPlan.yearlyPrice || 27000)
                : (matchingPlan.monthlyPrice || 2500);
              isDowngrade = newPriceCents < currentPriceCents;
            }

            const updatedSub = await stripeService.updateSubscription(activeSub.id, priceId, isDowngrade);
            const expiresAt = new Date(activeSub.current_period_end * 1000);

            const updatedOrg = await prisma.organization.update({
              where: { id: org.id },
              data: {
                currentPlanId: isDowngrade ? org.currentPlanId : (matchingPlan.id !== 'custom' ? matchingPlan.id : undefined),
                subscriptionStatus: isDowngrade ? 'canceling' : 'active',
                planExpiresAt: expiresAt,
                metadata: {
                  ...(typeof org.metadata === 'object' ? org.metadata : {}),
                  planId: isDowngrade ? (org.metadata?.planId || 'premium') : matchingPlan.name.toLowerCase(),
                  billingCycle: isDowngrade ? (org.metadata?.billingCycle || 'annual') : (newInterval === 'year' ? 'annual' : 'monthly'),
                  scheduledPlanId: isDowngrade ? matchingPlan.id : undefined,
                  scheduledPlanName: isDowngrade ? matchingPlan.name : undefined,
                  scheduledBillingCycle: isDowngrade ? (newInterval === 'year' ? 'annual' : 'monthly') : undefined,
                  planSelectedAt: new Date().toISOString(),
                  expiresAt: expiresAt.toISOString(),
                  isDowngradeScheduled: isDowngrade,
                },
              },
              include: { currentPlan: true },
            });

            const latestInvoice = updatedSub.latest_invoice;
            const amountPaidCents = typeof latestInvoice === 'object' ? latestInvoice?.amount_paid || 0 : 0;

            await recordPaymentEvent({
              orgId: org.id,
              userId: request.user?.id || null,
              stripeCustomerId: customerId,
              stripeSubscriptionId: updatedSub.id,
              eventType: isDowngrade ? 'subscription_downgrade_scheduled' : 'subscription_prorated_upgrade',
              status: 'SUCCESS',
              amountCents: amountPaidCents,
              currency: updatedSub.currency || 'usd',
              planId: matchingPlan.id,
              planName: matchingPlan.name,
              metadata: {
                planName: matchingPlan.name,
                billingCycle: newInterval === 'year' ? 'annual' : 'monthly',
                isDowngrade,
              },
            });

            const responseMessage = isDowngrade
              ? `Your downgrade to ${matchingPlan.name} is scheduled and will take effect at the end of your current paid billing cycle.`
              : `Subscription successfully upgraded to ${matchingPlan.name} with unused credit subtracted!`;

            return reply.send({
              directUpgrade: true,
              isDowngrade,
              message: responseMessage,
              organization: updatedOrg,
            });
          } else if (useSavedCard) {
            // Check if customer already has a saved card attached
            const pmRes = await stripeService.listPaymentMethods(customerId);
            const cards = pmRes?.cards || [];
            const defaultCard = cards.find((card) => card.isDefault) || cards[0];

            if (defaultCard) {
              const plans = await prisma.plan.findMany();
              const matchingPlan = plans.find(
                (p) =>
                  p.monthlyPriceId === priceId ||
                  p.yearlyPriceId === priceId ||
                  p.id.toLowerCase() === priceId.toLowerCase() ||
                  p.name.toLowerCase() === priceId.toLowerCase()
              ) || { id: 'basic', name: 'Basic', monthlyPrice: 10 };

              const isYearly = String(priceId).includes('year') || matchingPlan.yearlyPriceId === priceId;
              const newInterval = isYearly ? 'year' : 'month';

              let resolvedStripePriceId = isYearly ? matchingPlan.yearlyPriceId : matchingPlan.monthlyPriceId;

              if (!resolvedStripePriceId || !resolvedStripePriceId.startsWith('price_')) {
                if (priceId && String(priceId).startsWith('price_')) {
                  resolvedStripePriceId = priceId;
                } else {
                  const priceCents = isYearly
                    ? Math.round((matchingPlan.yearlyPrice || (matchingPlan.monthlyPrice * 12 * 0.9) || 108) * 100)
                    : Math.round((matchingPlan.monthlyPrice || 10) * 100);

                  const priceObj = await stripeService.createPrice({
                    amountCents: priceCents,
                    interval: newInterval,
                    productName: `${matchingPlan.name || 'Noah'} Plan`,
                  });
                  resolvedStripePriceId = priceObj.id;

                  await prisma.plan.updateMany({
                    where: { id: matchingPlan.id },
                    data: isYearly ? { yearlyPriceId: resolvedStripePriceId } : { monthlyPriceId: resolvedStripePriceId },
                  }).catch(() => {});
                }
              }

              const newSubscription = await stripeService.createSubscriptionDirectly(
                customerId,
                resolvedStripePriceId,
                defaultCard.id
              );

              const now = new Date();
              let expiresAt = new Date(now);
              if (newInterval === 'month') {
                expiresAt.setMonth(expiresAt.getMonth() + 1);
              } else {
                expiresAt.setFullYear(expiresAt.getFullYear() + 1);
              }

              const updatedOrg = await prisma.organization.update({
                where: { id: org.id },
                data: {
                  currentPlanId: matchingPlan.id !== 'custom' ? matchingPlan.id : undefined,
                  subscriptionStatus: 'active',
                  isFreeTrialUsed: true,
                  planExpiresAt: expiresAt,
                  metadata: {
                    ...(typeof org.metadata === 'object' ? org.metadata : {}),
                    planId: matchingPlan.name.toLowerCase(),
                    billingCycle: newInterval === 'year' ? 'annual' : 'monthly',
                    planSelectedAt: now.toISOString(),
                    expiresAt: expiresAt.toISOString(),
                  },
                },
                include: { currentPlan: true },
              });

              await recordPaymentEvent({
                orgId: org.id,
                userId: request.user?.id || null,
                stripeCustomerId: customerId,
                stripeSubscriptionId: newSubscription.id,
                eventType: 'subscription_created_with_saved_card',
                status: 'SUCCESS',
                amountCents: (matchingPlan.monthlyPrice || 10) * 100,
                currency: 'usd',
                planId: matchingPlan.id,
                planName: matchingPlan.name,
                metadata: {
                  planName: matchingPlan.name,
                  billingCycle: newInterval === 'year' ? 'annual' : 'monthly',
                },
              });

              return reply.send({
                directUpgrade: true,
                message: `Successfully subscribed to ${matchingPlan.name} using your saved card!`,
                organization: updatedOrg,
              });
            }
          }
        } catch (upgradeErr) {
          console.error('[StripeController] Direct upgrade/downgrade fallback to checkout session:', upgradeErr);
        }
      }

      let checkoutPriceId = priceId;
      if (!checkoutPriceId || !String(checkoutPriceId).startsWith('price_')) {
        const plans = await prisma.plan.findMany();
        const matchingPlan = plans.find(
          (p) =>
            p.monthlyPriceId === priceId ||
            p.yearlyPriceId === priceId ||
            p.id.toLowerCase() === priceId.toLowerCase() ||
            p.name.toLowerCase() === priceId.toLowerCase()
        ) || { id: 'basic', name: 'Basic', monthlyPrice: 10 };

        const isYearly = String(priceId).includes('year') || matchingPlan.yearlyPriceId === priceId;
        const newInterval = isYearly ? 'year' : 'month';

        checkoutPriceId = isYearly ? matchingPlan.yearlyPriceId : matchingPlan.monthlyPriceId;

        if (!checkoutPriceId || !checkoutPriceId.startsWith('price_')) {
          const priceCents = isYearly
            ? Math.round((matchingPlan.yearlyPrice || (matchingPlan.monthlyPrice * 12 * 0.9) || 108) * 100)
            : Math.round((matchingPlan.monthlyPrice || 10) * 100);

          const priceObj = await stripeService.createPrice({
            amountCents: priceCents,
            interval: newInterval,
            productName: `${matchingPlan.name || 'Noah'} Plan`,
          });
          checkoutPriceId = priceObj.id;

          await prisma.plan.updateMany({
            where: { id: matchingPlan.id },
            data: isYearly ? { yearlyPriceId: checkoutPriceId } : { monthlyPriceId: checkoutPriceId },
          }).catch(() => {});
        }
      }

      const baseUrl = getFrontendUrl();
      const session = await stripeService.createCheckoutSession(
        customerId,
        checkoutPriceId,
        `${baseUrl}/home/settings/accounts/plan?success=true&session_id={CHECKOUT_SESSION_ID}`,
        `${baseUrl}/home/settings/accounts/plan?canceled=true`
      );

      // Log Payment Audit Event
      await recordPaymentEvent({
        orgId: org.id,
        userId: request.user?.id || null,
        stripeCustomerId: customerId,
        stripeSessionId: session.id,
        eventType: 'checkout_session_created',
        status: 'SUCCESS',
        planId: priceId,
        metadata: { checkoutUrl: session.url },
      });

      return reply.send({ url: session.url });
    } catch (error) {
      request.log.error(error);
      console.error('[StripeController Error]', error);

      if (request.user?.orgId) {
        await recordPaymentEvent({
          orgId: request.user.orgId,
          userId: request.user?.id || null,
          eventType: 'checkout_session_failed',
          status: 'FAILED',
          failureReason: error.message,
          metadata: { priceId: request.body?.priceId },
        });
      }

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

      const baseUrl = getFrontendUrl();
      const session = await stripeService.createBillingPortalSession(
        customerId,
        `${baseUrl}/home/settings/accounts/plan`
      );

      // Log Portal Access Event
      await prisma.paymentLog.create({
        data: {
          orgId: org.id,
          userId: request.user?.id || null,
          stripeCustomerId: customerId,
          eventType: 'billing_portal_opened',
          status: 'SUCCESS',
        },
      }).catch((e) => console.error('[PaymentLog Error]', e));

      return reply.send({ url: session.url });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to create portal session', details: error.message });
    }
  }

  /**
   * Sync completed checkout session with Organization plan in DB
   */
  async syncSession(request, reply) {
    try {
      const { sessionId } = request.body || {};
      const orgId = request.user?.orgId;
      if (!orgId || !sessionId) {
        return reply.code(400).send({ error: 'Missing orgId or sessionId' });
      }

      const session = await stripeService.retrieveCheckoutSession(sessionId);
      if (!session || session.payment_status !== 'paid') {
        await recordPaymentEvent({
          orgId,
          userId: request.user?.id || null,
          stripeSessionId: sessionId,
          eventType: 'sync_session_failed',
          status: 'FAILED',
          failureReason: 'Session is unpaid or invalid',
        });

        return reply.code(400).send({ error: 'Session is not paid or invalid' });
      }

      const lineItem = session.line_items?.data?.[0];
      const priceId = lineItem?.price?.id;

      if (!priceId) {
        return reply.code(400).send({ error: 'Could not extract priceId from checkout session' });
      }

      const matchingPlan = await prisma.plan.findFirst({
        where: {
          OR: [
            { monthlyPriceId: priceId },
            { yearlyPriceId: priceId },
          ],
        },
      });

      if (!matchingPlan) {
        return reply.code(404).send({ error: `No system plan matches Stripe priceId: ${priceId}` });
      }

      const isYearly = matchingPlan.yearlyPriceId === priceId;
      const now = new Date();
      const expiresAt = new Date(now);
      if (isYearly) {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      } else {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      }

      const updatedOrg = await prisma.organization.update({
        where: { id: orgId },
        data: {
          currentPlanId: matchingPlan.id,
          subscriptionStatus: 'active',
          isFreeTrialUsed: true,
          planExpiresAt: expiresAt,
          metadata: {
            planId: matchingPlan.name.toLowerCase(),
            billingCycle: isYearly ? 'annual' : 'monthly',
            planSelectedAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
        },
        include: { currentPlan: true },
      });

      // Prune legacy active subscriptions if a new subscription was purchased
      const newSubId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (session.customer && newSubId) {
        try {
          const activeSubs = await stripeService.listActiveSubscriptions(session.customer);
          for (const sub of activeSubs?.data || []) {
            if (sub.id !== newSubId && !sub.cancel_at_period_end) {
              await stripeService.cancelSubscriptionAtPeriodEnd(sub.id);
            }
          }
        } catch (pruneErr) {
          console.error('[StripeController] Prune legacy subscriptions error:', pruneErr);
        }
      }

      const invoice = session.invoice;
      const invoicePdf = invoice?.invoice_pdf || null;
      const invoiceUrl = invoice?.hosted_invoice_url || null;

      // Log Successful Sync Payment Event
      await recordPaymentEvent({
        orgId,
        userId: request.user?.id || null,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id || org.stripeCustomerId,
        stripeSessionId: session.id,
        stripeSubscriptionId: String(newSubId || ''),
        eventType: 'sync_session_completed',
        status: 'SUCCESS',
        amountCents: session.amount_total || 0,
        currency: session.currency || 'usd',
        planId: matchingPlan.id,
        planName: matchingPlan.name,
        invoicePdf,
        invoiceUrl,
        metadata: {
          planName: matchingPlan.name,
          billingCycle: isYearly ? 'annual' : 'monthly',
          invoicePdf,
          invoiceUrl,
        },
      });

      return reply.send({
        success: true,
        message: `Subscription successfully updated to ${matchingPlan.name}!`,
        organization: updatedOrg,
        checkoutDetails: {
          planName: matchingPlan.name,
          billingCycle: isYearly ? 'annual' : 'monthly',
          amountPaidCents: session.amount_total || 0,
          currency: session.currency || 'usd',
          invoicePdf,
          invoiceUrl,
          sessionId: session.id,
        },
      });
    } catch (error) {
      request.log.error(error);
      console.error('[StripeController syncSession Error]', error);

      if (request.user?.orgId) {
        await prisma.paymentLog.create({
          data: {
            orgId: request.user.orgId,
            userId: request.user?.id || null,
            eventType: 'sync_session_failed',
            status: 'FAILED',
            failureReason: error.message,
          },
        }).catch(() => { });
      }

      return reply.code(500).send({ error: 'Failed to sync session', details: error.message });
    }
  }

  /**
   * Fetch Organization Payment Logs for Support Troubleshooting
   */
  async getPaymentLogs(request, reply) {
    try {
      const orgId = request.user?.orgId;
      if (!orgId) return reply.code(400).send({ error: 'Missing orgId' });

      const logs = await prisma.paymentLog.findMany({
        where: { orgId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          events: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      return reply.send({ success: true, logs });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch payment logs', details: error.message });
    }
  }

  /**
   * Fetch All Active Subscriptions for Organization
   */
  async getSubscriptions(request, reply) {
    try {
      const orgId = request.user?.orgId;
      if (!orgId) return reply.code(400).send({ error: 'Missing orgId' });

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) return reply.code(404).send({ error: 'Organization not found' });

      if (!org.stripeCustomerId) {
        return reply.send({ success: true, subscriptions: [] });
      }

      const activeSubs = await stripeService.listActiveSubscriptions(org.stripeCustomerId);

      const mapPriceToPlanName = (cents, planId) => {
        if (planId === 'enterprise' || cents === 5000 || cents === 54000) return 'Enterprise Plan';
        if (planId === 'premium' || cents === 2500 || cents === 27000) return 'Premium Plan';
        if (planId === 'basic' || cents === 1000 || cents === 10800) return 'Basic Plan';
        return 'Active Plan';
      };

      const subscriptions = (activeSubs?.data || []).map((sub) => {
        const item = sub.items?.data?.[0];
        const price = item?.price;
        const amountCents = price?.unit_amount || 0;
        const currency = price?.currency || 'usd';
        const interval = price?.recurring?.interval || 'month';
        const currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
        const planId = (sub.metadata?.planId || '').toLowerCase();
        const resolvedPlanName = sub.metadata?.planName || mapPriceToPlanName(amountCents, planId);

        return {
          id: sub.id,
          status: sub.status,
          planName: resolvedPlanName,
          planId: planId || 'custom',
          amountCents,
          currency,
          interval,
          currentPeriodEnd,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          createdAt: new Date(sub.created * 1000).toISOString(),
        };
      });

      // Sort subscriptions: Non-canceling active subscriptions first, then newest created
      subscriptions.sort((a, b) => {
        if (a.cancelAtPeriodEnd !== b.cancelAtPeriodEnd) {
          return a.cancelAtPeriodEnd ? 1 : -1;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return reply.send({ success: true, subscriptions });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch subscriptions', details: error.message });
    }
  }

  /**
   * Cancel Specific Active Subscription (Scheduled at Period End)
   */
  async cancelSubscription(request, reply) {
    try {
      const orgId = request.user?.orgId;
      const { subscriptionId } = request.body || {};

      if (!orgId) return reply.code(400).send({ error: 'Missing orgId' });

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org || !org.stripeCustomerId) {
        return reply.code(400).send({ error: 'No active Stripe customer found for this organization' });
      }

      let subToCancelId = subscriptionId;

      if (!subToCancelId) {
        const activeSubs = await stripeService.listActiveSubscriptions(org.stripeCustomerId);
        if (!activeSubs?.data?.length) {
          await prisma.organization.update({
            where: { id: org.id },
            data: { subscriptionStatus: 'canceled', currentPlanId: null },
          });
          return reply.send({ success: true, message: 'Subscription has been canceled.' });
        }
        subToCancelId = activeSubs.data[0].id;
      }

      await stripeService.cancelSubscriptionAtPeriodEnd(subToCancelId);

      await prisma.organization.update({
        where: { id: org.id },
        data: { subscriptionStatus: 'canceling' },
      });

      // Audit Log
      await recordPaymentEvent({
        orgId: org.id,
        userId: request.user?.id || null,
        stripeCustomerId: org.stripeCustomerId,
        stripeSubscriptionId: subToCancelId,
        eventType: 'subscription_cancel_requested',
        status: 'SUCCESS',
        metadata: { cancelAtPeriodEnd: true },
      });

      return reply.send({
        success: true,
        message: 'Your subscription cancellation has been scheduled. Access remains active until the end of your billing cycle.',
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to cancel subscription', details: error.message });
    }
  }

  /**
   * Resume / Un-cancel Specific Subscription
   */
  async resumeSubscription(request, reply) {
    try {
      const orgId = request.user?.orgId;
      const { subscriptionId } = request.body || {};

      if (!orgId) return reply.code(400).send({ error: 'Missing orgId' });

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org || !org.stripeCustomerId) {
        return reply.code(400).send({ error: 'No active Stripe customer found' });
      }

      let subToResumeId = subscriptionId;
      if (!subToResumeId) {
        const activeSubs = await stripeService.listActiveSubscriptions(org.stripeCustomerId);
        const subToResume = activeSubs?.data?.find((s) => s.cancel_at_period_end);
        subToResumeId = subToResume?.id;
      }

      if (!subToResumeId) {
        return reply.code(404).send({ error: 'No canceled subscription found to resume' });
      }

      await stripeService.resumeSubscription(subToResumeId);

      await prisma.organization.update({
        where: { id: org.id },
        data: { subscriptionStatus: 'active' },
      });

      await recordPaymentEvent({
        orgId: org.id,
        userId: request.user?.id || null,
        stripeCustomerId: org.stripeCustomerId,
        stripeSubscriptionId: subToResumeId,
        eventType: 'subscription_resumed',
        status: 'SUCCESS',
        metadata: { cancelAtPeriodEnd: false },
      });

      return reply.send({
        success: true,
        message: 'Subscription successfully resumed! Your plan will automatically renew on schedule.',
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to resume subscription', details: error.message });
    }
  }

  /**
   * Stripe Webhook Handler
   */
  async handleWebhook(request, reply) {
    const signature = request.headers['stripe-signature'];

    let event;
    try {
      event = stripeService.constructWebhookEvent(request.rawBody, signature);
    } catch (err) {
      request.log.error(`Webhook signature verification failed: ${err.message}`);

      await recordPaymentEvent({
        eventType: 'webhook_signature_failed',
        status: 'FAILED',
        failureReason: err.message,
      });

      return reply.code(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          if (session.mode === 'subscription') {
            const customerId = session.customer;
            const fullSession = await stripeService.retrieveCheckoutSession(session.id).catch(() => null);
            const lineItem = fullSession?.line_items?.data?.[0];
            const priceId = lineItem?.price?.id;

            if (priceId) {
              const matchingPlan = await prisma.plan.findFirst({
                where: {
                  OR: [
                    { monthlyPriceId: priceId },
                    { yearlyPriceId: priceId },
                  ],
                },
              });

              if (matchingPlan) {
                const isYearly = matchingPlan.yearlyPriceId === priceId;
                const now = new Date();
                const expiresAt = new Date(now);
                if (isYearly) {
                  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
                } else {
                  expiresAt.setMonth(expiresAt.getMonth() + 1);
                }

                const orgs = await prisma.organization.findMany({ where: { stripeCustomerId: customerId } });
                for (const org of orgs) {
                  await prisma.organization.update({
                    where: { id: org.id },
                    data: {
                      currentPlanId: matchingPlan.id,
                      subscriptionStatus: 'active',
                      isFreeTrialUsed: true,
                      planExpiresAt: expiresAt,
                    },
                  });

                  await recordPaymentEvent({
                    orgId: org.id,
                    stripeCustomerId: customerId,
                    stripeSessionId: session.id,
                    stripeSubscriptionId: String(session.subscription || ''),
                    eventType: 'webhook_checkout_completed',
                    status: 'SUCCESS',
                    amountCents: session.amount_total || 0,
                    currency: session.currency || 'usd',
                    planId: matchingPlan.id,
                    planName: matchingPlan.name,
                  });
                }
              }
            }
          }
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          const customerId = invoice.customer;
          const failureMessage = invoice.last_finalization_error?.message || 'Payment processing failed';

          const orgs = await prisma.organization.findMany({ where: { stripeCustomerId: customerId } });
          for (const org of orgs) {
            await prisma.organization.update({
              where: { id: org.id },
              data: { subscriptionStatus: 'past_due' },
            });

            await recordPaymentEvent({
              orgId: org.id,
              stripeCustomerId: customerId,
              stripePaymentIntentId: String(invoice.payment_intent || ''),
              eventType: 'invoice.payment_failed',
              status: 'FAILED',
              amountCents: invoice.amount_due || 0,
              failureReason: failureMessage,
              metadata: { invoiceId: invoice.id, invoiceUrl: invoice.hosted_invoice_url },
            });
          }
          break;
        }
        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          const customerId = subscription.customer;

          const orgs = await prisma.organization.findMany({ where: { stripeCustomerId: customerId } });
          for (const org of orgs) {
            await prisma.organization.update({
              where: { id: org.id },
              data: { subscriptionStatus: 'canceled', currentPlanId: null },
            });

            await recordPaymentEvent({
              orgId: org.id,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscription.id,
              eventType: 'customer.subscription.deleted',
              status: 'SUCCESS',
              metadata: { reason: subscription.cancellation_details?.reason || 'User canceled' },
            });
          }
          break;
        }
      }

      return reply.send({ received: true });
    } catch (err) {
      request.log.error(`Error processing webhook: ${err.message}`);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  }

  /**
   * Generate SetupIntent for In-App Add Card Modal
   */
  async createSetupIntent(request, reply) {
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

      const setupIntent = await stripeService.createSetupIntent(customerId);
      const publishableKey = process.env.VITE_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '';

      return reply.send({
        success: true,
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
        publishableKey,
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to create setup intent', details: error.message });
    }
  }

  /**
   * List attached cards for the organization
   */
  async getPaymentMethods(request, reply) {
    try {
      const orgId = request.user?.orgId;
      if (!orgId) return reply.code(400).send({ error: 'Missing orgId' });

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org || !org.stripeCustomerId) {
        return reply.send({ success: true, cards: [], defaultPaymentMethodId: null });
      }

      const result = await stripeService.listPaymentMethods(org.stripeCustomerId);
      return reply.send({ success: true, ...result });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch payment methods', details: error.message });
    }
  }

  /**
   * Set default payment method
   */
  async setDefaultPaymentMethod(request, reply) {
    try {
      const orgId = request.user?.orgId;
      const { paymentMethodId } = request.body || {};

      if (!orgId || !paymentMethodId) {
        return reply.code(400).send({ error: 'Missing orgId or paymentMethodId' });
      }

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org || !org.stripeCustomerId) {
        return reply.code(400).send({ error: 'Customer not found' });
      }

      await stripeService.setDefaultPaymentMethod(org.stripeCustomerId, paymentMethodId);

      return reply.send({ success: true, message: 'Default payment method updated successfully' });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to set default payment method', details: error.message });
    }
  }

  /**
   * Detach/delete card
   */
  async deletePaymentMethod(request, reply) {
    try {
      const { paymentMethodId } = request.body || {};
      if (!paymentMethodId) {
        return reply.code(400).send({ error: 'Missing paymentMethodId' });
      }

      await stripeService.detachPaymentMethod(paymentMethodId);

      return reply.send({ success: true, message: 'Payment method removed successfully' });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to remove payment method', details: error.message });
    }
  }
}

module.exports = new StripeController();
