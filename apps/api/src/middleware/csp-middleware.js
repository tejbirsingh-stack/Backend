const prisma = require('../utils/prisma');

function parseCspDomains(rawCsp) {
  if (!rawCsp) return ['noahcloud.ai', 'localhost'];
  try {
    const parsed = JSON.parse(rawCsp);
    if (Array.isArray(parsed)) {
      return parsed
        .map((d) => String(d).trim().toLowerCase().replace(/^https?:\/\//, ''))
        .filter(Boolean);
    }
  } catch (e) {}

  return String(rawCsp)
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, ''))
    .filter(Boolean);
}

/**
 * Middleware to dynamically inject Content-Security-Policy frame-ancestors header
 * and validate external embedding origin headers against Global Admin settings.
 */
async function attachCspFrameAncestors(request, reply) {
  try {
    const globalSetting = await prisma.globalAdminSetting.findFirst();
    const rawCsp = globalSetting?.contentSecurityPolicy || JSON.stringify(['noahcloud.ai', 'localhost']);

    // Parse allowed domains list
    const allowedDomains = parseCspDomains(rawCsp);

    // Format domains for CSP frame-ancestors directive
    const cspDomainsStr = allowedDomains.join(' ');
    const cspHeaderVal = `frame-ancestors 'self' ${cspDomainsStr};`;

    reply.header('Content-Security-Policy', cspHeaderVal);

    // Origin / Referer Verification for Embedded Media Requests
    const originHeader = request.headers['origin'] || request.headers['referer'];
    if (originHeader) {
      try {
        const requestOriginUrl = new URL(originHeader);
        const requestHostname = requestOriginUrl.hostname.toLowerCase();

        // Check if origin is localhost or same host
        const requestHostHeader = (request.headers['host'] || '').split(':')[0].toLowerCase();
        const isSelfHost = requestHostname === requestHostHeader || requestHostname === 'localhost' || requestHostname === '127.0.0.1';

        if (!isSelfHost) {
          // Check if requestHostname matches any allowed domain or wildcard domain pattern
          const isAllowedDomain = allowedDomains.some((allowed) => {
            if (allowed === requestHostname) return true;
            if (allowed.startsWith('*.')) {
              const rootDomain = allowed.slice(2);
              return requestHostname === rootDomain || requestHostname.endsWith('.' + rootDomain);
            }
            return false;
          });

          if (!isAllowedDomain) {
            return reply.status(403).send({
              success: false,
              error: 'Forbidden',
              message: `Media embedding on domain '${requestHostname}' is blocked by Global Admin Content Security Policy.`,
              allowedDomains,
            });
          }
        }
      } catch (urlErr) {
        // Invalid origin URL format, ignore URL parse error
      }
    }
  } catch (err) {
    console.error('Error in CSP middleware:', err.message);
  }
}

module.exports = {
  attachCspFrameAncestors,
};
