import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, summarise, CATEGORIES } from '../core/classify.mjs';
import { KNOWN } from '../sources/known-domains.mjs';

test('a known domain is classified with confidence', () => {
  const c = classify('doubleclick.net');
  assert.equal(c.category, 'advertising');
  assert.equal(c.confidence, 'known');
});

test('a subdomain inherits its registrable domain', () => {
  assert.equal(classify('ad.g.doubleclick.net').category, 'advertising');
});

test('an exact host match keeps the host as its label, not the company', () => {
  // "device-metrics-us.amazon.com is telemetry" is true.
  // "amazon.com is telemetry" is not, and printing the second would be a libel
  // produced by a display detail.
  const c = classify('device-metrics-us.amazon.com');
  assert.equal(c.category, 'telemetry');
  assert.equal(c.label, 'device-metrics-us.amazon.com');
  assert.equal(c.matchedOn, 'host');
  assert.equal(classify('shop.amazon.com').category, 'unknown', 'the company itself is not labelled');
});

test('a hint is reported as a guess, not as fact', () => {
  const c = classify('telemetry.some-vendor.io');
  assert.equal(c.category, 'telemetry');
  assert.equal(c.confidence, 'guess');
});

test('unknown is the honest default', () => {
  const c = classify('some-random-thing.example');
  assert.equal(c.category, 'unknown');
  assert.equal(c.confidence, 'none');
});

test('encrypted DNS endpoints are flagged, because they end observation', () => {
  for (const n of ['dns.google', 'cloudflare-dns.com', 'mozilla.cloudflare-dns.com', 'dns.quad9.net']) {
    const c = classify(n);
    assert.equal(c.isDoh, true, `${n} should be flagged`);
    assert.equal(c.category, 'doh');
  }
  assert.equal(classify('example.com').isDoh, false);
});

test('your own list beats the bundled one', () => {
  const extra = { 'doubleclick.net': 'work', 'weird.example': 'my printer' };
  assert.equal(classify('doubleclick.net', extra).category, 'work');
  assert.equal(classify('weird.example', extra).category, 'my printer');
});

test('local names are separated out rather than counted as contacts', () => {
  assert.equal(classify('printer.local').confidence, 'local');
});

test('summarise reports the unknown share, because coverage is the point', () => {
  const rows = [
    { name: 'doubleclick.net', client: 'a' },
    { name: 'mystery.example', client: 'a' },
    { name: 'another.example', client: 'b' },
    { name: 'printer.local', client: 'b' },
  ];
  const s = summarise(rows);
  assert.equal(s.total, 3, 'local queries are not external contacts');
  assert.equal(s.local, 1);
  assert.ok(Math.abs(s.unknownShare - 66.67) < 0.1, `got ${s.unknownShare}`);
});

test('summarise attributes domains to the devices that asked', () => {
  const s = summarise([
    { name: 'doubleclick.net', client: 'tv' },
    { name: 'doubleclick.net', client: 'phone' },
    { name: 'doubleclick.net', client: 'tv' },
  ]);
  const d = s.domains.find((x) => x.domain === 'doubleclick.net');
  assert.equal(d.count, 3);
  assert.deepEqual(d.devices.sort(), ['phone', 'tv']);
});

test('an empty input does not divide by zero', () => {
  const s = summarise([]);
  assert.equal(s.total, 0);
  assert.equal(s.unknownShare, 0);
});

test('content recognition is its own category, not filed under telemetry', () => {
  /* A television fingerprinting what is on the screen is a different kind of
     thing from a crash report, and the whole value of the report is that this
     line stands out rather than blending into a telemetry total. */
  const acr = classify('samsungacr.com');
  assert.equal(acr.category, 'acr');
  assert.ok(CATEGORIES.acr.includes('on your screen'), 'the category must explain itself in the report');
});

test('a subdomain of a content recognition host still classifies', () => {
  assert.equal(classify('api.samsungacr.com').category, 'acr');
});

test('every category used by a known domain has a description', () => {
  // A category with no description prints as a blank cell in the report.
  for (const [domain, category] of Object.entries(KNOWN)) {
    assert.ok(CATEGORIES[category], `"${domain}" uses category "${category}", which has no description`);
  }
});

