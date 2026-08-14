/**
 * Seed demo organizations for Platform Admin (dashboard, orgs, users, billing, usage).
 * Run: node apps/api/scripts/seed-demo-organizations.js
 *
 * Prerequisite: node apps/api/scripts/seed-platform.js
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

const ROLE_DEFS = [
  { name: 'Super Admin', show: 0 },
  { name: 'Admin', show: 1 },
  { name: 'Editor', show: 1 },
  { name: 'Viewer', show: 1 },
  { name: 'Collaborator', show: 1 },
];

function daysAgo(days, hours = 10) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hours, 15, 0, 0);
  return d;
}

function planExpiresAt(planName, startDate) {
  const expires = new Date(startDate);
  const name = String(planName || '').toLowerCase();
  if (name === 'free') {
    expires.setDate(expires.getDate() + 14);
  } else {
    expires.setFullYear(expires.getFullYear() + 1);
  }
  return expires;
}

function roleNameForJobTitle(jobTitle) {
  const t = String(jobTitle || '').toLowerCase();
  if (t.includes('super')) return 'Super Admin';
  if (t === 'admin') return 'Admin';
  if (['editor', 'producer', 'colorist', 'designer'].some((x) => t.includes(x))) return 'Editor';
  if (['viewer', 'reviewer'].some((x) => t.includes(x))) return 'Viewer';
  return 'Collaborator';
}

const DEMO_ORGS = [
  {
    name: 'Acme Creative Studio',
    slug: 'acme-creative',
    planName: 'Enterprise',
    status: 'active',
    storageUsedBytes: BigInt(Math.round(8.4 * GB)),
    subscriptionStatus: 'active',
    stripeCustomerId: 'cus_demo_acme',
    createdAt: daysAgo(78),
    users: [
      { email: 'maya@acmecreative.com', name: 'Maya Chen', jobTitle: 'Super Admin' },
      { email: 'jordan@acmecreative.com', name: 'Jordan Lee', jobTitle: 'Admin' },
      { email: 'sam@acmecreative.com', name: 'Sam Ortiz', jobTitle: 'Editor' },
      { email: 'priya@acmecreative.com', name: 'Priya Nair', jobTitle: 'Reviewer' },
      {
        email: 'inactive@acmecreative.com',
        name: 'Chris Idle',
        jobTitle: 'Viewer',
        status: 'inactive',
      },
    ],
    workspaces: [
      {
        name: 'Brand Films',
        color: '#7C3AED',
        projects: ['Q3 Brand Film', 'Founder Stories'],
        assets: [
          { title: 'Hero Cutdown v3', type: 'video' },
          { title: 'Logo Lockup Pack', type: 'image' },
        ],
      },
      {
        name: 'Social Campaigns',
        color: '#2563EB',
        projects: ['Summer Social'],
        assets: [
          { title: 'Reel — Launch Day', type: 'video' },
          { title: 'Caption Sheet', type: 'document' },
        ],
      },
      {
        name: 'Client Reviews',
        color: '#059669',
        projects: ['Review Round 2'],
        assets: [{ title: 'Client Notes', type: 'document' }],
      },
    ],
  },
  {
    name: 'Northwind Media',
    slug: 'northwind-media',
    planName: 'Premium',
    status: 'active',
    storageUsedBytes: BigInt(Math.round(6.2 * GB)),
    subscriptionStatus: 'active',
    stripeCustomerId: 'cus_demo_northwind',
    createdAt: daysAgo(44),
    users: [
      { email: 'alex@northwind.media', name: 'Alex Rivera', jobTitle: 'Super Admin' },
      { email: 'casey@northwind.media', name: 'Casey Brooks', jobTitle: 'Admin' },
      { email: 'taylor@northwind.media', name: 'Taylor Kim', jobTitle: 'Producer' },
    ],
    workspaces: [
      {
        name: 'Production Hub',
        color: '#DC2626',
        projects: ['Episode 12', 'B-Roll Library'],
        assets: [
          { title: 'A-Cam Master', type: 'video' },
          { title: 'Interview Audio', type: 'audio' },
          { title: 'Set Stills', type: 'image' },
        ],
      },
      {
        name: 'Archive',
        color: '#64748B',
        projects: ['Season 1 Archive'],
        assets: [{ title: 'Season 1 Master', type: 'video' }],
      },
    ],
  },
  {
    name: 'Brightpath Agency',
    slug: 'brightpath-agency',
    planName: 'Basic',
    status: 'active',
    storageUsedBytes: BigInt(180 * MB),
    subscriptionStatus: 'active',
    stripeCustomerId: 'cus_demo_brightpath',
    createdAt: daysAgo(12),
    users: [
      { email: 'nina@brightpath.io', name: 'Nina Patel', jobTitle: 'Super Admin' },
      { email: 'owen@brightpath.io', name: 'Owen Blake', jobTitle: 'Designer' },
    ],
    workspaces: [
      {
        name: 'Main Workspace',
        color: '#EA580C',
        projects: ['Website Refresh'],
        assets: [
          { title: 'Homepage Mock', type: 'image' },
          { title: 'Brand Voice Guide', type: 'document' },
        ],
      },
    ],
  },
  {
    name: 'Harbor Digital',
    slug: 'harbor-digital',
    planName: 'Premium',
    status: 'suspended',
    storageUsedBytes: BigInt(Math.round(14.1 * GB)),
    subscriptionStatus: 'past_due',
    stripeCustomerId: 'cus_demo_harbor',
    createdAt: daysAgo(8),
    users: [
      { email: 'chris@harbordigital.com', name: 'Chris Walsh', jobTitle: 'Super Admin', status: 'suspended' },
      { email: 'lee@harbordigital.com', name: 'Lee Nguyen', jobTitle: 'Admin', status: 'suspended' },
      { email: 'morgan@harbordigital.com', name: 'Morgan Ellis', jobTitle: 'Editor', status: 'suspended' },
      { email: 'jamie@harbordigital.com', name: 'Jamie Cruz', jobTitle: 'Viewer', status: 'suspended' },
      { email: 'riley@harbordigital.com', name: 'Riley Fox', jobTitle: 'Viewer', status: 'inactive' },
    ],
    workspaces: [
      {
        name: 'Client Deliverables',
        color: '#9333EA',
        projects: ['Overdue Delivery'],
        assets: [
          { title: 'Final Mix (flagged)', type: 'video' },
          { title: 'Poster Key Art', type: 'image' },
        ],
      },
      {
        name: 'Internal Assets',
        color: '#0D9488',
        projects: ['Internal Cuts'],
        assets: [{ title: 'Rough Assembly', type: 'video' }],
      },
      {
        name: 'Quarantine',
        color: '#B91C1C',
        projects: ['Hold for Review'],
        assets: [{ title: 'Unlicensed Stock Clip', type: 'video' }],
      },
      {
        name: 'Legacy Library',
        color: '#475569',
        projects: ['2019 Masters'],
        assets: [{ title: 'Legacy Promo', type: 'video' }],
      },
    ],
  },
  {
    name: 'Summit Pictures',
    slug: 'summit-pictures',
    planName: 'Free',
    status: 'active',
    storageUsedBytes: BigInt(0),
    subscriptionStatus: 'trialing',
    createdAt: daysAgo(5),
    users: [{ email: 'founder@summitpictures.co', name: 'Avery Stone', jobTitle: 'Super Admin' }],
    workspaces: [
      {
        name: 'Pilot Project',
        color: '#4F46E5',
        projects: ['Pilot Teaser'],
        assets: [{ title: 'Moodboard', type: 'image' }],
      },
    ],
  },
  {
    name: 'Velvet Frame Studios',
    slug: 'velvet-frame',
    planName: 'Enterprise',
    status: 'active',
    storageUsedBytes: BigInt(Math.round(18.2 * GB)),
    subscriptionStatus: 'active',
    stripeCustomerId: 'cus_demo_velvet',
    createdAt: daysAgo(2),
    users: [
      { email: 'dana@velvetframe.studio', name: 'Dana Brooks', jobTitle: 'Super Admin' },
      { email: 'kai@velvetframe.studio', name: 'Kai Nakamura', jobTitle: 'Admin' },
      { email: 'elena@velvetframe.studio', name: 'Elena Rossi', jobTitle: 'Colorist' },
      { email: 'marc@velvetframe.studio', name: 'Marc Dubois', jobTitle: 'Editor' },
      { email: 'sofia@velvetframe.studio', name: 'Sofia Alvarez', jobTitle: 'Producer' },
      { email: 'ben@velvetframe.studio', name: 'Ben Carter', jobTitle: 'Reviewer' },
    ],
    workspaces: [
      {
        name: 'Feature Films',
        color: '#7C3AED',
        projects: ['Northern Light', 'Night Market'],
        assets: [
          { title: 'Dailies Day 14', type: 'video' },
          { title: 'Color Pipeline Notes', type: 'document' },
        ],
      },
      {
        name: 'Commercials',
        color: '#DB2777',
        projects: ['Auto Spot :30'],
        assets: [
          { title: 'Spot Master :30', type: 'video' },
          { title: 'VO Take 7', type: 'audio' },
        ],
      },
      {
        name: 'VFX Plates',
        color: '#0284C7',
        projects: ['Plate Ingest'],
        assets: [{ title: 'Sky Replacement Plate', type: 'video' }],
      },
      {
        name: 'Delivery Masters',
        color: '#16A34A',
        projects: ['IMF Package'],
        assets: [{ title: 'IMF CPL', type: 'document' }],
      },
      {
        name: 'Reference Library',
        color: '#A16207',
        projects: ['Look Dev'],
        assets: [{ title: 'Look Dev Stills', type: 'image' }],
      },
    ],
  },
];

async function ensureRoles() {
  const byName = {};
  for (const def of ROLE_DEFS) {
    const role = await prisma.role.upsert({
      where: { name: def.name },
      update: { show: def.show },
      create: def,
    });
    byName[def.name] = role;
  }
  return byName;
}

async function ensureOrg(demo, plan) {
  const data = {
    name: demo.name,
    status: demo.status,
    currentPlanId: plan.id,
    storageUsedBytes: demo.storageUsedBytes,
    subscriptionStatus: demo.subscriptionStatus,
    stripeCustomerId: demo.stripeCustomerId || null,
    planExpiresAt: planExpiresAt(demo.planName, demo.createdAt),
    metadata: { seeded: true, planName: demo.planName },
  };

  const existing = await prisma.organization.findUnique({ where: { slug: demo.slug } });
  if (existing) {
    return prisma.organization.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.organization.create({
    data: {
      ...data,
      slug: demo.slug,
      createdAt: demo.createdAt,
    },
  });
}

async function ensureSettings(orgId) {
  const existing = await prisma.organizationSettings.findUnique({ where: { orgId } });
  if (existing) return existing;
  return prisma.organizationSettings.create({ data: { orgId } });
}

async function ensureWorkspace(orgId, ws, createdAt) {
  const existing = await prisma.workspace.findFirst({
    where: { orgId, name: ws.name },
  });
  if (existing) return existing;
  return prisma.workspace.create({
    data: {
      name: ws.name,
      description: `${ws.name} workspace`,
      color: ws.color,
      orgId,
      createdAt,
    },
  });
}

async function ensureProject(workspace, name, createdById, createdAt) {
  const existing = await prisma.project.findFirst({
    where: { workspaceId: workspace.id, name },
  });
  if (existing) return existing;
  return prisma.project.create({
    data: {
      name,
      ownerType: 'WORKSPACE',
      workspaceId: workspace.id,
      visibility: 'public',
      status: 'active',
      createdById,
      createdAt,
    },
  });
}

async function ensureAsset(orgId, workspace, asset, uploadedByUserId, createdAt) {
  const existing = await prisma.asset.findFirst({
    where: { orgId, workspaceId: workspace.id, title: asset.title, deletedAt: null },
  });
  if (existing) return existing;

  const ext =
    asset.type === 'video'
      ? 'mp4'
      : asset.type === 'audio'
        ? 'wav'
        : asset.type === 'image'
          ? 'jpg'
          : 'pdf';
  const mime =
    asset.type === 'video'
      ? 'video/mp4'
      : asset.type === 'audio'
        ? 'audio/wav'
        : asset.type === 'image'
          ? 'image/jpeg'
          : 'application/pdf';
  const size =
    asset.type === 'video'
      ? BigInt(420 * MB)
      : asset.type === 'audio'
        ? BigInt(48 * MB)
        : asset.type === 'image'
          ? BigInt(8 * MB)
          : BigInt(2 * MB);

  return prisma.asset.create({
    data: {
      orgId,
      title: asset.title,
      type: asset.type,
      status: 'active',
      visibility: 'public',
      ownerType: 'WORKSPACE',
      ownerId: workspace.id,
      workspaceId: workspace.id,
      uploadedByUserId,
      createdAt,
      files: {
        create: {
          fileClass: 'original',
          fileName: `${asset.title.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.${ext}`,
          filePath: `demo/${orgId}/${workspace.id}/${asset.title}.${ext}`,
          sizeBytes: size,
          mimeType: mime,
        },
      },
      metadata: {
        create: {
          technicalSpecs: { seeded: true },
          customProperties: { demo: true },
        },
      },
    },
  });
}

async function ensureUser(org, u, roleId, passwordHash, orgCreatedAt) {
  const status = u.status || (org.status === 'suspended' ? 'suspended' : 'active');
  const createdAt = new Date(orgCreatedAt.getTime() + 2 * 60 * 60 * 1000);
  const existing = await prisma.user.findUnique({ where: { email: u.email } });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        orgId: org.id,
        name: u.name,
        jobTitle: u.jobTitle,
        status,
        roleId,
        emailVerified: true,
      },
    });
  }

  return prisma.user.create({
    data: {
      orgId: org.id,
      email: u.email,
      name: u.name,
      jobTitle: u.jobTitle,
      passwordHash,
      emailVerified: true,
      status,
      roleId,
      lastLoginAt: status === 'active' ? daysAgo(1, 9) : null,
      lastActiveAt: status === 'active' ? daysAgo(0, 11) : null,
      createdAt,
    },
  });
}

async function ensureWorkspaceMember(workspaceId, userId) {
  const existing = await prisma.workspaceUser.findFirst({
    where: { workspaceId, userId },
  });
  if (existing) return existing;
  return prisma.workspaceUser.create({
    data: { workspaceId, userId, memberType: 'MEMBER' },
  });
}

async function ensureAudit(org, adminName) {
  const existing = await prisma.auditLog.findFirst({
    where: { orgId: org.id, actorType: 'platform_admin', activityType: 'platform' },
  });
  if (existing) return;

  await prisma.auditLog.createMany({
    data: [
      {
        activityName: 'Organization reviewed',
        description: `Platform admin reviewed ${org.name}`,
        activityType: 'platform',
        actorType: 'platform_admin',
        userName: adminName,
        userEmail: 'platformadmin@noahcloud.ai',
        userRole: 'Platform Admin',
        orgId: org.id,
        createdAt: daysAgo(1, 14),
      },
      {
        activityName: org.status === 'suspended' ? 'Organization suspended' : 'Plan synced',
        description:
          org.status === 'suspended'
            ? `${org.name} was suspended for past-due billing`
            : `Synced current plan for ${org.name}`,
        activityType: org.status === 'suspended' ? 'billing' : 'platform',
        actorType: 'platform_admin',
        userName: adminName,
        userEmail: 'platformadmin@noahcloud.ai',
        userRole: 'Platform Admin',
        orgId: org.id,
        createdAt: daysAgo(org.status === 'suspended' ? 1 : 3, 16),
      },
    ],
  });
}

async function ensureModerationFlags(org, assets, adminId) {
  if (org.slug !== 'harbor-digital' || !assets.length) return;

  for (const [index, asset] of assets.slice(0, 2).entries()) {
    const reason =
      index === 0 ? 'Possible copyrighted stock footage' : 'Content flagged for review before restore';
    const existing = await prisma.platformModerationFlag.findFirst({
      where: { orgId: org.id, assetId: asset.id },
    });
    if (existing) continue;
    await prisma.platformModerationFlag.create({
      data: {
        assetId: asset.id,
        orgId: org.id,
        reason,
        status: index === 0 ? 'open' : 'quarantined',
        notes: 'Seeded demo flag',
        flaggedById: adminId || null,
      },
    });
  }
}

async function main() {
  const plans = await prisma.plan.findMany();
  const planByName = Object.fromEntries(plans.map((p) => [p.name.toLowerCase(), p]));

  if (plans.length === 0) {
    console.error('No plans found. Run seed-platform.js first.');
    process.exit(1);
  }

  const roles = await ensureRoles();
  const passwordHash = await bcrypt.hash('DemoOrg@2026!', 10);
  const platformAdmin = await prisma.platformAdmin.findFirst({
    where: { email: 'platformadmin@noahcloud.ai' },
  });

  for (const demo of DEMO_ORGS) {
    const plan = planByName[demo.planName.toLowerCase()];
    if (!plan) {
      console.warn(`Plan not found for ${demo.name}: ${demo.planName}, skipping`);
      continue;
    }

    const org = await ensureOrg(demo, plan);
    await ensureSettings(org.id);

    const createdUsers = [];
    for (const u of demo.users) {
      const roleName = roleNameForJobTitle(u.jobTitle);
      const role = roles[roleName] || roles['Collaborator'];
      const user = await ensureUser(org, u, role.id, passwordHash, demo.createdAt);
      createdUsers.push(user);
    }

    const owner = createdUsers[0];
    const createdAssets = [];

    for (const [wsIndex, ws] of demo.workspaces.entries()) {
      const workspace = await ensureWorkspace(
        org.id,
        ws,
        new Date(demo.createdAt.getTime() + (wsIndex + 1) * 60 * 60 * 1000),
      );

      if (owner) {
        await ensureWorkspaceMember(workspace.id, owner.id);
      }

      for (const projectName of ws.projects || []) {
        await ensureProject(workspace, projectName, owner?.id || null, demo.createdAt);
      }

      for (const asset of ws.assets || []) {
        const created = await ensureAsset(org.id, workspace, asset, owner?.id || null, demo.createdAt);
        createdAssets.push(created);
      }
    }

    await ensureAudit(org, platformAdmin?.name || 'NOAH Platform Admin');
    await ensureModerationFlags(org, createdAssets, platformAdmin?.id);

    console.log(
      `Ready: ${org.name} — ${demo.planName}, ${demo.status}, ${demo.users.length} users, ${demo.workspaces.length} workspaces`,
    );
  }

  const [orgCount, userCount, wsCount, projectCount, assetCount] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.workspace.count(),
    prisma.project.count(),
    prisma.asset.count({ where: { deletedAt: null } }),
  ]);

  console.log('\nDone.');
  console.log(`  Organizations: ${orgCount}`);
  console.log(`  Users:         ${userCount}`);
  console.log(`  Workspaces:    ${wsCount}`);
  console.log(`  Projects:      ${projectCount}`);
  console.log(`  Assets:        ${assetCount}`);
  console.log('\nDemo tenant login password: DemoOrg@2026!');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
