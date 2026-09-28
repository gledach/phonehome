/* The forwarder.
 *
 * Listens for DNS queries, records the question, passes the packet upstream
 * unchanged, and returns the upstream answer unchanged. It is not a resolver
 * in the recursive sense and it is not a blocker: it observes and forwards.
 *
 * Deliberate non-goals:
 *   It never modifies a response. Nothing here can break name resolution for
 *   your house by returning something wrong, because it never composes an
 *   answer except SERVFAIL when the upstream is unreachable.
 *   It never inspects content. It reads the question and nothing else.
 *   It never sends your queries anywhere your machine was not already sending
 *   them: the default upstream is whatever your system already uses.
 */

import dgram from 'node:dgram';
import net from 'node:net';
import dnsPromises from 'node:dns';
import { readQuestion, readHeader, servfail } from './wire.mjs';

const DEFAULT_QUERY_TIMEOUT_MS = 4000;

/**
 * The resolvers this machine already uses, minus any loopback address, which
 * would be this tool pointing at itself once it is installed.
 */
export function systemUpstreams() {
  let servers = [];
  try {
    servers = dnsPromises.getServers();
  } catch {
    servers = [];
  }
  const usable = servers
    .map((s) => s.replace(/%.*$/, '').replace(/^\[|\]$/g, ''))
    .filter((s) => net.isIP(s))
    .filter((s) => !/^127\./.test(s) && s !== '::1' && s !== '0.0.0.0');

  // Falling back to a public resolver is a real decision, so it is stated in
  // doctor rather than made quietly.
  return usable.length ? usable : ['9.9.9.9'];
}

/**
 * @param {object} opts
 * @param {string} [opts.host]      bind address. 127.0.0.1 by default: opt in to LAN
 * @param {number} [opts.port]      53 needs privileges on most systems
 * @param {string[]} [opts.upstream]
 * @param {(q: {name:string,type:string,client:string,at:number,protocol:string}) => void} opts.onQuery
 * @param {(err: Error, ctx?: object) => void} [opts.onError]
 */
export function createResolver({
  host = '127.0.0.1',
  port = 5335,
  upstream = systemUpstreams(),
  timeoutMs = DEFAULT_QUERY_TIMEOUT_MS,
  onQuery,
  onError = () => {},
} = {}) {
  if (!upstream.length) throw new Error('no upstream resolver configured');

  /* No reuseAddr. With it, a second instance binds the same UDP port happily
     and the kernel splits queries between the two, so half the network's
     traffic would quietly land in a different process with a different data
     file. Failing to start is the correct behaviour, and the lock file in
     `watch` is the friendly message rather than the mechanism. */
  const udp = dgram.createSocket({ type: 'udp4' });
  /* In-flight upstream queries: both the timer and the socket. Tracking only
     the timer meant close() left the sockets open, so the process stayed alive
     until every outstanding query timed out. On Ctrl+C that is a four-second
     pause for no reason; in a test run it hangs the whole file. */
  const pending = new Map(); // key -> { timer, socket }
  let tcpServer = null;
  let nextUpstream = 0;

  const pickUpstream = () => {
    const chosen = upstream[nextUpstream % upstream.length];
    nextUpstream += 1;
    return chosen;
  };

  const record = (buf, client, protocol) => {
    const q = readQuestion(buf);
    if (!q) return null;
    try {
      onQuery({ name: q.name, type: q.type, client, at: Date.now(), protocol });
    } catch (err) {
      onError(err, { stage: 'onQuery', name: q.name });
    }
    return q;
  };

  /* ── UDP ── */

  udp.on('message', (msg, rinfo) => {
    let header;
    try {
      header = readHeader(msg);
    } catch {
      return; // not a DNS packet, drop it silently
    }
    if (header.isResponse) return; // we are not a client here

    record(msg, rinfo.address, 'udp');

    const out = dgram.createSocket('udp4');
    const key = Symbol('query');
    let settled = false;

    const done = () => {
      if (settled) return;
      settled = true;
      const entry = pending.get(key);
      if (entry) clearTimeout(entry.timer);
      pending.delete(key);
      try { out.close(); } catch { /* already closed */ }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      done();
      try { udp.send(servfail(msg), rinfo.port, rinfo.address); } catch { /* client gone */ }
    }, timeoutMs);
    pending.set(key, { timer, socket: out });

    out.on('message', (answer) => {
      done();
      try { udp.send(answer, rinfo.port, rinfo.address); } catch (err) { onError(err, { stage: 'reply' }); }
    });
    out.on('error', (err) => {
      done();
      onError(err, { stage: 'upstream' });
      try { udp.send(servfail(msg), rinfo.port, rinfo.address); } catch { /* client gone */ }
    });

    try {
      out.send(msg, 53, pickUpstream());
    } catch (err) {
      done();
      onError(err, { stage: 'send' });
    }
  });

  /* ── TCP ──
     Clients fall back to TCP when a response is truncated. Without this they
     would silently bypass the whole tool for exactly the large answers worth
     seeing, so observation would be quietly incomplete. */

  const startTcp = () =>
    net.createServer((socket) => {
      socket.setTimeout(timeoutMs * 2, () => socket.destroy());
      let buf = Buffer.alloc(0);

      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 2) {
          const len = buf.readUInt16BE(0);
          if (buf.length < 2 + len) break;
          const msg = buf.subarray(2, 2 + len);
          buf = buf.subarray(2 + len);

          record(msg, socket.remoteAddress?.replace(/^::ffff:/, '') ?? 'unknown', 'tcp');

          const up = net.connect(53, pickUpstream(), () => {
            const framed = Buffer.alloc(2 + msg.length);
            framed.writeUInt16BE(msg.length, 0);
            msg.copy(framed, 2);
            up.write(framed);
          });
          up.setTimeout(timeoutMs, () => up.destroy());
          up.on('data', (d) => socket.write(d));
          up.on('error', (err) => { onError(err, { stage: 'upstream-tcp' }); socket.destroy(); });
          up.on('close', () => socket.end());
        }
      });

      socket.on('error', () => socket.destroy());
    });

  return {
    upstream,
    async listen() {
      await new Promise((resolve, reject) => {
        udp.once('error', reject);
        udp.bind(port, host, () => {
          udp.removeListener('error', reject);
          resolve();
        });
      });
      udp.on('error', (err) => onError(err, { stage: 'udp' }));

      tcpServer = startTcp();
      /* A TCP bind failure must fail the start, not vanish into onError. A
         resolver serving UDP but not TCP looks healthy and silently misses
         every truncated answer the client retries over TCP. */
      await new Promise((resolve, reject) => {
        const onListenError = (err) => {
          try { udp.close(); } catch { /* already closed */ }
          reject(err);
        };
        tcpServer.once('error', onListenError);
        tcpServer.listen(port, host, () => {
          tcpServer.removeListener('error', onListenError);
          tcpServer.on('error', (err) => onError(err, { stage: 'tcp' }));
          resolve();
        });
      });

      return { host, port };
    },
    close() {
      for (const { timer, socket } of pending.values()) {
        clearTimeout(timer);
        try { socket.close(); } catch { /* already closed */ }
      }
      pending.clear();
      try { udp.close(); } catch { /* already closed */ }
      try { tcpServer?.close(); } catch { /* already closed */ }
    },
  };
}
