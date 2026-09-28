import test from 'node:test';
import assert from 'node:assert/strict';
import { registrable, isLocal } from '../core/names.mjs';

test('ordinary names reduce to two labels', () => {
  assert.equal(registrable('example.com'), 'example.com');
  assert.equal(registrable('a.b.c.example.com'), 'example.com');
  assert.equal(registrable('EXAMPLE.COM'), 'example.com');
  assert.equal(registrable('example.com.'), 'example.com', 'a trailing root dot is not a label');
});

test('multi-part suffixes keep three labels', () => {
  assert.equal(registrable('shop.example.co.uk'), 'example.co.uk');
  assert.equal(registrable('example.com.au'), 'example.com.au');
  assert.equal(registrable('a.b.example.co.jp'), 'example.co.jp');
});

test('public hosting suffixes count each registration separately', () => {
  // Two projects on github.io are not the same site, so collapsing them to
  // "github.io" would merge unrelated things into one row.
  assert.equal(registrable('alice.github.io'), 'alice.github.io');
  assert.equal(registrable('bob.github.io'), 'bob.github.io');
  assert.notEqual(registrable('alice.github.io'), registrable('bob.github.io'));
  assert.equal(registrable('bucket.s3.amazonaws.com'), 's3.amazonaws.com');
});

test('degenerate input does not throw', () => {
  assert.equal(registrable(''), null);
  assert.equal(registrable(null), null);
  assert.equal(registrable(undefined), null);
  assert.equal(registrable('localhost'), 'localhost');
  assert.equal(registrable('.'), null);
});

test('local and special-use names are recognised', () => {
  for (const n of ['printer.local', 'router.home', 'nas.lan', 'x.internal', 'wpad', '1.0.168.192.in-addr.arpa']) {
    assert.equal(isLocal(n), true, `${n} should be local`);
  }
  for (const n of ['example.com', 'a.b.example.co.uk']) {
    assert.equal(isLocal(n), false, `${n} should not be local`);
  }
});

test('a bare hostname counts as local', () => {
  // A device asking for "nas" with no dot is doing a LAN lookup, not contacting
  // anyone. Counting those as external contacts would bury the real signal.
  assert.equal(isLocal('nas'), true);
});
