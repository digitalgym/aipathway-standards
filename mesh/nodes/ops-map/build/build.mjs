/**
 * Ops Map: one accepted map of how the business runs, built to
 * AIP-BS-KNOWLEDGE-GRAPH 2026-10-03.
 * https://aipathway.com.au/explore-ai/knowledge-graph-build-standard
 *
 * A port of "OS: Ontology Stack" by Damiano Redemagni, reimplemented from the
 * standard. Nothing here is taken from the original bot's prompt or
 * instructions; only its public one-line description was read.
 *
 * Narrowed to the graph layer. It keeps the graph of how the
 * business runs: each step in its own procedures (who approves a purchase
 * order, who signs off a site handover), the suppliers and sites those steps
 * name, and the procedure each fact was cut from. Where two accepted
 * procedures say different things about the same step, or a procedure is
 * replaced, it stops and names a person. It does not measure throughput or
 * decide how a bottleneck is fixed; it shows where the written process
 * contradicts itself or has moved, and who has to decide.
 *
 * What one run does, every time it is woken (document.received for a new
 * procedure or edition, schedule.tick, or exception.closed):
 *
 *   1. Read the key contract first. Nothing is proposed before it is read.
 *   2. Read the library. A source whose checksum moved gets a change delta
 *      with the computed list of every node built from it, and those nodes
 *      leave live until a person accepts the delta.
 *   3. Register new sources as instruments. Customer material is never a source.
 *   4. Record a person's source acceptances. No name, no acceptance.
 *   5. Propose extracted nodes, refusing any type the contract does not name
 *      and anything cut from a source nobody accepted.
 *   6. Record a person's node acceptances. A Clause or Fact needs a named
 *      person and a replayable locator. Scope is written as APPLIES_TO;
 *      a replacement is written as SUPERSEDES and the old node retires.
 *   7. Identity: an Entity carries the system of record's id, or two nodes are
 *      joined by a SAME_AS a person accepted. Never a merge by label.
 *   8. Promote a claim from customer material only when a person names it.
 *   9. Find live nodes that answer one step differently: CONFLICTS edge and a
 *      named person. The build never picks a winner.
 *  10. Answer "who owns this step" from live nodes only, citing node ids.
 *      The index may rank; it never answers. No live node, decline.
 *
 * Every effect goes through the ports. Nothing is kept between runs.
 */

/** The person named on an exception when the run is not told who owns the map. */
export const DEFAULT_OWNER = "the operations manager who owns the ops map";

const PROVENANCE_TYPES = new Set(["Clause", "Fact"]);

const inDate = (n, on) => {
  if (!on) return true;
  const t = new Date(on).getTime();
  if (n.effectiveFrom && new Date(n.effectiveFrom).getTime() > t) return false;
  if (n.effectiveTo && new Date(n.effectiveTo).getTime() < t) return false;
  return true;
};

const scopeOf = (n) => n.scope?.jurisdiction ?? null;

/**
 * @param {import("@aipathway/conformance").KnowledgeGraphPorts} ports
 * @param {object} [input] what woke this run: new sources, a person's decisions, questions
 */
