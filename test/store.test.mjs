import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phonehome-test-'));
process.env.PHONEHOME_DATA = tmp;
const store = await import('../core/store.mjs');

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('queries round-trip through the daily file', () => {
  store.recordQuery({ name: 'example.com', type: 'A', client: '10.0.0.1' });
  store.recordQuery({ name: 'other.example', type: 'A', client: '10.0.0.2' });
  assert.equal(store.flush(), 2);

  const rows = store.readQueries({ days: 1 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'example.com');
});

test('a flush spanning midnight writes into the right day files', () => {
  const yesterday = Date.now() - 26 * 3600_000;
  store.recordQuery({ name: 'old.example', type: 'A', client: '10.0.0.3', at: yesterday });
  store.recordQuery({ name: 'today.example', type: 'A', client: '10.0.0.3' });
  store.flush();
  assert.ok(store.dayFiles().length >= 2, 'two days means two files');
});

test('readQueries filters by age', () => {
  const recent = store.readQueries({ days: 1 }).map((r) => r.name);
  assert.ok(!recent.includes('old.example'), 'yesterday is not in the last day');
  assert.ok(store.readQueries({ days: 3 }).some((r) => r.name === 'old.example'));
});

test('a corrupt line does not cost the whole file', () => {
  const file = path.join(tmp, 'queries', fs.readdirSync(path.join(tmp, 'queries'))[0]);
  fs.appendFileSync(file, 'this is not json\n', 'utf8');
  assert.doesNotThrow(() => store.readQueries({ days: 3 }));
  assert.ok(store.readQueries({ days: 3 }).length > 0);
});

test('markSeen reports only the first sighting of a pairing', () => {
  assert.equal(store.markSeen('tv', 'example.com'), true);
  assert.equal(store.markSeen('tv', 'example.com'), false, 'the second time is not news');
  assert.equal(store.markSeen('phone', 'example.com'), true, 'but a different device is');
});

test('newSince returns pairings first seen after a moment', () => {
  const before = Date.now();
  store.markSeen('doorbell', 'suspicious.example', before + 1000);
  const rows = store.newSince(before);
  assert.ok(rows.some((r) => r.client === 'doorbell' && r.domain === 'suspicious.example'));
  assert.equal(store.newSince(Date.now() + 60_000).length, 0, 'nothing is new in the future');
});

test('a device and a domain containing a pipe still split correctly', () => {
  // The key is "client|domain", so a domain with a pipe in it would break a
  // naive split. Splitting on the first separator only is what saves it.
  store.markSeen('10.0.0.9', 'weird|name.example');
  const found = store.newSince(0).find((r) => r.client === '10.0.0.9');
  assert.equal(found.domain, 'weird|name.example');
});

test('seenCount grows with pairings', () => {
  assert.ok(store.seenCount() >= 4);
});
