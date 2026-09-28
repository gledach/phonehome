/* Run the resolver and record what asks for what.
 *
 * Binds 127.0.0.1:5335 by default, which is useless to the rest of the house
 * on purpose: serving the network is an explicit decision, made with
 * --host=0.0.0.0, not something that happens because you tried the tool.
 */

import fs from 'node:fs';
import { createResolver, systemUpstreams } from '../core/resolver.mjs';
import { recordQuery, flush, markSeen, seenCount } from '../core/store.mjs';
import { classify } from '../core/classify.mjs';
import { loadDevices, loadDomains, label } from '../core/config.mjs';
import { paths, ensureDataDir, pretty } from '../core/paths.mjs';
import { c, hhmm } from '../core/format.mjs';
import { bool, num } from '../core/args.mjs';

export default async function watch({ flags }) {
  const host = typeof flags.host === 'string' ? flags.host : '127.0.0.1';
  const port = num(flags.port, 5335);
  const quiet = bool(flags.quiet);
  const upstream = typeof flags.upstream === 'string'
    ? flags.upstream.split(',').map((s) => s.trim()).filter(Boolean)
    : systemUpstreams();

  ensureDataDir();
  const release = acquireLock();
  if (!release) {
    console.error(`Another phonehome watch holds ${pretty(paths.lock)}. Stop it, or delete the file if it is stale.`);
    return 1;
  }

  const [{ names }, { extra }] = await Promise.all([loadDevices(), loadDomains()]);

  let queries = 0;
  let firsts = 0;
  const dohWarned = new Set();

  const resolver = createResolver({
    host,
    port,
    upstream,
    onQuery: (q) => {
      queries += 1;
      recordQuery(q);

      const cls = classify(q.name, extra);
      if (cls.confidence === 'local') return;

      const who = label(names, q.client);
      const isNew = cls.domain ? markSeen(q.client, cls.domain) : false;
      if (isNew) firsts += 1;

      /* A device looking up an encrypted-DNS endpoint is about to stop being
         visible here at all. That is the most important thing this tool can
         tell you, so it is said once per device rather than buried in a count. */
      if (cls.isDoh && !dohWarned.has(q.client)) {
        dohWarned.add(q.client);
        console.log(
          `${c.dim(hhmm(q.at))} ${c.yellow('!')} ${c.bold(who)} looked up ${c.bold(q.name)}. ` +
            c.dim('If it switches to encrypted DNS, everything after this is invisible here.'),
        );
        return;
      }

      if (quiet) return;
      const tag = isNew ? c.green('new') : c.dim('   ');
      const cat = cls.category === 'unknown' ? c.dim('unknown') : c.cyan(cls.category);
      console.log(`${c.dim(hhmm(q.at))} ${tag} ${who.padEnd(18).slice(0, 18)} ${q.name}  ${cat}`);
    },
    onError: (err, ctx) => {
      if (process.env.PHONEHOME_DEBUG) console.error(`  ${c.red(ctx?.stage ?? 'error')}: ${err.message}`);
    },
  });

  let stopping = false;
  const stop = () => {
    if (stopping) process.exit(130);
    stopping = true;
    const written = flush();
    resolver.close();
    release();
    console.log('');
    console.log(
      `${c.bold('stopped')}  ${queries} queries seen, ${firsts} first-time pairings, ` +
        `${written} rows flushed, ${seenCount()} pairings known`,
    );
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('exit', () => { try { flush(); release(); } catch { /* shutting down */ } });

  try {
    await resolver.listen();
  } catch (err) {
    release();
    if (err.code === 'EACCES') {
      console.error(`Cannot bind port ${port}: ${err.message}`);
      console.error('Ports below 1024 need privileges. Use --port=5335 and point your router there,');
      console.error('or run this with the privileges your platform requires.');
      return 1;
    }
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use on ${host}. Another resolver is probably running.`);
      return 1;
    }
    throw err;
  }

  console.log('');
  console.log(`${c.bold('phonehome')} listening on ${c.bold(`${host}:${port}`)} ${c.dim(`udp and tcp`)}`);
  console.log(c.dim(`  upstream   ${upstream.join(', ')}`));
  console.log(c.dim(`  recording  ${pretty(paths.queries)}`));
  if (host === '127.0.0.1') {
    console.log(c.dim('  only this machine can use it. --host=0.0.0.0 to serve the network.'));
  } else {
    console.log(c.yellow('  serving the whole network. Point your router or devices at this address.'));
  }
  console.log(c.dim('  Ctrl+C to stop. Nothing is sent anywhere: this only forwards and records.'));
  console.log('');

  // Keep the process alive until a signal arrives.
  await new Promise(() => {});
  return 0;
}

function acquireLock() {
  try {
    const pid = Number(fs.readFileSync(paths.lock, 'utf8').trim());
    if (Number.isFinite(pid) && pid > 0 && pid !== process.pid && isAlive(pid)) return null;
  } catch {
    // no lock, or unreadable
  }
  fs.writeFileSync(paths.lock, String(process.pid), 'utf8');
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      if (fs.readFileSync(paths.lock, 'utf8').trim() === String(process.pid)) fs.unlinkSync(paths.lock);
    } catch { /* nothing useful to do */ }
  };
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}
