const prisma = require('../utils/prisma');
const { writePlatformAudit } = require('../lib/platform-audit');

const DEFAULT_SECTIONS = { plansEnabled: true };

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
    const slug = String(request.query?.slug || request.params?.slug || 'main');
    let page = await prisma.landingPage.findUnique({ where: { slug } });
    if (!page) {
      page = await prisma.landingPage.create({
        data: {
          slug,
          status: 'draft',
          heroTitle: 'A library worthy of your beautiful work.',
          heroSubtitle: 'Enterprise media asset management for modern creative teams.',
          ctaLabel: 'Get started',
          ctaHref: '/signup',
          sections: DEFAULT_SECTIONS,
        },
      });
    }
    return { success: true, page: serializeLanding(page) };
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
    const slug = String(request.params?.slug || 'main');
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
      data.status = body.status;
      if (body.status === 'published') data.publishedAt = new Date();
    }
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

    const page = await prisma.landingPage.upsert({
      where: { slug },
      create: {
        slug,
        heroTitle: heroTitle || 'NOAH Cloud',
        heroSubtitle: heroSubtitle || null,
        ctaLabel: ctaLabel || 'Get started',
        ctaHref: ctaHref || '/signup',
        sections: normalizeSections(body.sections, body.plansEnabled),
        status: data.status || 'draft',
        publishedAt: data.publishedAt || null,
        updatedById: data.updatedById,
      },
      update: data,
    });

    await writePlatformAudit({
      activityName: 'Landing page updated',
      description: `Updated landing page "${slug}" (${page.status})`,
      activityType: 'landing',
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
      return reply.status(404).send({
        error: 'NotFound',
        message: 'Published landing page not found',
        statusCode: 404,
      });
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

module.exports = {
  getLandingPage,
  updateLandingPage,
  getPublishedLanding,
};
