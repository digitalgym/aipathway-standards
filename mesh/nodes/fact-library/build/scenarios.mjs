/**
 * One scenario per check of knowledge-graph-build-standard, for Fact Library.
 *
 * Scaffolded by `npx @aipathway/conformance init knowledge-graph-build-standard`
 * from https://aipathway.com.au/explore-ai/knowledge-graph-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world (its recorded trace and the graph store behind
 * its ports), never the build. Where a check needs what a fleet bot was told
 * (check 9), the drive keeps the build's reply on the world, standing in for
 * the asking bot.
 *
 * THE CORPUS IS A FIXTURE. The supplier, its trading terms, the accounts
 * payable procedure and the delegations register are invented for the stub and
 * named EXAMPLE so nobody mistakes them for a real supplier or a real policy.
 * The Xero contact id is made up.
 */

import { KnowledgeGraphWorld } from "@aipathway/conformance";

const OWNER = "Priya Nair, operations manager";
const XERO_CONTACT = "9b2f6c1e-4d7a-4f0e-a3b8-EXAMPLE00001";

const TERMS = {
  id: "SRC-COASTLINE-TERMS",
  kind: "instrument",
  title: "EXAMPLE Coastline Building Supplies trading terms",
  issuer: "EXAMPLE Coastline Building Supplies Pty Ltd",
  edition: "2026-07",
  jurisdiction: "AU",
  effectiveFrom: "2026-07-01",
  checksum: "sha256:aa11c0ffee",
  url: "https://drive.example/library/coastline-terms-2026-07.pdf",
};
const AP = {
  id: "SRC-AP-PROCEDURE",
  kind: "internal_rule",
  title: "EXAMPLE accounts payable procedure",
  issuer: "the business (finance)",
  edition: "v3",
  jurisdiction: "AU",
  effectiveFrom: "2026-01-15",
  checksum: "sha256:bb22d00d",
  url: "https://drive.example/library/ap-procedure-v3.pdf",
};
const DELEG = {
  id: "SRC-DELEGATIONS",
  kind: "internal_rule",
  title: "EXAMPLE financial delegations register",
  issuer: "the business (board)",
  edition: "2026-03",
  jurisdiction: "AU",
  effectiveFrom: "2026-03-01",
  checksum: "sha256:cc33beef",
  url: "https://drive.example/library/delegations-2026-03.pdf",
};
const INTERVIEW = {
  id: "DOC-CLIENT-INTERVIEW-0412",
  kind: "customer_material",
  title: "Client call notes, site manager interview",
  issuer: "a client",
  edition: "2026-10-12",
  jurisdiction: "QLD",
  effectiveFrom: "2026-10-12",
  checksum: "sha256:dd44f00d",
  url: "https://drive.example/library/client-interview-0412.txt",
};

const K = {
  pay: "supplier.payment_terms",
  cutoff: "supplier.delivery_cutoff",
  approve: "ap.second_approver_threshold",
  rebate: "supplier.volume_rebate",
};
const clause = (id, src, key, body, locator, jurisdiction) => ({
  id,
  type: "Clause",
  key,
  body,
  sourceId: src.id,
  ...(locator ? { locator } : {}),
  ...(jurisdiction ? { scope: { jurisdiction } } : {}),
});
const PAY = clause("CL-TERMS-4.1", TERMS, K.pay, "Invoices are payable 30 days from the end of the month of invoice.", "p2 s4.1");
const CUT_QLD = clause("CL-TERMS-6.2-QLD", TERMS, K.cutoff, "Orders placed by 2pm AEST are delivered the next business day in south-east Queensland.", "p3 s6.2(a)", "QLD");
const CUT_ANY = clause("CL-TERMS-6.2", TERMS, K.cutoff, "Orders are delivered within five business days.", "p3 s6.2");
const AP2 = clause("CL-AP-2", AP, K.approve, "Bills over $5,000 ex GST need a second approver before payment.", "s2");
const DEL3 = clause("CL-DELEG-3", DELEG, K.approve, "Bills over $10,000 ex GST need a second approver before payment.", "item 3");
const PAY_NEW = clause("CL-TERMS-4.1B", TERMS, K.pay, "Invoices are payable 30 days from the date of invoice.", "p2 s4.1 (rev)");

