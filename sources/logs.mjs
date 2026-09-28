/* Reading DNS logs you already have.
 *
 * Plenty of people already run Pi-hole, AdGuard Home or plain dnsmasq and have
 * months of history sitting on disk. Making them re-point their network at a
 * new resolver to get a report would be a worse trade than reading what they
 * already recorded.
 *
 * Each parser returns the same observation shape the live resolver produces,
 * so everything downstream is identical whether it came from a socket or a file.
 */

/* dnsmasq and Pi-hole FTL share a line format:
     Sep 29 00:14:22 dnsmasq[1234]: query[A] example.com from 192.168.1.5   */
const DNSMASQ = /^(\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}).*?query\[([A-Z0-9]+)\]\s+(\S+)\s+from\s+(\S+)/;

/* Unbound:
     [1727568862] unbound[1:0] info: 192.168.1.5 example.com. A IN           */
const UNBOUND = /^\[(\d+)\]\s+unbound.*?info:\s+(\S+)\s+(\S+?)\.?\s+([A-Z0-9]+)\s+IN/;

export const FORMATS = ['dnsmasq', 'pihole', 'unbound', 'adguard', 'auto'];

/** Month-name timestamps carry no year. Assume the most recent one that is not in the future. */
function dnsmasqTime(stamp, now = Date.now()) {
  const year = new Date(now).getFullYear();
  const t = Date.parse(`${stamp} ${year}`);
  if (Number.isNaN(t)) return now;
  // A log line from December read in January belongs to last year.
  return t > now + 86400_000 ? Date.parse(`${stamp} ${year - 1}`) : t;
}

export function parseLine(line, { format = 'auto', now = Date.now() } = {}) {
  const text = line.trim();
  if (!text) return null;

  if (format === 'adguard' || (format === 'auto' && text.startsWith('{'))) {
    try {
      const j = JSON.parse(text);
      const name = j.QH ?? j.question?.name ?? j.question?.host;
      if (!name) return null;
      return {
        at: j.T ? Date.parse(j.T) : now,
        client: j.IP ?? j.client ?? 'unknown',
        name: String(name).toLowerCase().replace(/\.$/, ''),
        type: j.QT ?? j.question?.type ?? 'A',
        protocol: 'log',
      };
    } catch {
      return null;
    }
  }

  const m = DNSMASQ.exec(text);
  if (m) {
    return {
      at: dnsmasqTime(m[1], now),
      client: m[4],
      name: m[3].toLowerCase().replace(/\.$/, ''),
      type: m[2],
      protocol: 'log',
    };
  }

  const u = UNBOUND.exec(text);
  if (u) {
    return {
      at: Number(u[1]) * 1000,
      client: u[2],
      name: u[3].toLowerCase().replace(/\.$/, ''),
      type: u[4],
      protocol: 'log',
    };
  }

  return null;
}

/**
 * @returns {{ rows: object[], read: number, parsed: number, skipped: number }}
 */
export function parseLog(text, opts = {}) {
  const lines = String(text).split('\n');
  const rows = [];
  let parsed = 0;
  for (const line of lines) {
    const row = parseLine(line, opts);
    if (row) {
      rows.push(row);
      parsed += 1;
    }
  }
  return {
    rows,
    read: lines.filter((l) => l.trim()).length,
    parsed,
    skipped: lines.filter((l) => l.trim()).length - parsed,
  };
}
