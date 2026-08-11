/**
 * Seed demo organizations for Platform Admin Organizations page.
 * Run: node apps/api/scripts/seed-demo-organizations.js
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

const GB = 1024 ** 3;
const MB = 1024 ** 2;

const DEMO_ORGS = [
  {
    name: 'Acme Creative Studio',
    slug: 'acme-creative',
    planName: 'Enterprise',
    status: 'active',
    storageUsedBytes: BigInt(Math.round(8.4 * GB)),
    subscriptionStatus: 'active',
    users: [
      { email: 'maya@acmecreative.com', name: 'Maya Chen', jobTitle: 'Super Admin' },
      { email: 'jordan@acmecreative.com', name: 'Jordan Lee', jobTitle: 'Admin' },
      { email: 'sam@acmecreative.com', name: 'Sam Ortiz', jobTitle: 'Editor' },
      { email: 'priya@acmecreative.com', name: 'Priya Nair', jobTitle: 'Reviewer' },
    ],
    workspaces: [
      { name: 'Brand Films', color: '#7C3AED' },
      { name: 'Social Campaigns', color: '#2563EB' },
      { name: 'Client Reviews', color: '#059669' },
    ],
  },
  {
    name: 'Northwind Media',
    slug: 'northwind-media',
    planName: 'Premium',
    status: 'active',
    storageUsedBytes: BigInt(Math.round(6.2 * GB)),
    subscriptionStatus: 'active',
    users: [
      { email: 'alex@northwind.media', name: 'Alex Rivera', jobTitle: 'Super Admin' },
      { email: 'casey@northwind.media', name: 'Casey Brooks', jobTitle: 'Admin' },
      { email: 'taylor@northwind.media', name: 'Taylor Kim', jobTitle: 'Producer' },
    ],
    workspaces: [
      { name: 'Production Hub', color: '#DC2626' },
      { name: 'Archive', color: '#64748B' },
    ],
  },
  {
    name: 'Brightpath Agency',
    slug: 'brightpath-agency',
    planName: 'Basic',
    status: 'active',
    storageUsedBytes: BigInt(180 * MB),
    subscriptionStatus: 'active',
    users: [
      { email: 'nina@brightpath.io', name: 'Nina Patel', jobTitle: 'Super Admin' },
      { email: 'owen@brightpath.io', name: 'Owen Blake', jobTitle: 'Designer' },
    ],
    workspaces: [{ name: 'Main Workspace', color: '#EA580C' }],
  },
  {
    name: 'Harbor Digital',
    slug: 'harbor-digital',
    planName: 'Premium',
    status: 'suspended',
    storageUsedBytes: BigInt(Math.round(14.1 * GB)),
    subscriptionStatus: 'past_due',
    users: [
      { email: 'chris@harbordigital.com', name: 'Chris Walsh', jobTitle: 'Super Admin' },
      { email: 'lee@harbordigital.com', name: 'Lee Nguyen', jobTitle: 'Admin' },
      { email: 'morgan@harbordigital.com', name: 'Morgan Ellis', jobTitle: 'Editor' },
      { email: 'jamie@harbordigital.com', name: 'Jamie Cruz', jobTitle: 'Viewer' },
      { email: 'riley@harbordigital.com', name: 'Riley Fox', jobTitle: 'Viewer' },
    ],
    workspaces: [
      { name: 'Client Deliverables', color: '#9333EA' },
      { name: 'Internal Assets', color: '#0D9488' },
      { name: 'Quarantine', color: '#B91C1C' },
      { name: 'Legacy Library', color: '#475569' },
    ],
  },
  {
    name: 'Summit Pictures',
    slug: 'summit-pictures',
    planName: 'Free',
    status: 'active',
    storageUsedBytes: BigInt(0),
    subscriptionStatus: 'trialing',
    users: [{ email: 'founder@summitpictures.co', name: 'Avery Stone', jobTitle: 'Super Admin' }],
    workspaces: [{ name: 'Pilot Project', color: '#4F46E5' }],
  },
  {
    name: 'Velvet Frame Studios',
    slug: 'velvet-frame',
    planName: 'Enterprise',
    status: 'active',
    storageUsedBytes: BigInt(Math.round(12.7 * GB)),
    subscriptionStatus: 'active',
    users: [
      { email: 'dana@velvetframe.studio', name: 'Dana Brooks', jobTitle: 'Super Admin' },
      { email: 'kai@velvetframe.studio', name: 'Kai Nakamura', jobTitle: 'Admin' },
      { email: 'elena@velvetframe.studio', name: 'Elena Rossi', jobTitle: 'Colorist' },
      { email: 'marc@velvetframe.studio', name: 'Marc Dubois', jobTitle: 'Editor' },
      { email: 'sofia@velvetframe.studio', name: 'Sofia Alvarez', jobTitle: 'Producer' },
      { email: 'ben@velvetframe.studio', name: 'Ben Carter', jobTitle: 'Reviewer' },
    ],
    workspaces: [
      { name: 'Feature Films', color: '#7C3AED' },
      { name: 'Commercials', color: '#DB2777' },
      { name: 'VFX Plates', color: '#0284C7' },
      { name: 'Delivery Masters', color: '#16A34A' },
      { name: 'Reference Library', color: '#A16207' },
    ],
  },
];

async function ensureRole() {
  let role = await prisma.role.findFirst({
    where: {
      OR: [{ name: 'Super Admin' }, { name: 'super_admin' }, { name: 'Admin' }],
    },
  });
  if (!role) {
    role = await prisma.role.create({
      data: { name: 'Super Admin' },
    });
  }
  return role;
}

async function main() {
  const plans = await prisma.plan.findMany();
  const planByName = Object.fromEntries(plans.map((p) => [p.name.toLowerCase(), p]));

  if (plans.length === 0) {
    console.error('No plans found. Run seed-platform.js first.');
    process.exit(1);
  }

  const role = await ensureRole();
  const passwordHash = await bcrypt.hash('DemoOrg@2026!', 10);

  for (const demo of DEMO_ORGS) {
    const plan = planByName[demo.planName.toLowerCase()];
    if (!plan) {
      console.warn(`Plan not found for ${demo.name}: ${demo.planName}, skipping`);
      continue;
    }

    const existing = await prisma.organization.findUnique({ where: { slug: demo.slug } });
    if (existing) {
      console.log(`Already exists: ${demo.name} (${demo.slug})`);
      continue;
    }

    const org = await prisma.organization.create({
      data: {
        name: demo.name,
        slug: demo.slug,
        planType: plan.id,
        currentPlanId: plan.id,
        status: demo.status,
        storageQuotaBytes: plan.storageQuotaBytes,
        storageUsedBytes: demo.storageUsedBytes,
        maxUsers: plan.maxUsers,
        maxWorkspaces: plan.maxWorkspaces,
        subscriptionStatus: demo.subscriptionStatus,
        features: plan.features,
      },
    });

    await prisma.organizationSettings.create({
      data: { orgId: org.id },
    });

    for (const ws of demo.workspaces) {
      await prisma.workspace.create({
        data: {
          name: ws.name,
          description: `${ws.name} for ${demo.name}`,
          color: ws.color,
          orgId: org.id,
        },
      });
    }

    for (const u of demo.users) {
      const emailTaken = await prisma.user.findUnique({ where: { email: u.email } });
      if (emailTaken) continue;
      await prisma.user.create({
        data: {
          orgId: org.id,
          email: u.email,
          name: u.name,
          jobTitle: u.jobTitle,
          passwordHash,
          emailVerified: true,
          status: demo.status === 'suspended' ? 'suspended' : 'active',
          roleId: role.id,
        },
      });
    }

    console.log(
      `Created: ${org.name} — ${demo.planName}, ${demo.status}, ${demo.users.length} users, ${demo.workspaces.length} workspaces`,
    );
  }

  const total = await prisma.organization.count();
  console.log(`\nDone. Total organizations in DB: ${total}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