// Scope targets. Concepts from the contract's closed list of jurisdictions,
// already live in the library before any of these runs.
const CONCEPTS = ["QLD", "NSW", "AU"].map((j) => ({ id: `concept-jurisdiction-${j}`, type: "Concept", key: `jurisdiction.${j}`, body: j, queue: "live", acceptedBy: OWNER }));

const Q = {
  pay: { question: "What payment terms does Coastline give us?", key: K.pay },
  cutQld: { question: "When does a Coastline order placed at 1pm arrive in Brisbane?", key: K.cutoff, jurisdiction: "QLD" },
  cutNsw: { question: "When does a Coastline order arrive in Newcastle?", key: K.cutoff, jurisdiction: "NSW" },
  approve: { question: "At what amount does a bill need a second approver?", key: K.approve },
  rebate: { question: "What volume rebate does Coastline pay us?", key: K.rebate },
};

const world = (opts = {}) => () => new KnowledgeGraphWorld({ nodes: CONCEPTS.map((c) => ({ ...c })), ...opts });
const libraryInput = (srcs, clauses) => ({
  owner: OWNER,
  sources: srcs,
  acceptSources: srcs.map((s) => ({ sourceId: s.id, by: OWNER })),
  propose: clauses,
  accept: clauses.map((c) => ({ nodeId: c.id, by: OWNER })),
});
const load = (b, w, srcs = [TERMS, AP], clauses = [PAY, CUT_QLD, CUT_ANY, AP2]) => b(w.ports(), libraryInput(srcs, clauses));
const ask = (b, w, ...questions) => b(w.ports(), { owner: OWNER, questions });

const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const escalated = (w, reason, id) => w.escalations.some((e) => e.reason === reason && (e.detail ?? "").includes(id));
const isLive = (w, id) => w.node(id)?.queue === "live";
const only = (a, id) => a?.outcome === "answered" && a.nodeIds.length === 1 && a.nodeIds[0] === id && a.otherCitations.length === 0;
const declined = (a) => a?.outcome === "declined" && a.text === null && a.nodeIds.length === 0 && a.otherCitations.length === 0;
const trace = (w) => w.answers.map((a) => `${a.id} ${a.outcome} [${[...a.nodeIds, ...a.otherCitations].join(",")}]`).join("; ") || "no answers";
const HOUR = 3_600_000;

