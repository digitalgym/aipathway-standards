// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/knowledge-base.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The knowledge-base world: a drive with files on it, a register with an owner
 * per source, an index that finds passages, and a watch that notices when a
 * file changes.
 *
 * WHY IT IS ITS OWN WORLD. The graph world starts from sources already known.
 * This one starts from the mess: files with no owner, two copies of one
 * manual, a client interview in the policy folder. The subject is the
 * inventory, and no other world holds a drive.
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. Nothing is enforced. A build may
 * index an unregistered file, name a team as an owner, put a client transcript
 * in the shared index, or return a composed paragraph from search. The world
 * records every one of those and the assertion catches it, because a world
 * that refused them would pass the exact builds the standard exists to catch.
 *
 * WHAT IT REFUSES TO MODEL. There is no port that answers a question. Search
 * returns passages; composing is Cited Answer's job over the graph. A build
 * that wants to answer from the knowledge base has no port to do it through
 * except by smuggling text into a passage, which the assertion reads.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const SOURCE_KINDS = ["instrument", "internal_rule", "template", "price_list", "contract", "customer_material"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** A file as it sits on the drive. What a build reads; never what it trusts. */
export interface DriveFile {
  path: string;
  system: "drive" | "mailbox" | "laptop" | "sharepoint";
  title: string;
  content: string;
  checksum: string;
  /** The edition printed on the cover, if the issuer prints one. */
  editionOnCover?: string;
  /** What the folder name suggests. A hint, and hints are wrong. */
  hintKind?: SourceKind;
}

export interface RegisterEntry {
  id: string;
  title: string;
  kind: SourceKind;
  owner: string;
  location: { system: DriveFile["system"]; path: string };
  edition?: string;
  checksum: string;
  retrievedAt: string;
  status: "current" | "superseded" | "duplicate_of" | "missing";
  duplicateOf?: string;
  /** Required for customer_material. Check 10. */
  accessList?: string[];
  expiresOn?: string;
  /** Previous checksums, kept so an edition can be recovered. Check 10. */
  supersededChecksums: string[];
}

export interface Passage {
  id: string;
  registerId: string | null;
  locator: string | null;
  text: string;
  /** Shared, or restricted to the access list on the entry. Check 5. */
  scope: "shared" | "restricted";
}

export interface SearchResult {
  passages: Array<{ passageId: string; registerId: string | null; locator: string | null; text: string }>;
  /** A build that composes an answer puts it here. The assertion reads it. Check 7. */
  composed: string | null;
}

export interface Gap {
  id: string;
  expected: string;
  owner: string;
  due: string;
}

export interface Notification {
  owner: string;
  registerId: string;
  detail: string;
  at: string;
}

export interface GraphHandover {
  registerId: string | null;
  edition?: string;
  checksum: string;
  locatorScheme: string;
}

export interface KnowledgeBasePorts {
  now(): Date;
  /** The drive as it is. Every file, including the ones that should not be there. */
  readDrive(): DriveFile[];
  /** Read one file again, for the watch. Null if it is gone. Check 9. */
  fetchFile(path: string): DriveFile | null;
  readRegister(): RegisterEntry[];
  /** What the business expects to hold, by title. The watch and the gap check read it. */
  readExpected(): string[];
  /** Write or update a register entry. Recorded as given; the assertion judges it. */
  writeEntry(entry: Omit<RegisterEntry, "retrievedAt" | "supersededChecksums"> & { supersededChecksums?: string[] }): RegisterEntry;
  indexPassage(passage: Omit<Passage, "id">): Passage;
  /** Find passages. Returns what the build hands back, composed text included. */
  search(query: string, results: SearchResult): SearchResult;
  raiseGap(input: { expected: string; owner: string; due: string }): Gap;
  notifyOwner(owner: string, registerId: string, detail: string): void;
  /** Hand a source to the graph. Check 11. */
  promoteToGraph(handover: GraphHandover): void;
  escalate(reason: string, detail?: string): void;
}

export interface KnowledgeBaseWorldOptions {
  now?: Date;
  drive?: DriveFile[];
  expected?: string[];
}

export class KnowledgeBaseWorld {
  readonly register: RegisterEntry[] = [];
  readonly passages: Passage[] = [];
  readonly searches: Array<{ query: string; result: SearchResult; at: string }> = [];
  readonly gaps: Gap[] = [];
  readonly notifications: Notification[] = [];
  readonly handovers: GraphHandover[] = [];
  readonly escalations: Array<{ reason: string; detail?: string }> = [];
  readonly calls: PortCall[] = [];

  private readonly drive: DriveFile[];
  private readonly expected: string[];
  private clock: Date;
  private seq = 0;

  constructor(opts: KnowledgeBaseWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-26T00:00:00.000Z");
    this.drive = (opts.drive ?? []).map((f) => ({ ...f }));
    this.expected = [...(opts.expected ?? [])];
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** The issuer replaces a file on the drive. The runner does this, never the build. Check 9. */
  replaceOnDrive(path: string, content: string, checksum: string, editionOnCover?: string): void {
    const f = this.drive.find((x) => x.path === path);
    if (f) {
      f.content = content;
      f.checksum = checksum;
      if (editionOnCover) f.editionOnCover = editionOnCover;
    }
  }

  /** Non-recording twins for the runner. */
  entry(id: string): RegisterEntry | undefined {
    return this.register.find((e) => e.id === id);
  }

  entryByChecksum(checksum: string): RegisterEntry[] {
    return this.register.filter((e) => e.checksum === checksum || e.supersededChecksums.includes(checksum));
  }

  driveFile(path: string): DriveFile | undefined {
    return this.drive.find((f) => f.path === path);
  }

  firstCall(port: Port, where?: (c: PortCall) => boolean): number {
    return this.calls.findIndex((c) => c.port === port && (!where || where(c)));
  }

  callsOf(port: Port, where?: (c: PortCall) => boolean): PortCall[] {
    return this.calls.filter((c) => c.port === port && (!where || where(c)));
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

  ports(): KnowledgeBasePorts {
    return {
      now: () => new Date(this.clock),

      readDrive: () => {
        const rows = this.drive.map((f) => ({ ...f }));
        this.record("read_file", { drive: true }, { files: rows.length });
        return rows;
      },

      fetchFile: (path) => {
        const f = this.drive.find((x) => x.path === path) ?? null;
        this.record("read_file", { fetch: path }, f ? { checksum: f.checksum } : null);
        return f ? { ...f } : null;
      },

      readRegister: () => {
        const rows = this.register.map((e) => ({ ...e, supersededChecksums: [...e.supersededChecksums] }));
        this.record("read_register", { register: true }, { entries: rows.length });
        return rows;
      },

      readExpected: () => {
        this.record("read_register", { expected: true }, { count: this.expected.length });
        return [...this.expected];
      },

      writeEntry: (input) => {
        const existing = this.register.find((e) => e.id === input.id);
        if (existing) {
          const changed = existing.checksum !== input.checksum;
          if (changed) existing.supersededChecksums.push(existing.checksum);
          Object.assign(existing, { ...input, supersededChecksums: existing.supersededChecksums });
          existing.retrievedAt = this.clock.toISOString();
          this.record("write_register", { id: input.id, update: true, checksum: input.checksum, status: input.status, owner: input.owner }, { changed });
          return { ...existing, supersededChecksums: [...existing.supersededChecksums] };
        }
        const entry: RegisterEntry = {
          ...input,
          retrievedAt: this.clock.toISOString(),
          supersededChecksums: [...(input.supersededChecksums ?? [])],
        };
        this.register.push(entry);
        this.record("write_register", { id: input.id, kind: input.kind, owner: input.owner, checksum: input.checksum, edition: input.edition ?? null, status: input.status, path: input.location.path }, { created: true });
        return { ...entry, supersededChecksums: [...entry.supersededChecksums] };
      },

      indexPassage: (input) => {
        const p: Passage = { id: `P${++this.seq}`, ...input };
        this.passages.push(p);
        this.record("index_passage", { registerId: input.registerId, locator: input.locator, scope: input.scope }, { id: p.id });
        return { ...p };
      },

      search: (query, results) => {
        const stored = { passages: results.passages.map((r) => ({ ...r })), composed: results.composed };
        this.searches.push({ query, result: stored, at: this.clock.toISOString() });
        this.record("search_index", { query }, { passages: stored.passages.length, composed: stored.composed !== null });
        return stored;
      },

      raiseGap: (input) => {
        const g: Gap = { id: `G${++this.seq}`, ...input };
        this.gaps.push(g);
        this.record("raise_task", input, { id: g.id });
        return { ...g };
      },

      notifyOwner: (owner, registerId, detail) => {
        this.notifications.push({ owner, registerId, detail, at: this.clock.toISOString() });
        this.record("notify", { owner, registerId, detail }, { ok: true });
      },

      promoteToGraph: (handover) => {
        this.handovers.push({ ...handover });
        this.record("write_node", { source: handover.registerId, edition: handover.edition ?? null, checksum: handover.checksum, locatorScheme: handover.locatorScheme }, { ok: true });
      },

      escalate: (reason, detail) => {
        this.escalations.push({ reason, ...(detail ? { detail } : {}) });
        this.record("escalate", { reason, detail }, { ok: true });
      },
    };
  }
}
