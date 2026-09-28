# phonehome roadmap

Honest status. Nothing here is a commitment.

## What works

- UDP and TCP forwarding. The question is recorded, the response returned unchanged.
- Classification with three confidence levels and an explicit unknown share.
- Encrypted-DNS endpoint detection, flagged once per device as it happens.
- First-contact detection, per device and domain pairing.
- Importers for Pi-hole, dnsmasq, Unbound and AdGuard Home logs.
- Read-only MCP surface with the blind spots attached to every result.
- 64 tests, fully offline.

## Known gaps, roughly in the order they hurt

1. **No IPv6 listener.** Only `udp4` is bound, so a device that reaches the resolver over
   IPv6 is not seen at all. On a dual-stack network that is a real hole, and the most
   valuable thing to close next.
2. **No ASN or ownership lookup.** Domains are classified by name alone. Knowing that an
   unknown domain resolves into a particular hosting provider would close much of the
   `unknown` share, but every free bulk ASN dataset is large enough to break the
   no-dependency, no-download promise.
3. **Registrable domains come from a short suffix table**, not the full Public Suffix List,
   so an unusual TLD can be grouped one label off. Bundling the real list means bundling
   something that rots.
4. **No retention policy.** Day files accumulate forever. A few megabytes a week is fine
   for a year and not fine for five.
5. **The resolver has not been proven over a long run.** It has been tested in bursts.
6. **No notification.** A device contacting somewhere new at 03:00 is discovered when you
   next run `new`, not when it happens.

## Deliberately not doing

- **Blocking.** Observing and intervening are different products. A blocker that gets a
  rule wrong breaks a household's internet; an observer that gets a rule wrong prints a
  wrong row.
- **Content inspection.** Reading answers or payloads would turn this into a surveillance
  tool rather than an inventory of what your devices contact.
- **Per-person attribution.** It sees devices. Turning that into people is a different
  thing entirely, and not one worth building.
