/* Just enough DNS wire format to read a question.
 *
 * This tool forwards packets byte for byte and only ever reads the question
 * section, so the parser deliberately stops there. Not parsing answers is a
 * choice, not a shortcut: it means a malformed or hostile response can never
 * reach a parser, because there is no parser for it to reach. The bytes go
 * back to the client exactly as they arrived.
 *
 * RFC 1035 section 4: a 12-byte header, then QDCOUNT questions, each a
 * length-prefixed label sequence terminated by a zero byte, then QTYPE and
 * QCLASS.
 */

export const TYPES = {
  1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX',
  16: 'TXT', 28: 'AAAA', 33: 'SRV', 64: 'SVCB', 65: 'HTTPS',
};

export class WireError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WireError';
  }
}

/**
 * @param {Buffer} buf
 * @returns {{ id: number, isResponse: boolean, opcode: number, rcode: number,
 *             questionCount: number, answerCount: number }}
 */
export function readHeader(buf) {
  if (!buf || buf.length < 12) throw new WireError('shorter than a DNS header');
  const flags = buf.readUInt16BE(2);
  return {
    id: buf.readUInt16BE(0),
    isResponse: (flags & 0x8000) !== 0,
    opcode: (flags >> 11) & 0x0f,
    recursionDesired: (flags & 0x0100) !== 0,
    truncated: (flags & 0x0200) !== 0,
    rcode: flags & 0x0f,
    questionCount: buf.readUInt16BE(4),
    answerCount: buf.readUInt16BE(6),
  };
}

/**
 * The first question in a packet, or null when there is none.
 *
 * Returns null rather than throwing on anything it does not understand. A
 * resolver that crashes on a weird packet stops resolving for the whole house,
 * and an unreadable question is a gap in observation, not a reason to fail.
 *
 * @param {Buffer} buf
 * @returns {{ name: string, type: string, typeId: number } | null}
 */
export function readQuestion(buf) {
  let header;
  try {
    header = readHeader(buf);
  } catch {
    return null;
  }
  if (header.questionCount < 1) return null;

  const labels = [];
  let offset = 12;
  let guard = 0;

  while (offset < buf.length) {
    if (guard++ > 128) return null; // labels are capped at 63 and names at 255
    const len = buf[offset];

    if (len === 0) {
      offset += 1;
      break;
    }
    /* Top two bits set marks a compression pointer. Legal in answers, and
       essentially never used in a question because there is nothing earlier to
       point at. Refuse rather than chase it: this parser only exists to read
       the question. */
    if ((len & 0xc0) === 0xc0) return null;
    if (len > 63) return null;

    const start = offset + 1;
    const end = start + len;
    if (end > buf.length) return null;
    labels.push(buf.toString('ascii', start, end));
    offset = end;
  }

  if (labels.length === 0) return null;
  if (offset + 4 > buf.length) return null;

  const typeId = buf.readUInt16BE(offset);
  const name = labels.join('.').toLowerCase();

  // A name is 255 bytes at most on the wire; anything longer is not a name.
  if (name.length > 253) return null;

  return { name, type: TYPES[typeId] ?? String(typeId), typeId };
}

/**
 * Build a minimal failure response so a client gets an answer rather than a
 * timeout when the upstream is unreachable. SERVFAIL, question echoed back.
 */
export function servfail(request) {
  const out = Buffer.alloc(Math.max(12, request.length));
  request.copy(out, 0, 0, Math.min(request.length, out.length));
  out.writeUInt16BE(request.readUInt16BE(0), 0); // same id
  // QR=1, RD copied, RA=1, RCODE=2 (server failure)
  const rd = (request.readUInt16BE(2) & 0x0100) !== 0 ? 0x0100 : 0;
  out.writeUInt16BE(0x8000 | rd | 0x0080 | 0x0002, 2);
  out.writeUInt16BE(request.readUInt16BE(4), 4); // qdcount
  out.writeUInt16BE(0, 6); // ancount
  out.writeUInt16BE(0, 8);
  out.writeUInt16BE(0, 10);
  return out;
}
