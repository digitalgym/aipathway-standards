// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/inbox-triage.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The inbox world: a shared mailbox, the jobs and suppliers it is about, a
 * queue table with an owner and a clock per kind, and the people who may
 * release a reply.
 *
 * WHY IT IS ITS OWN WORLD. The payables world holds a bill matched against a
 * PO; the job-to-ledger world holds a job that has been done. This one holds
 * a message that has not been read yet, with a thread it may already belong
 * to and an attachment that may be the artefact another standard reads.
 * Forcing it into either would have hidden the two things this standard is
 * about: the filing and the release.
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. One thing is enforced: a task
 * raised with an existing item id updates that item rather than creating
 * another, and a task raised without one creates a new item even when the
 * thread already has one, because that is the duplicate check 8 exists to
 * catch. Everything else is recorded and judged by the assertion: a
 * free-text kind, a filing into a folder, a reply with no release, a trashed
 * message, a complaint the machine answered.
 *
 * WHAT THE PORTS CANNOT DO. There is no port that composes a reply body from
 * the message. A build that wants to send a substantive reply has to carry
 * the words a person released.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const MESSAGE_KINDS = [
  "supplier_invoice",
  "quote_request",
  "job_update",
  "statement",
  "complaint",
  "remittance",
  "spam",
  "other",
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export interface Attachment {
  hash: string;
  name: string;
}

export interface Message {
  id: string;
  thread_id: string;
  from: string;
  received_at: string;
  subject: string;
  body_ref: string;
  /** A content hash of the raw message. What quarantine files it under. */
  hash: string;
  attachments: Attachment[];
}

/**
 * What the runner seeds: the message plus the truth the assertion judges by.
 * `kind` and `about` are never handed to the build.
 */
export interface SeededMessage extends Message {
  kind: MessageKind;
  /** The record this message is genuinely about, when there is one. */
  about?: string;
}

export interface Classification {
  message_id: string;
  /** Recorded as given: a free-text kind is stored so the assertion can fail it. */
  kind: string;
  confidence: number;
  classified_at: string;
}

export type ItemStatus = "open" | "answered" | "escalated" | "quarantined";

export interface Item {
  id: string;
  thread_id: string;
  kind: string;
  record_ref: string | null;
  owner: string;
  due: string;
  status: ItemStatus;
  message_ids: string[];
  created_at: string;
}

export interface Acknowledgement {
  item_id: string;
  sent_at: string;
  promised_by: string;
}

export interface Release {
  item_id: string;
  person: string;
  at: string;
}

export interface Evidence {
  hash: string;
  message_id: string;
  record_ref: string;
}

/** Where a message was put. `record` is the only conforming destination for a matched message. */
export type Filing =
  | { to: "record"; recordRef: string }
  | { to: "quarantine"; hash: string }
  | { to: "folder"; folder: string }
  | { to: "trash" };

export interface FilingRecord {
  message_id: string;
  filing: Filing;
  at: string;
}

export interface Outbound {
  id: string;
  item_id: string;
  kind: "acknowledgement" | "reply";
  to: string;
  body: string | null;
  promised_by: string | null;
  at: string;
}

export interface Escalation {
  item_id: string;
  to: string;
  reason: "complaint" | "past_clock" | "no_queue" | "other";
  with_message: boolean;
  at: string;
}

/** The queue for one kind: who owns it, who they answer to, how long it may wait. */
export interface Queue {
  kind: MessageKind;
  owner: string;
  manager: string;
  clockHours: number;
}

/** A job or supplier the business already has a record for. */
export interface RecordRef {
  ref: string;
  kind: "job" | "supplier";
  name: string;
  /** How a message finds it. In production this is the job system's own search. */
  match: { subjectContains?: string; fromDomain?: string };
}

/** A person's decision, sitting in the world: they have released these words for this thread. */
export interface Approval {
  thread_id: string;
  person: string;
  body: string;
}

export interface MessageRecord {
  message: Message;
  classification: Classification | null;
  item: Item | null;
  filing: FilingRecord | null;
  evidence: Evidence[];
  outbound: Array<Outbound & { released_by: string | null }>;
  releases: Release[];
}

export interface InboxPorts {
  now(): Date;
  /** Messages nobody has classified yet. Check 1. */
  readInbox(): Message[];
  /** The queue table: a kind, an owner, a manager, a clock. Checks 4 and 7. */
  readQueues(): Queue[];
  /** Every item that is not answered or quarantined. Check 7. */
  readItems(): Item[];
  /** The item already raised for a thread, if any. Read before raising. Check 8. */
  readItemForThread(threadId: string): Item | null;
  /** Releases a person has made, waiting to be sent. Check 6. */
  readApprovals(): Approval[];
  /** The record by message. Check 10. */
  readRecord(messageId: string): MessageRecord | null;
  /** The jobs and suppliers the business has records for. Check 2. */
  readRecords(): RecordRef[];
  /** Give a message its kind. Recorded as given, on or off the list. Check 1. */
  classify(messageId: string, kind: string, confidence: number): void;
  /** Put the message somewhere. Only `record` conforms for a matched message. Checks 2, 8, 9. */
  fileMessage(messageId: string, filing: Filing): void;
  /** File an attachment as the artefact. Check 3. */
  attachEvidence(input: { hash: string; messageId: string; recordRef: string }): void;
  /**
   * Raise or update an item. With `itemId`, adds the message to that item.
   * Without it, creates a new item even if the thread already has one.
   */
  raiseTask(input: {
    itemId?: string;
    messageId: string;
    threadId: string;
    kind: string;
    recordRef: string | null;
    owner: string;
    due: string;
    status?: ItemStatus;
  }): Item;
  /** The one automatic outbound: a person will reply, and by when. Check 6. */
  acknowledge(itemId: string, promisedBy: string): void;
  /** A substantive reply. Recorded whether or not a release preceded it. Check 6. */
  reply(itemId: string, body: string): void;
  /** A named person's release for an item. Check 6. */
  release(itemId: string, person: string): void;
  /** Hand an item to a person. Checks 5 and 7. */
  escalate(input: { itemId: string; to: string; reason: Escalation["reason"]; message?: Message }): void;
}

export interface InboxWorldOptions {
  now?: Date;
  messages?: SeededMessage[];
  queues?: Queue[];
  records?: RecordRef[];
  approvals?: Approval[];
}

export class InboxWorld {
  readonly classifications: Classification[] = [];
  readonly items: Item[] = [];
  readonly filings: FilingRecord[] = [];
  readonly evidence: Evidence[] = [];
  readonly acknowledgements: Acknowledgement[] = [];
  readonly releases: Release[] = [];
  readonly outbound: Outbound[] = [];
  readonly escalations: Escalation[] = [];
  readonly calls: PortCall[] = [];

  private readonly messages: SeededMessage[];
  private readonly trashed = new Set<string>();
  private readonly queues: Queue[];
  private readonly records: RecordRef[];
  private readonly approvals: Approval[];
  private clock: Date;
  private seq = 0;

  constructor(opts: InboxWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-26T00:00:00.000Z");
    this.messages = (opts.messages ?? []).map((m) => this.copyMessage(m));
    this.queues = (opts.queues ?? []).map((q) => ({ ...q }));
    this.records = (opts.records ?? []).map((r) => ({ ...r, match: { ...r.match } }));
    this.approvals = (opts.approvals ?? []).map((a) => ({ ...a }));
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** A message lands. The runner does this, never the build. */
  arrive(message: SeededMessage): void {
    this.messages.push(this.copyMessage({ ...message, received_at: message.received_at || this.clock.toISOString() }));
  }

  /** A person releases words for a thread. The runner does this, never the build. */
  approve(approval: Approval): void {
    this.approvals.push({ ...approval });
  }

  /** Non-recording twins for the runner. */
  seeded(): SeededMessage[] {
    return this.messages.map((m) => this.copyMessage(m));
  }

  seededMessage(id: string): SeededMessage | undefined {
    return this.messages.find((m) => m.id === id);
  }

  /** The message as a person could still find it. Undefined once trashed. Check 9. */
  stored(id: string): Message | undefined {
    const m = this.messages.find((x) => x.id === id);
    return m && !this.trashed.has(id) ? this.strip(m) : undefined;
  }

  classificationsFor(messageId: string): Classification[] {
    return this.classifications.filter((c) => c.message_id === messageId);
  }

  itemsForThread(threadId: string): Item[] {
    return this.items.filter((i) => i.thread_id === threadId);
  }

  itemForMessage(messageId: string): Item | undefined {
    return this.items.find((i) => i.message_ids.includes(messageId));
  }

  filingFor(messageId: string): FilingRecord | undefined {
    return this.filings.find((f) => f.message_id === messageId);
  }

  outboundFor(itemId: string): Outbound[] {
    return this.outbound.filter((o) => o.item_id === itemId);
  }

  releasesFor(itemId: string): Release[] {
    return this.releases.filter((r) => r.item_id === itemId);
  }

  queueFor(kind: string): Queue | undefined {
    return this.queues.find((q) => q.kind === kind);
  }

  /** Everyone the business knows: queue owners, managers and anyone who approved. */
  people(): string[] {
    const names = new Set<string>();
    for (const q of this.queues) {
      names.add(q.owner);
      names.add(q.manager);
    }
    for (const a of this.approvals) names.add(a.person);
    return [...names];
  }

  recordOf(messageId: string): MessageRecord | null {
    const m = this.messages.find((x) => x.id === messageId);
    if (!m) return null;
    const item = this.itemForMessage(messageId) ?? null;
    const releases = item ? this.releasesFor(item.id) : [];
    return {
      message: this.strip(m),
      classification: this.classificationsFor(messageId)[0] ?? null,
      item: item ? this.copyItem(item) : null,
      filing: this.filingFor(messageId) ?? null,
      evidence: this.evidence.filter((e) => e.message_id === messageId).map((e) => ({ ...e })),
      outbound: item
        ? this.outboundFor(item.id).map((o) => ({
            ...o,
            released_by: releases.filter((r) => r.at <= o.at).map((r) => r.person)[0] ?? null,
          }))
        : [],
      releases: releases.map((r) => ({ ...r })),
    };
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

  private copyMessage(m: SeededMessage): SeededMessage {
    return { ...m, attachments: m.attachments.map((a) => ({ ...a })) };
  }

  /** The message without the runner's truth on it. */
  private strip(m: SeededMessage): Message {
    const rest = { ...m } as Partial<SeededMessage>;
    delete rest.kind;
    delete rest.about;
    return { ...(rest as Message), attachments: m.attachments.map((a) => ({ ...a })) };
  }

  private copyItem(i: Item): Item {
    return { ...i, message_ids: [...i.message_ids] };
  }

  ports(): InboxPorts {
    return {
      now: () => new Date(this.clock),

      readInbox: () => {
        const rows = this.messages
          .filter((m) => !this.trashed.has(m.id) && this.classificationsFor(m.id).length === 0)
          .map((m) => this.strip(m));
        this.record("read_inbox", { unclassified: true }, { count: rows.length, ids: rows.map((m) => m.id) });
        return rows;
      },

      readQueues: () => {
        this.record("read_inbox", { queues: true }, { kinds: this.queues.map((q) => q.kind) });
        return this.queues.map((q) => ({ ...q }));
      },

      readItems: () => {
        const rows = this.items.filter((i) => i.status === "open" || i.status === "escalated");
        this.record("read_inbox", { items: true }, { count: rows.length });
        return rows.map((i) => this.copyItem(i));
      },

      readItemForThread: (threadId) => {
        const item = this.itemsForThread(threadId)[0] ?? null;
        this.record("read_inbox", { thread: threadId }, item ? { itemId: item.id } : null);
        return item ? this.copyItem(item) : null;
      },

      readApprovals: () => {
        this.record("read_inbox", { approvals: true }, { count: this.approvals.length });
        return this.approvals.map((a) => ({ ...a }));
      },

      readRecord: (messageId) => {
        const rec = this.recordOf(messageId);
        this.record(
          "read_inbox",
          { record: messageId },
          rec
            ? {
                kind: rec.classification?.kind ?? null,
                recordRef: rec.item?.record_ref ?? null,
                owner: rec.item?.owner ?? null,
                due: rec.item?.due ?? null,
                outbound: rec.outbound.map((o) => `${o.kind} by ${o.released_by ?? "machine"}`),
              }
            : null,
        );
        return rec;
      },

      readRecords: () => {
        this.record("read_job", { records: true }, { count: this.records.length });
        return this.records.map((r) => ({ ...r, match: { ...r.match } }));
      },

      classify: (messageId, kind, confidence) => {
        this.classifications.push({ message_id: messageId, kind, confidence, classified_at: this.clock.toISOString() });
        this.record("file_message", { classify: messageId, kind, confidence }, { onList: (MESSAGE_KINDS as readonly string[]).includes(kind) });
      },

      fileMessage: (messageId, filing) => {
        const exists = this.messages.some((m) => m.id === messageId);
        if (exists) {
          this.filings.push({ message_id: messageId, filing: { ...filing }, at: this.clock.toISOString() });
          if (filing.to === "trash") this.trashed.add(messageId);
        }
        this.record("file_message", { messageId, ...filing }, { ok: exists });
      },

      attachEvidence: (input) => {
        this.evidence.push({ hash: input.hash, message_id: input.messageId, record_ref: input.recordRef });
        this.record("evidence", { ...input }, { ok: true });
      },

      raiseTask: (input) => {
        if (input.itemId) {
          const existing = this.items.find((i) => i.id === input.itemId);
          if (existing) {
            if (!existing.message_ids.includes(input.messageId)) existing.message_ids.push(input.messageId);
            if (input.status) existing.status = input.status;
            this.record("raise_task", { update: existing.id, messageId: input.messageId }, { itemId: existing.id, messages: existing.message_ids.length });
            return this.copyItem(existing);
          }
        }
        const id = `ITEM${++this.seq}`;
        const item: Item = {
          id,
          thread_id: input.threadId,
          kind: input.kind,
          record_ref: input.recordRef,
          owner: input.owner,
          due: input.due,
          status: input.status ?? "open",
          message_ids: [input.messageId],
          created_at: this.clock.toISOString(),
        };
        this.items.push(item);
        this.record(
          "raise_task",
          { messageId: input.messageId, threadId: input.threadId, kind: input.kind, recordRef: input.recordRef, owner: input.owner, due: input.due, status: item.status },
          { itemId: id },
        );
        return this.copyItem(item);
      },

      acknowledge: (itemId, promisedBy) => {
        const item = this.items.find((i) => i.id === itemId);
        const to = item ? this.messages.find((m) => m.id === item.message_ids[0])?.from ?? "unknown" : "unknown";
        const at = this.clock.toISOString();
        this.acknowledgements.push({ item_id: itemId, sent_at: at, promised_by: promisedBy });
        this.outbound.push({ id: `OUT${++this.seq}`, item_id: itemId, kind: "acknowledgement", to, body: null, promised_by: promisedBy, at });
        this.record("notify", { acknowledge: itemId, promisedBy }, { to, ok: Boolean(item) });
      },

      reply: (itemId, body) => {
        const item = this.items.find((i) => i.id === itemId);
        const to = item ? this.messages.find((m) => m.id === item.message_ids[0])?.from ?? "unknown" : "unknown";
        const at = this.clock.toISOString();
        if (item && item.status === "open") item.status = "answered";
        this.outbound.push({ id: `OUT${++this.seq}`, item_id: itemId, kind: "reply", to, body, promised_by: null, at });
        this.record("notify", { reply: itemId, body }, { to, ok: Boolean(item) });
      },

      release: (itemId, person) => {
        const item = this.items.find((i) => i.id === itemId);
        this.releases.push({ item_id: itemId, person, at: this.clock.toISOString() });
        this.record("gate", { release: itemId, person }, { ok: Boolean(item) });
      },

      escalate: (input) => {
        const item = this.items.find((i) => i.id === input.itemId);
        if (item) item.status = "escalated";
        this.escalations.push({
          item_id: input.itemId,
          to: input.to,
          reason: input.reason,
          with_message: Boolean(input.message && input.message.body_ref),
          at: this.clock.toISOString(),
        });
        this.record("escalate", { itemId: input.itemId, to: input.to, reason: input.reason, withMessage: Boolean(input.message) }, { ok: Boolean(item) });
      },
    };
  }
}
