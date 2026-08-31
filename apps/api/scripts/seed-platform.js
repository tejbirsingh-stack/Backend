/**
 * Seed Platform Admin + ensure default plans + landing page.
 * Run: node apps/api/scripts/seed-platform.js
 */
const path = require('path');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const Stripe = require('stripe');

try {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
} catch {
  /* optional */
}

const prisma = new PrismaClient();

/**
 * Get or create a Stripe price for a given product and interval.
 * Uses the plan's human-readable slug as the stable Stripe Product ID so it's
 * the same across all environments (local, QA, prod) for the same Stripe account.
 */
async function syncPlanToStripe(stripe, plan) {
  if (!stripe) return {}; // Skip if no Stripe key configured

  const productId = plan.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Upsert Stripe Product
  let product;
  try {
    product = await stripe.products.retrieve(productId);
    product = await stripe.products.update(productId, {
      name: plan.name,
      description: plan.description || undefined,
      active: plan.isActive !== false,
    });
  } catch (err) {
    if (err.code === 'resource_missing' || err.statusCode === 404) {
      product = await stripe.products.create({
        id: productId,
        name: plan.name,
        description: plan.description || undefined,
        active: plan.isActive !== false,
      });
    } else {
      console.warn(`[Stripe] Could not sync product "${plan.name}": ${err.message}`);
      return {};
    }
  }

  const findOrCreatePrice = async (cents, interval, existingPriceId) => {
    if (!cents || cents <= 0) return null;
    if (existingPriceId) {
      try {
        const existing = await stripe.prices.retrieve(existingPriceId);
        if (
          existing.unit_amount === cents &&
          existing.recurring?.interval === interval &&
          existing.product === product.id &&
          existing.active
        ) {
          return existing.id; // Already correct, reuse
        }
        await stripe.prices.update(existingPriceId, { active: false }).catch(() => {});
      } catch (e) { /* will create a new one */ }
    }
    // Search for an existing active price with matching amount on this product
    try {
      const list = await stripe.prices.list({ product: product.id, active: true, limit: 20 });
      const match = list.data.find(
        p => p.unit_amount === cents && p.recurring?.interval === interval
      );
      if (match) return match.id;
    } catch (e) { /* ignore */ }
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: cents,
      currency: 'usd',
      recurring: { interval },
    });
    return price.id;
  };

  const monthlyPriceId = await findOrCreatePrice(plan.monthlyPriceCents, 'month', plan.monthlyPriceId);
  const yearlyPriceId = await findOrCreatePrice(plan.yearlyPriceCents, 'year', plan.yearlyPriceId);

  return { stripeProductId: product.id, monthlyPriceId, yearlyPriceId };
}

const PLATFORM_ADMIN = {
  email: 'platformadmin@noahcloud.ai',
  password: 'NoahPlatform@2026!',
  name: 'NOAH Platform Admin',
};

const MB = 1024 ** 2;
const GB = 1024 ** 3;
const TB = 1024 ** 4;

