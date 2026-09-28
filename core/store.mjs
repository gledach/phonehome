/* Persistence. JSONL on disk, one file per day, no database.
 *
 * Writes are buffered. A busy house produces a few queries a second and
 * fsyncing each one would make the resolver the slowest thing on the network,
 * which is the one outcome that would get this uninstalled.
 *
 * The seen map is the interesting file: first time each device asked for each
 * domain. That is what makes "this doorbell started talking to somewhere new
 * last night" answerable, and it is small enough to keep in memory.
 */

import fs from 'node:fs';
import path from 'node:path';
import { paths, ensureDataDir } from './paths.mjs';

const FLUSH_MS = 2000;
const FLUSH_ROWS = 200;

let buffer = [];
let flushTimer = null;
let seen = null;
let seenDirty = false;

function dayFile(ms = Date.now()) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return path.join(paths.queries, `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.jsonl`);
}

/* ── observations ─────────────────────────────────────────────────────── */

export function recordQuery({ name, type, client, at = Date.now(), protocol = 'udp' }) {
  buffer.push({ at, client, name, type, protocol });
  if (buffer.length >= FLUSH_ROWS) {
    flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_MS);
    flushTimer.unref?.();
  }
}

export function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (buffer.length === 0) return 0;

  ensureDataDir();
  // Group by day so a flush spanning midnight lands in the right files.
  const byFile = new Map();
  for (const row of buffer) {
    const f = dayFile(row.at);
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push(JSON.stringify(row));
  }
  for (const [file, lines] of byFile) {
    fs.appendFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  }

  const written = buffer.length;
  buffer = [];
  if (seenDirty) writeSeen();
  return written;
}

/** Observations from the last `days` days, oldest first. */
export function readQueries({ days = 1, since = null } = {}) {
  ensureDataDir();
  const cutoff = since ?? Date.now() - days * 86400_000;
  const out = [];

  let files = [];
  try {
    files = fs.readdirSync(paths.queries).filter((f) => f.endsWith('.jsonl')).sort();
  } catch {
    return out;
  }

  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(path.join(paths.queries, f), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if ((row.at ?? 0) >= cutoff) out.push(row);
      } catch {
        // one bad line must not cost the file
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export function dayFiles() {
  try {
    return fs.readdirSync(paths.queries).filter((f) => f.endsWith('.jsonl')).sort();
  } catch {
    return [];
  }
}

/* ── first-seen map ───────────────────────────────────────────────────── */

function loadSeen() {
  if (seen) return seen;
  try {
    seen = JSON.parse(fs.readFileSync(paths.seen, 'utf8'));
  } catch {
    seen = {};
  }
  return seen;
}

function writeSeen() {
  ensureDataDir();
  const tmp = `${paths.seen}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(loadSeen()), 'utf8');
  fs.renameSync(tmp, paths.seen);
  seenDirty = false;
}

/**
 * Record that a device asked for a domain, and say whether that pairing is new.
 * @returns {boolean} true the first time this device asks for this domain
 */
export function markSeen(client, domain, at = Date.now()) {
  if (!client || !domain) return false;
  const map = loadSeen();
  const key = `${client}|${domain}`;
  if (map[key] !== undefined) return false;
  map[key] = at;
  seenDirty = true;
  return true;
}

export function firstSeen(client, domain) {
  return loadSeen()[`${client}|${domain}`] ?? null;
}

/** Pairings first seen after `since`. The point of the whole tool. */
export function newSince(since) {
  const map = loadSeen();
  const out = [];
  for (const [key, at] of Object.entries(map)) {
    if (at >= since) {
      const i = key.indexOf('|');
      out.push({ client: key.slice(0, i), domain: key.slice(i + 1), at });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

export function seenCount() {
  return Object.keys(loadSeen()).length;
}

/** For tests, and for anyone who wants a clean slate. */
export function resetForTests() {
  buffer = [];
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  seen = null;
  seenDirty = false;
}