export async function build(ports, input = {}) {
  const owner = input.owner ?? DEFAULT_OWNER;
  const raise = async (reason, detail) => ports.escalate(reason, JSON.stringify({ owner, ...detail }));

  // 1. The contract, before anything else.
  const contract = await ports.readContract();
  const nodeTypes = new Set(contract.nodeTypes);

  // 2. The library, and any edition that moved since the last run.
  let sources = await ports.readSources();
  for (const s of sources) {
    if (!s.pendingChecksum || s.pendingChecksum === s.checksum) continue;
    const all = await ports.readAll();
    const affected = all.filter((n) => n.sourceId === s.id && n.type !== "Source");
    const delta = await ports.replaceSource(s.id, s.pendingChecksum, affected.map((n) => n.id));
    for (const n of affected) {
      if (n.queue === "live" || n.queue === "conflict") await ports.retireNode(n.id, "change_pending");
    }
    await raise("change.delta_awaiting_person", { sourceId: s.id, deltaId: delta.id, affected: delta.affectedNodeIds });
  }

  // 3. New sources, as instruments. Customer material is held, never registered.
  for (const src of input.sources ?? []) {
    if (src.kind === "customer_material") {
      await raise("source.customer_material_held", { sourceId: src.id });
      continue;
    }
    const res = await ports.registerSource(src);
    if (!res.accepted) await raise("source.not_an_instrument", { sourceId: src.id, missing: res.missing });
  }
  sources = await ports.readSources();
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  // 4. A person's source acceptances.
  for (const d of input.sourceAcceptances ?? []) {
    const s = sourceById.get(d.id);
    if (!s || s.kind === "customer_material") {
      await raise("source.acceptance_refused", { sourceId: d.id, why: s ? "customer material is not a source" : "not a registered instrument" });
      continue;
    }
    if (!d.by) {
      await raise("source.acceptance_refused", { sourceId: d.id, why: "no named person" });
      continue;
    }
    if (!s.checksum) {
      await raise("source.acceptance_refused", { sourceId: d.id, why: "no checksum" });
      continue;
    }
    await ports.acceptSource(d.id, d.by);
  }
  sources = await ports.readSources();
  const accepted = new Set(sources.filter((s) => s.queue === "accepted").map((s) => s.id));

  // 5. Proposals from the extract run.
  for (const p of input.proposals ?? []) {
    if (!nodeTypes.has(p.type)) {
      await raise("extract.type_not_in_contract", { nodeId: p.id, type: p.type, contractVersion: contract.version });
      continue;
    }
    if (PROVENANCE_TYPES.has(p.type) && p.sourceId && !accepted.has(p.sourceId)) {
      await raise("extract.source_not_accepted", { nodeId: p.id, sourceId: p.sourceId });
      continue;
    }
    await ports.proposeNode(p);
  }

  // 6. A person's node acceptances.
  for (const d of input.nodeAcceptances ?? []) {
    const all = await ports.readAll();
    const n = all.find((x) => x.id === d.id);
    let why = null;
    if (!n) why = "no such proposed node";
    else if (!d.by) why = "no named person";
    else if (PROVENANCE_TYPES.has(n.type) && (!n.sourceId || !n.locator)) why = "no replayable locator";
    else if (n.sourceId && !accepted.has(n.sourceId)) why = "its source is not accepted into the library";
    if (why) {
      await raise("node.acceptance_refused", { nodeId: d.id, why });
      continue;
    }
    const res = await ports.acceptNode(d.id, d.by);
    if (!res.accepted) {
      await raise("node.acceptance_refused", { nodeId: d.id, why: res.why });
      continue;
    }
    if (scopeOf(n)) await ports.addEdge({ type: "APPLIES_TO", from: n.id, to: `jurisdiction:${scopeOf(n)}`, acceptedBy: d.by });
    if (n.supersedes) {
      await ports.addEdge({ type: "SUPERSEDES", from: n.id, to: n.supersedes, acceptedBy: d.by });
      await ports.retireNode(n.supersedes, "retired");
    }
  }

  // 7. Identity from the system of record.
  for (const r of input.register ?? []) {
    await ports.proposeNode({ id: `${r.system}:${r.externalId}`, type: "Entity", body: r.label, externalId: r.externalId, system: r.system });
  }
  for (const m of input.mentions ?? []) {
    const reg = (input.register ?? []).find((r) => m.externalId && r.externalId === m.externalId);
    if (reg) continue; // the mention carries the register's own id: one Entity, already written
    await ports.proposeNode({ id: m.id, type: "Entity", body: m.label, sourceId: m.sourceId, locator: m.locator });
    const decision = (input.identityDecisions ?? []).find((d) => d.from === m.id || d.to === m.id);
    if (decision?.by) {
      await ports.addEdge({ type: "SAME_AS", from: decision.from, to: decision.to, acceptedBy: decision.by });
    } else {
      await raise("identity.same_as_needed", { nodeId: m.id, label: m.label });
    }
  }

  // 8. A claim from customer material, promoted only by a named person.
  for (const c of input.promotions ?? []) {
    if (!c.by || !c.sourceId || !c.locator) {
      await raise("claim.promotion_refused", { nodeId: c.id, why: !c.by ? "no named person" : "no provenance" });
      continue;
    }
    await ports.promoteClaim(c);
  }

  // 9. Two live nodes answering one step differently: a written conflict and a person.
  const groups = new Map();
  for (const n of await ports.readLive()) {
    if (!n.key || !PROVENANCE_TYPES.has(n.type)) continue;
    const g = `${n.key}|${scopeOf(n) ?? "*"}`;
    groups.set(g, [...(groups.get(g) ?? []), n]);
  }
  for (const nodes of groups.values()) {
    if (new Set(nodes.map((n) => n.body)).size < 2) continue;
    for (let i = 1; i < nodes.length; i++) await ports.addEdge({ type: "CONFLICTS", from: nodes[0].id, to: nodes[i].id });
    const k = await ports.raiseConflict(nodes.map((n) => n.id), owner);
    await raise("graph.conflict_open", { conflictId: k.id, nodeIds: nodes.map((n) => n.id) });
  }

  // 10. Questions: live nodes only, node ids only.
  for (const q of input.questions ?? []) {
    // The index may rank candidates. It is never the answer and never required.
    const hits = await ports.readIndex(q.question);
    const rank = new Map(hits.filter((h) => h.nodeId).map((h, i) => [h.nodeId, i]));
    const live = (await ports.readLive()).filter((n) => n.key === q.key && inDate(n, q.askedAbout));
    const fit = live
      .filter((n) => (q.jurisdiction ? scopeOf(n) === q.jurisdiction : scopeOf(n) === null))
      .sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
    if (fit.length === 0) {
      await ports.answer({ question: q.question, jurisdiction: q.jurisdiction, text: null, nodeIds: [], route: "declined_no_live_node" });
      continue;
    }
    if (new Set(fit.map((n) => n.body)).size > 1) {
      for (let i = 1; i < fit.length; i++) await ports.addEdge({ type: "CONFLICTS", from: fit[0].id, to: fit[i].id });
      await ports.raiseConflict(fit.map((n) => n.id), owner);
      await ports.answer({ question: q.question, jurisdiction: q.jurisdiction, text: null, nodeIds: [], route: "declined_conflict" });
      continue;
    }
    await ports.answer({ question: q.question, jurisdiction: q.jurisdiction, text: fit[0].body, nodeIds: [fit[0].id], route: "live_graph" });
  }

  // What an earlier answer relied on: findable whatever the node's queue is now.
  for (const r of input.reliedOn ?? []) {
    const all = await ports.readAll();
    const found = all.filter((n) => r.nodeIds.includes(n.id));
    await ports.answer({
      question: `What did answer ${r.answerId} rely on?`,
      text: found.map((n) => `${n.id} (${n.queue})`).join("; ") || null,
      nodeIds: found.map((n) => n.id),
      route: "provenance_lookup",
    });
  }
}
