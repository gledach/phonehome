import { readQueries } from '../core/store.mjs';
import { summarise, CATEGORIES } from '../core/classify.mjs';
import { loadDevices, loadDomains, label } from '../core/config.mjs';
import { c, table } from '../core/format.mjs';
import { bool, num } from '../core/args.mjs';

export default async function report({ flags }) {
  const days = num(flags.days, 1);
  const top = num(flags.top, 15);
  const rows = readQueries({ days });
  const [{ names }, { extra, isDefault: domainsDefault }] = await Promise.all([
    loadDevices(),
    loadDomains(),
  ]);

  if (bool(flags.json)) {
    console.log(JSON.stringify({ days, ...summarise(rows, extra) }, null, 2));
    return 0;
  }

  console.log('');
  console.log(`${c.bold('report')}  ${c.dim(`last ${days} day${days === 1 ? '' : 's'}`)}`);
  console.log('');

  if (rows.length === 0) {
    console.log(c.dim('  Nothing recorded yet. Run `phonehome watch` and point something at it,'));
    console.log(c.dim('  or `phonehome import` an existing DNS log.'));
    console.log('');
    return 0;
  }

  const s = summarise(rows, extra);

  // Per device, because "the network contacted X" is far less useful than
  // "the doorbell contacted X".
  const byDevice = new Map();
  for (const r of rows) {
    if (!byDevice.has(r.client)) byDevice.set(r.client, []);
    byDevice.get(r.client).push(r);
  }

  const deviceRows = [...byDevice.entries()]
    .map(([client, rs]) => {
      const sub = summarise(rs, extra);
      const worst = sub.categories.find((x) => x !== undefined);
      return {
        client,
        name: label(names, client),
        queries: rs.length,
        domains: sub.domains.length,
        unknown: sub.unknownShare,
        top: worst ? worst.category : 'none',
        named: Boolean(names[client]),
      };
    })
    .sort((a, b) => b.queries - a.queries);

  console.log(
    table(
      deviceRows.map((d) => [
        d.named ? d.name : c.dim(d.name),
        String(d.queries),
        String(d.domains),
        d.top,
        `${d.unknown.toFixed(0)}%`,
      ]),
      { headers: ['device', 'queries', 'domains', 'busiest category', 'unknown'] },
    )
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n'),
  );

  const unnamed = deviceRows.filter((d) => !d.named).length;
  if (unnamed) {
    console.log('');
    console.log(c.dim(`  ${unnamed} device(s) unnamed. Name them in config/devices.local.mjs and this becomes readable.`));
  }

  console.log('');
  console.log(c.bold('  Where the queries went'));
  console.log('');
  console.log(
    table(
      s.categories.map((x) => [
        x.category === 'unknown' ? c.dim(x.category) : x.category,
        String(x.count),
        `${((x.count / s.total) * 100).toFixed(0)}%`,
        c.dim(CATEGORIES[x.category] ?? ''),
      ]),
      { headers: ['category', 'queries', 'share', ''] },
    )
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n'),
  );

  console.log('');
  console.log(c.bold(`  Busiest domains`));
  console.log('');
  console.log(
    table(
      s.domains.slice(0, top).map((d) => [
        d.domain,
        String(d.count),
        d.confidence === 'known' ? d.category : d.confidence === 'guess' ? c.yellow(`${d.category}?`) : c.dim('unknown'),
        c.dim(d.devices.map((x) => label(names, x)).slice(0, 3).join(', ')),
      ]),
      { headers: ['domain', 'queries', 'category', 'asked by'] },
    )
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n'),
  );

  if (s.dohAttempts.length) {
    console.log('');
    console.log(`  ${c.yellow('Encrypted DNS')}`);
    for (const a of s.dohAttempts.slice(0, 8)) {
      console.log(`    ${a.replace(/^(\S+)/, (m) => label(names, m))}`);
    }
    console.log(c.dim('    A device that switches to encrypted DNS stops appearing here at all.'));
  }

  console.log('');
  console.log(
    c.dim(
      `  ${s.total} external queries, ${s.local} local. ` +
        `${s.unknownShare.toFixed(0)}% landed in "unknown".`,
    ),
  );
  if (domainsDefault && s.unknownShare > 30) {
    console.log(c.dim('  The bundled classification list is short on purpose. Add your own in config/domains.local.mjs.'));
  }
  console.log(c.dim('  A domain being contacted is not the same as data being sent. This sees names, not content.'));
  console.log('');
  return 0;
}
