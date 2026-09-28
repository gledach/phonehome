/* Integration, offline. No test here talks to a real upstream.
 *
 * This is the test that matters most. The resolver sits between every device in
 * a house and the internet: if it drops a packet or mangles a response, name
 * resolution breaks for everything, and whoever debugs it will not suspect the
 * monitoring tool installed last week.
 *
 * Every test carries an explicit timeout. A hanging socket test blocks the
 * whole gate otherwise, and a gate that can hang is a gate people stop running.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { createResolver } from '../core/resolver.mjs';
import { readHeader, readQuestion } from '../core/wire.mjs';

const T = { timeout: 15_000 };

function buildQuery(name, id = 0x4242) {
  const labels = name.split('.');
  const len = labels.reduce((a, l) => a + 1 + l.length, 0) + 1;
  const buf = Buffer.alloc(12 + len + 4);
  buf.writeUInt16BE(id, 0);
  buf.writeUInt16BE(0x0100, 2);
  buf.writeUInt16BE(1, 4);
  let off = 12;
  for (const l of labels) {
    buf.writeUInt8(l.length, off);
    buf.write(l, off + 1, 'ascii');
    off += 1 + l.length;
  }
  buf.writeUInt8(0, off);
  buf.writeUInt16BE(1, off + 1);
  buf.writeUInt16BE(1, off + 3);
  return buf;
}

function send(port, packet) {
  return new Promise((resolve) => {
    const c = dgram.createSocket('udp4');
    c.send(packet, port, '127.0.0.1', () => {
      setTimeout(() => { try { c.close(); } catch { /* closed */ } resolve(); }, 120);
    });
  });
}

function waitFor(port, packet, ms) {
  return new Promise((resolve) => {
    const c = dgram.createSocket('udp4');
    const timer = setTimeout(() => { try { c.close(); } catch { /* closed */ } resolve(null); }, ms);
    c.on('message', (msg) => {
      clearTimeout(timer);
      try { c.close(); } catch { /* closed */ }
      resolve(msg);
    });
    c.send(packet, port, '127.0.0.1');
  });
}

/** An unroutable address, so a forward attempt fails without leaving the machine. */
const NOWHERE = '192.0.2.1'; // RFC 5737 documentation range

test('a question is observed even when the forward fails', T, async () => {
  const seen = [];
  const r = createResolver({ port: 15361, upstream: [NOWHERE], onQuery: (q) => seen.push(q), onError: () => {} });
  await r.listen();
  try {
    await send(15361, buildQuery('recorded.example'));
    assert.equal(seen.length, 1, 'observation happens before forwarding, on purpose');
    assert.equal(seen[0].name, 'recorded.example');
    assert.equal(seen[0].type, 'A');
    assert.equal(seen[0].client, '127.0.0.1');
    assert.equal(seen[0].protocol, 'udp');
  } finally {
    r.close();
  }
});

test('an unreachable upstream produces SERVFAIL rather than silence', T, async () => {
  const r = createResolver({ port: 15362, upstream: [NOWHERE], timeoutMs: 400, onQuery: () => {}, onError: () => {} });
  await r.listen();
  try {
    const answer = await waitFor(15362, buildQuery('dead.example'), 5000);
    assert.ok(answer, 'a client must get an answer, not a hang');
    const h = readHeader(answer);
    assert.equal(h.isResponse, true);
    assert.equal(h.id, 0x4242, 'clients match answers to queries by id, so it must survive');
    assert.equal(h.rcode, 2, 'SERVFAIL');
    assert.equal(h.answerCount, 0);
  } finally {
    r.close();
  }
});

test('a response arriving on the listen port is ignored', T, async () => {
  // We are the server here. Treating a response as a query would record a
  // question nobody asked.
  const seen = [];
  const r = createResolver({ port: 15363, upstream: [NOWHERE], onQuery: (q) => seen.push(q), onError: () => {} });
  await r.listen();
  try {
    const response = buildQuery('not-a-query.example');
    response.writeUInt16BE(0x8180, 2);
    await send(15363, response);
    assert.equal(seen.length, 0);
  } finally {
    r.close();
  }
});

test('noise on the port is dropped without recording or crashing', T, async () => {
  const seen = [];
  const r = createResolver({ port: 15364, upstream: [NOWHERE], onQuery: (q) => seen.push(q), onError: () => {} });
  await r.listen();
  try {
    for (const junk of [Buffer.alloc(3), Buffer.from('hello there'), Buffer.alloc(0)]) {
      await send(15364, junk);
    }
    assert.equal(seen.length, 0);
  } finally {
    r.close();
  }
});

test('a throwing onQuery handler does not stop the resolver', T, async () => {
  const errors = [];
  const r = createResolver({
    port: 15365,
    upstream: [NOWHERE],
    onQuery: () => { throw new Error('handler exploded'); },
    onError: (e) => errors.push(e),
  });
  await r.listen();
  try {
    await send(15365, buildQuery('boom.example'));
    assert.equal(errors.length, 1, 'the failure is reported');
    assert.match(errors[0].message, /handler exploded/);
    // and the resolver is still alive
    await send(15365, buildQuery('after.example'));
  } finally {
    r.close();
  }
});

test('two resolvers cannot hold the same port', T, async () => {
  const a = createResolver({ port: 15366, upstream: [NOWHERE], onQuery: () => {}, onError: () => {} });
  await a.listen();
  const b = createResolver({ port: 15366, upstream: [NOWHERE], onQuery: () => {}, onError: () => {} });
  try {
    await assert.rejects(() => b.listen(), (err) => err.code === 'EADDRINUSE');
  } finally {
    a.close();
    b.close();
  }
});

test('an empty upstream list is refused at construction', () => {
  assert.throws(() => createResolver({ upstream: [], onQuery: () => {} }), /no upstream/);
});

test('the parser and the recorder agree on the name', () => {
  assert.equal(readQuestion(buildQuery('agreement.example')).name, 'agreement.example');
});
