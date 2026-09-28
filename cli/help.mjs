import { c } from '../core/format.mjs';

export default function help() {
  const b = c.bold;
  const d = c.dim;
  console.log(`
${b('phonehome')} ${d('· see what your devices talk to')}

A local DNS resolver that records which domains every device on your network
contacts, classifies them, and tells you when one starts talking to somewhere
new. Nothing is uploaded. Nothing is blocked.

${b('COMMANDS')}

  ${b('watch')}      Run the resolver and record what asks for what
  ${b('report')}     What happened, per device and per category
  ${b('new')}        What started contacting somewhere it never had before
  ${b('devices')}    Everything that has asked, so you can name it
  ${b('import')}     Read a Pi-hole, dnsmasq, Unbound or AdGuard log you already have
  ${b('doctor')}     Config, ports, upstream, and what this cannot see
  ${b('help')}       This

${b('START HERE')}

  ${d('# already have a DNS log? read it, no setup at all')}
  phonehome import /var/log/pihole.log --execute
  phonehome report

  ${d('# otherwise run the resolver and point this machine at it')}
  phonehome watch
  ${d('# then, in another terminal:')}
  phonehome report

${b('SERVING THE WHOLE HOUSE')}

  By default it binds ${b('127.0.0.1:5335')}, which only this machine can use. To see
  every device, bind the network and point your router's DHCP at this address:

    phonehome watch --host=0.0.0.0 --port=5335

  Port 53 is the one devices expect and needs privileges. Most routers let you
  set a custom DNS port; where they do not, forward 53 to 5335.

${b('NAMING THINGS')}

  cp config/devices.local.mjs   ${d('# addresses to names: "the doorbell"')}
  cp config/domains.local.mjs   ${d('# your own classifications')}

  Run ${b('phonehome devices')} first: it prints the lines to paste.

${b('WHAT THIS CANNOT SEE')}

  ${b('Encrypted DNS.')} A device using DoH or DoT resolves over HTTPS and never asks
  this resolver anything. It becomes invisible. ${b('watch')} flags the moment a
  device looks up a known DoH endpoint, because that is usually the last thing
  you will see from it.

  ${b('Content.')} This reads the question in a DNS packet and nothing else. A
  domain being contacted is not the same as data being sent.

  ${b('Devices with hardcoded resolvers.')} Some hardware ignores DHCP and talks to
  8.8.8.8 directly. Only a firewall rule catches that.

${d('MIT licensed. No account. Everything observed stays on this machine.')}
`);
  return 0;
}
