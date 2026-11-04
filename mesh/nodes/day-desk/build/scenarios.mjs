/**
 * One scenario per check of client-desk-build-standard, for Day Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init client-desk-build-standard`.
 * The checks are fetched at run time; what is here is the world each check
 * starts in, how the build is driven, and what "held" means. Every `holds`
 * reads the recorded trace (`world.calls`), never the build, and returns a
 * strict true or false.
 *
 * Day Desk drafts status updates and sends them only on a named person's
 * release, so the update scenarios stage that release as the office would.
 */

import { DayDeskWorld, deliver } from "./desk-world.mjs";

const ON_DUTY = "Dale Whitty";
const WINDOW = 30;
const roster = { on_duty: ON_DUTY, callback_within_minutes: WINDOW };

// ---- trace helpers ---------------------------------------------------------

/** The slice of the trace that belongs to one call, from its ring to the next. */
function segment(world, callId) {
  const i = world.callMarks.findIndex((m) => m.callId === callId);
  if (i < 0) return [];
  const end = i + 1 < world.callMarks.length ? world.callMarks[i + 1].at : world.calls.length;
  return world.calls.slice(world.callMarks[i].at, end);
}
const said = (seg) => seg.filter((c) => c.port === "talk" && typeof c.request.text === "string").map((c) => c.request.text);
const of = (world, port) => world.calls.filter((c) => c.port === port);
const WRITES = new Set(["write_job", "file_message", "raise_task", "draft_message", "send_sms"]);
const TIME_RE = /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i;
const GUESS_RE = /\b(morning|afternoon|arvo|lunch|soon|shortly|about|around|roughly|should be)\b/i;

async function ring(build, world, callId, phone, utterances) {
  const ev = world.ring(callId, phone, utterances);
  await build(world.ports(), ev);
}

function consentingJob(id, phone, eta, extra = {}) {
  return { id, customer: `Customer ${id}`, phone, eta, contact: { phone, consent: true, channel: "sms" }, ...extra };
}

// ---- scenarios ---------------------------------------------------------------

