import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, parseLog } from '../sources/logs.mjs';

const NOW = Date.UTC(2027, 8, 29, 12, 0, 0);

test('dnsmasq and Pi-hole lines parse', () => {
  const r = parseLine('Sep 29 00:14:22 dnsmasq[1234]: query[A] example.com from 192.168.1.5', { now: NOW });
  assert.equal(r.name, 'example.com');
  assert.equal(r.type, 'A');
  assert.equal(r.client, '192.168.1.5');
  assert.equal(r.protocol, 'log');
});

test('other dnsmasq lines are skipped rather than mangled', () => {
  assert.equal(parseLine('Sep 29 00:14:22 dnsmasq[1234]: cached example.com is 1.2.3.4', { now: NOW }), null);
  assert.equal(parseLine('Sep 29 00:14:22 dnsmasq[1234]: forwarded example.com to 1.1.1.1', { now: NOW }), null);
  assert.equal(parseLine('', { now: NOW }), null);
  assert.equal(parseLine('total nonsense', { now: NOW }), null);
});

test('a month-name timestamp from December read in January lands last year', () => {
  // dnsmasq lines carry no year. Assuming the current one would date a
  // December log a full year into the future and hide it from every report.
  const jan = Date.UTC(2027, 0, 5, 12, 0, 0);
  const r = parseLine('Dec 28 23:00:00 dnsmasq[1]: query[A] example.com from 10.0.0.1', { now: jan });
  assert.ok(r.at < jan, 'a December line must not be dated into the future');
  assert.equal(new Date(r.at).getFullYear(), 2026);
});

test('unbound lines parse', () => {
  const r = parseLine('[1790000000] unbound[1:0] info: 192.168.1.9 example.com. A IN', { now: NOW });
  assert.equal(r.name, 'example.com', 'the trailing root dot is dropped');
  assert.equal(r.client, '192.168.1.9');
  assert.equal(r.at, 1790000000000);
});

test('AdGuard Home JSON lines parse', () => {
  const r = parseLine(JSON.stringify({ T: '2027-09-29T00:14:22Z', IP: '192.168.1.7', QH: 'Example.COM', QT: 'AAAA' }), { now: NOW });
  assert.equal(r.name, 'example.com');
  assert.equal(r.type, 'AAAA');
  assert.equal(r.client, '192.168.1.7');
});

test('a JSON line missing a question is skipped, not guessed at', () => {
  assert.equal(parseLine('{"IP":"1.2.3.4"}', { now: NOW }), null);
  assert.equal(parseLine('{not json', { now: NOW }), null);
});

test('parseLog reports what it understood and what it did not', () => {
  const text = [
    'Sep 29 00:14:22 dnsmasq[1]: query[A] a.example from 10.0.0.1',
    'Sep 29 00:14:23 dnsmasq[1]: cached a.example is 1.2.3.4',
    'Sep 29 00:14:24 dnsmasq[1]: query[A] b.example from 10.0.0.2',
    '',
  ].join('\n');
  const { rows, read, parsed, skipped } = parseLog(text, { now: NOW });
  assert.equal(read, 3, 'blank lines are not lines');
  assert.equal(parsed, 2);
  assert.equal(skipped, 1);
  assert.equal(rows.length, 2);
});
