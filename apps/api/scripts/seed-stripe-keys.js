/**
 * Seed / Sync Test Stripe Keys (system_settings) & Plan Price IDs into the database.
 * 
 * Usage:
 *   node apps/api/scripts/seed-stripe-keys.js
 */
const path = require('path');
const { PrismaClient } = require('@prisma/client');

try {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
} catch {
  /* optional */
}

const { getStripeConfig } = require('../src/services/stripeConfig');

const prisma = new PrismaClient();

async function main() {
  const stripeConfig = await getStripeConfig();
  const pubKey = stripeConfig.publishableKey || process.env.TEST_STRIPE_PUBLISHABLE_KEY || process.env.VITE_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY;
  const secKey = stripeConfig.secretKey || process.env.TEST_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  const qaWebhookSecret = stripeConfig.qaWebhookSecret || process.env.QA_STRIPE_WEBHOOK_SECRET;
  const localWebhookSecret = stripeConfig.localWebhookSecret || process.env.LOCAL_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

  console.log('Seeding Stripe System Settings to database...');

  // Remove old/obsolete entries if present to keep DB clean
  await prisma.systemSetting.deleteMany({
    where: { key: { in: ['STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'TEST_STRIPE_WEBHOOK_SECRET'] } }
  }).catch(() => { });

  if (pubKey) {
    const setting = await prisma.systemSetting.upsert({
      where: { key: 'TEST_STRIPE_PUBLISHABLE_KEY' },
      create: { key: 'TEST_STRIPE_PUBLISHABLE_KEY', value: pubKey },
      update: { value: pubKey },
    });
    console.log(`[DB SystemSetting] Saved TEST_STRIPE_PUBLISHABLE_KEY (${setting.value.slice(0, 12)}...)`);
  }

  if (secKey) {
    const setting = await prisma.systemSetting.upsert({
      where: { key: 'TEST_STRIPE_SECRET_KEY' },
      create: { key: 'TEST_STRIPE_SECRET_KEY', value: secKey },
      update: { value: secKey },
    });
    console.log(`[DB SystemSetting] Saved TEST_STRIPE_SECRET_KEY (${setting.value.slice(0, 12)}...)`);
  }

  if (qaWebhookSecret) {
    const setting = await prisma.systemSetting.upsert({
      where: { key: 'QA_STRIPE_WEBHOOK_SECRET' },
      create: { key: 'QA_STRIPE_WEBHOOK_SECRET', value: qaWebhookSecret },
      update: { value: qaWebhookSecret },
    });
    console.log(`[DB SystemSetting] Saved QA_STRIPE_WEBHOOK_SECRET (${setting.value.slice(0, 12)}...)`);
  }

  if (localWebhookSecret) {
    const setting = await prisma.systemSetting.upsert({
      where: { key: 'LOCAL_STRIPE_WEBHOOK_SECRET' },
      create: { key: 'LOCAL_STRIPE_WEBHOOK_SECRET', value: localWebhookSecret },
      update: { value: localWebhookSecret },
    });
    console.log(`[DB SystemSetting] Saved LOCAL_STRIPE_WEBHOOK_SECRET (${setting.value.slice(0, 12)}...)`);
  }

  // Sync Plan Stripe Price IDs into Plan records
  const priceIds = stripeConfig.priceIds || {};
  const planPriceMap = [
    {
      name: 'Basic',
      monthlyPriceId: priceIds.basicMonthly || process.env.STRIPE_BASIC_MONTHLY_PRICE_ID,
      yearlyPriceId: priceIds.basicYearly || process.env.STRIPE_BASIC_YEARLY_PRICE_ID,
    },
    {
      name: 'Premium',
      monthlyPriceId: priceIds.premiumMonthly || process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID,
      yearlyPriceId: priceIds.premiumYearly || process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID,
    },
    {
      name: 'Enterprise',
      monthlyPriceId: priceIds.enterpriseMonthly || process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
      yearlyPriceId: priceIds.enterpriseYearly || process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID,
    },
  ];

  console.log('\nSyncing Plan Stripe Price IDs in DB...');
  for (const item of planPriceMap) {
    const plan = await prisma.plan.findFirst({
      where: { name: { equals: item.name, mode: 'insensitive' } },
    });
    if (plan) {
      const dataToUpdate = {};
      if (item.monthlyPriceId) dataToUpdate.monthlyPriceId = item.monthlyPriceId;
      if (item.yearlyPriceId) dataToUpdate.yearlyPriceId = item.yearlyPriceId;

      if (Object.keys(dataToUpdate).length > 0) {
        await prisma.plan.update({
          where: { id: plan.id },
          data: dataToUpdate,
        });
        console.log(`[DB Plan] Updated ${plan.name} Stripe Price IDs:`, dataToUpdate);
      } else {
        console.log(`[DB Plan] ${plan.name} current Price IDs in DB: (Monthly: ${plan.monthlyPriceId || 'none'}, Yearly: ${plan.yearlyPriceId || 'none'})`);
      }
    }
  }

  console.log('\n✅ Stripe database settings & price sync complete!');
}

main()
  .catch((err) => {
    console.error('Error seeding Stripe keys:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
