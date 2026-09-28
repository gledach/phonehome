/* Loading your device names and your own domain classifications.
 *
 * Same layering as the rest of the house:
 *   *.local.mjs  overrides  *.default.mjs
 *
 * The mtime goes in the import URL because ESM caches module records per URL
 * for the process lifetime, and `watch` runs for days. Without it, naming a
 * device would have no effect until a restart.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG_DIR } from './paths.mjs';

async function loadPair(base) {
  const local = path.join(CONFIG_DIR, `${base}.local.mjs`);
  const fallback = path.join(CONFIG_DIR, `${base}.default.mjs`);
  const file = fs.existsSync(local) ? local : fs.existsSync(fallback) ? fallback : null;
  if (!file) return { file: null, value: {}, isDefault: true };

  const mod = await import(`${pathToFileURL(file).href}?v=${fs.statSync(file).mtimeMs}`);
  const value = mod.default;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${file}: default export must be an object`);
  }
  return { file, value, isDefault: file === fallback };
}

export async function loadDevices() {
  const { file, value, isDefault } = await loadPair('devices');
  const names = {};
  for (const [addr, label] of Object.entries(value)) {
    if (typeof label !== 'string' || !label.trim()) {
      throw new Error(`${file}: name for ${addr} must be a non-empty string`);
    }
    names[addr.trim()] = label.trim();
  }
  return { file, names, isDefault, count: Object.keys(names).length };
}

export async function loadDomains() {
  const { file, value, isDefault } = await loadPair('domains');
  const extra = {};
  for (const [domain, category] of Object.entries(value)) {
    if (typeof category !== 'string' || !category.trim()) {
      throw new Error(`${file}: category for ${domain} must be a non-empty string`);
    }
    extra[domain.trim().toLowerCase()] = category.trim();
  }
  return { file, extra, isDefault, count: Object.keys(extra).length };
}

/** A device's label, or its address when it has none. */
export function label(names, client) {
  return names[client] || client;
}
