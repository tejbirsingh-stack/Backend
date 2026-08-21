const Stripe = require('stripe');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

let cachedSecretKey = null;
let cachedStripeInstance = null;

async function getStripe() {
  try {
    let key = '';
    const setting = await prisma.systemSetting.findFirst({
      where: { key: { in: ['TEST_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY'] } }
    });
    if (setting?.value) key = setting.value;
    if (!key) key = process.env.TEST_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

    if (cachedStripeInstance && cachedSecretKey === key) {
      return cachedStripeInstance;
    }
    cachedSecretKey = key;
    cachedStripeInstance = new Stripe(key, { apiVersion: '2023-10-16' });
    return cachedStripeInstance;
  } catch (err) {
    const fallbackKey = process.env.TEST_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    return new Stripe(fallbackKey, { apiVersion: '2023-10-16' });
  }
}

/**
 * Stripe Service
 * Wraps Stripe API calls to manage Customers, Subscriptions, and Checkout.
 */
class StripeService {

  /**
   * Create a new Stripe Customer
   * @param {string} email - The customer's email address
   * @param {string} name - The customer's name (Organization name)
   * @param {object} metadata - Additional metadata (e.g., orgId)
   * @param {object} [address] - Optional address object { line1, line2, city, state, postal_code, country }
   * @returns {Promise<Stripe.Customer>} The created customer
   */
  async createCustomer(email, name, metadata = {}, address = null) {
    try {
      const stripe = await getStripe();
      const payload = {
        email,
        name,
        metadata,
      };
      if (address) {
        payload.address = address;
      }
      const customer = await stripe.customers.create(payload);
      return customer;
    } catch (error) {
      console.error('[StripeService] Error creating customer:', error);
      throw error;
    }
  }

  /**
   * Get an existing Stripe Customer by ID
   */
  async getCustomer(customerId) {
    const stripe = await getStripe();
    return stripe.customers.retrieve(customerId);
  }

  /**
   * Update an existing Stripe Customer by ID
   */
  async updateCustomer(customerId, updateData) {
    try {
      const stripe = await getStripe();
      return await stripe.customers.update(customerId, updateData);
    } catch (error) {
      console.error('[StripeService] Error updating customer:', error);
      throw error;
    }
  }

  /**
   * Create a Stripe Checkout Session for a subscription
   * @param {string} customerId - The Stripe Customer ID
   * @param {string} priceId - The Stripe Price ID (from Plan table)
   * @param {string} successUrl - URL to redirect to on success
   * @param {string} cancelUrl - URL to redirect to on cancel
   */
  async createCheckoutSession(customerId, priceId, successUrl, cancelUrl) {
    try {
      const stripe = await getStripe();
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        billing_address_collection: 'auto',
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      return session;
    } catch (error) {
      console.error('[StripeService] Error creating checkout session:', error);
      throw error;
    }
  }

