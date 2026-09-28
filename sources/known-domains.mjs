/* A starter classification list.
 *
 * Deliberately short. This is not a blocklist and it is not trying to be
 * exhaustive: it exists so a first report is readable instead of four hundred
 * rows of "unknown". Everything here is a registrable domain that is widely
 * documented as doing what the category says.
 *
 * `unknown` is the honest default and the report says how much of your traffic
 * landed there, because a classifier that quietly labels everything is worse
 * than one that admits its coverage.
 *
 * Add your own in config/domains.local.mjs, which is gitignored and merged over
 * this file.
 */

export const CATEGORIES = {
  advertising: 'Ad serving and real-time bidding',
  analytics: 'Measurement and attribution',
  telemetry: 'Product telemetry and crash reporting',
  update: 'Software and firmware updates',
  cdn: 'Content delivery, mostly other people\'s assets',
  cloud: 'General cloud infrastructure',
  social: 'Social platforms, including embedded widgets',
  ntp: 'Clock synchronisation',
  doh: 'Encrypted DNS, which routes around this tool',
  assistant: 'Voice assistants and smart-home backends',
};

export const KNOWN = {
  // advertising
  'doubleclick.net': 'advertising',
  'googlesyndication.com': 'advertising',
  'googleadservices.com': 'advertising',
  'adnxs.com': 'advertising',
  'rubiconproject.com': 'advertising',
  'pubmatic.com': 'advertising',
  'criteo.com': 'advertising',
  'taboola.com': 'advertising',
  'outbrain.com': 'advertising',
  'adsrvr.org': 'advertising',
  'casalemedia.com': 'advertising',
  'openx.net': 'advertising',
  'smartadserver.com': 'advertising',
  'amazon-adsystem.com': 'advertising',

  // analytics
  'google-analytics.com': 'analytics',
  'googletagmanager.com': 'analytics',
  'scorecardresearch.com': 'analytics',
  'quantserve.com': 'analytics',
  'hotjar.com': 'analytics',
  'mixpanel.com': 'analytics',
  'segment.io': 'analytics',
  'segment.com': 'analytics',
  'amplitude.com': 'analytics',
  'branch.io': 'analytics',
  'adjust.com': 'analytics',
  'appsflyer.com': 'analytics',
  'kochava.com': 'analytics',
  'chartbeat.com': 'analytics',
  'matomo.cloud': 'analytics',
  'plausible.io': 'analytics',

  // telemetry and crash reporting
  'sentry.io': 'telemetry',
  'bugsnag.com': 'telemetry',
  'crashlytics.com': 'telemetry',
  'app-measurement.com': 'telemetry',
  'data.microsoft.com': 'telemetry',
  'vortex.data.microsoft.com': 'telemetry',
  'telemetry.mozilla.org': 'telemetry',
  'incoming.telemetry.mozilla.org': 'telemetry',
  'metrics.icloud.com': 'telemetry',
  'device-metrics-us.amazon.com': 'telemetry',
  'logs.netflix.com': 'telemetry',
  'graph.facebook.com': 'telemetry',

  // updates
  'windowsupdate.com': 'update',
  'update.microsoft.com': 'update',
  'swcdn.apple.com': 'update',
  'mesu.apple.com': 'update',
  'dl.google.com': 'update',
  'clients2.google.com': 'update',
  'archive.ubuntu.com': 'update',
  'security.ubuntu.com': 'update',
  'deb.debian.org': 'update',
  'registry.npmjs.org': 'update',
  'pypi.org': 'update',

  // cdn
  'akamaized.net': 'cdn',
  'akamaiedge.net': 'cdn',
  'akamai.net': 'cdn',
  'fastly.net': 'cdn',
  'fbcdn.net': 'cdn',
  'cloudflare.com': 'cdn',
  'cdn77.org': 'cdn',
  'edgekey.net': 'cdn',
  'llnwd.net': 'cdn',
  'jsdelivr.net': 'cdn',
  'unpkg.com': 'cdn',
  'gstatic.com': 'cdn',

  // cloud
  'amazonaws.com': 'cloud',
  'azure.com': 'cloud',
  'azureedge.net': 'cloud',
  'googleapis.com': 'cloud',
  'digitaloceanspaces.com': 'cloud',

  // social
  'facebook.com': 'social',
  'instagram.com': 'social',
  'twitter.com': 'social',
  'x.com': 'social',
  'tiktokcdn.com': 'social',
  'tiktokv.com': 'social',
  'linkedin.com': 'social',
  'reddit.com': 'social',

  // clocks
  'pool.ntp.org': 'ntp',
  'ntp.org': 'ntp',
  'time.windows.com': 'ntp',
  'time.apple.com': 'ntp',
  'time.google.com': 'ntp',

  // assistants and smart home
  'alexa.amazon.com': 'assistant',
  'avs-alexa-na.amazon.com': 'assistant',
  'tuyaus.com': 'assistant',
  'tuyaeu.com': 'assistant',
  'xiaomi.net': 'assistant',
  'miot-spec.org': 'assistant',
  'ring.com': 'assistant',
  'nest.com': 'assistant',
  'smartthings.com': 'assistant',
};

/* Encrypted DNS endpoints.
 *
 * A device resolving one of these is usually about to stop being visible to
 * this tool entirely: it is looking up a DoH server so it can send every
 * subsequent query over HTTPS. That is the single most useful thing this list
 * can flag, because it marks the exact point where observation ends.
 */
export const DOH_ENDPOINTS = new Set([
  'dns.google',
  'cloudflare-dns.com',
  'mozilla.cloudflare-dns.com',
  'one.one.one.one',
  'dns.quad9.net',
  'doh.opendns.com',
  'dns.nextdns.io',
  'doh.cleanbrowsing.org',
  'dns.adguard.com',
  'dns.adguard-dns.com',
  'doh.dns.sb',
  'dns.alidns.com',
  'chrome.cloudflare-dns.com',
  'security.cloudflare-dns.com',
  'family.cloudflare-dns.com',
]);

/* Substrings that are strong enough on their own. Checked only after the exact
   list misses, and reported as a guess rather than a fact. */
export const HINTS = [
  [/(^|\.)(telemetry|metrics|crashlytics|crash-report)/, 'telemetry'],
  [/(^|\.)(analytics|tracking|tracker|pixel|beacon)/, 'analytics'],
  [/(^|\.)(ads?|adserver|adservice|advert)\./, 'advertising'],
  [/(^|\.)(ota|firmware|update|upgrade)\./, 'update'],
  [/(^|\.)(cdn|static|assets|media)\./, 'cdn'],
  [/(^|\.)ntp\./, 'ntp'],
];
