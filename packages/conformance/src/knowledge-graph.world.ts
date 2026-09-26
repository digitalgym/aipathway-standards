// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/knowledge-graph.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The knowledge-graph world: a versioned key contract, sources that are
 * instruments, nodes that reach live only through a named person, and an
 * index that may propose and must never be the store.
 *
 * WHY IT IS ITS OWN WORLD. The clause library in `cited-answer.world.ts` holds
 * clauses that answer. This one holds the thing UNDER that: where a clause came
 * from, who accepted it, what it supersedes, what it applies to, and what
 * breaks when the source is replaced. Cited Answer asks "is there a live
 * clause"; this world can be asked "which nodes were built from page 14".
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. Three refusals are enforced,
 * because without them a conforming build and a careless one leave the same
 * trace: a node of a type the contract does not name, a source with no
 * edition or checksum, and an acceptance with no name. Everything else is
 * recorded and judged by the assertion: an answer that cites a filename, a
 * clause still live after its source moved, a delta with a guessed list, a
 * merge by label. The world could correct each of those, and a world that did
 * would pass the exact failures the standard exists to catch.
 *
 * WHAT IT REFUSES TO MODEL. Nothing here composes prose. The `answer` port
 * stores what the build claims and which nodes it says it used; the standard
 * for the words is Cited Answer. There is no port that promotes a node to live
 * on confidence, because check 3 says confidence is not acceptance.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const NODE_TYPES = ["Source", "Passage", "Clause", "Concept", "Entity", "Fact", "Change"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const EDGE_TYPES = ["CONTAINS", "EXTRACTS", "SUPERSEDES", "DEFINES", "APPLIES_TO", "SAME_AS", "CONFLICTS", "DERIVES"] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const NODE_QUEUES = ["proposed", "live", "conflict", "change_pending", "retired"] as const;
export type NodeQueue = (typeof NODE_QUEUES)[number];

export const SOURCE_KINDS = ["instrument", "internal_rule", "customer_material"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface KeyContract {
  version: string;
  nodeTypes: readonly NodeType[];
  edgeTypes: readonly EdgeType[];
  /** What a Source must carry to be an instrument rather than a file path. Check 2. */
  requiredSourceFields: readonly string[];
}

export const CONTRACT: KeyContract = {
  version: "1.0",
  nodeTypes: NODE_TYPES,
  edgeTypes: EDGE_TYPES,
  requiredSourceFields: ["title", "issuer", "edition", "jurisdiction", "effectiveFrom", "checksum"],
};

export interface SourceInput {
  id: string;
  kind: SourceKind;
  title: string;
  issuer?: string;
  edition?: string;
  jurisdiction?: string;
  effectiveFrom?: string;
  checksum?: string;
  url?: string;
}

export interface Source extends SourceInput {
  queue: "proposed" | "accepted" | "retired" | "rejected";
  acceptedBy?: string;
  acceptedOn?: string;
  /** A new edition has landed and its checksum differs. The build owes a delta. Check 8. */
  pendingChecksum?: string;
}

export interface NodeInput {
  id: string;
  type: NodeType | string;
  body: string;
  /** The system of record's id, for an Entity. Labels are not ids. Check 5. */
  externalId?: string;
  /** Provenance. A Clause or Fact with none cannot reach live. Check 3. */
  sourceId?: string;
  locator?: string;
  /** Scope, as data the APPLIES_TO edge will carry. Check 6. */
  scope?: { jurisdiction?: string; product?: string };
}

export interface GraphNode extends NodeInput {
  queue: NodeQueue;
  acceptedBy?: string;
  acceptedOn?: string;
  /** Set when promoted from customer material by a person. Check 11. */
  promotedBy?: string;
}

export interface Edge {
  type: EdgeType;
  from: string;
  to: string;
  acceptedBy?: string;
}

export interface ChangeDelta {
  id: string;
  sourceId: string;
  oldChecksum: string;
  newChecksum: string;
  /** What the build says is affected. The assertion compares it to the truth. Check 8. */
  affectedNodeIds: string[];
  at: string;
}

export interface Conflict {
  id: string;
  nodeIds: string[];
  decidedBy?: string;
  pick?: string;
}

/** A chunk the index would return. A filename and a hash, never a node. */
export interface IndexHit {
  chunkId: string;
  file: string;
  text: string;
  /** The node the chunk was cut for, if the build wants to look it up. */
  nodeId?: string;
}

export interface GraphAnswer {
  id: string;
  question: string;
  jurisdiction?: string;
  outcome: "answered" | "declined";
  text: string | null;
  /** What the build cited. Node ids are the only conforming citation. */
  nodeIds: string[];
  /** Anything else the build cited: filenames, chunk ids, hashes. Check 4. */
  otherCitations: string[];
  route?: string;
  at: string;
}

export interface KnowledgeGraphPorts {
  now(): Date;
  /** The key contract, versioned. Check 1. */
  readContract(): KeyContract;
  /** Every registered source, with any pending edition. Check 8's trigger. */
  readSources(): Source[];
  /** Register a source as an instrument. Refused when required fields are missing. Check 2. */
  registerSource(input: SourceInput): { accepted: boolean; missing: string[] };
  /** Accept a source into the library. Refused without a named person. */
  acceptSource(sourceId: string, by?: string): boolean;
  /** Propose a node. Refused when the type is not in the contract. Check 1. */
  proposeNode(input: NodeInput): { accepted: boolean; why?: string };
  /** Accept a proposed node as live. Refused without a name or without provenance. Check 3. */
  acceptNode(nodeId: string, by?: string): { accepted: boolean; why?: string };
  /** Write an edge. SAME_AS needs a named acceptance; the rest are recorded as given. Checks 5 and 7. */
  addEdge(edge: Edge): { accepted: boolean; why?: string };
  /** Move a node out of live. The build does this on supersession and on a change. */
  retireNode(nodeId: string, to: "retired" | "change_pending"): void;
  /** Live nodes, with their scope. The build filters; the assertion judges what it cited. Checks 4 and 6. */
  readLive(): GraphNode[];
  /** Every node, whatever its queue. For "what did that answer rely on". Check 9. */
  readAll(): GraphNode[];
  /** The index. Chunks with filenames. Empty when detached. Check 10. */
  readIndex(question: string): IndexHit[];
  /** Replace a source's content. The build names what it believes is affected. Check 8. */
  replaceSource(sourceId: string, newChecksum: string, affectedNodeIds: string[]): ChangeDelta;
  /** Two live nodes disagree. Routed to a person, never averaged. Check 7. */
  raiseConflict(nodeIds: string[], person: string): Conflict;
  resolveConflict(conflictId: string, by: string, pick: string): void;
  /** A person promotes a claim from customer material into a Fact with provenance. Check 11. */
  promoteClaim(input: { id: string; body: string; sourceId: string; locator: string; by: string }): GraphNode;
  /** Answer, or decline, naming the nodes used. Check 4, 6, 9, 10. */
  answer(input: { question: string; jurisdiction?: string; text: string | null; nodeIds: string[]; otherCitations?: string[]; route?: string }): GraphAnswer;
  escalate(reason: string, detail?: string): void;
}

export interface KnowledgeGraphWorldOptions {
  now?: Date;
  sources?: Source[];
  nodes?: GraphNode[];
  edges?: Edge[];
  index?: IndexHit[];
}

export class KnowledgeGraphWorld {
  readonly sources: Source[];
  readonly nodes: GraphNode[];
  readonly edges: Edge[];
  readonly deltas: ChangeDelta[] = [];
  readonly conflicts: Conflict[] = [];
  readonly answers: GraphAnswer[] = [];
  readonly refusedSources: Array<{ id: string; missing: string[] }> = [];
  readonly refusedNodes: Array<{ id: string; why: string }> = [];
  readonly refusedAcceptances: Array<{ id: string; why: string }> = [];
  readonly refusedEdges: Array<{ edge: Edge; why: string }> = [];
  readonly escalations: Array<{ reason: string; detail?: string }> = [];
  readonly calls: PortCall[] = [];

  private index: IndexHit[];
  private detached = false;
  private clock: Date;
  private seq = 0;

  constructor(opts: KnowledgeGraphWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-26T00:00:00.000Z");
    this.sources = (opts.sources ?? []).map((s) => ({ ...s }));
    this.nodes = (opts.nodes ?? []).map((n) => ({ ...n, scope: n.scope ? { ...n.scope } : undefined }));
    this.edges = (opts.edges ?? []).map((e) => ({ ...e }));
    this.index = (opts.index ?? []).map((h) => ({ ...h }));
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** A new edition of a source lands. The runner does this, never the build. Check 8. */
  newEdition(sourceId: string, checksum: string): void {
    const s = this.sources.find((x) => x.id === sourceId);
    if (s) s.pendingChecksum = checksum;
  }

  /** A person retires a node. The runner does this for check 9's stimulus. */
  retire(nodeId: string): void {
    const n = this.nodes.find((x) => x.id === nodeId);
    if (n) n.queue = "retired";
  }

  /** Pull the index and the weights. Check 10's stimulus. */
  detachIndex(): void {
    this.detached = true;
    this.index = [];
  }

  /** Non-recording twins for the runner. */
  live(): GraphNode[] {
    return this.nodes.filter((n) => n.queue === "live");
  }

  node(id: string): GraphNode | undefined {
    return this.nodes.find((n) => n.id === id);
  }

  /** The truth check 8 compares a delta against: every node built from that source. */
  builtFrom(sourceId: string): string[] {
    return this.nodes.filter((n) => n.sourceId === sourceId && n.type !== "Source").map((n) => n.id);
  }

  get answered(): GraphAnswer[] {
    return this.answers.filter((a) => a.outcome === "answered");
  }

  get declined(): GraphAnswer[] {
    return this.answers.filter((a) => a.outcome === "declined");
  }

  firstCall(port: Port, where?: (c: PortCall) => boolean): number {
    return this.calls.findIndex((c) => c.port === port && (!where || where(c)));
  }

  private record(port: Port, request: unknown, response: unknown): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({
      at: this.clock.toISOString(),
      port,
      verb: shape.verb,
      subject: shape.subject,
      request,
      response,
    });
  }

  ports(): KnowledgeGraphPorts {
    return {
      now: () => new Date(this.clock),

      readContract: () => {
        this.record("read_rule", { contract: true }, { version: CONTRACT.version, nodeTypes: CONTRACT.nodeTypes.length });
        return { ...CONTRACT };
      },

      readSources: () => {
        const rows = this.sources.map((x) => ({ ...x }));
        this.record("read_rule", { sources: true }, { count: rows.length, pending: rows.filter((r) => r.pendingChecksum).map((r) => r.id) });
        return rows;
      },

      registerSource: (input) => {
        const missing = CONTRACT.requiredSourceFields.filter((f) => !(input as unknown as Record<string, unknown>)[f]);
        if (missing.length > 0) {
          this.refusedSources.push({ id: input.id, missing });
          this.record("write_node", { source: input.id, kind: input.kind }, { accepted: false, missing });
          return { accepted: false, missing };
        }
        this.sources.push({ ...input, queue: "proposed" });
        this.record("write_node", { source: input.id, kind: input.kind, checksum: input.checksum }, { accepted: true, queue: "proposed" });
        return { accepted: true, missing: [] };
      },

      acceptSource: (sourceId, by) => {
        const s = this.sources.find((x) => x.id === sourceId);
        if (!by || !s) {
          this.refusedAcceptances.push({ id: sourceId, why: by ? "no such source" : "no named person" });
          this.record("gate", { acceptSource: sourceId }, { accepted: false });
          return false;
        }
        s.queue = "accepted";
        s.acceptedBy = by;
        s.acceptedOn = this.clock.toISOString();
        this.record("gate", { acceptSource: sourceId, by, kind: s.kind }, { accepted: true });
        return true;
      },

      proposeNode: (input) => {
        if (!(CONTRACT.nodeTypes as readonly string[]).includes(input.type)) {
          const why = `type ${input.type} is not in the contract`;
          this.refusedNodes.push({ id: input.id, why });
          this.record("write_node", { node: input.id, type: input.type }, { accepted: false, why });
          return { accepted: false, why };
        }
        this.nodes.push({ ...input, type: input.type as NodeType, queue: "proposed", scope: input.scope ? { ...input.scope } : undefined });
        this.record("write_node", { node: input.id, type: input.type, sourceId: input.sourceId ?? null, locator: input.locator ?? null }, { accepted: true, queue: "proposed" });
        return { accepted: true };
      },

      acceptNode: (nodeId, by) => {
        const n = this.nodes.find((x) => x.id === nodeId);
        let why: string | undefined;
        if (!n) why = "no such node";
        else if (!by) why = "no named person";
        else if ((n.type === "Clause" || n.type === "Fact") && (!n.sourceId || !n.locator)) why = "no replayable provenance";
        if (why) {
          this.refusedAcceptances.push({ id: nodeId, why });
          this.record("gate", { acceptNode: nodeId, by: by ?? null }, { accepted: false, why });
          return { accepted: false, why };
        }
        n!.queue = "live";
        n!.acceptedBy = by;
        n!.acceptedOn = this.clock.toISOString();
        this.record("gate", { acceptNode: nodeId, by }, { accepted: true });
        return { accepted: true };
      },

      addEdge: (edge) => {
        if (edge.type === "SAME_AS" && !edge.acceptedBy) {
          const why = "SAME_AS needs a named acceptance";
          this.refusedEdges.push({ edge: { ...edge }, why });
          this.record("write_node", { edge: edge.type, from: edge.from, to: edge.to }, { accepted: false, why });
          return { accepted: false, why };
        }
        this.edges.push({ ...edge });
        this.record("write_node", { edge: edge.type, from: edge.from, to: edge.to, acceptedBy: edge.acceptedBy ?? null }, { accepted: true });
        return { accepted: true };
      },

      retireNode: (nodeId, to) => {
        const n = this.nodes.find((x) => x.id === nodeId);
        if (n) n.queue = to;
        this.record("write_node", { retire: nodeId, to }, { done: Boolean(n) });
      },

      readLive: () => {
        const rows = this.live().map((n) => ({ ...n }));
        this.record("read_node", { live: true }, { count: rows.length });
        return rows;
      },

      readAll: () => {
        const rows = this.nodes.map((n) => ({ ...n }));
        this.record("read_node", { all: true }, { count: rows.length });
        return rows;
      },

      readIndex: (question) => {
        const hits = this.detached ? [] : this.index.map((h) => ({ ...h }));
        this.record("read_node", { index: question, detached: this.detached }, { hits: hits.length });
        return hits;
      },

      replaceSource: (sourceId, newChecksum, affectedNodeIds) => {
        const s = this.sources.find((x) => x.id === sourceId);
        const delta: ChangeDelta = {
          id: `Δ${++this.seq}`,
          sourceId,
          oldChecksum: s?.checksum ?? "",
          newChecksum,
          affectedNodeIds: [...affectedNodeIds],
          at: this.clock.toISOString(),
        };
        if (s) {
          s.checksum = newChecksum;
          delete s.pendingChecksum;
        }
        this.deltas.push(delta);
        this.record("write_node", { replaceSource: sourceId, newChecksum, affected: affectedNodeIds }, { delta: delta.id });
        return { ...delta };
      },

      raiseConflict: (nodeIds, person) => {
        const c: Conflict = { id: `K${++this.seq}`, nodeIds: [...nodeIds] };
        this.conflicts.push(c);
        for (const id of nodeIds) {
          const n = this.nodes.find((x) => x.id === id);
          if (n && n.queue === "live") n.queue = "conflict";
        }
        this.record("escalate", { conflict: c.id, nodeIds, person }, { ok: true });
        return { ...c };
      },

      resolveConflict: (conflictId, by, pick) => {
        const c = this.conflicts.find((x) => x.id === conflictId);
        if (c) {
          c.decidedBy = by;
          c.pick = pick;
          for (const id of c.nodeIds) {
            const n = this.nodes.find((x) => x.id === id);
            if (n) n.queue = id === pick ? "live" : "retired";
          }
        }
        this.record("gate", { resolveConflict: conflictId, by, pick }, { done: Boolean(c) });
      },

      promoteClaim: (input) => {
        const node: GraphNode = {
          id: input.id,
          type: "Fact",
          body: input.body,
          sourceId: input.sourceId,
          locator: input.locator,
          queue: "live",
          acceptedBy: input.by,
          acceptedOn: this.clock.toISOString(),
          promotedBy: input.by,
        };
        this.nodes.push(node);
        this.record("gate", { promote: input.id, sourceId: input.sourceId, by: input.by }, { queue: "live" });
        return { ...node };
      },

      answer: (input) => {
        const usable = input.text !== null && (input.nodeIds.length > 0 || (input.otherCitations ?? []).length > 0);
        const stored: GraphAnswer = {
          id: `A${++this.seq}`,
          question: input.question,
          ...(input.jurisdiction ? { jurisdiction: input.jurisdiction } : {}),
          outcome: usable ? "answered" : "declined",
          text: usable ? input.text : null,
          nodeIds: [...input.nodeIds],
          otherCitations: [...(input.otherCitations ?? [])],
          ...(input.route ? { route: input.route } : {}),
          at: this.clock.toISOString(),
        };
        this.answers.push(stored);
        this.record("answer", { question: input.question, jurisdiction: input.jurisdiction ?? null, nodes: input.nodeIds.length, other: stored.otherCitations.length }, { id: stored.id, outcome: stored.outcome });
        if (stored.nodeIds.length > 0 || stored.otherCitations.length > 0) {
          this.record("cite", { answerId: stored.id }, { nodeIds: stored.nodeIds, other: stored.otherCitations });
        }
        return { ...stored };
      },

      escalate: (reason, detail) => {
        this.escalations.push({ reason, ...(detail ? { detail } : {}) });
        this.record("escalate", { reason, detail }, { ok: true });
      },
    };
  }
}
