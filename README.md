# phonehome

**See what your devices talk to.**

A local DNS resolver that records which domains every device on your network contacts,
classifies them, and tells you when one starts talking to somewhere new.

Zero dependencies. No account. Nothing is uploaded, nothing is blocked, and everything it
observes stays on the machine you ran it on.

```bash
git clone https://github.com/gledach/phonehome.git && cd phonehome
node bin/phonehome.mjs help
```

There is no `npm install`, because there is nothing to install.

## The fastest way to see something real

If you already run Pi-hole, AdGuard Home, dnsmasq or Unbound, you have months of history on
disk already. Read it rather than re-pointing your network:

```bash
node bin/phonehome.mjs import /var/log/pihole.log --execute
node bin/phonehome.mjs report
```

```
  device        queries  domains  busiest category  unknown
  living room   144      12       telemetry         40%
  doorbell      130      12       unknown           45%

  category     queries  share
  unknown      172      43%
  telemetry     59      15%   Product telemetry and crash reporting
  advertising   41      10%   Ad serving and real-time bidding
  doh           33       8%   Encrypted DNS, which routes around this tool

  Encrypted DNS
    doorbell -> dns.google
    A device that switches to encrypted DNS stops appearing here at all.
```

## Otherwise: run the resolver

```bash
node bin/phonehome.mjs watch
```

By default it binds `127.0.0.1:5335`, which only this machine can use. That is deliberate:
serving the whole house is a decision you make, not something that happens because you
tried the tool.

To see every device, bind the network and point your router's DHCP at this address:

```bash
node bin/phonehome.mjs watch --host=0.0.0.0 --port=5335
```

Port 53 is the one devices expect and needs privileges on most systems. Many routers let
you set a custom DNS port; where they do not, forward 53 to 5335.

## Commands

```bash
phonehome watch      # run the resolver and record what asks for what
phonehome report     # what happened, per device and per category
phonehome new        # what started contacting somewhere it never had before
phonehome devices    # everything that has asked, so you can name it
phonehome import     # read a DNS log you already have
phonehome doctor     # config, ports, upstream, and what this cannot see
```

`new` is the one that earns its keep. A steady list of domains is background noise. A
doorbell that contacts something at 03:00 which it has never contacted before is the thing
worth knowing.

## Naming things

A report of IP addresses tells you almost nothing. A report of names tells you everything.

```bash
cp config/devices.default.mjs config/devices.local.mjs
```

Run `phonehome devices` first: it prints the exact lines to paste.

```js
export default {
  '192.168.1.10': 'living room TV',
  '192.168.1.22': 'doorbell',
};
```

Both `.local.mjs` files are gitignored. Your network layout is nobody else's business.

## What this cannot see

This matters more than the feature list, so it is not buried at the bottom of a wiki.

- **Encrypted DNS.** A device using DoH or DoT resolves over HTTPS and never asks this
  resolver anything. It becomes completely invisible. `watch` flags the moment a device
  looks up a known DoH endpoint, because that is usually the last thing you will ever see
  from it.
- **Content.** This reads the question in a DNS packet and nothing else. **A domain being
  contacted is not the same as data being sent.**
- **Devices with hardcoded resolvers.** Some hardware ignores DHCP and talks to `8.8.8.8`
  directly. Only a firewall rule catches that; this tool cannot.
- **Who, as opposed to what.** It sees devices, not people. It is not a way to find out
  what somebody in your house is doing, and the report is built around devices and domains
  for that reason.
- **Classification coverage.** The bundled list is deliberately short. Every report prints
  the share that landed in `unknown`, because a classifier that labels everything looks
  better and tells you less.

## Safety

- **It never modifies a response.** It forwards packets and returns the upstream answer
  unchanged, so it cannot break name resolution by inventing an answer. The only packet it
  ever composes is a SERVFAIL when the upstream is unreachable.
- **It never blocks anything.** This is not an ad blocker. It observes.
- **It does not send your queries anywhere new.** The default upstream is whatever your
  machine was already using.
- **Two resolvers cannot share a port.** `reuseAddr` is off on purpose: with it the kernel
  splits queries between instances and half your traffic lands in a different data file.

## For agents

```bash
node mcp-server.mjs
```

Five read-only tools: `list_devices`, `get_report`, `new_contacts`, `classify_domain`,
`blind_spots`. Every result carries the blind-spot list and a `trustEmptyResult` flag, so
an agent cannot report a clean bill of health that the data does not support.

## Tests

```bash
npm test     # 64 tests, fully offline, no network
```

The resolver is tested against a fake upstream and a documentation-range address, so the
gate never sends a packet off the machine. That file alone found three real bugs: a
`reuseAddr` flag that let two resolvers bind one port, TCP listen errors being swallowed,
and in-flight sockets leaking on shutdown.

## Licence

MIT. See [LICENSE](./LICENSE).
