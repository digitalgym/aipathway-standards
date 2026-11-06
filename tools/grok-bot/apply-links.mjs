// node tools/grok-bot/apply-links.mjs <grok-links.json>   (run from the repo root)
// Adds links.bot and the grok-bot-template runtime to each node's mesh.json,
// editing the text in place: re-serialising the JSON would reformat every file.
import fs from "node:fs";
const links = JSON.parse(fs.readFileSync(process.argv[2],"utf8")); let n = 0;
for (const [slug, url] of Object.entries(links)) {
  const f = `mesh/nodes/${slug}/mesh.json`; let t = fs.readFileSync(f,"utf8");
  if (JSON.parse(t).links?.bot) continue;
  const a = t.replace(/("repo": "[^"]*")(\s*\})/, `$1, "bot": "${url}"$2`)
             .replace(/("runtime": \[[^\]]*?)(\s*\])/, (m, p, q) => p.includes("grok-bot-template") ? m : `${p}, "grok-bot-template"${q}`);
  const j = JSON.parse(a);
  if (j.links.bot !== url || !j.runtime.includes("grok-bot-template")) { console.log("FAIL", slug); continue; }
  fs.writeFileSync(f, a); n++;
}
console.log("applied", n);