export const scenarios = [
  {
    checkId: "disclosure-first",
    world: () => {
      const w = new DayDeskWorld({ roster });
      w.seedJob(consentingJob("J1042", "0412 555 101", "2:30pm"));
      w.seedJob(consentingJob("J1043", "0412 555 102", "9:00am"));
      return w;
    },
    drive: async (build, world) => {
      await ring(build, world, "c-new", "0412 555 900", ["Hi, I've got a leaking shower I'd like fixed this week."]);
      await ring(build, world, "c-status", "0412 555 101", ["When is the plasterer coming?"]);
      await ring(build, world, "c-person", "0412 555 102", ["Can I speak to someone, please?"]);
    },
    holds: (world) => {
      if (world.callMarks.length !== 3) return false;
      return world.callMarks.every(({ callId }) => {
        const seg = segment(world, callId);
        if (seg.length === 0) return false;
        const first = seg[0];
        if (first.port !== "disclose" || first.request.callId !== callId) return false;
        if (!/AI/.test(first.request.text) || !/record/i.test(first.request.text)) return false;
        return seg.filter((c) => c.port === "disclose").length === 1;
      });
    },
    describe: (world) => `${of(world, "disclose").length} disclosure(s) across ${world.callMarks.length} call(s); first port per call: ${world.callMarks.map((m) => segment(world, m.callId)[0]?.port ?? "none").join(", ")}`,
  },
  {
    checkId: "caller-matched-first",
    world: () => {
      const w = new DayDeskWorld({ roster });
      w.seedJob(consentingJob("J1042", "0412 555 101", "2:30pm", { customer: "Mrs Patel" }));
      return w;
    },
    drive: async (build, world) => {
      await ring(build, world, "c1", "0412 555 101", ["When is the plasterer coming?"]);
      world.advance(60 * 60_000);
      await ring(build, world, "c2", "0412 555 101", ["Can I speak to someone about the job?"]);
    },
    holds: (world) => {
      if (of(world, "write_job").length !== 0) return false;
      const notes = of(world, "file_message");
      if (!notes.every((n) => n.request.jobId === "J1042")) return false;
      for (const callId of ["c1", "c2"]) {
        if (!notes.some((n) => n.request.ref === callId)) return false;
        const seg = segment(world, callId);
        const lookup = seg.findIndex((c) => c.port === "read_job" && c.request.phone === "0412 555 101");
        const firstWrite = seg.findIndex((c) => WRITES.has(c.port));
        if (lookup < 0 || firstWrite < 0 || lookup > firstWrite) return false;
      }
      return true;
    },
    describe: (world) => `${of(world, "write_job").length} job write(s); notes on ${of(world, "file_message").map((n) => `${n.request.jobId}/${n.request.ref}`).join(", ") || "nothing"}`,
  },
  {
    checkId: "new-work-as-after-hours",
    world: () => new DayDeskWorld({ roster }),
    drive: async (build, world) => {
      await ring(build, world, "n1", "0400 100 001", ["We've got a burst pipe under the kitchen sink and water is going everywhere."]);
      await ring(build, world, "n2", "0400 100 002", ["The bathroom tap has been dripping for a week."]);
      await ring(build, world, "n3", "0400 100 003", ["I'd like a quote for a full bathroom renovation."]);
    },
    holds: (world) => {
      const expected = {
        "0400 100 001": ["We've got a burst pipe under the kitchen sink and water is going everywhere.", "emergency"],
        "0400 100 002": ["The bathroom tap has been dripping for a week.", "routine"],
        "0400 100 003": ["I'd like a quote for a full bathroom renovation.", "quote"],
      };
      const writes = of(world, "write_job");
      if (writes.length !== 3) return false;
      for (const [phone, [words, type]] of Object.entries(expected)) {
        const mine = writes.filter((w) => w.request.phone === phone);
        if (mine.length !== 1) return false;
        if (mine[0].request.verbatim !== words) return false;
        if (mine[0].request.type !== type) return false;
        if (!mine[0].response || !mine[0].response.id) return false;
      }
      return true;
    },
    describe: (world) => of(world, "write_job").map((w) => `${w.request.phone}: ${w.request.type} "${w.request.verbatim}"`).join("; ") || "no job writes",
  },
  {
    checkId: "status-from-the-record",
    world: () => {
      const w = new DayDeskWorld({ roster });
      w.seedJob(consentingJob("J1042", "0412 555 101", "2:30pm"));
      w.seedJob(consentingJob("J1077", "0412 555 177", null));
      return w;
    },
    drive: async (build, world) => {
      await ring(build, world, "s1", "0412 555 101", ["When is he coming?"]);
      await ring(build, world, "s2", "0412 555 177", ["What time is the electrician coming today?"]);
    },
    holds: (world) => {
      const s1 = segment(world, "s1");
      const readById = s1.findIndex((c) => c.port === "read_job" && c.request.id === "J1042");
      const tellIdx = s1.findIndex((c) => c.port === "talk" && typeof c.request.text === "string" && c.request.text.includes("2:30pm"));
      if (readById < 0 || tellIdx < 0 || readById > tellIdx) return false;
      const s1Times = said(s1).flatMap((t) => t.match(new RegExp(TIME_RE, "gi")) ?? []);
      if (!s1Times.every((t) => t.replace(/\s/g, "").toLowerCase() === "2:30pm")) return false;

      const s2 = segment(world, "s2");
      const s2Said = said(s2).map((t) => t.replace(/within \d+ minutes/g, ""));
      if (s2Said.some((t) => TIME_RE.test(t) || GUESS_RE.test(t))) return false;
      const task = s2.find((c) => c.port === "raise_task" && c.request.jobId === "J1077");
      return !!task && task.request.owner === ON_DUTY && !!task.response?.id;
    },
    describe: (world) => `s1 said: ${said(segment(world, "s1")).join(" | ")} || s2 said: ${said(segment(world, "s2")).join(" | ")}`,
  },
  {
    checkId: "transfer-with-a-fallback",
    world: () => {
      const w = new DayDeskWorld({ roster, transferAnswered: false });
      w.seedJob(consentingJob("J1042", "0412 555 101", "2:30pm"));
      return w;
    },
    drive: async (build, world) => {
      await ring(build, world, "t1", "0412 555 101", ["Can I speak to the owner?"]);
    },
    holds: (world) => {
      const seg = segment(world, "t1");
      const rosterIdx = seg.findIndex((c) => c.port === "read_rule");
      const transfers = seg.filter((c) => c.port === "escalate");
      const tIdx = seg.findIndex((c) => c.port === "escalate");
      if (rosterIdx < 0 || tIdx < 0 || rosterIdx > tIdx) return false;
      if (transfers.length !== 1 || transfers[0].request.transfer_to !== ON_DUTY) return false;
      const taskIdx = seg.findIndex((c) => c.port === "raise_task");
      if (taskIdx < tIdx) return false;
      const task = seg[taskIdx].request;
      if (task.jobId !== "J1042" || task.owner !== ON_DUTY) return false;
      const due = new Date(task.due_by).getTime();
      const at = new Date(seg[tIdx].at).getTime();
      if (!(due > at && due <= at + WINDOW * 60_000)) return false;
      // The caller is told when to expect it, after the task exists.
      return seg.slice(taskIdx).some((c) => c.port === "talk" && typeof c.request.text === "string" && c.request.text.includes(`${WINDOW} minutes`) && c.request.text.includes(ON_DUTY));
    },
    describe: (world) => `transfers: ${of(world, "escalate").map((c) => c.request.transfer_to).join(", ") || "none"}; tasks: ${of(world, "raise_task").map((c) => `${c.request.owner} by ${c.request.due_by}`).join(", ") || "none"}`,
  },
  {
    checkId: "update-from-an-event",
    world: () => {
      const w = new DayDeskWorld({ roster });
      w.seedJob(consentingJob("J1", "0400 200 001", "2:30pm"));
      w.seedJob(consentingJob("J2", "0400 200 002", "1:00pm"));
      w.seedJob(consentingJob("J3", "0400 200 003", "9:00am"));
      w.seedJob(consentingJob("J4", "0400 200 004", "11:00am"));
      return w;
    },
    drive: async (build, world) => {
      world.events = [world.moveEta("J1", "3:30pm"), world.markLeft("J2"), world.markComplete("J3")];
      await deliver(build, world, world.events);
      for (const id of ["J1", "J2", "J3", "J4"]) await deliver(build, world, world.releaseAll(id, "Kerry Nolan"));
    },
    holds: (world) => {
      const sends = of(world, "send_sms");
      if (sends.length !== 3) return false;
      const [etaEv, leftEv, doneEv] = world.events;
      const want = { J1: ["late", etaEv.eventId], J2: ["on_the_way", leftEv.eventId], J3: ["complete", doneEv.eventId] };
      for (const [jobId, [kind, eventId]] of Object.entries(want)) {
        const s = sends.filter((x) => x.request.jobId === jobId);
        if (s.length !== 1 || s[0].request.kind !== kind || s[0].request.eventId !== eventId) return false;
        if (s[0].request.to !== world.jobs.get(jobId).contact.phone) return false;
        if (!(typeof s[0].request.released_by === "string" && s[0].request.released_by.length > 0)) return false;
      }
      const late = sends.find((x) => x.request.jobId === "J1");
      if (!late.request.text.includes("3:30pm") || late.request.text.includes("2:30pm")) return false;
      // The 3:30pm came off a read of the job after the event, not from the event.
      const evIdx = world.calls.findIndex((c) => c.port === "read_job" && c.request.id === "J1" && c.response?.eta === "3:30pm");
      return evIdx >= 0 && evIdx < world.calls.indexOf(late) && !sends.some((x) => x.request.jobId === "J4");
    },
    describe: (world) => of(world, "send_sms").map((s) => `${s.request.jobId} ${s.request.kind} "${s.request.text}"`).join("; ") || "no messages",
  },
  {
    checkId: "one-update-per-change",
    world: () => {
      const w = new DayDeskWorld({ roster });
      w.seedJob(consentingJob("J1", "0400 300 001", "2:30pm"));
      return w;
    },
    drive: async (build, world) => {
      const first = world.moveEta("J1", "3:30pm");
      await deliver(build, world, [first, first]);
      const rel1 = world.releaseAll("J1");
      await deliver(build, world, [...rel1, ...rel1]);
      await deliver(build, world, [first]); // a late redelivery of the first change
      world.advance(45 * 60_000);
      const second = world.moveEta("J1", "4:15pm");
      await deliver(build, world, [second]);
      await deliver(build, world, world.releaseAll("J1"));
    },
    holds: (world) => {
      const sends = of(world, "send_sms").filter((s) => s.request.jobId === "J1");
      if (sends.length !== 2) return false;
      return sends[0].request.text.includes("3:30pm") && sends[1].request.text.includes("4:15pm") && !sends[1].request.text.includes("3:30pm");
    },
    describe: (world) => of(world, "send_sms").map((s) => `"${s.request.text}"`).join("; ") || "no messages",
  },
  {
    checkId: "contact-and-consent",
    world: () => {
      const w = new DayDeskWorld({ roster });
      // The customer's own number differs from the contact the job records.
      w.seedJob({ id: "J1", customer: "Mr Lee", phone: "0400 400 001", eta: "2:30pm", contact: { phone: "0400 499 888", consent: true, channel: "sms" } });
      w.seedJob({ id: "J2", customer: "Ms Ward", phone: "0400 400 002", eta: "1:00pm", contact: { phone: "0400 400 002", consent: false } });
      return w;
    },
    drive: async (build, world) => {
      await deliver(build, world, [world.moveEta("J1", "3:30pm"), world.moveEta("J2", "2:00pm")]);
      await deliver(build, world, [...world.releaseAll("J1"), ...world.releaseAll("J2")]);
    },
    holds: (world) => {
      const sends = of(world, "send_sms");
      if (sends.length !== 1 || sends[0].request.to !== "0400 499 888" || sends[0].request.jobId !== "J1") return false;
      return of(world, "file_message").some((n) => n.request.jobId === "J2" && n.request.reason === "no_consent_to_messages");
    },
    describe: (world) => `sent to: ${of(world, "send_sms").map((s) => s.request.to).join(", ") || "nobody"}; J2 notes: ${of(world, "file_message").filter((n) => n.request.jobId === "J2").map((n) => n.request.reason ?? n.request.kind).join(", ") || "none"}`,
  },
  {
    checkId: "job-shows-what-was-said",
    world: () => {
      const w = new DayDeskWorld({ roster, transferAnswered: false });
      w.seedJob(consentingJob("J1042", "0412 555 101", "2:30pm"));
      return w;
    },
    drive: async (build, world) => {
      await ring(build, world, "d1", "0412 555 101", ["When is the plasterer coming?"]);
      await ring(build, world, "d2", "0412 555 101", ["Can I talk to a person?"]);
      await deliver(build, world, [world.moveEta("J1042", "3:30pm")]);
      await deliver(build, world, world.releaseAll("J1042"));
      await deliver(build, world, [world.markComplete("J1042")]);
      await deliver(build, world, world.releaseAll("J1042"));
    },
    holds: (world) => {
      const notes = of(world, "file_message");
      const callsNoted = world.callMarks.every(({ callId }) =>
        notes.some((n) => n.request.jobId === "J1042" && n.request.ref === callId && Array.isArray(n.request.said) && n.request.said.length > 0 && Array.isArray(n.request.told) && n.request.told.length > 0),
      );
      const sends = of(world, "send_sms");
      if (sends.length !== 2) return false;
      const sendsNoted = sends.every((s) => notes.some((n) => n.request.jobId === s.request.jobId && n.request.ref === s.request.eventId && n.request.kind === "update_sent"));
      return callsNoted && sendsNoted;
    },
    describe: (world) => `notes: ${of(world, "file_message").map((n) => `${n.request.kind}@${n.request.ref}`).join(", ") || "none"}; ${of(world, "send_sms").length} message(s)`,
  },
  {
    checkId: "write-verified",
    world: () => new DayDeskWorld({ roster, failNextWrite: true }),
    drive: async (build, world) => {
      await ring(build, world, "w1", "0400 500 001", ["Our hot water system is leaking all over the laundry floor."]);
    },
    holds: (world) => {
      const seg = segment(world, "w1");
      const write = seg.find((c) => c.port === "write_job");
      if (!write || write.response?.id !== null) return false;
      if (said(seg).some((t) => /\b(booked|job number|all set|confirmed|locked in)\b/i.test(t))) return false;
      const task = seg.find((c) => c.port === "raise_task");
      return !!task && task.request.phone === "0400 500 001" && task.request.owner === ON_DUTY;
    },
    describe: (world) => `said: ${said(segment(world, "w1")).join(" | ")}; tasks: ${of(world, "raise_task").map((c) => `${c.request.owner}/${c.request.phone}`).join(", ") || "none"}`,
  },
  {
    checkId: "survives-the-builder",
    // A precondition: closed by evidence, never by this run.
    world: () => new DayDeskWorld({ roster }),
    drive: async () => {},
    holds: () => false,
    describe: () => "precondition: no software result",
  },
];

// 12, the pass test, runs only on the business's own number and job system.
export const liveScenarios = [];
