/* What started talking to somewhere it never had before.
 *
 * The reason the tool exists. A steady list of domains is background; a device
 * that contacts something new at 03:00 is the thing worth knowing.
 */

import { newSince, seenCount } from '../core/store.mjs';
import { classify } from '../core/classify.mjs';
import { loadDevices, loadDomains, label } from '../core/config.mjs';
import { c, table, hhmm, dayLabel } from '../core/format.mjs';
import { bool, num, minutes } from '../core/args.mjs';

export default async function newCmd({ flags }) {
  const mins = minutes(flags.since, null) ?? num(flags.days, 1) * 24 * 60;
  const since = Date.now() - mins * 60_000;

  const [{ names }, { extra }] = await Promise.all([loadDevices(), loadDomains()]);
  const rows = newSince(since);

  if (bool(flags.json)) {
    console.log(JSON.stringify({ sinceIso: new Date(since).toISOString(), rows }, null, 2));
    return 0;
  }

  console.log('');
  console.log(`${c.bold('new')}  ${c.dim(`first contact in the last ${mins >= 1440 ? `${Math.round(mins / 1440)}d` : `${mins}m`}`)}`);
  console.log('');

  if (seenCount() === 0) {
    console.log(c.dim('  Nothing has been observed yet, so nothing can be new.'));
    console.log('');
    return 0;
  }
  if (rows.length === 0) {
    console.log(c.green('  Nothing new.') + c.dim(` ${seenCount()} device and domain pairings already known.`));
    console.log('');
    return 0;
  }

  const shown = rows.map((r) => {
    const cls = classify(r.domain, extra);
    return [
      c.dim(`${dayLabel(r.at)} ${hhmm(r.at)}`),
      label(names, r.client),
      r.domain,
      cls.confidence === 'known' ? cls.category : cls.confidence === 'guess' ? c.yellow(`${cls.category}?`) : c.dim('unknown'),
    ];
  });

  console.log(
    table(shown, { headers: ['first seen', 'device', 'domain', 'category'] })
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n'),
  );

  console.log('');
  console.log(c.dim(`  ${rows.length} new pairing(s). A first sighting is not automatically bad:`));
  console.log(c.dim('  a CDN rotating hostnames looks identical to something new starting up.'));
  console.log('');
  return 0;
}