  /**
   * Create a direct subscription using an existing saved payment method
   * @param {string} customerId - Stripe Customer ID
   * @param {string} priceId - Stripe Price ID
   * @param {string} paymentMethodId - Stripe PaymentMethod ID
   */
  async createSubscriptionDirectly(customerId, priceId, paymentMethodId) {
    try {
      const stripe = await getStripe();
      if (paymentMethodId) {
        await stripe.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });
      }

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        default_payment_method: paymentMethodId || undefined,
        expand: ['latest_invoice.payment_intent'],
      });

      return subscription;
    } catch (error) {
      console.error('[StripeService] Error creating direct subscription:', error);
      throw error;
    }
  }

  /**
   * Sync a Noah Plan to Stripe Product Catalogue
   * @param {Object} planData - Plan details from database
   * @returns {Object} - Object containing stripeProductId, monthlyPriceId, yearlyPriceId
   */
  async syncPlanToStripe(planData) {
    try {
      const stripe = await getStripe();
      const productId = planData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); // Use deterministic slug as Stripe Product ID

      // 1. Sync Product
      let product;
      try {
        product = await stripe.products.retrieve(productId);
        product = await stripe.products.update(productId, {
          name: planData.name,
          description: planData.description || undefined,
          active: planData.isActive,
        });
      } catch (error) {
        if (error.code === 'resource_missing' || error.statusCode === 404) {
          product = await stripe.products.create({
            id: productId,
            name: planData.name,
            description: planData.description || undefined,
            active: planData.isActive,
          });
        } else {
          throw error;
        }
      }

      // Helper to find or create price
      const findOrCreatePrice = async (cents, interval, existingPriceId) => {
        if (cents <= 0) return null; // free tier, no price needed
        
        if (existingPriceId) {
          try {
            const existing = await stripe.prices.retrieve(existingPriceId);
            if (
              existing.unit_amount === cents &&
              existing.recurring?.interval === interval &&
              existing.product === product.id &&
              existing.active
            ) {
              return existing.id; // Still valid, reuse
            }
            // Archive the old price because it no longer matches
            await stripe.prices.update(existingPriceId, { active: false }).catch(() => {});
          } catch (e) {
            // Ignore retrieve/update errors and just create a new one
          }
        }

        // Before creating, search for an existing active price with the same amount on this product
        try {
          const list = await stripe.prices.list({ product: product.id, active: true, limit: 20 });
          const match = list.data.find(
            (p) => p.unit_amount === cents && p.recurring?.interval === interval
          );
          if (match) return match.id;
        } catch (_e) { /* ignore list errors */ }

        // Create new price
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: cents,
          currency: 'usd',
          recurring: { interval },
        });
        return price.id;
      };

      const monthlyPriceId = await findOrCreatePrice(planData.monthlyPriceCents, 'month', planData.monthlyPriceId);
      const yearlyPriceId = await findOrCreatePrice(planData.yearlyPriceCents, 'year', planData.yearlyPriceId);

      return {
        stripeProductId: product.id,
        monthlyPriceId,
        yearlyPriceId,
      };
    } catch (error) {
      console.error('[StripeService] Error syncing plan to Stripe:', error);
      throw error;
    }
  }

  /**
   * Archive a Stripe Product (when deleted in NOAH)
   * @param {string} productId - Stripe Product ID (plan slug)
   */
  async archivePlanInStripe(productId) {
    try {
      const stripe = await getStripe();
      await stripe.products.update(productId, { active: false });
      return true;
    } catch (error) {
      if (error.code === 'resource_missing' || error.statusCode === 404) {
        return true; // Already gone
      }
      console.error('[StripeService] Error archiving plan in Stripe:', error);
      throw error;
    }
  }

  /**
   * Dynamically create a price in Stripe
   */
  async createPrice({ amountCents, interval = 'month', productName = 'Noah Plan' }) {
    try {
      const stripe = await getStripe();
      const price = await stripe.prices.create({
        unit_amount: amountCents,
        currency: 'usd',
        recurring: { interval },
        product_data: {
          name: productName,
        },
      });
      return price;
    } catch (error) {
      console.error('[StripeService] Error creating price:', error);
      throw error;
    }
  }

  /**
   * Update existing Stripe Subscription (Instant Prorated Upgrade OR Scheduled Downgrade)
   * @param {string} subscriptionId - Active Stripe Subscription ID
   * @param {string} newPriceId - New Stripe Price ID
   * @param {boolean} isDowngrade - Whether this is a downgrade
   */
  async updateSubscription(subscriptionId, newPriceId, isDowngrade = false) {
    try {
      const stripe = await getStripe();
      if (isDowngrade) {
        return await this.scheduleDowngrade(subscriptionId, newPriceId);
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const itemId = subscription.items?.data?.[0]?.id;
      if (!itemId) {
        throw new Error('Subscription item not found for update');
      }

      const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: itemId,
            price: newPriceId,
          },
        ],
        proration_behavior: 'always_invoice',
        payment_behavior: 'error_if_incomplete',
        expand: ['latest_invoice', 'latest_invoice.payment_intent'],
      });

      return updatedSubscription;
    } catch (error) {
      console.error('[StripeService] Error updating subscription:', error);
      throw error;
    }
  }

  /**
   * Schedule a plan downgrade at the end of the current billing cycle using Stripe Subscription Schedules
   */
  async scheduleDowngrade(subscriptionId, newPriceId) {
    try {
      const stripe = await getStripe();
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      let scheduleId = typeof subscription.schedule === 'string'
        ? subscription.schedule
        : subscription.schedule?.id;

      if (!scheduleId) {
        const createdSchedule = await stripe.subscriptionSchedules.create({
          from_subscription: subscriptionId,
        });
        scheduleId = createdSchedule.id;
      }

      const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
      const currentPhase = schedule.phases?.[0];

      const updatedSchedule = await stripe.subscriptionSchedules.update(scheduleId, {
        end_behavior: 'release',
        phases: [
          {
            items: [{ price: currentPhase.items[0].price }],
            start_date: currentPhase.start_date,
            end_date: currentPhase.end_date,
          },
          {
            items: [{ price: newPriceId }],
            start_date: currentPhase.end_date,
          },
        ],
      });

      return { ...subscription, isScheduledDowngrade: true, schedule: updatedSchedule };
    } catch (error) {
      console.error('[StripeService] Error scheduling downgrade:', error);
      throw error;
    }
  }

  /**
   * Retrieve a Stripe Checkout Session with expanded line items
   */
  async retrieveCheckoutSession(sessionId) {
    try {
      const stripe = await getStripe();
      return await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['line_items', 'customer', 'invoice', 'subscription', 'subscription.latest_invoice'],
      });
    } catch (error) {
      console.error('[StripeService] Error retrieving checkout session:', error);
      throw error;
    }
  }

  /**
   * List active subscriptions for a customer
   */
  async listActiveSubscriptions(customerId) {
    try {
      const stripe = await getStripe();
      return await stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
        expand: ['data.items.data.price'],
        limit: 10,
      });
    } catch (error) {
      console.error('[StripeService] Error listing subscriptions:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription at period end
   */
  async cancelSubscriptionAtPeriodEnd(subscriptionId) {
    try {
      const stripe = await getStripe();
      return await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    } catch (error) {
      console.error('[StripeService] Error canceling subscription:', error);
      throw error;
    }
  }

  /**
   * Resume subscription (un-cancel at period end)
   */
  async resumeSubscription(subscriptionId) {
    try {
      const stripe = await getStripe();
      return await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });
    } catch (error) {
      console.error('[StripeService] Error resuming subscription:', error);
      throw error;
    }
  }

  /**
   * Create a Stripe Billing Portal Session (allows users to update cards, view invoices, etc.)
   * @param {string} customerId - The Stripe Customer ID
   * @param {string} returnUrl - URL to redirect to when they leave the portal
   */
  async createBillingPortalSession(customerId, returnUrl) {
    try {
      const stripe = await getStripe();
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return session;
    } catch (error) {
      console.error('[StripeService] Error creating billing portal session:', error);
      throw error;
    }
  }

  /**
   * List invoices for a Stripe customer
   * @param {string} customerId
   * @param {number} limit
   */
  async listInvoices(customerId, limit = 20) {
    try {
      const stripe = await getStripe();
      if (!customerId) return { data: [] };
      const invoices = await stripe.invoices.list({
        customer: customerId,
        limit,
      });
      return invoices;
    } catch (error) {
      console.error('[StripeService] Error listing invoices:', error);
      return { data: [] };
    }
  }

  /**
   * Retrieve a single Stripe Invoice by ID
   * @param {string} invoiceId
   */
  async retrieveInvoice(invoiceId) {
    try {
      const stripe = await getStripe();
      if (!invoiceId) return null;
      return await stripe.invoices.retrieve(invoiceId);
    } catch (error) {
      console.error('[StripeService] Error retrieving invoice:', error);
      return null;
    }
  }

  /**
   * Verify a Stripe Webhook Signature
   * @param {string} payload - The raw request body
   * @param {string} signature - The Stripe signature header
   */
  async constructWebhookEvent(payload, signature) {
    try {
      const stripe = await getStripe();
      let webhookSecret = '';
      const isQA = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'qa' || process.env.WEBHOOK_HOST?.includes('qa.noahcloud.ai');
      const preferredKeys = isQA
        ? ['QA_STRIPE_WEBHOOK_SECRET', 'LOCAL_STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET']
        : ['LOCAL_STRIPE_WEBHOOK_SECRET', 'QA_STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET'];

      try {
        for (const key of preferredKeys) {
          const setting = await prisma.systemSetting.findUnique({ where: { key } });
          if (setting?.value) {
            webhookSecret = setting.value;
            break;
          }
        }
      } catch (e) { }

      if (!webhookSecret) {
        webhookSecret =
          process.env.QA_STRIPE_WEBHOOK_SECRET ||
          process.env.LOCAL_STRIPE_WEBHOOK_SECRET ||
          process.env.STRIPE_WEBHOOK_SECRET;
      }
      return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      console.error('[StripeService] Webhook signature verification failed:', error.message);
      throw error;
    }
  }

  /**
   * Send Usage Record to Stripe (for metered billing)
   * @param {string} subscriptionItemId - The Stripe Subscription Item ID
   * @param {number} quantity - The usage amount (e.g., storage bytes)
   * @param {string} action - 'set' or 'increment'
   */
  async reportUsage(subscriptionItemId, quantity, action = 'set') {
    try {
      const stripe = await getStripe();
      const usageRecord = await stripe.subscriptionItems.createUsageRecord(
        subscriptionItemId,
        {
          quantity,
          timestamp: Math.floor(Date.now() / 1000),
          action,
        }
      );
      return usageRecord;
    } catch (error) {
      console.error('[StripeService] Error reporting usage:', error);
      throw error;
    }
  }

  /**
   * Create SetupIntent for adding a card
   */
  async createSetupIntent(customerId) {
    try {
      const stripe = await getStripe();
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
      });
      return setupIntent;
    } catch (error) {
      console.error('[StripeService] Error creating setup intent:', error);
      throw error;
    }
  }

  /**
   * List customer's attached credit cards
   */
  async listPaymentMethods(customerId) {
    try {
      const stripe = await getStripe();
      const customer = await stripe.customers.retrieve(customerId);
      const defaultPmId = typeof customer.invoice_settings?.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings?.default_payment_method?.id;

      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      const cards = (paymentMethods?.data || []).map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand || 'card',
        last4: pm.card?.last4 || '****',
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
        nameOnCard: pm.billing_details?.name || customer.name || 'Cardholder',
        isDefault: pm.id === defaultPmId || paymentMethods.data.length === 1,
      }));

      return { cards, defaultPaymentMethodId: defaultPmId };
    } catch (error) {
      console.error('[StripeService] Error listing payment methods:', error);
      throw error;
    }
  }

  /**
   * Set default payment method for customer
   */
  async setDefaultPaymentMethod(customerId, paymentMethodId) {
    try {
      const stripe = await getStripe();
      try {
        await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      } catch (attachErr) {
        // already attached
      }
      return await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    } catch (error) {
      console.error('[StripeService] Error setting default payment method:', error);
      throw error;
    }
  }

  /**
   * Detach / Delete a payment method
   */
  async detachPaymentMethod(paymentMethodId) {
    try {
      const stripe = await getStripe();
      return await stripe.paymentMethods.detach(paymentMethodId);
    } catch (error) {
      console.error('[StripeService] Error detaching payment method:', error);
      throw error;
    }
  }
}

module.exports = new StripeService();
