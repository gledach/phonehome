/* Your own classifications, merged over the bundled list.
 *
 *   cp config/domains.default.mjs config/domains.local.mjs
 *
 * Keys are registrable domains ("example.com", not "api.example.com") or exact
 * hostnames when you want to be specific. Values are any category name you
 * like: unknown ones simply appear in the report as written.
 *
 * The bundled list in sources/known-domains.mjs is deliberately short. It is
 * there so a first report is readable, not to be exhaustive. Anything it misses
 * shows up as "unknown", and the report prints what share that was.
 */

export default {
  // 'example.com': 'work',
  // 'weird-iot-vendor.cn': 'assistant',
};
