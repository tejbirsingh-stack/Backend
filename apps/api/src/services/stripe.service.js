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
}

module.exports = new StripeService();
