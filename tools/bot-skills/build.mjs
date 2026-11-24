// node tools/bot-skills/build.mjs [repo root]
//
// Writes the Bot Team as an OpenAI plugin: plugins/bot-team, one skill per
// listed bot, so ChatGPT is a platform like Grok Bot and Claude (2026-11-24).
//
// WHY A PLUGIN. ChatGPT has no public sharing. A Business or Enterprise admin
// imports this repo as a plugin marketplace (Admin Console > Plugins > Add >
// Import marketplace, help.openai.com 20001504), and .agents/plugins/
// marketplace.json lists two plugins: build-standards (the 47 standards, from
// website_consulting's build-skills) and bot-team (this). Each bot keeps its
// directory name, so "Chase Desk" on the site is the chase-desk skill here.
//
// The instructions are the Grok Bot pack's, built by the same function
// (tools/grok-bot/instructions.mjs). Only the first-run connect steps differ:
// ChatGPT signs in to the AI Pathway connector, which an admin adds.
//
// Regenerate after any mesh.json or standard change; CI checks it is current.
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { botPack, makeReader } from "../grok-bot/instructions.mjs";

const repo = process.argv[2] ?? ".";
const reader = makeReader(repo);
const registry = JSON.parse(reader.read("mesh/registry.json"));
const nodes = registry.nodes.filter((n) => n.status === "listed").map((n) => n.slug).sort();

const OUT = join(repo, "plugins", "bot-team");
rmSync(join(OUT, "skills"), { recursive: true, force: true });
mkdirSync(join(OUT, "skills"), { recursive: true });

/** A skill description is what ChatGPT reads to decide when to use it. */
function describe(pack) {
  const task = pack.node.office_task.replace(/\s+/g, " ").trim();
  const d = `${pack.pack.name}, an AI Pathway Bot Team bot. ${task} Use when the person asks for ${pack.pack.name} or when its scheduled task runs.`;
  return d.length > 1000 ? `${d.slice(0, 997).replace(/\s\S*$/, "")}...` : d;
}

/**
 * ChatGPT runs a skill as a scheduled task; it has no address of its own to
 * email and can't be called by a job system's webhook. So every bot becomes a
 * scheduled run, and an email bot reads the inbox through the person's own
 * email connected in ChatGPT, working what arrived since the last run.
 */
function schedule(name, node) {
  const ticks = node.consumes.some((x) => x.event === "schedule.tick");
  const email = node.consumes.some((x) => x.event === "email.received");
  const inbox = " Connect your email in ChatGPT and it works the emails that arrived since the last run.";
  if (ticks) return `Ask ChatGPT to run the ${name} skill as a scheduled task, every weekday at 7:00 AM.${email ? inbox : ""}`;
  if (email) return `Ask ChatGPT to run the ${name} skill as a scheduled task, for example every hour.${inbox}`;
  return `ChatGPT can't be woken by your job system, so ask ChatGPT to run the ${name} skill as a scheduled task instead, for example every weekday at 7:00 AM, and it works whatever is waiting.`;
}

const yaml = (s) => JSON.stringify(s); // a JSON string is a valid YAML scalar

for (const slug of nodes) {
  const built = botPack(reader, slug, "chatgpt");
  const { pack, node } = built;
  const runs = schedule(pack.name, node);
  const credit = node.port_of?.credited
    ? `Based on ${node.port_of.original_name} by ${node.port_of.original_author}. Rebuilt and maintained by ${node.maintainer.name}.`
    : `Maintained by ${node.maintainer.name}.`;
  const md = [
    `---`,
    `name: ${slug}`,
    `description: ${yaml(describe(built))}`,
    `license: CC-BY-4.0`,
    `---`,
    ``,
    `# ${pack.name}`,
    ``,
    pack.instructions,
    ``,
    `## When it runs`,
    ``,
    runs,
    ``,
    `## About this bot`,
    ``,
    `${credit} Listed in the AI Pathway Bot Team: https://aipathway.com.au/explore-ai/mesh-directory. Set-up help for ChatGPT: https://aipathway.com.au/explore-ai/bot-team-in-chatgpt?bot=${slug}`,
    ``,
  ].join("\n");
  mkdirSync(join(OUT, "skills", slug), { recursive: true });
  writeFileSync(join(OUT, "skills", slug, "SKILL.md"), md, "utf8");
}

// The version follows the registry date so a sync shows a change only when the
// directory changed.
const stamp = (registry.updated ?? registry.generated ?? new Date().toISOString()).slice(0, 10);
const version = stamp.split("-").map(Number).join(".");
const description = `The AI Pathway Bot Team: ${nodes.length} office bots for trade, property and accounting work that pass the job along by its id, so nobody retypes it. Each bot is one skill. Connect your systems with the AI Pathway connector.`;
const iface = {
  displayName: "AI Pathway Bot Team",
  shortDescription: "Office bots that hand the job along: quotes, invoices, debtor chasing and more",
  category: "Productivity",
  defaultPrompt: ["Run Chase Desk on our Xero debtors.", "Which Bot Team bot drafts quotes from our price list?"],
};
const portable = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  name: "bot-team",
  version,
  description,
  author: { name: "AI Pathway", url: "https://aipathway.com.au" },
  homepage: "https://aipathway.com.au/explore-ai/mesh-directory",
  repository: "https://github.com/digitalgym/aipathway-standards",
  license: "CC-BY-4.0",
  keywords: ["bots", "office", "xero", "servicem8", "simpro", "hand-off"],
  extensions: { "com.openai": { interface: iface } },
};
const { $schema, extensions, ...rest } = portable;
const codex = { ...rest, skills: "./skills/", interface: { ...iface, developerName: "AI Pathway" } };
writeFileSync(join(OUT, "plugin.json"), `${JSON.stringify(portable, null, 2)}\n`, "utf8");
mkdirSync(join(OUT, ".codex-plugin"), { recursive: true });
writeFileSync(join(OUT, ".codex-plugin", "plugin.json"), `${JSON.stringify(codex, null, 2)}\n`, "utf8");
writeFileSync(
  join(OUT, "README.md"),
  `# AI Pathway Bot Team (ChatGPT and Codex plugin)

Generated by \`node tools/bot-skills/build.mjs\` from \`mesh/registry.json\` and each
node's \`mesh.json\`. Do not edit by hand.

${nodes.length} skills, one per bot in the [Bot Team directory](https://aipathway.com.au/explore-ai/mesh-directory).
The instructions match the bot's Grok Bot template; only the first-run connect
steps differ, because ChatGPT signs in to the AI Pathway connector instead of
taking a key.

ChatGPT Business or Enterprise: a workspace admin imports this repository once
(Admin Console, Plugins, Add, Import marketplace, paste
\`https://github.com/digitalgym/aipathway-standards\`, leave Path empty), then makes
\`bot-team\` available. Set-up help: https://aipathway.com.au/explore-ai/bot-team-in-chatgpt
`,
  "utf8",
);
console.log(`bot-team ${version}: ${nodes.length} skills`);