const DEFAULT_PLANS = [
  {
    name: 'Free',
    description: 'For individuals exploring Noah with core library tools.',
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    storageQuotaBytes: BigInt(0 * GB),
    maxUsers: 5,
    maxWorkspaces: 1,
    maxProjects: 1,
    features: [
      'Basic media library & folders',
      'Share links with view access',
      'Mobile & desktop access',
      'Community support',
    ],
    isPublic: true,
    isFeatured: false,
    sortOrder: 1,
    ctaLabel: 'Continue with Free',
    isActive: true,
  },
  {
    name: 'Basic',
    description: 'For individuals and small teams getting started.',
    monthlyPriceCents: 1000,
    yearlyPriceCents: 10800,
    storageQuotaBytes: BigInt(300 * MB),
    maxUsers: 5,
    maxWorkspaces: 2,
    maxProjects: 2,
    features: [
      'Media library essentials',
      'Share links & file comments',
      'Activity feed & project overview',
      'Mobile & desktop access',
      'Email support',
    ],
    isPublic: true,
    isFeatured: false,
    sortOrder: 2,
    ctaLabel: 'Get started',
    isActive: true,
  },
  {
    name: 'Premium',
    description: 'For growing teams that need smarter workflows.',
    monthlyPriceCents: 2500,
    yearlyPriceCents: 27000,
    storageQuotaBytes: BigInt(15 * GB),
    maxUsers: 10,
    maxWorkspaces: 3,
    maxProjects: 3,
    features: [
      'Review & annotate video/audio',
      'Advanced filters & reporting',
      'Custom labels, priorities & checklists',
      'Project insights & team analytics',
      'Billing & usage tracking',
      'Priority support',
    ],
    isPublic: true,
    isFeatured: true,
    sortOrder: 3,
    ctaLabel: 'Start with Premium',
    isActive: true,
  },
  {
    name: 'Enterprise',
    description: 'For large organizations with advanced needs.',
    monthlyPriceCents: 5000,
    yearlyPriceCents: 54000,
    storageQuotaBytes: BigInt(20 * GB),
    maxUsers: 15,
    maxWorkspaces: 4,
    maxProjects: 4,
    features: [
      'Dedicated account manager',
      'Custom integrations & automation',
      'SSO & role-based access control',
      'KPI dashboards & reporting tools',
      'Onboarding support',
    ],
    isPublic: true,
    isFeatured: false,
    sortOrder: 4,
    ctaLabel: 'Contact Sales',
    isActive: true,
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(PLATFORM_ADMIN.password, 10);

  // Initialise Stripe (optional — if no key is configured, plan sync is skipped gracefully)
  let stripe = null;
  try {
    const setting = await prisma.systemSetting.findFirst({
      where: { key: { in: ['TEST_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY'] } },
    }).catch(() => null);
    const stripeKey = setting?.value || process.env.TEST_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    if (stripeKey) {
      stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
      console.log('Stripe initialised — plans will be synced automatically.');
    } else {
      console.warn('No Stripe key found — skipping Stripe sync. Run Save in Platform Admin to sync later.');
    }
  } catch (e) {
    console.warn('Stripe init failed:', e.message);
  }

  const admin = await prisma.platformAdmin.upsert({
    where: { email: PLATFORM_ADMIN.email },
    create: {
      email: PLATFORM_ADMIN.email,
      name: PLATFORM_ADMIN.name,
      passwordHash,
      status: 'active',
    },
    update: {
      name: PLATFORM_ADMIN.name,
      passwordHash,
      status: 'active',
    },
  });

  console.log('Platform admin ready:', admin.email);

  for (const plan of DEFAULT_PLANS) {
    const { features, ...planData } = plan;
    const planSlug = plan.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    
    // Search by stripeProductId first (stable slug), fallback to name
    let existing = await prisma.plan.findFirst({
      where: { stripeProductId: planSlug },
    });
    
    if (!existing) {
      existing = await prisma.plan.findFirst({
        where: { name: { equals: plan.name, mode: 'insensitive' } },
      });
    }

    let currentPlan;
    if (existing) {
      // Preserve existing Stripe price IDs so we don't generate new prices on every seed run
      const updateData = { ...planData };
      if (existing.monthlyPriceId) delete updateData.monthlyPriceId;
      if (existing.yearlyPriceId) delete updateData.yearlyPriceId;
      currentPlan = await prisma.plan.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      currentPlan = await prisma.plan.create({
        data: planData,
      });
    }

    // Auto-sync ALL plans to Stripe (even free ones) so stripeProductId is always stored — rename-safe
    if (stripe) {
      try {
        const { stripeProductId, monthlyPriceId, yearlyPriceId } = await syncPlanToStripe(stripe, currentPlan);
        // Always save stripeProductId; only save price IDs if they exist
        const syncData = {};
        if (stripeProductId) syncData.stripeProductId = stripeProductId;
        if (monthlyPriceId) syncData.monthlyPriceId = monthlyPriceId;
        if (yearlyPriceId) syncData.yearlyPriceId = yearlyPriceId;
        if (Object.keys(syncData).length > 0) {
          currentPlan = await prisma.plan.update({ where: { id: currentPlan.id }, data: syncData });
        }
        console.log(`Plan ready + Stripe synced: ${currentPlan.name} (product: ${stripeProductId ?? 'n/a'}, monthly: ${monthlyPriceId ?? 'n/a'}, yearly: ${yearlyPriceId ?? 'n/a'})`);
      } catch (stripeErr) {
        console.warn(`Plan ready: ${currentPlan.name} — Stripe sync failed: ${stripeErr.message}`);
      }
    } else {
      console.log(`Plan ready: ${currentPlan.name} (${currentPlan.id})`);
    }

    for (let i = 0; i < features.length; i++) {
      const featureName = features[i];
      const featureRecord = await prisma.planFeature.upsert({
        where: { name: featureName },
        update: {},
        create: {
          name: featureName,
          sortOrder: i,
        },
      });

      await prisma.planFeatureSelection.upsert({
        where: {
          planId_featureId: {
            planId: currentPlan.id,
            featureId: featureRecord.id,
          },
        },
        update: {},
        create: {
          planId: currentPlan.id,
          featureId: featureRecord.id,
        },
      });
    }
  }

  const landingBase = {
    heroTitle: 'A library worthy of your beautiful work.',
    heroSubtitle:
      'NOAH Cloud is the media intelligence layer for modern teams — find anything, review on the timeline, and share finished work without leaving your library.',
    ctaLabel: 'Start free trial',
    ctaHref: '/signup',
    sections: { plansEnabled: true },
  };

  await prisma.landingPage.upsert({
    where: { slug: 'main' },
    create: {
      slug: 'main',
      status: 'published',
      ...landingBase,
      publishedAt: new Date(),
    },
    update: {
      status: 'published',
      publishedAt: new Date(),
    },
  });
  
  await prisma.landingPage.upsert({
    where: { slug: 'main-draft' },
    create: {
      slug: 'main-draft',
      status: 'draft',
      ...landingBase,
    },
    update: {},
  });

  console.log('Landing pages ready: main, main-draft');

  const DEFAULT_CONTENT = [
    {
      title: 'Noah starter brand kit',
      fileName: 'noah-brand-kit.pdf',
      filePath: 'platform-defaults/noah-brand-kit.pdf',
      mimeType: 'application/pdf',
      sizeBytes: BigInt(245000),
      assetType: 'document',
      sortOrder: 0,
      isEnabled: true,
    },
    {
      title: 'Sample hero still',
      fileName: 'sample-hero.jpg',
      filePath: 'platform-defaults/sample-hero.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: BigInt(1800000),
      assetType: 'image',
      sortOrder: 1,
      isEnabled: true,
    },
    {
      title: 'Onboarding welcome clip',
      fileName: 'welcome-clip.mp4',
      filePath: 'platform-defaults/welcome-clip.mp4',
      mimeType: 'video/mp4',
      sizeBytes: BigInt(12 * MB),
      assetType: 'video',
      sortOrder: 2,
      isEnabled: true,
    },
  ];

  for (const item of DEFAULT_CONTENT) {
    const existing = await prisma.platformDefaultContent.findFirst({
      where: { title: item.title },
    });
    if (existing) {
      await prisma.platformDefaultContent.update({
        where: { id: existing.id },
        data: item,
      });
      console.log(`Default content ready: ${item.title}`);
    } else {
      await prisma.platformDefaultContent.create({ data: item });
      console.log(`Default content ready: ${item.title}`);
    }
  }

  // Sync all existing organizations with their active plan's maxWorkspaces & maxProjects
  const allPlans = await prisma.plan.findMany();
  const planMapByName = new Map(allPlans.map(p => [p.name.toLowerCase(), p]));
  const planMapById = new Map(allPlans.map(p => [p.id, p]));

  const orgs = await prisma.organization.findMany();
  for (const org of orgs) {
    let plan = org.currentPlanId ? planMapById.get(org.currentPlanId) : null;
    if (!plan) {
      const targetPlanName = (org.metadata?.planId || 'free').toLowerCase();
      plan = planMapByName.get(targetPlanName) || planMapByName.get('free');
    }
    if (plan) {
      const planName = plan.name.toLowerCase();
      const startDate = org.createdAt ? new Date(org.createdAt) : new Date();
      let expiresAt = new Date(startDate);
      if (planName === 'free') {
        expiresAt.setDate(expiresAt.getDate() + 3);
      } else {
        const isMonthly = (org.metadata?.billingCycle || 'annual').toLowerCase() === 'monthly';
        if (isMonthly) {
          expiresAt.setMonth(expiresAt.getMonth() + 1);
        } else {
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        }
      }

      await prisma.organization.update({
        where: { id: org.id },
        data: {
          currentPlanId: plan.id,
          planExpiresAt: expiresAt,
        },
      });
      console.log(`Synced Org "${org.name}" (${org.id}) -> Plan "${plan.name}" (ExpiresAt: ${expiresAt.toISOString()})`);
    }
  }

  console.log('\nLogin at /platform/login');
  console.log(`  email: ${PLATFORM_ADMIN.email}`);
  console.log(`  password: ${PLATFORM_ADMIN.password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
