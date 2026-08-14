const Stripe = require('stripe');

// Initialize Stripe with the secret key from environment variables
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16', // Always hardcode the version your integration is built for
});

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
   * @returns {Promise<Stripe.Customer>} The created customer
   */
  async createCustomer(email, name, metadata = {}) {
    try {
      const customer = await stripe.customers.create({
        email,
        name,
        metadata,
      });
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
    return stripe.customers.retrieve(customerId);
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
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
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
   * Dynamically create a price in Stripe
   */
  async createPrice({ amountCents, interval = 'month', productName = 'Noah Plan' }) {
    try {
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
        expand: ['latest_invoice.payment_intent'],
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
      return await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['line_items', 'customer', 'invoice'],
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
   * Verify a Stripe Webhook Signature
   * @param {string} payload - The raw request body
   * @param {string} signature - The Stripe signature header
   */
  constructWebhookEvent(payload, signature) {
    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
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
      return await stripe.paymentMethods.detach(paymentMethodId);
    } catch (error) {
      console.error('[StripeService] Error detaching payment method:', error);
      throw error;
    }
  }
}

module.exports = new StripeService();
