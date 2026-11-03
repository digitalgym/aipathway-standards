/**
 * Fact Library: one read-only company knowledge graph that every bot in the
 * fleet asks, instead of each bot keeping its own copy of the policies, price
 * lists, supplier terms and procedures.
 *
 * Built to AIP-BS-KNOWLEDGE-GRAPH 2026-10-03
 * (https://aipathway.com.au/explore-ai/knowledge-graph-build-standard), written
 * from the standard alone. A reimplementation: nothing is taken from the public
 * bot that inspired it beyond its one-line public description.
 *
 * READ-ONLY TO THE FLEET. Other bots only ask. They name a concept key from the
 * key contract (for example "supplier.payment_terms") and, where it matters, a
 * state or territory, and get back an answer that cites live node ids, or a
 * decline. Nothing a fleet bot says ever becomes a node. Only this library,
 * acting on a named person's acceptance, moves anything to live.
 *
 * HOW IT IS WOKEN. One run handles what the record hands it:
 *   - document.received: a new source landed in the watched library folder.
 *                        It is registered as an instrument (or refused, with
 *                        the missing fields named) and its passages proposed.
 *   - exception.closed:  a named person acted on the library register:
 *                        accepted a source, accepted a node, accepted a
 *                        supersession, a SAME_AS or a conflict pick, or
 *                        promoted a claim. Passed in as the inputs below.
 *   - schedule.tick:     the change watch. Read the sources, find any whose
 *                        checksum moved, write the delta with the computed
 *                        list of affected nodes, move them to change_pending,
 *                        and raise an exception to the knowledge owner.
 *   - a fleet question:  `questions` below. Answered from live nodes only.
 *
 * Every outside effect goes through the ports. Nothing is kept between runs:
 * sources, nodes, edges, deltas and answers live in the graph store and its
 * register; exceptions on the exception desk.
 *
 * @param {import("@aipathway/conformance").KnowledgeGraphPorts} ports
 * @param {{
 *   owner?: string,
 *   sources?: Array<import("@aipathway/conformance").SourceInput>,
 *   acceptSources?: Array<{ sourceId: string, by?: string }>,
 *   propose?: Array<import("@aipathway/conformance").NodeInput & { key?: string }>,
 *   accept?: Array<{ nodeId: string, by?: string }>,
 *   supersede?: Array<{ newId: string, oldId: string, by?: string }>,
 *   entities?: Array<{ id: string, label: string, system?: string, externalId?: string, sourceId?: string, locator?: string }>,
 *   sameAs?: Array<{ from: string, to: string, by?: string }>,
 *   resolve?: Array<{ conflictId: string, by?: string, pick: string }>,
 *   promote?: Array<{ id: string, body: string, sourceId?: string, locator?: string, by?: string, key?: string }>,
 *   tick?: boolean,
 *   questions?: Array<{ question: string, key: string, jurisdiction?: string }>,
 *   reliedOn?: Array<{ answerId: string, nodeIds: string[] }>,
 *   openException?: (recordId: string) => null | { owner: string },
 * }} [input]
 */
