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
      '1 Project & 1 Workspace',
      '0 Storage',
      '5 Members',
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
    name: 'Basic',
    description: 'For individuals and small teams getting started.',
    monthlyPriceCents: 1000,
    yearlyPriceCents: 10800,
    storageQuotaBytes: BigInt(300 * MB),
    maxUsers: 5,
    maxWorkspaces: 2,
    maxProjects: 2,
    features: [
      '2 Projects & 2 Workspaces',
      '300 MB Storage',
      '5 Members',
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
    name: 'Premium',
    description: 'For growing teams that need smarter workflows.',
    monthlyPriceCents: 2500,
    yearlyPriceCents: 27000,
    storageQuotaBytes: BigInt(15 * GB),
    maxUsers: 10,
    maxWorkspaces: 3,
    maxProjects: 3,
    features: [
      '3 Projects & 3 Workspaces',
      '15 GB Storage',
      '10 Members',
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
    name: 'Enterprise',
    description: 'For large organizations with advanced needs.',
    monthlyPriceCents: 5000,
    yearlyPriceCents: 54000,
    storageQuotaBytes: BigInt(20 * GB),
    maxUsers: 15,
    maxWorkspaces: 4,
    maxProjects: 4,
    features: [
      '4 Projects & 4 Workspaces',
      '20 GB Storage',
      '15 Members',
      'Dedicated account manager',
      'Custom integrations & automation',
      'SSO & role-based access control',
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
    const existing = await prisma.plan.findFirst({
      where: { name: { equals: plan.name, mode: 'insensitive' } },
    });

    if (existing) {
      const updated = await prisma.plan.update({
        where: { id: existing.id },
        data: plan,
      });
      console.log(`Plan ready: ${updated.name} (${updated.id})`);
    } else {
      const created = await prisma.plan.create({
        data: plan,
      });
      console.log(`Plan ready: ${created.name} (${created.id})`);
    }
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
      sections: { plansEnabled: true },
      publishedAt: new Date(),
    },
    update: {
      status: 'published',
      publishedAt: new Date(),
    },
  });
  console.log('Landing page ready: main');

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
