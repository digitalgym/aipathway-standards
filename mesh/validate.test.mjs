/**
 * The gate's own tests: node --test mesh/
 *
 * Each refusal case breaks one rule of the team contract on an otherwise good
 * node, so a test that passes for the wrong reason shows up as the wrong
 * message rather than a quiet green.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistry, validateManifest, requiredEvidence } from "./validate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const vocab = JSON.parse(readFileSync(join(HERE, "vocabulary.json"), "utf8"));
const standards = ["booked-after-hours", "quote-out", "invoice-out", "debtor-chasing", "cash-seam", "inbox-triage"];
const NOW = Date.parse("2026-11-03T00:00:00Z");

function run(standard, { fail = 0, pass = 5, ranAt = "2026-11-01T00:00:00Z" } = {}) {
  const results = [
    ...Array.from({ length: pass }, (_, i) => ({ checkId: `c${i}`, n: i + 1, verdict: "pass" })),
    ...Array.from({ length: fail }, (_, i) => ({ checkId: `f${i}`, n: pass + i + 1, verdict: "fail" })),
    { checkId: "w", n: 99, verdict: "with_us" },
  ];
  const envelope = {
    envelopeVersion: "1.0",
    runId: `run-${standard}`,
    standard,
    results,
    summary: { total: results.length, pass, fail, shapeOnly: 0, withUs: 1, evidenceRequired: 0 },
  };
  const manifest = {
    standard,
    edition: "1.0",
    environment: "stub",
    ran_at: ranAt,
    tally: { green: pass, red: fail, with_us: 1, evidence_required: 0, total: results.length },
  };
  return { manifest, envelope };
}

function quoteBot(over = {}) {
  return {
    slug: "quote-chaser",
    name: "Quote chaser",
    office_task: "Sends the quote drafted from the job and chases it until it is accepted or declined.",
    verticals: ["trades-building"],
    standards: ["quote-out"],
    systems_of_record: ["ServiceM8"],
    links: { bot: "https://example.com/bot/quote-chaser" },
    maintainer: { name: "Sam", github: "sam" },
    runtime: ["grok-bot-routine", "webhook"],
    consumes: [{ event: "job.created", wake: "webhook" }],
    emits: [{ event: "quote.sent", write: "quote on the job", readback: "GET /quote/{uuid}" }],
    matches_after_intake: "id-only",
    exceptions: { raises: ["quote.missing_scope"], owner_field: "exception_owner", halts_on_open: true },
    durable_state: { writes_to: "system-of-record", fields: ["seam.quote_id", "seam.status"] },
    private_memory: "preferences-only",
    port_of: {
      original_name: "Quote Follow-up",
      original_author: "Jo",
      share_link: "https://example.com/share/abc",
      licence_or_permission: "reimplementation",
    },
    ...over,
  };
}

function invoiceBot() {
  return {
    ...quoteBot(),
    slug: "invoice-raiser",
    name: "Invoice raiser",
    standards: ["invoice-out"],
    consumes: [{ event: "quote.sent", wake: "webhook" }],
    emits: [{ event: "invoice.raised", write: "draft invoice", readback: "GET /Invoices/{InvoiceID}" }],
    port_of: null,
  };
}

const node = (manifest, evidence) => ({
  folder: manifest.slug,
  manifest,
  evidence: evidence ?? Object.fromEntries(requiredEvidence(manifest, vocab).map((s) => [s, run(`${s}-build-standard`)])),
});

const build = (nodes, removals = []) => buildRegistry({ nodes, vocab, standards, removals, now: NOW });
const errorsFor = (m) => validateManifest(m, { vocab, standards, folder: m.slug }).join("\n");

test("a good node is listed, routable, and credited", () => {
  const { problems, registry } = build([node(quoteBot())]);
  assert.deepEqual(problems, []);
  assert.equal(registry.nodes[0].status, "listed");
  assert.equal(registry.nodes[0].port_of.original_author, "Jo");
  assert.equal(registry.nodes[0].evidence_kind, "self-run");
  assert.deepEqual(registry.routable, ["quote-chaser"]);
});

test("two nodes that share an event are joined by a handover carrying its id", () => {
  const { registry } = build([node(quoteBot()), node(invoiceBot())]);
  assert.deepEqual(registry.edges, [{ from: "quote-chaser", to: "invoice-raiser", event: "quote.sent", id: "quote_id" }]);
});

test("a cash path node without a Cash Seam run is refused", () => {
  const { problems } = build([node(quoteBot(), { "quote-out": run("quote-out-build-standard") })]);
  assert.match(problems[0].errors.join("\n"), /cash-seam: no evidence.*touches the cash path/);
});

test("a red check keeps a node out", () => {
  const ev = { "quote-out": run("quote-out-build-standard"), "cash-seam": run("cash-seam-build-standard", { fail: 1 }) };
  const { problems, registry } = build([node(quoteBot(), ev)]);
  assert.match(problems[0].errors.join("\n"), /1 check\(s\) red/);
  assert.equal(registry.nodes.length, 0);
});

test("an edited summary that disagrees with its results is refused", () => {
  const ev = { "quote-out": run("quote-out-build-standard", { fail: 1 }), "cash-seam": run("cash-seam-build-standard") };
  ev["quote-out"].envelope.summary.fail = 0;
  const { problems } = build([node(quoteBot(), ev)]);
  assert.match(problems[0].errors.join("\n"), /summary disagrees/);
});

test("evidence older than the limit lists the node as stale and drops it from routing", () => {
  const old = "2026-07-01T00:00:00Z";
  const ev = { "quote-out": run("quote-out-build-standard", { ranAt: old }), "cash-seam": run("cash-seam-build-standard") };
  const { problems, registry } = build([node(quoteBot(), ev), node(invoiceBot())]);
  assert.deepEqual(problems, []);
  assert.equal(registry.nodes.find((n) => n.slug === "quote-chaser").status, "stale");
  assert.deepEqual(registry.routable, ["invoice-raiser"]);
  assert.deepEqual(registry.edges, []);
});

test("a vertical outside trades, fire, accounting, property and B2B office is refused", () => {
  assert.match(errorsFor(quoteBot({ verticals: ["restaurants"] })), /not one the mesh serves/);
});

test("a port without its original's credit is refused", () => {
  assert.match(errorsFor(quoteBot({ port_of: { original_name: "Quote Follow-up" } })), /original_author is required/);
  const { port_of, ...noField } = quoteBot();
  assert.match(errorsFor(noField), /port_of is required/);
});

test("a node that matches on name or phone after intake is refused", () => {
  assert.match(errorsFor(quoteBot({ matches_after_intake: "name-or-phone" })), /id-only/);
});

test("a node that runs past an open exception is refused", () => {
  assert.match(errorsFor(quoteBot({ exceptions: { raises: [], owner_field: "owner", halts_on_open: false } })), /halts_on_open must be true/);
});

test("an emit with no readback is refused: a chat confirmation is not a write", () => {
  assert.match(errorsFor(quoteBot({ emits: [{ event: "quote.sent", write: "quote" }] })), /readback is required/);
});

test("an unnamed event, or a bot emitting an entry event, is refused", () => {
  assert.match(errorsFor(quoteBot({ consumes: [{ event: "quote.maybe", wake: "webhook" }] })), /not a named event/);
  assert.match(errorsFor(quoteBot({ emits: [{ event: "call.received", write: "x", readback: "y" }] })), /entry event/);
});

test("durable state held in the bot's own memory is refused", () => {
  assert.match(errorsFor(quoteBot({ private_memory: "job-history" })), /private_memory must be one of/);
});

test("an author's removal delists the port everywhere, matched by share link", () => {
  const { registry } = build([node(quoteBot()), node(invoiceBot())], [{ share_link: "https://example.com/share/abc", scope: "delist" }]);
  assert.deepEqual(registry.routable, ["invoice-raiser"]);
  assert.deepEqual(registry.edges, []);
});

test("an author who asks not to be named keeps the port listed without the credit", () => {
  const { registry } = build([node(quoteBot())], [{ slug: "quote-chaser", scope: "uncredit" }]);
  assert.equal(registry.nodes[0].port_of.credited, false);
  assert.equal(registry.nodes[0].port_of.original_author, undefined);
});

test("listed_at is the first day a node was listed and survives a rebuild", () => {
  const first = build([node(quoteBot())]).registry;
  assert.equal(first.nodes[0].listed_at, new Date(NOW).toISOString().slice(0, 10));
  const later = buildRegistry({
    nodes: [node(quoteBot())], vocab, standards, removals: [], now: NOW + 30 * 86400000,
    previous: { nodes: [{ slug: "quote-chaser", listed_at: "2026-01-05" }] },
  }).registry;
  assert.equal(later.nodes[0].listed_at, "2026-01-05");
});
