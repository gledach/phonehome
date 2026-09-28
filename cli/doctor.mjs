/* Reports, does not repair. Ends with what the tool cannot see, because on a
 * privacy tool the blind spots matter more than the features. */

import fs from 'node:fs';
import dgram from 'node:dgram';
import { systemUpstreams } from '../core/resolver.mjs';
import { loadDevices, loadDomains } from '../core/config.mjs';
import { readQueries, seenCount, dayFiles } from '../core/store.mjs';
import { paths, ensureDataDir, pretty } from '../core/paths.mjs';
import { KNOWN, DOH_ENDPOINTS } from '../sources/known-domains.mjs';
import { c } from '../core/format.mjs';
import { num } from '../core/args.mjs';

export default async function doctor({ flags }) {
  const port = num(flags.port, 5335);
  let problems = 0;
  let warnings = 0;
  const ok = (l, d = '') => console.log(`  ${c.green('ok')}    ${l}${d ? `  ${c.dim(d)}` : ''}`);
  const warn = (l, d = '') => { warnings += 1; console.log(`  ${c.yellow('warn')}  ${l}${d ? `  ${c.dim(d)}` : ''}`); };
  const bad = (l, d = '') => { problems += 1; console.log(`  ${c.red('FAIL')}  ${l}${d ? `  ${c.dim(d)}` : ''}`); };

  console.log('');
  console.log(c.bold('phonehome doctor'));
  console.log('');

  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 22) ok('node', `v${process.versions.node}`);
  else bad('node', `v${process.versions.node}, needs >= 22`);

  try {
    const { file, count, isDefault } = await loadDevices();
    ok('device names', `${pretty(file ?? 'none')}, ${count} named`);
    if (isDefault || count === 0) warn('no devices named', 'a report of IP addresses tells you very little');
  } catch (err) { bad('device names', err.message); }

  try {
    const { file, count, isDefault } = await loadDomains();
    ok('your classifications', `${pretty(file ?? 'none')}, ${count} entries`);
    if (isDefault) warn('using the bundled list only', `${Object.keys(KNOWN).length} domains, deliberately short`);
  } catch (err) { bad('your classifications', err.message); }

  const upstream = systemUpstreams();
  if (upstream.length === 1 && upstream[0] === '9.9.9.9') {
    warn('upstream', 'no system resolver found, would fall back to 9.9.9.9');
  } else {
    ok('upstream', `${upstream.join(', ')}  (what this machine already uses)`);
  }

  const free = await portFree(port);
  if (free) ok(`port ${port}`, 'available on 127.0.0.1');
  else warn(`port ${port}`, 'in use. watch is probably already running');

  try {
    ensureDataDir();
    fs.accessSync(paths.data, fs.constants.W_OK);
    const files = dayFiles();
    const recent = readQueries({ days: 1 });
    ok('data', `${pretty(paths.data)}, ${files.length} day file(s), ${recent.length} queries in the last day`);
    ok('pairings known', `${seenCount()} device and domain combinations`);
    if (recent.length === 0 && files.length === 0) {
      warn('nothing recorded yet', 'run `phonehome watch`, or `phonehome import` a log you already have');
    }
  } catch (err) { bad('data directory', err.message); }

  console.log('');
  console.log(c.bold('  What this cannot see'));
  console.log(c.dim(`    Encrypted DNS. ${DOH_ENDPOINTS.size} known DoH endpoints are flagged on sight, but once a`));
  console.log(c.dim('    device switches to it, nothing it does appears here again.'));
  console.log(c.dim('    Content. This reads the question in a packet, never an answer or a payload.'));
  console.log(c.dim('    Hardcoded resolvers. Hardware that ignores DHCP needs a firewall rule, not this.'));
  console.log(c.dim('    Registrable domains are derived from a short suffix table, not the full'));
  console.log(c.dim('    Public Suffix List, so an unusual TLD can be grouped one label off.'));

  console.log('');
  if (problems) console.log(`  ${c.red(`${problems} problem(s)`)}${warnings ? `, ${warnings} warning(s)` : ''}`);
  else if (warnings) console.log(`  ${c.yellow(`${warnings} warning(s)`)}, nothing broken`);
  else console.log(`  ${c.green('all good')}`);
  console.log('');
  return problems > 0 ? 1 : 0;
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = dgram.createSocket('udp4');
    s.once('error', () => resolve(false));
    s.bind(port, '127.0.0.1', () => { s.close(() => resolve(true)); });
  });
}
