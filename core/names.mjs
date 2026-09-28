/* Reducing a query name to the thing worth counting.
 *
 * "a1b2c3.telemetry.example.co.uk" and "d4e5f6.telemetry.example.co.uk" are one
 * fact, not two, so names are reduced to their registrable domain before being
 * counted or compared against the known list.
 *
 * Doing this properly needs the Public Suffix List, which is thousands of lines
 * and changes. Rather than bundle a copy that silently rots, this uses the last
 * two labels plus a short table of the multi-part suffixes that actually turn up
 * on a home network. The limitation is stated in `doctor` and in the README,
 * because a wrong registrable domain means a miscounted report rather than an
 * error anyone would notice.
 */

/** Suffixes where the registrable domain is the last three labels, not two. */
const MULTI_PART = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk', 'sch.uk',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'net.nz', 'org.nz',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'co.in', 'net.in', 'org.in', 'gov.in',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn',
  'co.za', 'org.za',
  'com.mx', 'com.ar', 'com.tr', 'com.sg', 'com.hk', 'com.tw',
  'co.kr', 'or.kr',
  'com.pl', 'com.ua', 'com.ru',
]);

/** Suffixes where every registration is effectively its own site. */
const PUBLIC_HOSTING = new Set([
  'github.io', 'gitlab.io', 'netlify.app', 'vercel.app', 'pages.dev',
  'workers.dev', 'herokuapp.com', 'azurewebsites.net', 'cloudfront.net',
  'amazonaws.com', 'appspot.com', 'firebaseapp.com', 'web.app',
  'blogspot.com', 'wordpress.com', 'myshopify.com', 'r2.dev',
]);

export function registrable(name) {
  if (!name || typeof name !== 'string') return null;
  const clean = name.trim().toLowerCase().replace(/\.$/, '');
  if (!clean) return null;

  const labels = clean.split('.').filter(Boolean);
  if (labels.length <= 1) return clean;

  const lastTwo = labels.slice(-2).join('.');
  const lastThree = labels.slice(-3).join('.');

  if (labels.length >= 3 && MULTI_PART.has(lastTwo)) return lastThree;
  if (labels.length >= 3 && PUBLIC_HOSTING.has(lastTwo)) return lastThree;
  return lastTwo;
}

/** Local and special-use names that are noise in a report, not contacts. */
const LOCAL_SUFFIXES = ['.local', '.arpa', '.localhost', '.internal', '.home', '.lan', '.invalid'];

export function isLocal(name) {
  if (!name) return true;
  const n = name.toLowerCase();
  if (!n.includes('.')) return true; // a bare hostname is a LAN lookup
  return LOCAL_SUFFIXES.some((s) => n === s.slice(1) || n.endsWith(s));
}
