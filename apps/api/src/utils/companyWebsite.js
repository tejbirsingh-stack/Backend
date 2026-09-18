const MAX_WEBSITE_LENGTH = 255;
const INVALID_WEBSITE_MESSAGE =
  'Please enter a valid website URL (e.g. https://example.com or example.com)';

const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const TLD_PATTERN = /^[a-z]{2,63}$/i;

function parseCompanyWebsite(value) {
  if (value === undefined || value === null) {
    return { ok: true, website: null };
  }

  const trimmed = String(value).trim();
  if (trimmed === '') {
    return { ok: true, website: null };
  }

  if (trimmed.length > MAX_WEBSITE_LENGTH || /\s/.test(trimmed)) {
    return { ok: false, error: INVALID_WEBSITE_MESSAGE };
  }

  const withProtocol = /^(https?:\/\/)/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return { ok: false, error: INVALID_WEBSITE_MESSAGE };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: INVALID_WEBSITE_MESSAGE };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: INVALID_WEBSITE_MESSAGE };
  }

  const hostname = (parsed.hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return { ok: false, error: INVALID_WEBSITE_MESSAGE };
  }

  if (IPV4_PATTERN.test(hostname) || hostname.includes(':')) {
    return { ok: false, error: INVALID_WEBSITE_MESSAGE };
  }

  if (!hostname.includes('.')) {
    return { ok: false, error: INVALID_WEBSITE_MESSAGE };
  }

  const labels = hostname.split('.');
  if (labels.some((label) => !label)) {
    return { ok: false, error: INVALID_WEBSITE_MESSAGE };
  }

  const tld = labels[labels.length - 1];
  if (!TLD_PATTERN.test(tld)) {
    return { ok: false, error: INVALID_WEBSITE_MESSAGE };
  }

  return { ok: true, website: trimmed };
}

module.exports = {
  MAX_WEBSITE_LENGTH,
  INVALID_WEBSITE_MESSAGE,
  parseCompanyWebsite,
};
