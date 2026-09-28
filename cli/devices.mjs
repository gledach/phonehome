import { readQueries } from '../core/store.mjs';
import { loadDevices } from '../core/config.mjs';
import { c, table, hhmm, dayLabel } from '../core/format.mjs';
import { bool, num } from '../core/args.mjs';

export default async function devices({ flags }) {
  const days = num(flags.days, 7);
  const rows = readQueries({ days });
  const { names, file, isDefault } = await loadDevices();

  const byClient = new Map();
  for (const r of rows) {
    const e = byClient.get(r.client) || { client: r.client, queries: 0, domains: new Set(), first: r.at, last: r.at };
    e.queries += 1;
    e.domains.add(r.name);
    e.first = Math.min(e.first, r.at);
    e.last = Math.max(e.last, r.at);
    byClient.set(r.client, e);
  }

  const list = [...byClient.values()].sort((a, b) => b.queries - a.queries);

  if (bool(flags.json)) {
    console.log(JSON.stringify(list.map((d) => ({ ...d, domains: d.domains.size, name: names[d.client] ?? null })), null, 2));
    return 0;
  }

  console.log('');
  console.log(`${c.bold('devices')}  ${c.dim(`seen in the last ${days} days`)}`);
  console.log('');

  if (list.length === 0) {
    console.log(c.dim('  Nothing has asked this resolver for anything yet.'));
    console.log('');
    return 0;
  }

  console.log(
    table(
      list.map((d) => [
        names[d.client] ? c.bold(names[d.client]) : c.yellow('unnamed'),
        d.client,
        String(d.queries),
        String(d.domains.size),
        c.dim(`${dayLabel(d.last)} ${hhmm(d.last)}`),
      ]),
      { headers: ['name', 'address', 'queries', 'domains', 'last seen'] },
    )
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n'),
  );

  const unnamed = list.filter((d) => !names[d.client]);
  console.log('');
  if (unnamed.length) {
    console.log(c.dim(`  ${unnamed.length} unnamed. Add them to ${isDefault ? 'config/devices.local.mjs' : file}:`));
    console.log('');
    for (const d of unnamed.slice(0, 8)) console.log(c.dim(`    '${d.client}': 'what is it',`));
    console.log('');
    console.log(c.dim('  A report of addresses tells you nothing. A report of names tells you everything.'));
  } else {
    console.log(c.green('  Every device is named.'));
  }
  console.log('');
  return 0;
}