export async function build(ports, input = {}) {
  const owner = input.owner ?? "the knowledge owner named on the exception desk";
  const halted = (id) => Boolean(input.openException?.(id));
  const out = { answers: [], lookups: [] };

  // Check 1. The contract is read before anything is written, every run.
  const contract = await ports.readContract();
  const nodeTypes = new Set(contract.nodeTypes);
  const required = contract.requiredSourceFields;

  // Check 2. A source is an instrument or it is not registered at all.
  for (const s of input.sources ?? []) {
    if (halted(s.id)) continue;
    if (s.kind === "customer_material") {
      // Check 11. Client files sit in the same drive; that does not make them policy.
      await ports.escalate("kg.customer_material_not_a_source", `${s.id}: customer material is not a source; a named person may promote one claim from it (${owner})`);
      continue;
    }
    const missing = required.filter((f) => !present(s[f]));
    if (missing.length > 0) {
      await ports.escalate("kg.source_not_an_instrument", `${s.id}: not registered, missing ${missing.join(", ")} (${owner})`);
      continue;
    }
    const r = await ports.registerSource(s);
    if (!r.accepted) await ports.escalate("kg.source_not_an_instrument", `${s.id}: refused by the register, missing ${r.missing.join(", ")} (${owner})`);
  }

  // A person accepts a source into the library. Never customer material, never nameless.
  for (const a of input.acceptSources ?? []) {
    const src = (await ports.readSources()).find((x) => x.id === a.sourceId);
    if (!src) {
      await ports.escalate("kg.acceptance_refused", `${a.sourceId}: no registered source by that id (${owner})`);
      continue;
    }
    if (src.kind === "customer_material") {
      await ports.escalate("kg.customer_material_not_a_source", `${a.sourceId}: customer material cannot be accepted as a source (${owner})`);
      continue;
    }
    if (!named(a.by)) {
      await ports.escalate("kg.acceptance_refused", `${a.sourceId}: a source needs a named person to accept it (${owner})`);
      continue;
    }
    if (!present(src.checksum)) {
      await ports.escalate("kg.acceptance_refused", `${a.sourceId}: no checksum, so a replacement could not be detected (${owner})`);
      continue;
    }
    await ports.acceptSource(a.sourceId, a.by.trim());
  }

  // Proposals onto the key contract. Proposed is invisible to every answer.
  const sources = await ports.readSources();
  for (const n of input.propose ?? []) {
    if (!nodeTypes.has(n.type)) {
      await ports.escalate("kg.type_not_in_contract", `${n.id}: type ${n.type} is not in key contract ${contract.version}; refused, the passage keeps it (${owner})`);
      continue;
    }
    const src = sources.find((x) => x.id === n.sourceId);
    if (n.sourceId && (!src || src.kind === "customer_material")) {
      await ports.escalate("kg.no_registered_source", `${n.id}: ${n.sourceId} is not a registered source; not proposed (${owner})`);
      continue;
    }
    await ports.proposeNode(n);
  }

  // Check 5. Identity comes from the system of record, or a person says SAME_AS.
  for (const e of input.entities ?? []) {
    if (present(e.externalId) && present(e.system)) {
      await ports.proposeNode({ id: e.id, type: "Entity", body: e.label, externalId: e.externalId, system: e.system });
      continue;
    }
    const pair = (input.sameAs ?? []).find((s) => s.from === e.id || s.to === e.id);
    if (!pair || !named(pair.by)) {
      // A label with no register id is not an entity until a person joins it to one.
      await ports.escalate("kg.identity_unconfirmed", `${e.id} "${e.label}": no system-of-record id and no accepted SAME_AS; left in the passage (${owner})`);
      continue;
    }
    await ports.proposeNode({ id: e.id, type: "Entity", body: e.label, ...(e.sourceId ? { sourceId: e.sourceId, locator: e.locator } : {}) });
  }
  for (const s of input.sameAs ?? []) {
    if (!named(s.by)) {
      await ports.escalate("kg.identity_unconfirmed", `SAME_AS ${s.from} ~ ${s.to}: needs a named person; not written (${owner})`);
      continue;
    }
    await ports.addEdge({ type: "SAME_AS", from: s.from, to: s.to, acceptedBy: s.by.trim() });
  }

  // Check 3. Live only with a named acceptance and a replayable locator.
  for (const a of input.accept ?? []) await acceptOne(ports, a, owner);

  // Check 7. Supersession is a written edge, accepted by a person.
  for (const s of input.supersede ?? []) {
    const ok = await acceptOne(ports, { nodeId: s.newId, by: s.by }, owner);
    if (!ok) continue;
    await ports.addEdge({ type: "SUPERSEDES", from: s.newId, to: s.oldId, acceptedBy: s.by.trim() });
    await ports.retireNode(s.oldId, "retired");
  }

  // A person's pick on a conflict. The library never picks.
  for (const r of input.resolve ?? []) {
    if (!named(r.by)) {
      await ports.escalate("kg.conflict_needs_person", `${r.conflictId}: a conflict is resolved by a named person only (${owner})`);
      continue;
    }
    await ports.resolveConflict(r.conflictId, r.by.trim(), r.pick);
  }

  // Check 11. A claim from customer material becomes a Fact only when a named
  // person promotes it, and it keeps its provenance.
  for (const p of input.promote ?? []) {
    if (!named(p.by) || !present(p.sourceId) || !present(p.locator)) {
      await ports.escalate("kg.promotion_refused", `${p.id}: a promoted claim needs a named person and a replayable locator (${owner})`);
      continue;
    }
    await ports.promoteClaim({ id: p.id, body: p.body, sourceId: p.sourceId, locator: p.locator, by: p.by.trim() });
  }

  // Check 8. The change watch.
  if (input.tick) await changeWatch(ports, owner);

  // Checks 4, 6, 7, 10. The fleet asks; the library answers from live nodes.
  for (const q of input.questions ?? []) out.answers.push(await answerOne(ports, q, owner));

  // Check 9. What did an earlier answer rely on, whatever its queue now.
  for (const r of input.reliedOn ?? []) {
    const all = await ports.readAll();
    const ids = new Set(r.nodeIds);
    out.lookups.push({ answerId: r.answerId, nodes: all.filter((n) => ids.has(n.id)).map((n) => ({ id: n.id, queue: n.queue, sourceId: n.sourceId, locator: n.locator })) });
  }
  return out;
}

