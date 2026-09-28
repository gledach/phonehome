#!/usr/bin/env node
/* MCP over stdio. Zero dependencies, so JSON-RPC 2.0 is implemented directly.
 *
 * Read-only, and more pointedly than usual: this tool observes a household
 * network, so there is no tool here that starts a resolver, changes a config,
 * or reveals anything an agent could not already read from the report. It
 * answers questions about what has been recorded and nothing else.
 *
 * Every result carries the blind spots. An agent told "nothing contacted
 * anything unusual" needs to know that a device on encrypted DNS is invisible
 * here, or it will report a clean bill of health it cannot support.
 */

import { readQueries, newSince, seenCount, dayFiles } from './core/store.mjs';
import { summarise, classify, CATEGORIES } from './core/classify.mjs';
import { loadDevices, loadDomains, label } from './core/config.mjs';
import { DOH_ENDPOINTS, KNOWN } from './sources/known-domains.mjs';

const SERVER = { name: 'phonehome', version: '0.1.0' };
const DEFAULT_PROTOCOL = '2025-06-18';

const BLIND_SPOTS = [
  'Encrypted DNS. A device using DoH or DoT never asks this resolver anything and is invisible here.',
  'Content. This reads the question in a DNS packet, never an answer or a payload. A domain being contacted is not data being sent.',
  'Hardcoded resolvers. Hardware that ignores DHCP and talks to a public resolver directly bypasses this entirely.',
  'Registrable domains come from a short suffix table, not the full Public Suffix List, so an unusual TLD can be grouped one label off.',
];

const TOOLS = [
  {
    name: 'list_devices',
    description: 'Every device that has asked this resolver for anything, with query counts and whether it has been named.',
    inputSchema: { type: 'object', properties: { days: { type: 'number', description: 'Lookback, default 7' } } },
  },
  {
    name: 'get_report',
    description: 'What the network contacted: per category, per domain, per device, with the share that could not be classified.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Lookback, default 1' },
        top: { type: 'number', description: 'How many domains to return, default 25' },
      },
    },
  },
  {
    name: 'new_contacts',
    description: 'Device and domain pairings seen for the first time recently. The most useful signal this tool produces.',
    inputSchema: { type: 'object', properties: { hours: { type: 'number', description: 'Lookback in hours, default 24' } } },
  },
  {
    name: 'classify_domain',
    description: 'What category a domain falls into, and how confident that is: a known entry, a substring guess, or unknown.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'blind_spots',
    description: 'What this tool cannot see. Read before drawing any conclusion from an absence of results.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function coverage(rows) {
  const files = dayFiles();
  return {
    observations: rows.length,
    dayFiles: files.length,
    pairingsKnown: seenCount(),
    trustEmptyResult: rows.length > 0,
    blindSpots: BLIND_SPOTS,
    note:
      rows.length === 0
        ? 'Nothing has been recorded. An empty result here means the tool has not been watching, not that nothing happened.'
        : 'Absence of a device from these results may mean it uses encrypted DNS rather than that it was quiet.',
  };
}

