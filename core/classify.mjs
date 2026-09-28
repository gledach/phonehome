/* Putting a name in a bucket, and being clear how sure it is.
 *
 * Three levels of confidence, and the report shows which is which:
 *   known  the registrable domain is on the bundled list
 *   guess  a substring hint fired, like "telemetry." in the name
 *   none   unknown, which is the honest default
 *
 * A classifier that labels everything looks better and tells you less. The
 * share of traffic that landed in "unknown" is printed on every report for
 * exactly that reason.
 */

import { registrable, isLocal } from './names.mjs';
import { KNOWN, HINTS, DOH_ENDPOINTS, CATEGORIES } from '../sources/known-domains.mjs';

export { CATEGORIES };

/**
 * @param {string} name the full query name
 * @param {Record<string,string>} [extra] merged user list, registrable -> category
 * @returns {{ domain: string|null, label: string, category: string,
 *             confidence: 'known'|'guess'|'none'|'local', matchedOn: string, isDoh: boolean }}
 *
 * `label` is what a report should show. When the match was on an exact host it
 * is that host, because "device-metrics-us.amazon.com is telemetry" is true and
 * "amazon.com is telemetry" is not. Collapsing everything to the registrable
 * domain would have libelled a lot of perfectly ordinary companies.
 */
export function classify(name, extra = {}) {
  const lower = (name || '').toLowerCase().replace(/\.$/, '');

  if (isLocal(lower)) {
    return {
      domain: lower || null, label: lower, category: 'local',
      confidence: 'local', matchedOn: 'local', isDoh: false,
    };
  }

  const domain = registrable(lower);
  const isDoh = DOH_ENDPOINTS.has(lower) || DOH_ENDPOINTS.has(domain);

  // The user's own list wins: they know their network better than this file does.
  if (extra[lower]) {
    return { domain, label: lower, category: extra[lower], confidence: 'known', matchedOn: 'host', isDoh };
  }
  if (domain && extra[domain]) {
    return { domain, label: domain, category: extra[domain], confidence: 'known', matchedOn: 'domain', isDoh };
  }

  if (isDoh) {
    return { domain, label: lower, category: 'doh', confidence: 'known', matchedOn: 'host', isDoh: true };
  }

  // Exact host first, then the registrable domain. "data.microsoft.com" is
  // telemetry while "microsoft.com" on its own is not, so a host match keeps
  // the host as its label.
  if (KNOWN[lower]) {
    return { domain, label: lower, category: KNOWN[lower], confidence: 'known', matchedOn: 'host', isDoh };
  }
  if (domain && KNOWN[domain]) {
    return { domain, label: domain, category: KNOWN[domain], confidence: 'known', matchedOn: 'domain', isDoh };
  }

  for (const [pattern, category] of HINTS) {
    if (pattern.test(lower)) {
      return { domain, label: domain ?? lower, category, confidence: 'guess', matchedOn: 'hint', isDoh };
    }
  }

  return { domain, label: domain ?? lower, category: 'unknown', confidence: 'none', matchedOn: 'none', isDoh };
}

/** Roll a list of observations into per-category and per-domain counts. */
export function summarise(rows, extra = {}) {
  const byCategory = new Map();
  const byDomain = new Map();
  let local = 0;
  let total = 0;
  const dohSeen = new Set();

  for (const row of rows) {
    const c = classify(row.name, extra);
    if (c.confidence === 'local') {
      local += 1;
      continue;
    }
    total += 1;
    byCategory.set(c.category, (byCategory.get(c.category) || 0) + 1);

    /* Key on the label, not the registrable domain, so an exact-host match
       stays attributed to that host instead of tarring the whole company. */
    const key = c.label ?? c.domain ?? row.name;
    const entry = byDomain.get(key) || { domain: key, count: 0, category: c.category, confidence: c.confidence, matchedOn: c.matchedOn, devices: new Set() };
    entry.count += 1;
    if (row.client) entry.devices.add(row.client);
    byDomain.set(key, entry);

    if (c.isDoh) dohSeen.add(`${row.client} -> ${row.name}`);
  }

  const unknown = byCategory.get('unknown') || 0;

  return {
    total,
    local,
    unknownShare: total === 0 ? 0 : (unknown / total) * 100,
    categories: [...byCategory.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    domains: [...byDomain.values()]
      .map((d) => ({ ...d, devices: [...d.devices] }))
      .sort((a, b) => b.count - a.count),
    dohAttempts: [...dohSeen],
  };
}
