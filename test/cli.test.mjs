/* Integration: actually spawn the binary. Offline throughout. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(HERE, '..', 'bin', 'phonehome.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phonehome-cli-'));
const logFile = path.join(tmp, 'sample.log');

const env = { ...process.env, PHONEHOME_DATA: tmp, NO_COLOR: '1' };

const stamp = (d) =>
  `${d.toLocaleString('en-US', { month: 'short' })} ${String(d.getDate()).padStart(2, ' ')} ${d.toTimeString().slice(0, 8)}`;

const lines = [];
const now = Date.now();
for (let i = 0; i < 60; i++) {
  const t = new Date(now - i * 60_000);
  const name = ['example.com', 'doubleclick.net', 'dns.google', 'printer.local'][i % 4];
  const client = ['10.0.0.5', '10.0.0.6'][i % 2];
  lines.push(`${stamp(t)} dnsmasq[1]: query[A] ${name} from ${client}`);
}
fs.writeFileSync(logFile, `${lines.join('\n')}\n`, 'utf8');

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const run = (args) => spawnSync(process.execPath, [BIN, ...args], { env, encoding: 'utf8', timeout: 60_000 });

test('help exits cleanly and names every command', () => {
  const r = run(['help']);
  assert.equal(r.status, 0);
  // Plain includes rather than a built regex: a word-boundary escape written
  // through a shell heredoc collapses to a literal backspace character, which
  // matches nothing and looks like a real failure.
  for (const cmd of ['watch', 'report', 'new', 'devices', 'import', 'doctor']) {
    assert.ok(r.stdout.includes(`  ${cmd}`), `help should list ${cmd}`);
  }
});

test('help states what the tool cannot see', () => {
  // On a privacy tool the blind spots matter more than the features, so they
  // are not allowed to drift out of the help text unnoticed.
  const r = run(['help']);
  assert.match(r.stdout, /Encrypted DNS/i);
  assert.match(r.stdout, /cannot see/i);
});

test('an unknown command exits 2', () => {
  const r = run(['nope']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown command/);
});

test('import without a file explains itself', () => {
  const r = run(['import']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Which log/);
});

test('import of a missing file fails cleanly', () => {
  const r = run(['import', path.join(tmp, 'nope.log')]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /No such file/);
});

test('import defaults to a dry run', () => {
  const r = run(['import', logFile]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Dry run/);
  assert.match(r.stdout, /understood 60/);
});

test('import --execute writes observations', () => {
  const r = run(['import', logFile, '--execute']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Imported 60 observations/);
});

test('report summarises what was imported and admits its unknown share', () => {
  const r = run(['report', '--days=2']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /doubleclick\.net/);
  assert.match(r.stdout, /advertising/);
  assert.match(r.stdout, /landed in "unknown"/);
});

test('report separates local lookups from external contacts', () => {
  const r = run(['report', '--days=2']);
  // printer.local is a LAN lookup, not a contact with anyone.
  assert.doesNotMatch(r.stdout, /printer\.local\s+\d+\s+unknown/);
  assert.match(r.stdout, /\d+ external queries, \d+ local/);
});

test('report flags encrypted DNS, which is where observation ends', () => {
  const r = run(['report', '--days=2']);
  assert.match(r.stdout, /Encrypted DNS/);
  assert.match(r.stdout, /dns\.google/);
});

test('report --json is parseable', () => {
  const r = run(['report', '--days=2', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const parsed = JSON.parse(r.stdout);
  assert.ok(Array.isArray(parsed.domains));
  assert.equal(typeof parsed.unknownShare, 'number');
});

test('devices lists what has asked, and offers the lines to paste', () => {
  const r = run(['devices']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /10\.0\.0\.5/);
  assert.match(r.stdout, /unnamed/);
  assert.match(r.stdout, /'10\.0\.0\.\d': 'what is it',/);
});

test('new reports first contacts', () => {
  const r = run(['new', '--days=2']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /first contact/);
});

test('new is honest that a first sighting is not automatically bad', () => {
  const r = run(['new', '--days=2']);
  assert.match(r.stdout, /not automatically bad/);
});

test('doctor runs and ends with the blind spots', () => {
  const r = run(['doctor']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /What this cannot see/);
  assert.match(r.stdout, /Encrypted DNS/);
});

test('report on an empty store says so rather than pretending', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'phonehome-empty-'));
  try {
    const r = spawnSync(process.execPath, [BIN, 'report'], {
      env: { ...env, PHONEHOME_DATA: empty }, encoding: 'utf8', timeout: 60_000,
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Nothing recorded yet/);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});
