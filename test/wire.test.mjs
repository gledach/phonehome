import test from 'node:test';
import assert from 'node:assert/strict';
import { readHeader, readQuestion, servfail, WireError } from '../core/wire.mjs';

/** Build a real DNS query packet, so the parser is tested against the format
 *  rather than against my memory of it. */
function query(name, typeId = 1, { id = 0x1234, qdcount = 1 } = {}) {
  const labels = name.split('.').filter(Boolean);
  const nameLen = labels.reduce((a, l) => a + 1 + l.length, 0) + 1;
  const buf = Buffer.alloc(12 + nameLen + 4);
  buf.writeUInt16BE(id, 0);
  buf.writeUInt16BE(0x0100, 2); // standard query, recursion desired
  buf.writeUInt16BE(qdcount, 4);
  let off = 12;
  for (const l of labels) {
    buf.writeUInt8(l.length, off);
    buf.write(l, off + 1, 'ascii');
    off += 1 + l.length;
  }
  buf.writeUInt8(0, off);
  off += 1;
  buf.writeUInt16BE(typeId, off);
  buf.writeUInt16BE(1, off + 2);
  return buf;
}

test('reads the header of a real query', () => {
  const h = readHeader(query('example.com'));
  assert.equal(h.id, 0x1234);
  assert.equal(h.isResponse, false);
  assert.equal(h.questionCount, 1);
  assert.equal(h.recursionDesired, true);
});

test('a buffer shorter than a header is refused', () => {
  assert.throws(() => readHeader(Buffer.alloc(4)), WireError);
  assert.throws(() => readHeader(null), WireError);
});

test('reads the question name and type', () => {
  assert.deepEqual(readQuestion(query('example.com')), {
    name: 'example.com', type: 'A', typeId: 1,
  });
  assert.equal(readQuestion(query('a.b.c.example.co.uk', 28)).name, 'a.b.c.example.co.uk');
  assert.equal(readQuestion(query('example.com', 28)).type, 'AAAA');
  assert.equal(readQuestion(query('example.com', 65)).type, 'HTTPS');
});

test('an unknown query type is reported as its number rather than dropped', () => {
  assert.equal(readQuestion(query('example.com', 9999)).type, '9999');
});

test('names are lowercased, because DNS is case insensitive', () => {
  assert.equal(readQuestion(query('ExAmPlE.CoM')).name, 'example.com');
});

/* Every malformed case returns null rather than throwing. A resolver that
 * crashes on a weird packet stops resolving for the whole house, and an
 * unreadable question is a gap in observation, not a reason to fail. */

test('malformed packets return null instead of throwing', () => {
  assert.equal(readQuestion(Buffer.alloc(0)), null);
  assert.equal(readQuestion(Buffer.alloc(5)), null);
  assert.equal(readQuestion(query('example.com', 1, { qdcount: 0 })), null);

  const truncated = query('example.com').subarray(0, 16);
  assert.equal(readQuestion(truncated), null, 'a name running off the end of the buffer');

  const badLabel = query('example.com');
  badLabel.writeUInt8(200, 12); // a label longer than the legal 63
  assert.equal(readQuestion(badLabel), null);

  const pointer = query('example.com');
  pointer.writeUInt8(0xc0, 12); // compression pointer, illegal in a question
  assert.equal(readQuestion(pointer), null);
});

test('a packet of pure noise never throws', () => {
  for (let i = 0; i < 200; i++) {
    const junk = Buffer.alloc(40);
    for (let j = 0; j < junk.length; j++) junk[j] = Math.floor(Math.random() * 256);
    junk.writeUInt16BE(1, 4); // claim one question, to force the parser down the path
    assert.doesNotThrow(() => readQuestion(junk));
  }
});

test('servfail echoes the id and marks a response', () => {
  const req = query('example.com');
  const res = servfail(req);
  const h = readHeader(res);
  assert.equal(h.id, 0x1234, 'the client matches answers to queries by id');
  assert.equal(h.isResponse, true);
  assert.equal(h.rcode, 2, 'SERVFAIL');
  assert.equal(h.answerCount, 0);
});
