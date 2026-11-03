/**
 * One scenario per check of knowledge-graph-build-standard, for Ops Map.
 *
 * The corpus is a small Queensland fit-out business's own procedures: an
 * operations manual (purchasing and approvals), a site handover procedure, and
 * a supplier named in the manual and in Xero. Every `holds` reads the world the
 * runner owns (its recorded calls and the stores behind the ports), never the
 * build, and returns a strict true or false.
 *
 * Each scenario was run against a do-nothing build and against deliberately
 * broken builds (see the PR); every claimed check goes red for them.
 */

import { KnowledgeGraphWorld } from "@aipathway/conformance";

const OWNER = "Priya Shah, operations manager";
const ACCEPTOR = "Priya Shah";

const OPS_MANUAL = {
  id: "src-ops-manual",
  kind: "internal_rule",
  title: "Operations Manual: purchasing and approvals",
  issuer: "Harbour Fitouts Pty Ltd",
  edition: "v4.2 (July 2026)",
  jurisdiction: "QLD",
  effectiveFrom: "2026-07-01",
  checksum: "sha256:4f1c9a02",
  url: "https://example.sharepoint.com/ops/purchasing-v4.2.pdf",
};

const HANDOVER = {
  id: "src-handover",
  kind: "internal_rule",
  title: "Site handover procedure",
  issuer: "Harbour Fitouts Pty Ltd",
  edition: "v2.0 (March 2026)",
  jurisdiction: "QLD",
  effectiveFrom: "2026-03-01",
  checksum: "sha256:9b77d310",
  url: "https://example.sharepoint.com/ops/handover-v2.0.pdf",
};

const acceptedSource = (s) => ({ ...s, queue: "accepted", acceptedBy: ACCEPTOR, acceptedOn: "2026-09-01T00:00:00.000Z" });

const liveClause = (id, key, body, extra = {}) => ({
  id,
  type: "Clause",
  key,
  body,
  sourceId: OPS_MANUAL.id,
  locator: "p.6 s.3.2",
  queue: "live",
  acceptedBy: ACCEPTOR,
  acceptedOn: "2026-09-02T00:00:00.000Z",
  ...extra,
});

const PO_KEY = "step.po_over_5000.approver";
const PO_Q = { question: "Who approves a purchase order over $5,000 ex GST at the Brisbane site?", key: PO_KEY, jurisdiction: "QLD", askedAbout: "2026-09-26" };
const PO_CLAUSE = liveClause("cl-po-approver", PO_KEY, "Purchase orders over $5,000 ex GST are approved by the operations manager before release.", { scope: { jurisdiction: "QLD" } });

const indexFor = (nodeId) => [{ chunkId: "chunk-47", file: "purchasing-v4.2.pdf", text: "orders over $5,000 ... operations manager", nodeId }];

/** Calls on one port, in order. */
const callsOn = (world, port) => world.calls.filter((c) => c.port === port);

/** A refusal recorded anywhere the run can show it: the world's own refusal log or an escalation naming the id. */
const refusalRecorded = (world, log, id) =>
  log.some((r) => r.id === id) || world.escalations.some((e) => typeof e.detail === "string" && e.detail.includes(`"${id}"`) && /refused|not_in_contract|not_an_instrument/.test(e.reason));

/** Every live Clause or Fact carries provenance with a locator. */
const liveHaveProvenance = (world) => world.live().filter((n) => n.type === "Clause" || n.type === "Fact").every((n) => Boolean(n.sourceId) && Boolean(n.locator));

const liveAnswers = (world) => world.answers.filter((a) => a.route !== "provenance_lookup");

