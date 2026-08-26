const prisma = require('../utils/prisma');
const { writePlatformAudit, ACTIVITY_TYPE, ACTIVITY_NAME } = require('../lib/platform-audit');
const emailService = require('../services/email-service');

const DEFAULT_SECTIONS = { plansEnabled: true };

const DEFAULT_PUBLIC_LANDING = {
  slug: 'main',
  status: 'published',
  heroTitle: 'A library worthy of your beautiful work.',
  heroSubtitle:
    'NOAH Cloud is the media intelligence layer for modern teams — find anything, review on the timeline, and share finished work without leaving your library.',
  ctaLabel: 'Start free trial',
  ctaHref: '/signup',
  sections: DEFAULT_SECTIONS,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parsePlansEnabled(sections) {
  if (sections && typeof sections === 'object' && !Array.isArray(sections)) {
    if (typeof sections.plansEnabled === 'boolean') return sections.plansEnabled;
  }
  return true;
}

function normalizeSections(sections, plansEnabled) {
  if (typeof plansEnabled === 'boolean') {
    return { plansEnabled };
  }
  if (sections && typeof sections === 'object' && !Array.isArray(sections)) {
    return {
      ...sections,
      plansEnabled: parsePlansEnabled(sections),
    };
  }
  return { ...DEFAULT_SECTIONS };
}

function serializeLanding(page) {
  if (!page) return null;
  const plansEnabled = parsePlansEnabled(page.sections);
  return {
    ...page,
    plansEnabled,
    // Aliases for UI convenience
    title: page.heroTitle || 'NOAH Cloud',
    heroHeadline: page.heroTitle,
    heroSubheadline: page.heroSubtitle,
    heroCtaLabel: page.ctaLabel,
    heroCtaUrl: page.ctaHref,
  };
}

async function getLandingPage(request, reply) {
  try {
    let baseSlug = String(request.query?.slug || request.params?.slug || 'main');
    if (baseSlug.endsWith('-draft')) baseSlug = baseSlug.replace('-draft', '');
    const draftSlug = `${baseSlug}-draft`;

    let [livePage, draftPage] = await Promise.all([
      prisma.landingPage.findUnique({ where: { slug: baseSlug } }),
      prisma.landingPage.findUnique({ where: { slug: draftSlug } }),
    ]);

    if (!livePage) {
      livePage = await prisma.landingPage.create({
        data: {
          slug: baseSlug,
          status: 'published',
          heroTitle: 'A library worthy of your beautiful work.',
          heroSubtitle:
            'NOAH Cloud is the media intelligence layer for modern teams — find anything, review on the timeline, and share finished work without leaving your library.',
          ctaLabel: 'Start free trial',
          ctaHref: '/signup',
          sections: DEFAULT_SECTIONS,
          publishedAt: new Date(),
        },
      });
    }

    if (!draftPage) {
      draftPage = await prisma.landingPage.create({
        data: {
          slug: draftSlug,
          status: 'draft',
          heroTitle: livePage.heroTitle,
          heroSubtitle: livePage.heroSubtitle,
          ctaLabel: livePage.ctaLabel,
          ctaHref: livePage.ctaHref,
          sections: livePage.sections,
        },
      });
    }

    const latest = livePage.updatedAt > draftPage.updatedAt ? livePage : draftPage;
    return { success: true, page: serializeLanding(latest) };
  } catch (error) {
    console.error('getLandingPage error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to load landing page',
      statusCode: 500,
    });
  }
}

