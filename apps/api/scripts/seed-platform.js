/**
 * Seed Platform Admin + ensure default plans + landing page.
 * Run: node apps/api/scripts/seed-platform.js
 */
const path = require('path');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

try {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
} catch {
  /* optional */
}

const prisma = new PrismaClient();

const PLATFORM_ADMIN = {
  email: 'platformadmin@noahcloud.ai',
  password: 'NoahPlatform@2026!',
  name: 'NOAH Platform Admin',
};

const GB = 1024 ** 3;
const TB = 1024 ** 4;

const DEFAULT_PLANS = [
  {
    id: 'free',
    name: 'Free',
    description: 'For individuals exploring Noah with core library tools.',
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    storageQuotaBytes: BigInt(5 * GB),
    maxUsers: 2,
    maxWorkspaces: 1,
    features: [
      'Up to 5 GB media storage',
      'Basic media library & folders',
      'Share links with view access',
      'Mobile & desktop access',
      'Community support',
    ],
    isPublic: true,
    isFeatured: false,
    sortOrder: 0,
    ctaLabel: 'Continue with Free',
    isActive: true,
  },
  {
    id: 'basic',
    name: 'Basic',
    description: 'For individuals and small teams getting started.',
    monthlyPriceCents: 1000,
    yearlyPriceCents: 10800,
    storageQuotaBytes: BigInt(100 * GB),
    maxUsers: 5,
    maxWorkspaces: 3,
    features: [
      'Media library essentials',
      'Share links & file comments',
      'Activity feed & project overview',
      'Mobile & desktop access',
      'Email support',
    ],
    isPublic: true,
    isFeatured: false,
    sortOrder: 1,
    ctaLabel: 'Get started',
    isActive: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    description: 'For growing teams that need smarter workflows.',
    monthlyPriceCents: 2500,
    yearlyPriceCents: 27000,
    storageQuotaBytes: BigInt(1 * TB),
    maxUsers: 25,
    maxWorkspaces: 20,
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
    sortOrder: 2,
    ctaLabel: 'Start with Premium',
    isActive: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations with advanced needs.',
    monthlyPriceCents: 5000,
    yearlyPriceCents: 54000,
    storageQuotaBytes: BigInt(10 * TB),
    maxUsers: 500,
    maxWorkspaces: 1000,
    features: [
      'Dedicated account manager',
      'Custom integrations & automation',
      'SSO & role-based access control',
      'Unlimited projects & users',
      'KPI dashboards & reporting tools',
      'Onboarding support',
    ],
    isPublic: true,
    isFeatured: false,
    sortOrder: 3,
    ctaLabel: 'Contact Sales',
    isActive: true,
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(PLATFORM_ADMIN.password, 10);

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
    await prisma.plan.upsert({
      where: { id: plan.id },
      create: plan,
      update: {
        name: plan.name,
        description: plan.description,
        monthlyPriceCents: plan.monthlyPriceCents,
        yearlyPriceCents: plan.yearlyPriceCents,
        storageQuotaBytes: plan.storageQuotaBytes,
        maxUsers: plan.maxUsers,
        maxWorkspaces: plan.maxWorkspaces,
        features: plan.features,
        isPublic: plan.isPublic,
        isFeatured: plan.isFeatured,
        sortOrder: plan.sortOrder,
        ctaLabel: plan.ctaLabel,
        isActive: plan.isActive,
      },
    });
    console.log('Plan ready:', plan.id);
  }

  await prisma.landingPage.upsert({
    where: { slug: 'main' },
    create: {
      slug: 'main',
      status: 'published',
      heroTitle: 'A library worthy of your beautiful work.',
      heroSubtitle: 'Enterprise media asset management for modern creative teams.',
      ctaLabel: 'Get started',
      ctaHref: '/signup',
      sections: [
        {
          id: 'features',
          title: 'Built for media teams',
          body: 'Review, annotate, organize, and deliver — in one place.',
        },
      ],
      publishedAt: new Date(),
    },
    update: {
      status: 'published',
      publishedAt: new Date(),
    },
  });
  console.log('Landing page ready: main');

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
