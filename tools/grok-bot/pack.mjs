// node tools/grok-bot/pack.mjs <repo root> <out dir> <slug...>
// Writes one Grok Bot setup pack per mesh node: the fields a person (or a
// browser script) pastes into Grok Bot before Share as Template. Built only
// from the node's mesh.json and its standard's SKILL.md constitution, so the
// pack says no more than the listing and the standard already say. The
// instructions themselves live in instructions.mjs, shared with the ChatGPT
// skills (tools/bot-skills/build.mjs).
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { botPack, makeReader } from "./instructions.mjs";

const [repo, out, ...slugs] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const reader = makeReader(repo);

for (const slug of slugs) {
  const { pack, constitution: c } = botPack(reader, slug, "grok");
  writeFileSync(join(out, `${slug}.json`), JSON.stringify(pack, null, 2));
  console.log(`${slug}: ${pack.instructions.length} chars, never ${c.never.length}, person ${c.person.length}, routine: ${pack.routine}`);
}