async function updateLandingPage(request, reply) {
  try {
    let baseSlug = String(request.params?.slug || 'main');
    if (baseSlug.endsWith('-draft')) baseSlug = baseSlug.replace('-draft', '');
    const body = request.body || {};
    const data = {};
    
    if (body.status !== undefined) {
      if (!['draft', 'published'].includes(body.status)) {
        return reply.status(400).send({
          error: 'ValidationError',
          message: 'status must be draft or published',
          statusCode: 400,
        });
      }
    }
    const status = body.status || 'draft';
    
    const heroTitle = body.heroTitle ?? body.heroHeadline ?? body.title;
    const heroSubtitle = body.heroSubtitle ?? body.heroSubheadline;
    const ctaLabel = body.ctaLabel ?? body.heroCtaLabel;
    const ctaHref = body.ctaHref ?? body.heroCtaUrl;
    if (heroTitle !== undefined) data.heroTitle = heroTitle;
    if (heroSubtitle !== undefined) data.heroSubtitle = heroSubtitle;
    if (ctaLabel !== undefined) data.ctaLabel = ctaLabel;
    if (ctaHref !== undefined) data.ctaHref = ctaHref;
    if (body.sections !== undefined || body.plansEnabled !== undefined) {
      data.sections = normalizeSections(body.sections, body.plansEnabled);
    }
    data.updatedById = request.platformAdmin?.id || null;

    let page;

    if (status === 'draft') {
      const draftSlug = `${baseSlug}-draft`;
      page = await prisma.landingPage.upsert({
        where: { slug: draftSlug },
        create: {
          slug: draftSlug,
          heroTitle: heroTitle || DEFAULT_PUBLIC_LANDING.heroTitle,
          heroSubtitle: heroSubtitle || DEFAULT_PUBLIC_LANDING.heroSubtitle,
          ctaLabel: ctaLabel || DEFAULT_PUBLIC_LANDING.ctaLabel,
          ctaHref: ctaHref || DEFAULT_PUBLIC_LANDING.ctaHref,
          sections: normalizeSections(body.sections, body.plansEnabled),
          status: 'draft',
          updatedById: data.updatedById,
        },
        update: {
          ...data,
          status: 'draft',
        },
      });
    } else {
      // status === 'published'
      data.publishedAt = new Date();
      data.status = 'published';

      page = await prisma.landingPage.upsert({
        where: { slug: baseSlug },
        create: {
          slug: baseSlug,
          heroTitle: heroTitle || DEFAULT_PUBLIC_LANDING.heroTitle,
          heroSubtitle: heroSubtitle || DEFAULT_PUBLIC_LANDING.heroSubtitle,
          ctaLabel: ctaLabel || DEFAULT_PUBLIC_LANDING.ctaLabel,
          ctaHref: ctaHref || DEFAULT_PUBLIC_LANDING.ctaHref,
          sections: normalizeSections(body.sections, body.plansEnabled),
          status: 'published',
          publishedAt: data.publishedAt,
          updatedById: data.updatedById,
        },
        update: data,
      });

      // Keep draft in sync
      const draftSlug = `${baseSlug}-draft`;
      await prisma.landingPage.upsert({
        where: { slug: draftSlug },
        create: {
          slug: draftSlug,
          heroTitle: heroTitle || DEFAULT_PUBLIC_LANDING.heroTitle,
          heroSubtitle: heroSubtitle || DEFAULT_PUBLIC_LANDING.heroSubtitle,
          ctaLabel: ctaLabel || DEFAULT_PUBLIC_LANDING.ctaLabel,
          ctaHref: ctaHref || DEFAULT_PUBLIC_LANDING.ctaHref,
          sections: normalizeSections(body.sections, body.plansEnabled),
          status: 'draft',
          updatedById: data.updatedById,
        },
        update: {
          ...data,
          status: 'draft',
          publishedAt: null,
        },
      });
    }

    await writePlatformAudit({
      activityName: ACTIVITY_NAME.LANDING_PAGE_UPDATED,
      description: `Updated landing page "${baseSlug}" (${page.status})`,
      activityType: ACTIVITY_TYPE.INFO,
      admin: request.platformAdmin,
    });

    return { success: true, page: serializeLanding(page) };
  } catch (error) {
    console.error('updateLandingPage error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to update landing page',
      statusCode: 500,
    });
  }
}

async function getPublishedLanding(request, reply) {
  try {
    const slug = String(request.query?.slug || 'main');
    const page = await prisma.landingPage.findFirst({
      where: { slug, status: 'published' },
    });
    if (!page) {
      return { success: true, page: serializeLanding({ ...DEFAULT_PUBLIC_LANDING, slug }) };
    }
    return { success: true, page: serializeLanding(page) };
  } catch (error) {
    console.error('getPublishedLanding error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to load landing page',
      statusCode: 500,
    });
  }
}

async function submitDemoRequest(request, reply) {
  try {
    const body = request.body || {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const company = String(body.company || '').trim();
    const teamSize = String(body.teamSize || '').trim();
    const message = String(body.message || '').trim();

    if (!name || name.length > 120) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Please enter your name.',
        statusCode: 400,
      });
    }
    if (!EMAIL_RE.test(email) || email.length > 255) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Please enter a valid work email.',
        statusCode: 400,
      });
    }
    if (company.length > 200) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Company name is too long.',
        statusCode: 400,
      });
    }
    if (message.length > 2000) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: 'Message is too long.',
        statusCode: 400,
      });
    }

    const salesTo =
      process.env.DEMO_REQUEST_EMAIL ||
      process.env.SMTP_FROM_EMAIL ||
      process.env.EMAIL_FROM ||
      'noreply@noah-dev.local';

    const summary = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Company: ${company || '—'}`,
      `Team size: ${teamSize || '—'}`,
      '',
      message || 'No additional message.',
    ].join('\n');

    await emailService.sendEmail({
      to: salesTo,
      subject: `NOAH demo request — ${name}${company ? ` (${company})` : ''}`,
      text: summary,
      html: `<pre style="font-family:Inter,system-ui,sans-serif;white-space:pre-wrap">${summary
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}</pre>`,
    });

    await writePlatformAudit({
      activityName: ACTIVITY_NAME.DEMO_REQUEST_SUBMITTED,
      description: `${name} <${email}> requested a demo${company ? ` for ${company}` : ''}`,
      activityType: ACTIVITY_TYPE.INFO,
      admin: { name: 'Public visitor', email },
    });

    return { success: true };
  } catch (error) {
    console.error('submitDemoRequest error:', error);
    return reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'Failed to submit demo request',
      statusCode: 500,
    });
  }
}

module.exports = {
  getLandingPage,
  updateLandingPage,
  getPublishedLanding,
  submitDemoRequest,
};
