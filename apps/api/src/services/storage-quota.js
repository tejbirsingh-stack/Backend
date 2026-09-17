/**
 * Shared org storage quota resolution — used by dashboard, org serialize, and usage meter.
 * Prefer linked plan → free-plan fallback → 300 MB default.
 */
const DEFAULT_STORAGE_QUOTA_BYTES = 314572800n; // 300 MB

function toPositiveBigInt(value) {
  try {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'bigint' ? value : BigInt(value);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} org - Organization with optional currentPlan
 * @param {object|null} [fallbackFreePlan] - Optional free plan row (avoids extra DB lookup)
 * @returns {bigint}
 */
function resolveOrgQuotaBytes(org, fallbackFreePlan = null) {
  const fromPlan = toPositiveBigInt(org?.currentPlan?.storageQuotaBytes);
  if (fromPlan) return fromPlan;

  const fromFallback = toPositiveBigInt(fallbackFreePlan?.storageQuotaBytes);
  if (fromFallback) return fromFallback;

  return DEFAULT_STORAGE_QUOTA_BYTES;
}

/**
 * Find a catalog free/trial plan suitable as quota fallback.
 * @param {Array} plans
 */
function findFallbackFreePlan(plans = []) {
  if (!Array.isArray(plans) || plans.length === 0) return null;
  return (
    plans.find((p) => String(p.name || '').toLowerCase().includes('free')) ||
    plans.find((p) => Number(p.monthlyPriceCents || 0) === 0) ||
    null
  );
}

module.exports = {
  DEFAULT_STORAGE_QUOTA_BYTES,
  resolveOrgQuotaBytes,
  findFallbackFreePlan,
  toPositiveBigInt,
};
