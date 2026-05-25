# CLAUDE.md - Billing Service

This folder contains the Stripe integration and billing management service.

## Overview
Handles subscriptions, payments, usage tracking, and invoice generation for the Noah platform.

## Tech Stack
- **Node.js** with TypeScript
- **Stripe SDK** - Payment processing
- **Express/Fastify** - API framework
- **PostgreSQL** - Billing data storage
- **BullMQ** - Job queue for billing tasks

## Key Features
- Subscription management (Free, Pro, Enterprise)
- Usage-based billing
- Payment method management
- Invoice generation
- Webhook handling
- Dunning management
- Analytics and reporting

## Subscription Tiers
```typescript
FREE: {
  storage: 5GB,
  users: 2,
  apiCalls: 1000/month
}
PRO: {
  storage: 100GB,
  users: 10,
  apiCalls: 10000/month,
  price: $29/month
}
ENTERPRISE: {
  storage: unlimited,
  users: unlimited,
  apiCalls: unlimited,
  price: custom
}
```

## API Endpoints
- `POST /subscriptions/create` - Create subscription
- `PUT /subscriptions/update` - Change plan
- `DELETE /subscriptions/cancel` - Cancel subscription
- `GET /billing/usage` - Get usage stats
- `GET /invoices` - List invoices
- `POST /payment-methods` - Add payment method
- `POST /webhooks/stripe` - Stripe webhook handler

## Stripe Webhooks
Handles events:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `payment_method.attached`

## Environment Variables
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
BILLING_DATABASE_URL=postgresql://...
```

## Running
```bash
# Development
npm run dev

# Production
npm run build && npm start

# Listen for webhooks (dev)
stripe listen --forward-to localhost:4001/webhooks/stripe
```

## Usage Tracking
Tracks and bills for:
- Storage usage (GB/month)
- API calls
- Bandwidth
- Number of users
- Processing minutes

## Integration
Main API calls billing service:
```typescript
// Check subscription status
const subscription = await billingService.getSubscription(organizationId);

// Track usage
await billingService.trackUsage({
  organizationId,
  metric: 'storage',
  amount: fileSize
});
```