export const scenarios = [
  {
    checkId: "key-contract-before-extract",
    // 1. One clause of a published type and one "Policy" node the contract does
    //    not name, proposed from an accepted source.
    world: world(),
    drive: (b, w) =>
      b(w.ports(), {
        owner: OWNER,
        sources: [TERMS],
        acceptSources: [{ sourceId: TERMS.id, by: OWNER }],
        propose: [PAY, { id: "POL-TERMS-1", type: "Policy", key: K.pay, body: "Coastline payment policy", sourceId: TERMS.id, locator: "p2" }],
      }),
    holds: (w) => {
      const contractAt = w.firstCall("read_rule", (c) => c.request.contract === true);
      const firstWrite = w.firstCall("write_node");
      const refused = w.refusedNodes.some((r) => r.id === "POL-TERMS-1") || escalated(w, "kg.type_not_in_contract", "POL-TERMS-1");
      return (
        contractAt >= 0 &&
        firstWrite >= 0 &&
        contractAt < firstWrite &&
        w.node(PAY.id)?.type === "Clause" &&
        w.node(PAY.id)?.queue === "proposed" &&
        !w.node("POL-TERMS-1") &&
        refused
      );
    },
    describe: (w) => `contract read at ${w.firstCall("read_rule")}, first write at ${w.firstCall("write_node")}; nodes ${w.nodes.map((n) => `${n.id}:${n.queue}`).join(",")}; escalations ${JSON.stringify(w.escalations)}`,
  },
  {
    checkId: "source-is-an-instrument",
    // 2. The full trading terms, and a drive link with a title only. Then an
    //    attempt to accept the bare link as if it were a source.
    world: world(),
    drive: (b, w) =>
      b(w.ports(), {
        owner: OWNER,
        sources: [TERMS, { id: "SRC-LINK", kind: "instrument", title: "Supplier terms", url: "https://drive.example/terms.pdf" }],
        acceptSources: [{ sourceId: "SRC-LINK", by: OWNER }],
      }),
    holds: (w) => {
      const full = w.sources.find((s) => s.id === TERMS.id);
      const named = ["edition", "checksum", "issuer"];
      const refusal =
        w.refusedSources.some((r) => r.id === "SRC-LINK" && named.every((f) => r.missing.includes(f))) ||
        w.escalations.some((e) => e.reason === "kg.source_not_an_instrument" && named.every((f) => (e.detail ?? "").includes(f)) && (e.detail ?? "").includes("SRC-LINK"));
      return (
        full?.queue === "proposed" &&
        full.checksum === TERMS.checksum &&
        !w.sources.some((s) => s.id === "SRC-LINK") &&
        refusal &&
        w.sources.every((s) => s.queue !== "accepted" || Boolean(s.checksum))
      );
    },
    describe: (w) => `sources ${w.sources.map((s) => `${s.id}:${s.queue}`).join(",") || "none"}; refused ${JSON.stringify(w.refusedSources)}; escalations ${JSON.stringify(w.escalations)}`,
  },
  {
    checkId: "nothing-live-without-acceptance",
    // 3. Three clauses from the accepted terms: one accepted by a named person,
    //    one accepted with no name, one with no locator accepted by a person.
    world: world(),
    drive: (b, w) => {
      const noLoc = clause("CL-TERMS-9", TERMS, "supplier.returns", "Returns need a returns authority number.");
      return b(w.ports(), {
        owner: OWNER,
        sources: [TERMS],
        acceptSources: [{ sourceId: TERMS.id, by: OWNER }],
        propose: [PAY, CUT_ANY, noLoc],
        accept: [
          { nodeId: PAY.id, by: OWNER },
          { nodeId: CUT_ANY.id, by: "" },
          { nodeId: "CL-TERMS-9", by: OWNER },
        ],
      });
    },
    holds: (w) => {
      const liveFromTerms = w.live().filter((n) => n.sourceId === TERMS.id).map((n) => n.id);
      const refused = (id) => w.refusedAcceptances.some((r) => r.id === id) || escalated(w, "kg.acceptance_refused", id);
      return (
        liveFromTerms.length === 1 &&
        liveFromTerms[0] === PAY.id &&
        w.node(PAY.id)?.acceptedBy === OWNER &&
        w.node(CUT_ANY.id)?.queue === "proposed" &&
        w.node("CL-TERMS-9")?.queue === "proposed" &&
        refused(CUT_ANY.id) &&
        refused("CL-TERMS-9") &&
        w.live().filter((n) => n.type === "Clause" || n.type === "Fact").every((n) => Boolean(n.sourceId) && Boolean(n.locator))
      );
    },
    describe: (w) => `nodes ${w.nodes.map((n) => `${n.id}:${n.queue}`).join(",")}; refused ${JSON.stringify(w.refusedAcceptances)}; escalations ${w.escalations.length}`,
  },
  {
    checkId: "production-reads-live-nodes",
    // 4. The payment terms are live; the index also holds the chunk they came from.
    world: world({ index: [{ chunkId: "chunk-47", file: "coastline-terms-2026-07.pdf", text: "Invoices are payable 30 days from the end of the month", nodeId: PAY.id }] }),
    drive: async (b, w) => {
      await load(b, w);
      w.advance(HOUR);
      await ask(b, w, Q.pay);
    },
    holds: (w) => {
      const a = w.answers[0];
      const bad = new Set(["chunk-47", "coastline-terms-2026-07.pdf", TERMS.url, TERMS.id]);
      return (
        w.answers.length === 1 &&
        a.outcome === "answered" &&
        a.nodeIds.length > 0 &&
        a.otherCitations.length === 0 &&
        a.nodeIds.every((id) => isLive(w, id) && ["Clause", "Fact"].includes(w.node(id).type) && !bad.has(id)) &&
        a.nodeIds.includes(PAY.id) &&
        callsTo(w, "cite").length === 1
      );
    },
    describe: trace,
  },
  {
    checkId: "identity-from-the-system-of-record",
    // 5. The terms name the supplier in full; Xero holds it as a contact with
    //    its own id. A person accepts that they are the same supplier.
    world: world(),
    drive: (b, w) =>
      b(w.ports(), {
        ...libraryInput([TERMS], [PAY]),
        entities: [
          { id: `ENT-XERO-${XERO_CONTACT}`, label: "Coastline Building Supplies", system: "Xero", externalId: XERO_CONTACT },
          { id: "ENT-TERMS-PARTY", label: "EXAMPLE Coastline Building Supplies Pty Ltd", sourceId: TERMS.id, locator: "p1 parties" },
        ],
        sameAs: [{ from: "ENT-TERMS-PARTY", to: `ENT-XERO-${XERO_CONTACT}`, by: OWNER }],
      }),
    holds: (w) => {
      const ents = w.nodes.filter((n) => n.type === "Entity");
      const reg = ents.filter((e) => e.externalId === XERO_CONTACT);
      if (ents.length === 0 || reg.length !== 1) return false;
      const joined = (e) =>
        w.edges.some(
          (x) => x.type === "SAME_AS" && Boolean(x.acceptedBy) && ((x.from === e.id && x.to === reg[0].id) || (x.to === e.id && x.from === reg[0].id)),
        );
      return ents.filter((e) => e.id !== reg[0].id).every(joined) && ents.every((e) => e.externalId === XERO_CONTACT || joined(e));
    },
    describe: (w) => `entities ${JSON.stringify(w.nodes.filter((n) => n.type === "Entity"))}; edges ${JSON.stringify(w.edges)}`,
  },
  {
    checkId: "scope-is-an-edge",
    // 6. A Queensland delivery cut-off and an unscoped one, both live. Asked
    //    about Queensland, then about New South Wales, where nothing is scoped.
    world: world(),
    drive: async (b, w) => {
      await load(b, w);
      await ask(b, w, Q.cutQld, Q.cutNsw);
    },
    holds: (w) => {
      const [qld, nsw] = w.answers;
      return (
        w.answers.length === 2 &&
        isLive(w, CUT_ANY.id) &&
        only(qld, CUT_QLD.id) &&
        declined(nsw) &&
        w.edges.some((e) => e.type === "APPLIES_TO" && e.from === CUT_QLD.id && e.to === "concept-jurisdiction-QLD") &&
        !w.edges.some((e) => e.type === "APPLIES_TO" && e.from === CUT_ANY.id)
      );
    },
    describe: trace,
  },
  {
    checkId: "supersedes-and-conflicts-are-written",
    // 7. A revised payment clause accepted as superseding the old one. Separately,
    //    the AP procedure and the delegations register give different
    //    second-approver thresholds. Asked twice, then a person picks.
    world: world(),
    drive: async (b, w) => {
      await load(b, w, [TERMS, AP, DELEG], [PAY, AP2, DEL3]);
      await b(w.ports(), { owner: OWNER, propose: [PAY_NEW], supersede: [{ newId: PAY_NEW.id, oldId: PAY.id, by: OWNER }] });
      await ask(b, w, Q.pay, Q.approve);
      w.advance(HOUR);
      await ask(b, w, Q.approve);
      const c = w.conflicts[0];
      w.advance(HOUR);
      await b(w.ports(), { owner: OWNER, resolve: c ? [{ conflictId: c.id, by: "Sam Ortiz, finance manager", pick: DEL3.id }] : [], questions: [Q.approve] });
    },
    holds: (w) => {
      const [pay, a1, a2, a3] = w.answers;
      const pair = [AP2.id, DEL3.id];
      const c = w.conflicts[0];
      const esc = callsTo(w, "escalate", (x) => Array.isArray(x.request.nodeIds) && pair.every((id) => x.request.nodeIds.includes(id)) && Boolean(x.request.person));
      const citesPair = (a) => a.nodeIds.some((id) => pair.includes(id));
      return (
        w.answers.length === 4 &&
        w.node(PAY.id)?.queue === "retired" &&
        w.edges.some((e) => e.type === "SUPERSEDES" && e.from === PAY_NEW.id && e.to === PAY.id) &&
        only(pay, PAY_NEW.id) &&
        w.edges.some((e) => e.type === "CONFLICTS" && pair.includes(e.from) && pair.includes(e.to) && e.from !== e.to) &&
        esc.length >= 1 &&
        w.conflicts.length === 1 &&
        declined(a1) &&
        declined(a2) &&
        !citesPair(a1) &&
        !citesPair(a2) &&
        c.decidedBy === "Sam Ortiz, finance manager" &&
        only(a3, DEL3.id)
      );
    },
    describe: (w) => `${trace(w)}; conflicts ${JSON.stringify(w.conflicts)}; edges ${w.edges.map((e) => `${e.type}:${e.from}->${e.to}`).join(",")}`,
  },
  {
    checkId: "change-computes-affected-nodes",
    // 8. Answers are given from the trading terms; then a new edition with a
    //    different checksum lands, and the change watch runs.
    world: world(),
    drive: async (b, w) => {
      await load(b, w);
      await ask(b, w, Q.pay, Q.cutQld, Q.approve);
      w.advance(24 * HOUR);
      w.newEdition(TERMS.id, "sha256:ee55newedition");
      await b(w.ports(), { owner: OWNER, tick: true });
    },
    holds: (w) => {
      const d = w.deltas[0];
      if (w.deltas.length !== 1 || !d) return false;
      const truth = w.builtFrom(TERMS.id).slice().sort();
      const listed = d.affectedNodeIds.slice().sort();
      return (
        w.answered.length === 3 &&
        d.sourceId === TERMS.id &&
        d.oldChecksum === TERMS.checksum &&
        d.newChecksum === "sha256:ee55newedition" &&
        truth.length === 3 &&
        JSON.stringify(listed) === JSON.stringify(truth) &&
        truth.every((id) => !isLive(w, id)) &&
        isLive(w, AP2.id)
      );
    },
    describe: (w) => `deltas ${JSON.stringify(w.deltas)}; truth ${JSON.stringify(w.builtFrom(TERMS.id))}; nodes ${w.nodes.map((n) => `${n.id}:${n.queue}`).join(",")}`,
  },
  {
    checkId: "queues-are-states",
    // 9. The payment clause is cited, then retired, then asked again; then the
    //    bot that got the first answer asks what it relied on.
    world: world(),
    drive: async (b, w) => {
      await load(b, w);
      await ask(b, w, Q.pay);
      w.retire(PAY.id);
      w.advance(HOUR);
      await ask(b, w, Q.pay);
      const first = w.answers[0];
      const r = await b(w.ports(), { owner: OWNER, reliedOn: first ? [{ answerId: first.id, nodeIds: first.nodeIds }] : [] });
      w.lookups = r?.lookups ?? [];
    },
    holds: (w) => {
      const [first, second] = w.answers;
      const found = (w.lookups ?? []).find((l) => l.answerId === first?.id)?.nodes ?? [];
      return (
        w.answers.length === 2 &&
        only(first, PAY.id) &&
        !second.nodeIds.includes(PAY.id) &&
        second.nodeIds.every((id) => isLive(w, id)) &&
        found.some((n) => n.id === PAY.id && n.queue === "retired" && n.sourceId === TERMS.id && Boolean(n.locator))
      );
    },
    describe: (w) => `${trace(w)}; lookups ${JSON.stringify(w.lookups ?? null)}`,
  },
  {
    checkId: "index-proposes-only",
    // 10. Asked with the index attached (it also holds a rebate chunk no node
    //     covers), then with the index detached.
    world: world({
      index: [
        { chunkId: "chunk-47", file: "coastline-terms-2026-07.pdf", text: "Invoices are payable 30 days from the end of the month", nodeId: PAY.id },
        { chunkId: "chunk-88", file: "coastline-rebates-draft.pdf", text: "A 2% volume rebate applies over $50,000 a year" },
      ],
    }),
    drive: async (b, w) => {
      await load(b, w);
      await ask(b, w, Q.pay, Q.rebate);
      w.detachIndex();
      w.advance(HOUR);
      await ask(b, w, Q.pay, Q.rebate);
    },
    holds: (w) => {
      const [pay1, reb1, pay2, reb2] = w.answers;
      return (
        w.answers.length === 4 &&
        only(pay1, PAY.id) &&
        only(pay2, PAY.id) &&
        declined(reb1) &&
        declined(reb2) &&
        callsTo(w, "read_node", (c) => c.request.detached === true).length >= 1
      );
    },
    describe: trace,
  },
  {
    checkId: "customer-material-is-not-a-source",
    // 11. A client interview in the same folder as the terms. A crawler-style
    //     proposal from it, an attempt to accept it as a source, and two
    //     promotions of the same claim: one by a named person, one with no name.
    world: world(),
    drive: (b, w) => {
      const claim = "The client's site accepts deliveries only before 7am.";
      const loc = "00:04:10-00:04:32";
      return b(w.ports(), {
        owner: OWNER,
        sources: [TERMS, INTERVIEW],
        acceptSources: [
          { sourceId: TERMS.id, by: OWNER },
          { sourceId: INTERVIEW.id, by: OWNER },
        ],
        propose: [{ id: "FACT-CRAWLED-1", type: "Fact", key: "client.delivery_window", body: claim, sourceId: INTERVIEW.id, locator: loc }],
        accept: [{ nodeId: "FACT-CRAWLED-1", by: OWNER }],
        promote: [
          { id: "FACT-PROMOTED-1", body: claim, sourceId: INTERVIEW.id, locator: loc, by: OWNER },
          { id: "FACT-PROMOTED-2", body: claim, sourceId: INTERVIEW.id, locator: loc, by: "" },
        ],
      });
    },
    holds: (w) => {
      const fromInterview = w.nodes.filter((n) => n.sourceId === INTERVIEW.id);
      const promoted = w.node("FACT-PROMOTED-1");
      return (
        !w.sources.some((s) => s.kind === "customer_material" && s.queue === "accepted") &&
        w.sources.some((s) => s.id === TERMS.id) &&
        !fromInterview.some((n) => n.queue === "live" && !(n.promotedBy && n.locator)) &&
        promoted?.queue === "live" &&
        promoted.type === "Fact" &&
        promoted.promotedBy === OWNER &&
        promoted.sourceId === INTERVIEW.id &&
        Boolean(promoted.locator) &&
        !w.node("FACT-PROMOTED-2") &&
        !isLive(w, "FACT-CRAWLED-1")
      );
    },
    describe: (w) => `sources ${w.sources.map((s) => `${s.id}:${s.kind}:${s.queue}`).join(",")}; nodes ${w.nodes.filter((n) => n.type === "Fact").map((n) => `${n.id}:${n.queue}:${n.promotedBy ?? "-"}`).join(",")}`,
  },
  {
    checkId: "survives-the-builder",
    // 12. A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the graph store, the acceptances and the change
    // list run on the business's own account, with the knowledge owner named
    // on the exception desk as the second person who can explain it.
    world: world(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the business's own corpus, register ids and
// accepted library. This standard publishes no live port map yet, so run.mjs
// refuses a production run and the stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    // 13. The pass test passes. Proved by hand on the business's own systems.
    world: world(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];