export const scenarios = [
  {
    checkId: "key-contract-before-extract",
    world: () => new KnowledgeGraphWorld({ sources: [acceptedSource(OPS_MANUAL)] }),
    drive: (b, world) =>
      b(world.ports(), {
        owner: OWNER,
        proposals: [
          { id: "cl-po-step", type: "Clause", key: PO_KEY, body: "Orders over $5,000 need the operations manager.", sourceId: OPS_MANUAL.id, locator: "p.6 s.3.2" },
          { id: "bn-po-step", type: "Bottleneck", key: PO_KEY, body: "Approvals queue behind one person.", sourceId: OPS_MANUAL.id, locator: "p.6 s.3.2" },
        ],
      }),
    holds: (world) => {
      const contractRead = world.firstCall("read_rule", (c) => c.request?.contract === true);
      const firstProposal = world.firstCall("write_node", (c) => "node" in (c.request ?? {}));
      const published = world.node("cl-po-step");
      return (
        contractRead >= 0 &&
        firstProposal >= 0 &&
        contractRead < firstProposal &&
        published?.queue === "proposed" &&
        world.node("bn-po-step") === undefined &&
        refusalRecorded(world, world.refusedNodes, "bn-po-step")
      );
    },
    describe: (world) => `${world.calls.length} port call(s); nodes ${world.nodes.map((n) => `${n.id}:${n.queue}`).join(", ") || "none"}`,
  },
  {
    checkId: "source-is-an-instrument",
    world: () => new KnowledgeGraphWorld(),
    drive: (b, world) =>
      b(world.ports(), {
        owner: OWNER,
        sources: [OPS_MANUAL, { id: "src-drive-link", kind: "internal_rule", title: "Purchasing (shared drive)", url: "https://example.sharepoint.com/ops/purchasing.pdf" }],
        sourceAcceptances: [{ id: "src-drive-link", by: ACCEPTOR }],
      }),
    holds: (world) => {
      const full = world.sources.find((s) => s.id === OPS_MANUAL.id);
      const bareRefusal = world.refusedSources.find((r) => r.id === "src-drive-link");
      return (
        full?.queue === "proposed" &&
        world.sources.every((s) => s.id !== "src-drive-link") &&
        bareRefusal !== undefined &&
        ["edition", "checksum", "issuer"].every((f) => bareRefusal.missing.includes(f)) &&
        world.sources.filter((s) => s.queue === "accepted").every((s) => Boolean(s.checksum))
      );
    },
    describe: (world) => `sources ${world.sources.map((s) => `${s.id}:${s.queue}`).join(", ") || "none"}; refused ${JSON.stringify(world.refusedSources)}`,
  },
  {
    checkId: "nothing-live-without-acceptance",
    world: () => new KnowledgeGraphWorld({ sources: [acceptedSource(OPS_MANUAL)] }),
    drive: (b, world) =>
      b(world.ports(), {
        owner: OWNER,
        proposals: [
          { id: "cl-named", type: "Clause", key: PO_KEY, body: "Orders over $5,000 need the operations manager.", sourceId: OPS_MANUAL.id, locator: "p.6 s.3.2" },
          { id: "cl-nameless", type: "Clause", key: "step.po_under_5000.approver", body: "Orders under $5,000 need a supervisor.", sourceId: OPS_MANUAL.id, locator: "p.6 s.3.1" },
          { id: "cl-no-locator", type: "Clause", key: "step.po.release", body: "Released orders are emailed from Xero.", sourceId: OPS_MANUAL.id },
        ],
        nodeAcceptances: [
          { id: "cl-named", by: ACCEPTOR },
          { id: "cl-nameless" },
          { id: "cl-no-locator", by: ACCEPTOR },
        ],
      }),
    holds: (world) => {
      const live = world.live();
      return (
        live.length === 1 &&
        live[0].id === "cl-named" &&
        live[0].acceptedBy === ACCEPTOR &&
        refusalRecorded(world, world.refusedAcceptances, "cl-nameless") &&
        refusalRecorded(world, world.refusedAcceptances, "cl-no-locator") &&
        liveHaveProvenance(world)
      );
    },
    describe: (world) => `live ${world.live().map((n) => n.id).join(", ") || "none"}; refused ${JSON.stringify(world.refusedAcceptances)}; ${world.escalations.length} escalation(s)`,
  },
  {
    checkId: "production-reads-live-nodes",
    world: () => new KnowledgeGraphWorld({ sources: [acceptedSource(OPS_MANUAL)], nodes: [PO_CLAUSE], index: indexFor(PO_CLAUSE.id) }),
    drive: (b, world) => b(world.ports(), { owner: OWNER, questions: [PO_Q] }),
    holds: (world) => {
      const a = liveAnswers(world);
      const liveIds = new Set(world.live().map((n) => n.id));
      return (
        a.length === 1 &&
        a[0].outcome === "answered" &&
        a[0].nodeIds.length > 0 &&
        a[0].nodeIds.every((id) => liveIds.has(id)) &&
        a[0].otherCitations.length === 0 &&
        callsOn(world, "cite").length === 1
      );
    },
    describe: (world) => `answers ${JSON.stringify(world.answers.map((a) => ({ outcome: a.outcome, nodeIds: a.nodeIds, other: a.otherCitations })))}`,
  },
  {
    checkId: "identity-from-the-system-of-record",
    world: () => new KnowledgeGraphWorld({ sources: [acceptedSource(OPS_MANUAL)] }),
    drive: (b, world) =>
      b(world.ports(), {
        owner: OWNER,
        // The Xero contact for the supplier the manual names in full.
        register: [{ system: "xero", externalId: "c7a1e2f0-5d3b-4e8a-9f21-0b6c2d4e8a11", label: "Coastal Steel" }],
        mentions: [{ id: "ent-coastal-steel-manual", label: "Coastal Steel Supplies Pty Ltd", sourceId: OPS_MANUAL.id, locator: "p.9 s.5.1" }],
        identityDecisions: [{ from: "ent-coastal-steel-manual", to: "xero:c7a1e2f0-5d3b-4e8a-9f21-0b6c2d4e8a11", by: ACCEPTOR }],
      }),
    holds: (world) => {
      const CRM = "c7a1e2f0-5d3b-4e8a-9f21-0b6c2d4e8a11";
      const entities = world.nodes.filter((n) => n.type === "Entity");
      const carrying = entities.filter((n) => n.externalId === CRM);
      const oneNode = entities.length === 1 && carrying.length === 1;
      const joined =
        entities.length === 2 &&
        carrying.length === 1 &&
        world.edges.some(
          (e) =>
            e.type === "SAME_AS" &&
            Boolean(e.acceptedBy) &&
            [e.from, e.to].includes(carrying[0].id) &&
            [e.from, e.to].includes(entities.find((n) => n !== carrying[0]).id),
        );
      return oneNode || joined;
    },
    describe: (world) => `entities ${JSON.stringify(world.nodes.filter((n) => n.type === "Entity").map((n) => ({ id: n.id, externalId: n.externalId ?? null })))}; edges ${JSON.stringify(world.edges)}`,
  },
  {
    checkId: "scope-is-an-edge",
    world: () =>
      new KnowledgeGraphWorld({
        sources: [acceptedSource(OPS_MANUAL)],
        nodes: [
          liveClause("cl-handover-qld", "step.site_handover.signoff", "Site handover in Queensland is signed off by the site supervisor and the QBCC licence holder.", { scope: { jurisdiction: "QLD" } }),
          liveClause("cl-handover-any", "step.site_handover.signoff", "Site handover is signed off by the project manager."),
        ],
      }),
    drive: (b, world) =>
      b(world.ports(), { owner: OWNER, questions: [{ question: "Who signs off a site handover in Queensland?", key: "step.site_handover.signoff", jurisdiction: "QLD", askedAbout: "2026-09-26" }] }),
    holds: (world) => {
      const a = liveAnswers(world);
      return a.length === 1 && a[0].outcome === "answered" && a[0].nodeIds.length === 1 && a[0].nodeIds[0] === "cl-handover-qld";
    },
    describe: (world) => `answers ${JSON.stringify(world.answers.map((a) => ({ outcome: a.outcome, nodeIds: a.nodeIds })))}`,
  },
  {
    checkId: "supersedes-and-conflicts-are-written",
    world: () =>
      new KnowledgeGraphWorld({
        sources: [acceptedSource(OPS_MANUAL), acceptedSource(HANDOVER)],
        nodes: [
          liveClause("cl-po-old", "step.po_over_10000.approver", "Orders over $10,000 are approved by the director."),
          liveClause("cl-variation-ops", "step.variation.approver", "Client variations are approved by the operations manager.", { scope: { jurisdiction: "QLD" } }),
          liveClause("cl-variation-handover", "step.variation.approver", "Client variations are approved by the project manager on site.", { scope: { jurisdiction: "QLD" }, sourceId: HANDOVER.id, locator: "p.3 s.2.4" }),
        ],
      }),
    drive: (b, world) =>
      b(world.ports(), {
        owner: OWNER,
        proposals: [
          { id: "cl-po-new", type: "Clause", key: "step.po_over_10000.approver", body: "Orders over $10,000 are approved by the operations manager and countersigned by the director.", sourceId: OPS_MANUAL.id, locator: "p.6 s.3.3", supersedes: "cl-po-old" },
        ],
        nodeAcceptances: [{ id: "cl-po-new", by: ACCEPTOR }],
        questions: [{ question: "Who approves a client variation at a Queensland site?", key: "step.variation.approver", jurisdiction: "QLD", askedAbout: "2026-09-26" }],
      }),
    holds: (world) => {
      const pair = ["cl-variation-ops", "cl-variation-handover"];
      const conflictEdge = world.edges.some((e) => e.type === "CONFLICTS" && pair.includes(e.from) && pair.includes(e.to) && e.from !== e.to);
      const escalatedToPerson = callsOn(world, "escalate").some(
        (c) => Array.isArray(c.request?.nodeIds) && pair.every((id) => c.request.nodeIds.includes(id)) && typeof c.request.person === "string" && c.request.person.length > 0,
      );
      const picked = world.conflicts.some((k) => k.pick !== undefined && !k.decidedBy);
      const citedEither = world.answers.some((a) => a.nodeIds.some((id) => pair.includes(id)));
      return (
        world.node("cl-po-old")?.queue !== "live" &&
        world.node("cl-po-new")?.queue === "live" &&
        world.edges.some((e) => e.type === "SUPERSEDES" && e.from === "cl-po-new" && e.to === "cl-po-old") &&
        conflictEdge &&
        escalatedToPerson &&
        !picked &&
        !citedEither &&
        pair.every((id) => world.node(id)?.queue !== "live")
      );
    },
    describe: (world) => `queues ${world.nodes.map((n) => `${n.id}:${n.queue}`).join(", ")}; edges ${JSON.stringify(world.edges)}; conflicts ${JSON.stringify(world.conflicts)}`,
  },
  {
    checkId: "change-computes-affected-nodes",
    world: () =>
      new KnowledgeGraphWorld({
        sources: [acceptedSource(OPS_MANUAL), acceptedSource(HANDOVER)],
        nodes: [
          PO_CLAUSE,
          liveClause("cl-po-release", "step.po.release", "Released orders are emailed from Xero by the purchasing officer.", { locator: "p.7 s.3.4" }),
          { id: "pa-ops-6", type: "Passage", body: "3.2 Orders over $5,000 ...", sourceId: OPS_MANUAL.id, locator: "p.6 s.3.2", queue: "proposed" },
          liveClause("cl-handover-qld", "step.site_handover.signoff", "Site handover in Queensland is signed off by the site supervisor.", { sourceId: HANDOVER.id, locator: "p.2 s.1.1", scope: { jurisdiction: "QLD" } }),
        ],
      }),
    drive: async (b, world) => {
      await b(world.ports(), { owner: OWNER, questions: [PO_Q] });
      world.advance(86_400_000);
      world.newEdition(OPS_MANUAL.id, "sha256:77e0b5c4");
      await b(world.ports(), { owner: OWNER });
    },
    holds: (world) => {
      const truth = world.builtFrom(OPS_MANUAL.id).sort();
      const delta = world.deltas.find((d) => d.sourceId === OPS_MANUAL.id);
      if (!delta) return false;
      const listed = [...delta.affectedNodeIds].sort();
      return (
        truth.length === 3 &&
        listed.length === truth.length &&
        listed.every((id, i) => id === truth[i]) &&
        truth.every((id) => world.node(id)?.queue !== "live") &&
        world.node("cl-handover-qld")?.queue === "live" &&
        world.answered.length === 1
      );
    },
    describe: (world) => `deltas ${JSON.stringify(world.deltas)}; queues ${world.nodes.map((n) => `${n.id}:${n.queue}`).join(", ")}`,
  },
  {
    checkId: "queues-are-states",
    world: () => new KnowledgeGraphWorld({ sources: [acceptedSource(OPS_MANUAL)], nodes: [PO_CLAUSE] }),
    drive: async (b, world) => {
      await b(world.ports(), { owner: OWNER, questions: [PO_Q] });
      const first = world.answers[0];
      world.retire(PO_CLAUSE.id);
      await b(world.ports(), { owner: OWNER, questions: [PO_Q], reliedOn: first ? [{ answerId: first.id, nodeIds: first.nodeIds }] : [] });
    },
    holds: (world) => {
      const a = liveAnswers(world);
      const lookup = world.answers.find((x) => x.route === "provenance_lookup");
      return (
        a.length === 2 &&
        a[0].nodeIds.includes(PO_CLAUSE.id) &&
        !a[1].nodeIds.includes(PO_CLAUSE.id) &&
        a[1].outcome === "declined" &&
        lookup !== undefined &&
        lookup.nodeIds.includes(PO_CLAUSE.id) &&
        world.node(PO_CLAUSE.id)?.queue === "retired"
      );
    },
    describe: (world) => `answers ${JSON.stringify(world.answers.map((a) => ({ route: a.route ?? null, outcome: a.outcome, nodeIds: a.nodeIds })))}`,
  },
  {
    checkId: "index-proposes-only",
    world: () => new KnowledgeGraphWorld({ sources: [acceptedSource(OPS_MANUAL)], nodes: [PO_CLAUSE], index: indexFor(PO_CLAUSE.id) }),
    drive: async (b, world) => {
      await b(world.ports(), { owner: OWNER, questions: [PO_Q] });
      world.detachIndex();
      await b(world.ports(), {
        owner: OWNER,
        questions: [PO_Q, { question: "Who approves overtime for apprentices?", key: "step.overtime.approver", jurisdiction: "QLD", askedAbout: "2026-09-26" }],
      });
    },
    holds: (world) => {
      const a = liveAnswers(world);
      if (a.length !== 3) return false;
      const [before, after, uncovered] = a;
      return (
        before.outcome === "answered" &&
        before.nodeIds.length === 1 &&
        before.otherCitations.length === 0 &&
        after.outcome === "answered" &&
        after.nodeIds.length === 1 &&
        after.nodeIds[0] === before.nodeIds[0] &&
        after.otherCitations.length === 0 &&
        uncovered.outcome === "declined" &&
        uncovered.nodeIds.length === 0 &&
        uncovered.text === null
      );
    },
    describe: (world) => `answers ${JSON.stringify(world.answers.map((a) => ({ outcome: a.outcome, nodeIds: a.nodeIds, other: a.otherCitations })))}`,
  },
  {
    checkId: "customer-material-is-not-a-source",
    world: () =>
      new KnowledgeGraphWorld({
        sources: [
          acceptedSource(OPS_MANUAL),
          // Picked up from the same project folder by a crawler.
          { id: "src-client-interview", kind: "customer_material", title: "Client debrief, Kangaroo Point fit-out", issuer: "client", edition: "2026-08-14", jurisdiction: "QLD", effectiveFrom: "2026-08-14", checksum: "sha256:0c3e11aa", queue: "proposed" },
        ],
      }),
    drive: (b, world) =>
      b(world.ports(), {
        owner: OWNER,
        sourceAcceptances: [{ id: "src-client-interview", by: "folder sync" }],
        proposals: [
          { id: "fa-crawled", type: "Fact", key: "step.variation.approver", body: "The client's project manager approves variations.", sourceId: "src-client-interview", locator: "00:12:40-00:13:05" },
        ],
        nodeAcceptances: [{ id: "fa-crawled", by: "folder sync" }],
        promotions: [
          { id: "fa-promoted", body: "Variations on this client's sites go to their project manager for written approval before work starts.", sourceId: "src-client-interview", locator: "00:12:40-00:13:05", by: ACCEPTOR },
        ],
      }),
    holds: (world) => {
      const cm = new Set(world.sources.filter((s) => s.kind === "customer_material").map((s) => s.id));
      const promoted = world.node("fa-promoted");
      const liveFromCm = world.live().filter((n) => n.sourceId && cm.has(n.sourceId));
      return (
        world.sources.filter((s) => s.kind === "customer_material").every((s) => s.queue !== "accepted") &&
        promoted?.queue === "live" &&
        promoted.promotedBy === ACCEPTOR &&
        Boolean(promoted.sourceId) &&
        Boolean(promoted.locator) &&
        liveFromCm.every((n) => Boolean(n.promotedBy) && Boolean(n.sourceId) && Boolean(n.locator)) &&
        world.node("fa-crawled")?.queue !== "live"
      );
    },
    describe: (world) => `sources ${world.sources.map((s) => `${s.id}:${s.kind}:${s.queue}`).join(", ")}; nodes ${world.nodes.map((n) => `${n.id}:${n.queue}`).join(", ") || "none"}`,
  },
  {
    checkId: "survives-the-builder",
    // A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the graph, the acceptances and the change list
    // run on the business's own Microsoft 365 or Workspace tenant.
    world: () => new KnowledgeGraphWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// The pass test runs on the business's own corpus and register. This standard
// publishes no live port map, so run.mjs refuses a production run and the stub
// reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new KnowledgeGraphWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];
