/* The one place that decides where anything lives on disk. */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DATA_DIR = process.env.PHONEHOME_DATA
  ? path.resolve(process.env.PHONEHOME_DATA)
  : path.join(ROOT, 'data');

export const CONFIG_DIR = path.join(ROOT, 'config');

export const paths = {
  root: ROOT,
  data: DATA_DIR,
  queries: path.join(DATA_DIR, 'queries'),
  seen: path.join(DATA_DIR, 'seen.json'),
  lock: path.join(DATA_DIR, 'watch.lock'),
};

export function ensureDataDir() {
  fs.mkdirSync(paths.queries, { recursive: true });
  return DATA_DIR;
}

export function pretty(p) {
  const rel = path.relative(ROOT, p);
  return rel.startsWith('..') ? p : rel.split(path.sep).join('/');
}
