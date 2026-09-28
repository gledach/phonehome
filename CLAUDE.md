# phonehome

A local DNS resolver that records which domains each device contacts. Node 22+,
**zero runtime dependencies**, no build step.

## The rules that matter

- **Never modify a response.** The forwarder returns upstream bytes unchanged. The only
  packet this tool composes is SERVFAIL, in `core/wire.mjs`. Anything else risks breaking
  name resolution for a whole house, and whoever debugs it will not suspect the monitoring
  tool installed last week.
- **Never block.** This is not an ad blocker and must not become one. Observing and
  intervening are different products with different failure modes.
- **Never parse an answer.** `core/wire.mjs` reads the question and stops. A malformed or
  hostile response cannot reach a parser, because there is no parser for it to reach.
- **Report the blind spots everywhere.** `help`, `doctor`, `report` and every MCP result
  carry them. On a privacy tool what it cannot see matters more than what it can, and a
  quiet result must never be mistakable for a clean one.
- **`unknown` is an honest answer.** The bundled list is short on purpose and every report
  prints the unclassified share. Do not pad the list to make reports look tidier.
- **Zero dependencies is a feature.** The MCP server hand-rolls JSON-RPC for this reason.

## Layout

```
bin/phonehome.mjs   router, lazy-imports each command
cli/                one file per command
core/
  wire.mjs          DNS question parsing. Returns null, never throws
  resolver.mjs      UDP and TCP forwarder. The only thing on the network path
  names.mjs         registrable-domain reduction
  classify.mjs      domain to category, with a confidence level
  store.mjs         JSONL per day, plus the first-seen map
  config.mjs        device names and your own classifications
sources/
  known-domains.mjs the bundled list, deliberately short
  logs.mjs          importers for Pi-hole, dnsmasq, Unbound, AdGuard
```

## Things already learned the hard way

- **`reuseAddr` on the UDP socket let two resolvers bind the same port.** The kernel then
  splits queries between them and half the network lands in a different data file. It is
  off now, and the test proving it must stay.
- **A TCP listen failure used to vanish into `onError`.** A resolver serving UDP but not
  TCP looks healthy while silently missing every truncated answer a client retries over
  TCP. It now fails the start.
- **`close()` leaked in-flight upstream sockets.** Clearing the timers was not enough: the
  process stayed alive until every outstanding query timed out, which hung the test file
  for a minute and made Ctrl+C take four seconds.
- **An exact-host match must keep the host as its label.** "device-metrics-us.amazon.com is
  telemetry" is true; "amazon.com is telemetry" is not. Collapsing to the registrable
  domain libelled ordinary companies through a display detail.
- **A bare hostname with no dot is a LAN lookup, not a contact.** Counting those as
  external buries the signal.
- **Do not write regex escapes through a shell heredoc.** A doubled backslash collapses,
  and in a template literal the result is a backspace character rather than a word
  boundary. It cost a debugging cycle in `test/cli.test.mjs`. Use `includes`, or write the
  file with an editor tool.

## Testing

`npm test` is the gate and is fully offline. The resolver tests use the RFC 5737
documentation range (`192.0.2.1`) as an unreachable upstream so no packet leaves the
machine, and every socket test carries an explicit timeout, because a gate that can hang is
a gate people stop running.
