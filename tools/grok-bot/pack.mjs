// node tools/grok-bot/pack.mjs <repo root> <out dir> <slug...>
// Writes one Grok Bot setup pack per mesh node: the fields a person (or a
// browser script) pastes into Grok Bot before Share as Template. Built only
// from the node's mesh.json and its standard's SKILL.md constitution, so the
// pack says no more than the listing and the standard already say.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [repo, out, ...slugs] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const read = (p) => readFileSync(join(repo, p), "utf8").replace(/\r\n/g, "\n");
const vocab = JSON.parse(read("mesh/vocabulary.json"));
const means = Object.fromEntries(vocab.events.map((e) => [e.name, e.means]));

function constitution(std) {
  const md = read(`skills/${std}/SKILL.md`);
  const fm = md.split("---")[1] ?? "";
  const list = (key) => {
    const m = fm.match(new RegExp(`^${key}:\\n((?:  - .*\\n)+)`, "m"));
    return m ? m[1].trim().split("\n").map((l) => l.replace(/^\s*-\s*"?|"?\s*$/g, "")) : [];
  };
  const canon = md.match(/\*\*Canonical:\*\*\s*(\S+)/)?.[1] ?? "";
  return { never: list("never"), person: list("stays_with_person"), canon };
}

const WAKE = {
  "schedule.tick": "on its schedule",
  "email.received": "when an email arrives",
  "exception.closed": "when the person named on an exception closes it",
};
const when = (c) => WAKE[c.event] ?? `when ${means[c.event]?.replace(/\.$/, "").toLowerCase() ?? c.event}`;

for (const slug of slugs) {
  const m = JSON.parse(read(`mesh/nodes/${slug}/mesh.json`));
  const std = m.standards[0];
  const c = constitution(std);
  const schedule = m.consumes.some((x) => x.event === "schedule.tick");
  const email = m.consumes.some((x) => x.event === "email.received");
  const description = m.office_task.length > 140 ? m.office_task.slice(0, 137).replace(/\s\S*$/, "") + "..." : m.office_task;
  // First run: the owner connects their books through an Office Voice key, the
  // same steps as aipathway.com.au/explore-ai/grok-bot-xero#key. The Bot does
  // the MCP setup itself and takes the key through a secret card, never chat.
  const books = m.systems_of_record.some((s) => /xero|myob|ledger/i.test(s));
  // Answering the phone is Office Voice Front Desk (the Booked After Hours add-in);
  // making calls is queued through the key (Get Paid). They are different steps.
  const answers = m.consumes.some((x) => x.event === "call.received") || /front-desk/i.test(m.runtime.join(","));
  const dials = !answers && /voice|telephony|call/i.test(m.runtime.join(","));
  const scopes = ["Read the book", "Write drafts and notes", ...(dials ? ["Queue calls"] : [])];
  const test = answers
    ? "read the five most recent jobs in the job system by id, change nothing, contact no one, and show the owner the list"
    : "read the total of sent invoices past their due date and the three customers who owe the most, change nothing, contact no one, and show the owner the result";
  const firstRun = books || answers || dials ? [
    `First run, before any real work:`,
    `1. Check whether you have an MCP server called Office Voice. If you do, skip to step 4.`,
    `2. If not, tell the owner: "I work with your systems through an Office Voice key, so your passwords stay with you. Sign up at https://office-voice.com, click Sign in with Xero and pick your organisation. Then under Keys, create a key and tick: ${scopes.join(", ")}."${dials ? " Queue calls needs the Get Paid plan." : ""}${answers ? " Answering your phone after hours is the Booked After Hours add-in in Office Voice; turn it on there." : ""}`,
    `3. When they have the key, add a custom MCP server called Office Voice at https://office-voice.com/api/mcp. It needs an Authorization header: the word Bearer, a space, then the key. Ask for the key with a secure secret card. Never ask them to type it in chat.`,
    `4. Run a read-only test: ${test}. Only then start your job.`,
    ...(answers ? [`The phone: you never answer, dial or text anyone yourself. Office Voice answers the call; you pick the job up from the record it writes, by its id.`] : []),
    ...(dials ? [`Calls and texts: you never dial or text anyone yourself. You queue the call through Office Voice, which places it inside calling hours after the Do Not Call Register check, and you read the outcome back from the record.`] : []),
    ``,
  ] : [];
  const instructions = [
    `You are ${m.name}. Your one job: ${m.office_task}`,
    ``,
    ...firstRun,
    `You work in: ${m.systems_of_record.join(", ")}. You run ${[...new Set(m.consumes.map(when))].join(", ")}.`,
    ``,
    `How you work, every time:`,
    `- After the first step, find every record by its id from the system it lives in. Never match on a name, phone number or email address.`,
    `- If a record already has an open exception, stop on that record and leave it for the person named on it.`,
    `- A write counts only when the system gives back an id and you read the record back by that id. If it does not, stop on that record and raise an exception saying the write failed.`,
    `- Keep what you know on the record itself (${m.durable_state.fields.join(", ")}), not in your own memory.`,
    `- Draft anything a customer or supplier will read and leave it for a person to send, unless the owner has written a rule that releases it.`,
    ``,
    `Never:`,
    ...c.never.map((n) => `- ${n}`),
    `- pay a bill, approve spending or move money`,
    ``,
    `Always leave to a person:`,
    ...c.person.map((p) => `- ${p}`),
    ``,
    `When you finish a record, hand it on:`,
    ...m.emits.filter((e) => e.event !== "exception.raised").map((e) => `- ${e.event}: ${e.write}`),
    ``,
    `When something is wrong, raise an exception to the person in ${m.exceptions.owner_field}, with one of: ${m.exceptions.raises.join(", ")}.`,
    ``,
    `The method you follow is the open standard at ${c.canon}. Read it when you are unsure; it wins over anything here.`,
  ].join("\n");
  const pack = {
    slug,
    name: m.name,
    description,
    instructions,
    routine: [schedule && "Every weekday at 7:00 AM", email && "whenever an email arrives at this Bot's address"].filter(Boolean).join(", and ") || "When its webhook is called by the job system",
    connect: m.systems_of_record,
    credit: m.port_of?.credited ? `Port of ${m.port_of.original_name} by ${m.port_of.original_author} (${m.port_of.share_link})` : "Original AI Pathway build",
    standard: c.canon,
  };
  writeFileSync(join(out, `${slug}.json`), JSON.stringify(pack, null, 2));
  console.log(`${slug}: ${instructions.length} chars, never ${c.never.length}, person ${c.person.length}, routine: ${pack.routine}`);
}
