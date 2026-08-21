const stripeService = require('../services/stripe.service.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function getFrontendUrl(req) {
  if (req) {
    const origin = req.headers?.origin;
    if (origin && origin.startsWith('http')) {
      return origin.replace(/\/$/, '');
    }
    const referer = req.headers?.referer;
    if (referer && referer.startsWith('http')) {
      try {
        const parsed = new URL(referer);
        return `${parsed.protocol}//${parsed.host}`;
      } catch (e) {}
    }
  }
  const url = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://qa.noahcloud.ai' : 'http://localhost:3002');
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
          stripePaymentIntentId: stripePaymentIntentId || paymentLog.stripePaymentIntentId,
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

      // Auto-heal dirty seed state: if plan was deleted directly in DB, the foreign key might be violated on next update
      if (org.currentPlanId) {
        const planExists = await prisma.plan.findUnique({ where: { id: org.currentPlanId } });
        if (!planExists) {
          console.warn(`[Stripe] Auto-healing invalid currentPlanId for org ${org.id}`);
          await prisma.organization.update({
            where: { id: org.id },
            data: { currentPlanId: null, subscriptionStatus: null },
          });
          org.currentPlanId = null;
          org.subscriptionStatus = null;
        }
      }

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
        const metadata = org.metadata || {};
        const billingAddr = metadata.billingAddress;
        const invConfig = metadata.invoiceConfig;

        const customer = await stripeService.createCustomer(
          invConfig?.invoiceEmail || request.user.email,
          invConfig?.companyName || org.name,
          { orgId: org.id },
          billingAddr?.line1 ? {
            line1: billingAddr.line1 || '',
            line2: billingAddr.line2 || '',
            city: billingAddr.city || '',
            state: billingAddr.state || '',
            postal_code: billingAddr.postalCode || '',
            country: billingAddr.country || 'US',
          } : null
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

            const getPlanRank = (pName, pId, cents) => {
              const str = (pName || pId || '').toLowerCase();
              if (str.includes('enterprise') || cents === 5000 || cents === 54000) return 3;
              if (str.includes('premium') || cents === 2500 || cents === 27000) return 2;
              if (str.includes('basic') || cents === 1000 || cents === 10800) return 1;
              return 0;
            };

            const currentPlanName = org.currentPlan?.name || org.metadata?.planId;
            const currentRank = getPlanRank(currentPlanName, org.currentPlanId, currentPriceCents);
            const targetRank = getPlanRank(matchingPlan.name, matchingPlan.id, 0);

            // Determine if this plan change is an upgrade or a downgrade
            let isDowngrade = false;
            if (targetRank < currentRank) {
              isDowngrade = true;
            } else if (targetRank === currentRank) {
              if (currentInterval === 'year' && newInterval === 'month') {
                isDowngrade = true;
              }
            }

            const updatedSub = await stripeService.updateSubscription(activeSub.id, priceId, isDowngrade);
            const expiresAt = new Date(activeSub.current_period_end * 1000);

            const updatedOrg = await prisma.organization.update({
              where: { id: org.id },
              data: {
                currentPlanId: isDowngrade ? org.currentPlanId : (matchingPlan.id !== 'custom' ? matchingPlan.id : undefined),
                subscriptionStatus: 'active',
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

            const latestInvoice = typeof updatedSub.latest_invoice === 'object' ? updatedSub.latest_invoice : null;
            const amountPaidCents = latestInvoice?.amount_paid || (isYearly ? (matchingPlan.yearlyPriceCents || 27000) : (matchingPlan.monthlyPriceCents || 2500));
            const invoicePdf = latestInvoice?.invoice_pdf || null;
            const invoiceUrl = latestInvoice?.hosted_invoice_url || null;

            await recordPaymentEvent({
              orgId: org.id,
              userId: request.user?.id || null,
              stripeCustomerId: customerId,
              stripeSubscriptionId: updatedSub.id,
              stripePaymentIntentId: (typeof latestInvoice?.payment_intent === 'object' ? latestInvoice.payment_intent.id : latestInvoice?.payment_intent) || null,
              eventType: isDowngrade ? 'subscription_downgrade_scheduled' : 'subscription_prorated_upgrade',
              status: 'SUCCESS',
              amountCents: amountPaidCents,
              currency: updatedSub.currency || 'usd',
              planId: matchingPlan.id,
              planName: matchingPlan.name,
              metadata: {
                planName: matchingPlan.name,
                billingCycle: newInterval === 'year' ? 'annual' : 'monthly',
                invoicePdf,
                invoiceUrl,
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
              checkoutDetails: {
                planName: matchingPlan.name,
                billingCycle: newInterval === 'year' ? 'annual' : 'monthly',
                amountPaidCents,
                currency: updatedSub.currency || 'usd',
                invoicePdf,
                invoiceUrl,
                isDowngrade,
              },
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

              const latestInvoice = typeof newSubscription.latest_invoice === 'object' ? newSubscription.latest_invoice : null;
              const amountPaidCents = latestInvoice?.amount_paid || (newInterval === 'year' ? (matchingPlan.yearlyPriceCents || 10800) : (matchingPlan.monthlyPriceCents || 1000));
              const invoicePdf = latestInvoice?.invoice_pdf || null;
              const invoiceUrl = latestInvoice?.hosted_invoice_url || null;

              return reply.send({
                directUpgrade: true,
                message: `Successfully subscribed to ${matchingPlan.name} using your saved card!`,
                organization: updatedOrg,
                checkoutDetails: {
                  planName: matchingPlan.name,
                  billingCycle: newInterval === 'year' ? 'annual' : 'monthly',
                  amountPaidCents,
                  currency: 'usd',
                  invoicePdf,
                  invoiceUrl,
                },
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

      const baseUrl = getFrontendUrl(request);
      const { successUrl, cancelUrl } = request.body || {};
      
      const finalSuccessUrl = successUrl 
        ? `${baseUrl}${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}` 
        : `${baseUrl}/home/settings/accounts/plan?success=true&session_id={CHECKOUT_SESSION_ID}`;
        
      const finalCancelUrl = cancelUrl 
        ? `${baseUrl}${cancelUrl}` 
        : `${baseUrl}/home/settings/accounts/plan?canceled=true`;

      const session = await stripeService.createCheckoutSession(
        customerId,
        checkoutPriceId,
        finalSuccessUrl,
        finalCancelUrl
      );

      // Log Payment Audit Event
      await recordPaymentEvent({
        orgId: org.id,
        userId: request.user?.id || null,
        stripeCustomerId: customerId,
        stripeSessionId: session.id,
        eventType: 'checkout_session_created',
        status: 'PENDING',
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

      const baseUrl = getFrontendUrl(request);
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

      const isDowngradeScheduled = org.metadata?.isDowngradeScheduled === true;
      const scheduledDowngrade = isDowngradeScheduled
        ? {
            planId: org.metadata?.scheduledPlanId || 'basic',
            planName: org.metadata?.scheduledPlanName || 'Basic Plan',
            billingCycle: org.metadata?.scheduledBillingCycle || 'monthly',
            effectiveDate: org.planExpiresAt || org.metadata?.expiresAt,
          }
        : null;

      return reply.send({ success: true, subscriptions, scheduledDowngrade });
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
   * Cancel a Scheduled Downgrade (Restore current active plan)
   */
  async cancelScheduledDowngrade(request, reply) {
    try {
      const orgId = request.user?.orgId;
      if (!orgId) return reply.code(400).send({ error: 'Missing orgId' });

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) return reply.code(404).send({ error: 'Organization not found' });

      const currentMetadata = typeof org.metadata === 'object' ? org.metadata : {};

      const updatedMetadata = {
        ...currentMetadata,
        isDowngradeScheduled: false,
        scheduledPlanId: undefined,
        scheduledPlanName: undefined,
        scheduledBillingCycle: undefined,
      };

      await prisma.organization.update({
        where: { id: org.id },
        data: {
          subscriptionStatus: 'active',
          metadata: updatedMetadata,
        },
      });

      if (org.stripeCustomerId) {
        try {
          const activeSubs = await stripeService.listActiveSubscriptions(org.stripeCustomerId);
          const subToResume = activeSubs?.data?.find((s) => s.cancel_at_period_end);
          if (subToResume) {
            await stripeService.resumeSubscription(subToResume.id);
          }
        } catch (err) {
          console.error('[StripeController] Error resuming Stripe subscription during downgrade cancellation:', err);
        }
      }

      await recordPaymentEvent({
        orgId: org.id,
        userId: request.user?.id || null,
        stripeCustomerId: org.stripeCustomerId,
        eventType: 'scheduled_downgrade_canceled',
        status: 'SUCCESS',
        metadata: { isDowngradeScheduled: false },
      });

      return reply.send({
        success: true,
        message: 'Scheduled downgrade canceled successfully. You will remain on your current plan!',
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to cancel scheduled downgrade', details: error.message });
    }
  }

  /**
   * Get historical invoices for the organization
   */
  async getInvoices(request, reply) {
    try {
      const orgId = request.user?.orgId || request.user?.organizationId;
      if (!orgId) {
        return reply.code(400).send({ error: 'User is not associated with an organization' });
      }

      const org = await prisma.organization.findUnique({
        where: { id: orgId },
      });

      if (!org) {
        return reply.code(440).send({ error: 'Organization not found' });
      }

      let stripeInvoices = [];
      if (org.stripeCustomerId) {
        const res = await stripeService.listInvoices(org.stripeCustomerId, 50);
        stripeInvoices = res?.data || [];
      }

      const formattedInvoices = stripeInvoices.map((inv) => {
        // Find line item that represents positive plan charge or fallback to first line
        const posLine = inv.lines?.data?.find((l) => l.amount > 0) || inv.lines?.data?.[0];
        const rawDesc = posLine?.description || inv.description || '';

        let description = `${org.name} Subscription`;
        if (/premium/i.test(rawDesc)) {
          description = 'Premium Plan — Subscription';
        } else if (/basic/i.test(rawDesc)) {
          description = 'Basic Plan — Subscription';
        } else if (/enterprise/i.test(rawDesc)) {
          description = 'Enterprise Plan — Subscription';
        } else if (rawDesc) {
          description = rawDesc.replace(/^1\s*[\u00d7xX]\s*/i, '').replace(/\s*\([^)]*\)$/, '').trim();
        }

        // Net charge amount (display $0.00 for $0 / credit adjustments instead of negative string)
        const netAmountCents = Math.max(0, inv.total > 0 ? inv.total : 0);
        const formattedAmount = `$${(netAmountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        const dateFormatted = new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }).format(new Date((inv.created || Date.now() / 1000) * 1000));

        let status = 'Paid';
        if (inv.status === 'open') status = 'Open';
        else if (inv.status === 'draft') status = 'Draft';
        else if (inv.status === 'uncollectible' || inv.status === 'void') status = 'Void';

        return {
          id: inv.id,
          invoiceNumber: inv.number || inv.id,
          date: dateFormatted,
          createdTimestamp: (inv.created || 0) * 1000,
          description,
          status,
          amount: formattedAmount,
          amountCents: netAmountCents,
          paidCents: inv.amount_paid || 0,
          invoicePdf: inv.invoice_pdf || inv.hosted_invoice_url || null,
          invoiceUrl: inv.hosted_invoice_url || inv.invoice_pdf || null,
        };
      });

      const totalInvoices = formattedInvoices.length;
      const paidInvoices = formattedInvoices.filter((i) => i.status === 'Paid');
      const lastPaidInvoice = paidInvoices[0] || null;
      // Calculate Lifetime Spend as actual cash collected by Stripe across paid invoices
      const lifetimeSpendCents = stripeInvoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);
      const lifetimeSpendFormatted = `$${(lifetimeSpendCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

      return reply.send({
        success: true,
        invoices: formattedInvoices,
        stats: {
          totalInvoices,
          lastPaymentDate: lastPaidInvoice ? lastPaidInvoice.date : '—',
          lifetimeSpend: lifetimeSpendFormatted,
        },
      });
    } catch (error) {
      request.log ? request.log.error(error) : console.error('[StripeController] getInvoices error:', error);
      return reply.code(500).send({ error: 'Failed to fetch invoices', details: error.message });
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
                    stripePaymentIntentId: session.payment_intent 
                      ? String(session.payment_intent) 
                      : (fullSession?.invoice?.payment_intent 
                          ? String(fullSession.invoice.payment_intent) 
                          : (fullSession?.subscription?.latest_invoice?.payment_intent 
                              ? String(fullSession.subscription.latest_invoice.payment_intent) 
                              : null)),
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
      let publishableKey = '';
      try {
        const setting = await prisma.systemSetting.findFirst({
          where: { key: { in: ['TEST_STRIPE_PUBLISHABLE_KEY', 'STRIPE_PUBLISHABLE_KEY'] } },
        });
        if (setting?.value) publishableKey = setting.value;
      } catch (e) {}
      if (!publishableKey) {
        publishableKey = process.env.TEST_STRIPE_PUBLISHABLE_KEY || process.env.VITE_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '';
      }

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

  /**
   * Get billing address and invoice configuration for the current organization
   */
  async getBillingDetails(request, reply) {
    try {
      const orgId = request.user?.orgId;
      if (!orgId) return reply.code(400).send({ error: 'Missing orgId' });

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) return reply.code(404).send({ error: 'Organization not found' });

      const metadata = org.metadata || {};
      const billingAddress = metadata.billingAddress || {
        companyName: org.name || '',
        line1: '',
        line2: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'US',
      };
      const invoiceConfig = metadata.invoiceConfig || {
        companyName: org.name || '',
        taxId: '',
        invoiceEmail: request.user?.email || '',
        billingContact: request.user?.name || '',
      };

      return reply.send({
        success: true,
        billingAddress,
        invoiceConfig,
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch billing details', details: error.message });
    }
  }

  /**
   * Update billing address for organization & sync with Stripe Customer
   */
  async updateBillingAddress(request, reply) {
    try {
      const orgId = request.user?.orgId;
      if (!orgId) return reply.code(400).send({ error: 'Missing orgId' });

      const { companyName, line1, line2, city, state, postalCode, country } = request.body || {};

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) return reply.code(404).send({ error: 'Organization not found' });

      const newAddress = {
        companyName: companyName !== undefined ? companyName : org.name,
        line1: line1 || '',
        line2: line2 || '',
        city: city || '',
        state: state || '',
        postalCode: postalCode || '',
        country: country || 'US',
      };

      const updatedMetadata = {
        ...(typeof org.metadata === 'object' && org.metadata !== null ? org.metadata : {}),
        billingAddress: newAddress,
      };

      await prisma.organization.update({
        where: { id: orgId },
        data: { metadata: updatedMetadata },
      });

      if (org.stripeCustomerId) {
        await stripeService.updateCustomer(org.stripeCustomerId, {
          name: newAddress.companyName || org.name,
          address: {
            line1: newAddress.line1,
            line2: newAddress.line2,
            city: newAddress.city,
            state: newAddress.state,
            postal_code: newAddress.postalCode,
            country: newAddress.country,
          },
        }).catch((err) => console.error('[Stripe Customer Address Sync Warning]', err.message));
      }

      return reply.send({
        success: true,
        message: 'Billing address updated successfully',
        billingAddress: newAddress,
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to update billing address', details: error.message });
    }
  }

  /**
   * Update invoice configuration for organization & sync with Stripe Customer
   */
  async updateInvoiceConfig(request, reply) {
    try {
      const orgId = request.user?.orgId;
      if (!orgId) return reply.code(400).send({ error: 'Missing orgId' });

      const { companyName, taxId, invoiceEmail, billingContact } = request.body || {};

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) return reply.code(404).send({ error: 'Organization not found' });

      const newInvoiceConfig = {
        companyName: companyName !== undefined ? companyName : org.name,
        taxId: taxId || '',
        invoiceEmail: invoiceEmail || request.user?.email || '',
        billingContact: billingContact || request.user?.name || '',
      };

      const updatedMetadata = {
        ...(typeof org.metadata === 'object' && org.metadata !== null ? org.metadata : {}),
        invoiceConfig: newInvoiceConfig,
      };

      await prisma.organization.update({
        where: { id: orgId },
        data: { metadata: updatedMetadata },
      });

      if (org.stripeCustomerId && newInvoiceConfig.invoiceEmail) {
        await stripeService.updateCustomer(org.stripeCustomerId, {
          name: newInvoiceConfig.companyName || org.name,
          email: newInvoiceConfig.invoiceEmail,
        }).catch((err) => console.error('[Stripe Customer Invoice Config Sync Warning]', err.message));
      }

      return reply.send({
        success: true,
        message: 'Invoice configuration updated successfully',
        invoiceConfig: newInvoiceConfig,
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to update invoice configuration', details: error.message });
    }
  }
}

module.exports = new StripeController();
