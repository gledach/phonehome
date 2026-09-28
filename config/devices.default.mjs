/* Naming the things on your network.
 *
 * Without this a report is a list of IP addresses, which tells you nothing.
 * With it you get "the television" and "the doorbell", which is the whole
 * difference between data and an answer.
 *
 *   cp config/devices.default.mjs config/devices.local.mjs
 *
 * The copy is gitignored. Your network layout is nobody else's business.
 *
 * Find the addresses by running `phonehome devices` after watching for a while:
 * it lists every client that has asked for anything, busiest first, so you can
 * name them one at a time.
 */

export default {
  // '192.168.1.10': 'living room TV',
  // '192.168.1.22': 'doorbell',
  // '192.168.1.31': 'work laptop',
  // '127.0.0.1':    'this machine',
};
