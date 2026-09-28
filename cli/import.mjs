/* Read a DNS log you already have, rather than making you re-point a network. */

import fs from 'node:fs';
import { parseLog, FORMATS } from '../sources/logs.mjs';
import { recordQuery, flush, markSeen } from '../core/store.mjs';
import { classify } from '../core/classify.mjs';
import { loadDomains } from '../core/config.mjs';
import { c } from '../core/format.mjs';
import { bool } from '../core/args.mjs';

export default async function importCmd({ flags, _ }) {
  const file = _[0] ?? (typeof flags.file === 'string' ? flags.file : null);
  if (!file) {
    console.error('Which log? `phonehome import /var/log/pihole.log`');
    console.error(`Formats: ${FORMATS.join(', ')}. Default is auto.`);
    return 2;
  }
  if (!fs.existsSync(file)) {
    console.error(`No such file: ${file}`);
    return 2;
  }

  const format = typeof flags.format === 'string' ? flags.format : 'auto';
  if (!FORMATS.includes(format)) {
    console.error(`Unknown format "${format}". One of: ${FORMATS.join(', ')}`);
    return 2;
  }

  const dryRun = !bool(flags.execute);
  const { extra } = await loadDomains();
  const text = fs.readFileSync(file, 'utf8');
  const { rows, read, parsed, skipped } = parseLog(text, { format });

  console.log('');
  console.log(`${c.bold('import')}  ${c.dim(file)}`);
  console.log(`  read ${read} lines, understood ${parsed}, skipped ${skipped}`);

  if (parsed === 0) {
    console.log(c.red('  Nothing recognised. Check --format, or paste a sample line into an issue.'));
    console.log('');
    return 1;
  }
  if (skipped > parsed) {
    console.log(c.yellow(`  More lines were skipped than understood. Is --format right?`));
  }

  let firsts = 0;
  if (!dryRun) {
    for (const row of rows) {
      recordQuery(row);
      const cls = classify(row.name, extra);
      if (cls.confidence !== 'local' && cls.domain && markSeen(row.client, cls.domain, row.at)) firsts += 1;
    }
    flush();
  } else {
    for (const row of rows) {
      const cls = classify(row.name, extra);
      if (cls.confidence !== 'local' && cls.domain) firsts += 1;
    }
  }

  const span = rows.length
    ? `${new Date(Math.min(...rows.map((r) => r.at))).toISOString().slice(0, 16)} to ${new Date(Math.max(...rows.map((r) => r.at))).toISOString().slice(0, 16)}`
    : '';
  console.log(`  covering ${c.dim(span)}`);
  console.log('');

  if (dryRun) {
    console.log(c.dim(`  Dry run. Nothing written. Add --execute to import ${parsed} observations.`));
  } else {
    console.log(c.green(`  Imported ${parsed} observations, ${firsts} first-time pairings.`));
    console.log(c.dim('  Now try `phonehome report` or `phonehome new --days=30`.'));
  }
  console.log('');
  return 0;
}