async function acceptOne(ports, a, owner) {
  const node = (await ports.readAll()).find((n) => n.id === a.nodeId);
  let why;
  if (!node) why = "no such node";
  else if (!named(a.by)) why = "no named person";
  else if ((node.type === "Clause" || node.type === "Fact") && (!present(node.sourceId) || !present(node.locator))) why = "no replayable locator";
  else if (node.sourceId) {
    const src = (await ports.readSources()).find((s) => s.id === node.sourceId);
    if (!src || src.queue !== "accepted") why = "its source is not accepted into the library";
  }
  if (why) {
    await ports.escalate("kg.acceptance_refused", `${a.nodeId}: ${why}; stays proposed (${owner})`);
    return false;
  }
  const r = await ports.acceptNode(a.nodeId, a.by.trim());
  if (!r.accepted) {
    await ports.escalate("kg.acceptance_refused", `${a.nodeId}: ${r.why} (${owner})`);
    return false;
  }
  // Check 6. Scope is written as an APPLIES_TO edge, never implied.
  if (node.scope?.jurisdiction) await ports.addEdge({ type: "APPLIES_TO", from: node.id, to: `concept-jurisdiction-${node.scope.jurisdiction}` });
  if (node.scope?.product) await ports.addEdge({ type: "APPLIES_TO", from: node.id, to: `concept-product-${node.scope.product}` });
  return true;
}

async function changeWatch(ports, owner) {
  const sources = await ports.readSources();
  for (const s of sources) {
    if (!s.pendingChecksum || s.pendingChecksum === s.checksum) continue;
    const affected = (await ports.readAll()).filter((n) => n.sourceId === s.id && n.type !== "Source").map((n) => n.id);
    const delta = await ports.replaceSource(s.id, s.pendingChecksum, affected);
    for (const id of affected) await ports.retireNode(id, "change_pending");
    await ports.escalate(
      "kg.change_pending",
      `${s.id} moved (${delta.oldChecksum} -> ${delta.newChecksum}), delta ${delta.id}: ${affected.join(", ") || "no nodes"} wait for a named person to accept the delta (${owner})`,
    );
  }
}

async function answerOne(ports, q, owner) {
  // The index may rank. It is never the store and never a citation.
  const hits = await ports.readIndex(q.question);
  const live = await ports.readLive();
  let candidates = live.filter((n) => (n.type === "Clause" || n.type === "Fact") && n.key === q.key);
  // Check 6. A scoped question takes scoped nodes only; an unscoped node cannot answer it.
  candidates = q.jurisdiction
    ? candidates.filter((n) => n.scope?.jurisdiction === q.jurisdiction)
    : candidates.filter((n) => !n.scope?.jurisdiction);
  const rank = new Map(hits.map((h, i) => [h.nodeId, i]));
  candidates.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));

  const bodies = new Set(candidates.map((n) => n.body.trim()));
  if (candidates.length > 1 && bodies.size > 1) {
    // Check 7. Two live nodes disagree: write the edge, name a person, decline.
    const ids = candidates.map((n) => n.id);
    for (let i = 1; i < ids.length; i++) await ports.addEdge({ type: "CONFLICTS", from: ids[0], to: ids[i] });
    await ports.raiseConflict(ids, owner);
    return ports.answer({ question: q.question, ...(q.jurisdiction ? { jurisdiction: q.jurisdiction } : {}), text: null, nodeIds: [], route: `conflict between ${ids.join(", ")}, with ${owner}` });
  }
  if (candidates.length === 0) {
    await ports.escalate("kg.not_covered", `"${q.question}" (${q.key}${q.jurisdiction ? `, ${q.jurisdiction}` : ""}): no live node covers it (${owner})`);
    return ports.answer({ question: q.question, ...(q.jurisdiction ? { jurisdiction: q.jurisdiction } : {}), text: null, nodeIds: [], route: owner });
  }
  const node = candidates[0];
  return ports.answer({ question: q.question, ...(q.jurisdiction ? { jurisdiction: q.jurisdiction } : {}), text: node.body, nodeIds: [node.id] });
}

const present = (v) => typeof v === "string" && v.trim().length > 0;
const named = (v) => present(v);
