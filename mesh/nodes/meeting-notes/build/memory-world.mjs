/**
 * The stub world for Meeting Notes: a practice's client memory list, its
 * practice-management jobs, the approval surface, the inbox the meeting notes
 * land in, the drafts other steps hold for a person, and the exception desk.
 *
 * The runner owns all of it. The build reaches it only through ports(), and
 * every port call is recorded in `calls` with the snake_case port name the
 * standard's checks use (read_inbox, propose_memory, write_memory, read_rule,
 * escalate, read_memory, draft_message, read_job, read_contacts,
 * publish_report). Nothing here decides a verdict; it only records.
 *
 * Runner side only: deliver(), advance(), seedItem(). A build never calls them.
 */

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

export class MemoryWorld {
  constructor({ now = "2026-11-03T23:00:00.000Z", jobs = [], items = [], approvers = [], exceptions = [] } = {}) {
    this.clock = new Date(now);
    this.jobs = jobs.map(clone);
    this.items = [];
    this.approvers = [...approvers];
    this.exceptions = exceptions.map(clone);
    this.inbox = [];
    this.drafts = [];
    this.reports = [];
    this.calls = [];
    this.runs = 0;
    this.seq = 0;
    for (const it of items) this.seedItem(it);
  }

  // ── runner side ──────────────────────────────────────────────────────────

  advance(ms) {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** Put something in the inbox: a meeting note, a decision, a draft coming due, a review coming due. */
  deliver(entry) {
    this.inbox.push({ ...clone(entry), delivered: false });
  }

  /** An item already on the list before the scenario starts (written by a person, earlier). */
  seedItem(item) {
    const it = { status: "approved", version: 1, supersedes: null, superseded_by: null, ...clone(item) };
    this.items.push(it);
    return it;
  }

  item(id) {
    return this.items.find((i) => i.id === id) ?? null;
  }

  // ── recorder ─────────────────────────────────────────────────────────────

  record(port, verb, subject, request, response) {
    this.calls.push({ at: this.clock.toISOString(), port, verb, subject, request: clone(request), response: clone(response) });
    return response;
  }

  /** Hand this to the build. It is the only door. */
  ports() {
    this.runs += 1;
    return {
      now: () => new Date(this.clock),

      /** box "incoming": undelivered entries, marked delivered. box "drafts": the held drafts log. */
      readInbox: (box = "incoming") => {
        if (box === "drafts") {
          return clone(this.record("read_inbox", "read", "drafts", { box }, this.drafts));
        }
        const fresh = this.inbox.filter((e) => !e.delivered);
        for (const e of fresh) e.delivered = true;
        return clone(this.record("read_inbox", "read", "incoming", { box }, fresh.map(({ delivered, ...e }) => e)));
      },

      readJob: (jobId) => {
        const job = this.jobs.find((j) => j.id === jobId) ?? null;
        const open = this.exceptions.find((x) => x.job_id === jobId && x.open) ?? null;
        const res = job ? { ...job, open_exception: open ? { id: open.id, exception_owner: open.exception_owner } : null } : null;
        return clone(this.record("read_job", "read", jobId, { jobId }, res));
      },

      /** A client search by name or phone. The standard says nothing after intake should call it. */
      readContacts: (query) => {
        const q = String(query ?? "").toLowerCase();
        const hits = this.jobs.filter((j) => j.client_name.toLowerCase().includes(q) || (j.phone ?? "") === query);
        return clone(this.record("read_contacts", "read", q, { query }, hits.map((j) => ({ client_id: j.client_id, client_name: j.client_name }))));
      },

      /** Every item the list holds for one client id, in every status. Filtering to the approved slice is the build's job. */
      readMemory: (clientId) => {
        const res = this.items.filter((i) => i.client_id === clientId);
        return clone(this.record("read_memory", "read", clientId, { clientId }, res));
      },

      /** Every item on the list, for the review. */
      listMemory: () => clone(this.record("read_memory", "read", "*", { scope: "all" }, this.items)),

      /** Adds a row. The world stores what it is given, so a build that sends status approved is caught in the trace. */
      proposeMemory: (item) => {
        const id = `MEM-${String(++this.seq).padStart(4, "0")}`;
        const row = { superseded_by: null, ...clone(item), id };
        this.items.push(row);
        return clone(this.record("propose_memory", "write", row.client_id, item, { id }));
      },

      readMemoryItem: (id) => clone(this.record("read_memory", "read", id, { itemId: id }, this.item(id))),

      /** Changes a row's status fields. Records which decision the build said it acted on. */
      writeMemory: (itemId, patch, decisionId) => {
        const it = this.item(itemId);
        if (it) Object.assign(it, clone(patch));
        return clone(this.record("write_memory", "write", itemId, { itemId, patch, decisionId }, it ? { id: itemId } : null));
      },

      readRule: (name) => {
        const rules = { approvers: this.approvers };
        return clone(this.record("read_rule", "read", name, { name }, rules[name] ?? null));
      },

      escalate: (exception) => {
        const id = `EXC-${String(++this.seq).padStart(4, "0")}`;
        this.exceptions.push({ ...clone(exception), id, open: true });
        return clone(this.record("escalate", "write", exception.job_id ?? exception.decision_id ?? "-", exception, { exception_id: id }));
      },

      /** A draft held for a person to release. Nothing leaves the business from here. */
      draftMessage: (draft) => {
        const id = `DRF-${String(++this.seq).padStart(4, "0")}`;
        this.drafts.push({ ...clone(draft), id, at: this.clock.toISOString(), status: "held_for_release" });
        return clone(this.record("draft_message", "write", draft.job_id, draft, { id }));
      },

      publishReport: (report) => {
        const id = `RPT-${String(++this.seq).padStart(4, "0")}`;
        this.reports.push({ ...clone(report), id });
        return clone(this.record("publish_report", "write", "review", report, { report_id: id }));
      },
    };
  }
}