async function callTool(name, args = {}) {
  const [{ names }, { extra }] = await Promise.all([loadDevices(), loadDomains()]);

  if (name === 'blind_spots') {
    return { blindSpots: BLIND_SPOTS, knownDohEndpoints: [...DOH_ENDPOINTS], classifiedDomains: Object.keys(KNOWN).length };
  }

  if (name === 'classify_domain') {
    if (!args.name || typeof args.name !== 'string') return { error: 'name is required' };
    const c = classify(args.name, extra);
    return {
      query: args.name,
      label: c.label,
      registrableDomain: c.domain,
      category: c.category,
      categoryMeans: CATEGORIES[c.category] ?? null,
      confidence: c.confidence,
      matchedOn: c.matchedOn,
      isEncryptedDnsEndpoint: c.isDoh,
    };
  }

  if (name === 'list_devices') {
    const days = Number(args.days) || 7;
    const rows = readQueries({ days });
    const byClient = new Map();
    for (const r of rows) {
      const e = byClient.get(r.client) || { address: r.client, queries: 0, domains: new Set(), lastSeen: 0 };
      e.queries += 1;
      e.domains.add(r.name);
      e.lastSeen = Math.max(e.lastSeen, r.at);
      byClient.set(r.client, e);
    }
    return {
      days,
      devices: [...byClient.values()]
        .map((d) => ({
          address: d.address,
          name: names[d.address] ?? null,
          named: Boolean(names[d.address]),
          queries: d.queries,
          distinctNames: d.domains.size,
          lastSeenIso: new Date(d.lastSeen).toISOString(),
        }))
        .sort((a, b) => b.queries - a.queries),
      coverage: coverage(rows),
    };
  }

  if (name === 'get_report') {
    const days = Number(args.days) || 1;
    const top = Number(args.top) || 25;
    const rows = readQueries({ days });
    const s = summarise(rows, extra);
    return {
      days,
      externalQueries: s.total,
      localLookups: s.local,
      unknownSharePct: Number(s.unknownShare.toFixed(1)),
      categories: s.categories,
      domains: s.domains.slice(0, top).map((d) => ({
        domain: d.domain,
        queries: d.count,
        category: d.category,
        confidence: d.confidence,
        devices: d.devices.map((x) => label(names, x)),
      })),
      encryptedDnsLookups: s.dohAttempts,
      coverage: coverage(rows),
    };
  }

  if (name === 'new_contacts') {
    const hours = Number(args.hours) || 24;
    const since = Date.now() - hours * 3600_000;
    const rows = newSince(since);
    return {
      hours,
      sinceIso: new Date(since).toISOString(),
      contacts: rows.map((r) => {
        const c = classify(r.domain, extra);
        return {
          device: label(names, r.client),
          address: r.client,
          domain: r.domain,
          category: c.category,
          confidence: c.confidence,
          firstSeenIso: new Date(r.at).toISOString(),
        };
      }),
      caution:
        'A first sighting is not automatically suspicious. A CDN rotating hostnames looks identical to something new starting up.',
      coverage: coverage(readQueries({ days: Math.max(1, Math.ceil(hours / 24)) })),
    };
  }

  return { error: `unknown tool "${name}"` };
}

/* ─── JSON-RPC plumbing ─────────────────────────────────────────────────── */

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const result = (id, value) => send({ jsonrpc: '2.0', id, result: value });
const failure = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return result(id, {
      protocolVersion: params?.protocolVersion || DEFAULT_PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER,
      instructions:
        'phonehome reports which domains the devices on a home network contacted. It is read-only ' +
        'and cannot start, stop or configure anything. Call blind_spots before concluding that a ' +
        'quiet result means nothing happened.',
    });
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return;
  if (method === 'ping') return result(id, {});
  if (method === 'tools/list') return result(id, { tools: TOOLS });

  if (method === 'tools/call') {
    try {
      const value = await callTool(params?.name, params?.arguments ?? {});
      return result(id, {
        content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        isError: Boolean(value && value.error),
      });
    } catch (err) {
      return result(id, {
        content: [{ type: 'text', text: `phonehome ${params?.name} failed: ${err.message}` }],
        isError: true,
      });
    }
  }

  if (id !== undefined) failure(id, -32601, `Method not found: ${method}`);
}

let buffer = '';
let stdinEnded = false;
let draining = false;
const queue = [];

/* One at a time, in arrival order, exiting only when stdin has closed and the
   queue is empty. Tracking this per message instead would exit after the first
   response while the rest of a piped batch was still buffered. */
async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (queue.length) {
      const msg = queue.shift();
      try {
        await handle(msg);
      } catch (err) {
        if (msg?.id !== undefined) failure(msg.id, -32603, err.message);
      }
    }
  } finally {
    draining = false;
    if (stdinEnded && queue.length === 0) finish();
  }
}

/* process.exit truncates anything still buffered, and writes to a pipe are
   asynchronous everywhere and non-blocking on Windows. Set the code and let the
   loop end instead. */
function finish() {
  process.exitCode = 0;
  process.stdin.pause();
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    try {
      queue.push(JSON.parse(line));
    } catch {
      failure(null, -32700, 'Parse error');
    }
  }
  drain();
});

process.stdin.on('end', () => {
  stdinEnded = true;
  if (!draining && queue.length === 0) finish();
  else drain();
});
