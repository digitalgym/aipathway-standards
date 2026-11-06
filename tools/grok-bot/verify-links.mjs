// node tools/grok-bot/verify-links.mjs <grok-links.json>   (run from the repo root)
// Checks each new link opens the right public template before it goes into a
// listing: a 200, the right bot name, no link used twice. Set GROK_AUTHOR to
// the name templates show as "by ..." (default Andrew).
import fs from "node:fs";
const links = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const urls = Object.values(links); const dup = urls.filter((u, i) => urls.indexOf(u) !== i);
if (dup.length) console.log("DUPLICATE", dup);
let ok = 0, bad = [];
for (const [slug, url] of Object.entries(links)) {
  const f = `mesh/nodes/${slug}/mesh.json`; if (!fs.existsSync(f)) { bad.push(slug + " no node"); continue; }
  const m = JSON.parse(fs.readFileSync(f, "utf8")); if (m.links?.bot) continue;
  const r = await fetch(url); const h = await r.text();
  const t = (h.match(/og:title" content="([^"]*)"/) || [])[1] || "";
  if (r.status === 200 && t.startsWith(`${m.name} by ${process.env.GROK_AUTHOR ?? "Andrew"}`)) ok++; else bad.push(`${slug} ${r.status} "${t}"`);
}
console.log(`ok ${ok}`, bad.length ? "BAD:\n" + bad.join("\n") : "bad 0");
