/**
 * One scenario per check of job-close-build-standard, for Job Sheet.
 *
 * Scaffolded by `npx @aipathway/conformance init job-close-build-standard`; the
 * checks themselves are fetched at run time from
 * https://aipathway.com.au/explore-ai/job-close-build-standard
 *
 * Each world is a JobWorld (job-world.mjs): a plumbing business with two techs,
 * its own price book, a close inbox and an exception desk. Every `holds` reads
 * the world's trace (`world.calls`) or what landed in the job system, never the
 * build, and returns a strict true or false.
 *
 * mutants.mjs runs these same scenarios against a do-nothing build and a set of
 * deliberately broken builds, and fails unless every check claimed here goes
 * red for the builds that break it.
 */

import { JobWorld, MIA, SAM, OFFICE_MANAGER, VARIATION_PRICER, SUPERVISOR } from "./job-world.mjs";

const MIN = 60_000;
const run = async (build, world) => build(world.ports());

const J100 = () => ({ job_id: "J100", assigned_techs: [MIA], quote: null });
const J101 = () => ({ job_id: "J101", assigned_techs: [MIA], quote: null });
const J101_SAM = () => ({ job_id: "J101", assigned_techs: [SAM], quote: null });
const J200 = () => ({ job_id: "J200", assigned_techs: [SAM], quote: { quote_id: "Q200", covers: ["HWS-ANODE", "RV-850", "LAB-HR"] } });
const J300 = () => ({ job_id: "J300", assigned_techs: [MIA], quote: null });

const MIA_J100 = {
  job_number: "J100",
  transcript: "Replaced the leaking tempering valve under the house and two 15 mil elbows. Also swapped the Rheem element, three point six kilowatt. About an hour and a half all up.",
  photos: ["s3://site/J100/valve-before.jpg", "s3://site/J100/valve-after.jpg"],
  parts_used: [
    { spoken: "tempering valve", qty: 1 },
    { spoken: "15 mil elbow", qty: 2 },
    { spoken: "Rheem element 3.6kW", qty: 1 },
  ],
  labour_hours: 1.5,
};
const SAM_J200 = {
  job_number: "J200",
  transcript: "Hot water service: new anode and relief valve as quoted. Fitted a tempering valve as well, the old one was weeping. Two hours.",
  photos: ["s3://site/J200/hws.jpg", "s3://site/J200/tmv.jpg"],
  parts_used: [
    { spoken: "anode", qty: 1 },
    { spoken: "relief valve", qty: 1 },
    { spoken: "tempering valve", qty: 1 },
  ],
  labour_hours: 2,
};
const simple = (job, extra = {}) => ({
  job_number: job,
  transcript: `Cleared and flushed on ${job}, replaced the relief valve.`,
  photos: [`s3://site/${job}/a.jpg`, `s3://site/${job}/b.jpg`],
  parts_used: [{ spoken: "relief valve", qty: 1 }],
  labour_hours: 1,
  ...extra,
});

const exc = (w, reason, job) => w.exceptions.filter((e) => e.reason === reason && (job === undefined || e.job_id === job));
const closeCalls = (w, job) => w.calls.filter((c) => c.port === "close_job" && (job === undefined || c.jobId === job));
const completions = (w, job) => w.calls.filter((c) => c.port === "write_job" && c.jobId === job && c.request.status === "Completed");
const yes = (w, from, captureId) => w.reply(from, `YES D-${captureId}`);
const describe = (w) =>
  `${w.calls.length} port call(s); close_job ${closeCalls(w).length}; exceptions ${w.exceptions.map((e) => `${e.job_id}:${e.reason}->${e.owner}`).join(", ") || "none"}`;

export const scenarios = [
  {
    checkId: "job-exists-tech-on-it",
    world: () => new JobWorld({ jobs: [J100(), J101_SAM()] }),
    drive: async (build, w) => {
      const ok = w.capture(MIA.mobile, simple("J100"));
      w.capture(MIA.mobile, simple("J999"));
      w.capture(MIA.mobile, simple("J101")); // Sam is on J101, not Mia
      await run(build, w);
      w.advance(3 * MIN);
      yes(w, MIA.mobile, ok);
      await run(build, w);
    },
    holds: (w) => {
      const wrote = closeCalls(w).filter((c) => c.response?.external_ids?.length);
      const noJob = exc(w, "no_job");
      const notAssigned = exc(w, "not_assigned");
      const touched = (job) => w.calls.some((c) => c.jobId === job && ["close_job", "write_job", "send_sms", "evidence"].includes(c.port));
      return (
        wrote.length >= 1 &&
        wrote.every((c) => c.jobId === "J100") &&
        noJob.length === 1 && noJob[0].job_id === "J999" && noJob[0].owner === OFFICE_MANAGER.name &&
        notAssigned.length === 1 && notAssigned[0].job_id === "J101" && notAssigned[0].owner === OFFICE_MANAGER.name &&
        !touched("J999") && !touched("J101")
      );
    },
    describe,
  },
  {
    checkId: "verbatim-stored-first",
    world: () => new JobWorld({ jobs: [J100(), J101_SAM()] }),
    drive: async (build, w) => {
      w.capture(MIA.mobile, MIA_J100);
      w.capture(SAM.mobile, { ...simple("J101"), notes: "Customer says the tap in the laundry drips too." });
      await run(build, w);
      w.advance(5 * MIN);
      await run(build, w);
    },
    holds: (w) => {
      const caps = w.inbox.filter((m) => m.kind === "capture");
      return caps.every((cap) => {
        const stored = w.calls.filter((c) => c.port === "evidence" && c.captureId === cap.message_id);
        if (stored.length !== 1) return false;
        const copy = stored[0].request.copy;
        const exact =
          copy.transcript === cap.transcript &&
          copy.notes === cap.notes &&
          JSON.stringify(copy.photos) === JSON.stringify(cap.photos) &&
          JSON.stringify(copy.parts_used) === JSON.stringify(cap.parts_used);
        const at = w.calls.indexOf(stored[0]);
        const sms = w.calls.findIndex((c) => c.port === "send_sms" && c.captureId === cap.message_id);
        if (sms < 0) return false;
        const bookBefore = w.calls.slice(0, sms).map((c) => c.port).lastIndexOf("read_pricebook");
        return exact && at < sms && bookBefore > at;
      });
    },
    describe,
  },
  {
    checkId: "parts-from-the-book",
    world: () => new JobWorld({ jobs: [J100()] }),
    drive: async (build, w) => {
      const id = w.capture(MIA.mobile, {
        ...MIA_J100,
        parts_used: [...MIA_J100.parts_used, { spoken: "flexi hose", qty: 1 }],
      });
      await run(build, w);
      w.advance(20 * MIN);
      w.setPrice("TMV15", 199.0); // the office fixes a price while the draft sits
      w.advance(5 * MIN);
      yes(w, MIA.mobile, id);
      await run(build, w);
    },
    holds: (w) => {
      const wrote = closeCalls(w, "J100").filter((c) => c.response?.external_ids?.length);
      if (wrote.length !== 1) return false;
      const lines = wrote[0].request.lines;
      const codes = lines.map((l) => l.catalogue_code);
      const allCoded = lines.length > 0 && lines.every((l) => typeof l.catalogue_code === "string" && l.unit_price === w.priceAt(l.catalogue_code, wrote[0].at));
      const tmv = lines.find((l) => l.catalogue_code === "TMV15");
      const nb = exc(w, "not_in_book", "J100");
      const amb = exc(w, "ambiguous", "J100");
      return (
        allCoded &&
        tmv?.unit_price === 199 &&
        codes.includes("CU15-ELB") &&
        !codes.some((c) => /^FLX/.test(c)) &&
        !lines.some((l) => /rheem|flexi/i.test(l.description ?? "")) &&
        nb.length === 1 && nb[0].words === "Rheem element 3.6kW" &&
        amb.length === 1 && amb[0].words === "flexi hose"
      );
    },
    describe,
  },
  {
    checkId: "variation-never-priced",
    world: () => new JobWorld({ jobs: [J200()] }),
    drive: async (build, w) => {
      const id = w.capture(SAM.mobile, SAM_J200);
      await run(build, w);
      w.advance(4 * MIN);
      yes(w, SAM.mobile, id);
      await run(build, w);
    },
    holds: (w) => {
      const wrote = closeCalls(w, "J200").filter((c) => c.response?.external_ids?.length);
      const anyTmv = closeCalls(w).some((c) => c.request.lines.some((l) => l.catalogue_code === "TMV15"));
      const v = exc(w, "variation", "J200");
      const codes = wrote[0]?.request.lines.map((l) => l.catalogue_code) ?? [];
      return (
        wrote.length === 1 &&
        !anyTmv &&
        ["HWS-ANODE", "RV-850", "LAB-HR"].every((c) => codes.includes(c)) &&
        v.length === 1 && v[0].owner === VARIATION_PRICER && v[0].words === "tempering valve"
      );
    },
    describe,
  },
  {
    checkId: "tech-confirms",
    world: () => new JobWorld({ jobs: [J100(), J101()] }),
    drive: async (build, w) => {
      const a = w.capture(MIA.mobile, simple("J100"));
      const b = w.capture(MIA.mobile, simple("J101"));
      await run(build, w);
      w.advance(5 * MIN);
      yes(w, OFFICE_MANAGER.mobile, a); // the office manager, from her own phone
      await run(build, w);
      w.advance(10 * MIN);
      yes(w, MIA.mobile, b);
      await run(build, w);
    },
    holds: (w) => {
      const writes = closeCalls(w);
      const followsTechYes = (c) => {
        const job = w.jobs.get(c.jobId);
        const capture = w.inbox.find((m) => m.kind === "capture" && m.job_number === c.jobId);
        return w.inbox.some(
          (m) =>
            m.kind === "reply" &&
            job.assigned_techs.some((t) => t.mobile === m.from) &&
            m.text.includes(`D-${capture.message_id}`) &&
            Date.parse(m.at) <= Date.parse(c.at),
        );
      };
      return writes.length >= 1 && writes.every(followsTechYes) && closeCalls(w, "J100").length === 0 && closeCalls(w, "J101").length >= 1;
    },
    describe,
  },
  {
    checkId: "unconfirmed-to-supervisor",
    world: () => new JobWorld({ jobs: [J100(), J101()] }),
    drive: async (build, w) => {
      w.capture(MIA.mobile, simple("J100"));
      w.capture(MIA.mobile, simple("J101"));
      await run(build, w);
      w.advance(60 * MIN);
      await run(build, w); // inside the window: nothing yet
      w.advance(61 * MIN);
      await run(build, w); // past it
      w.advance(10 * MIN);
      await run(build, w); // and again
    },
    holds: (w) =>
      ["J100", "J101"].every((job) => {
        const nc = exc(w, "not_confirmed", job);
        const sent = w.sms.find((s) => s.job_id === job);
        return (
          sent !== undefined &&
          nc.length === 1 &&
          nc[0].owner === SUPERVISOR &&
          Date.parse(nc[0].at) >= Date.parse(sent.at) + 120 * MIN &&
          closeCalls(w, job).length === 0 &&
          completions(w, job).length === 0
        );
      }),
    describe,
  },
  {
    checkId: "one-write-ids-back",
    world: () => new JobWorld({ jobs: [J100(), J101()] }),
    drive: async (build, w) => {
      const a = w.capture(MIA.mobile, simple("J100"));
      const b = w.capture(MIA.mobile, simple("J101"));
      await run(build, w);
      w.advance(3 * MIN);
      yes(w, MIA.mobile, a);
      yes(w, MIA.mobile, b);
      w.fault("J100", "lost"); // lands, but the answer never reaches the phone
      w.fault("J101", "refused", "refused");
      await run(build, w);
      w.advance(2 * MIN);
      await run(build, w);
    },
    holds: (w) => {
      const cap = w.inbox.find((m) => m.kind === "capture" && m.job_number === "J100");
      const intent = `close:harbour:J100:${cap.message_id}`;
      const tries = closeCalls(w, "J100");
      const cards = [...w.jobs.get("J100").cards.values()];
      const wf100 = exc(w, "write_failed", "J100");
      const wf101 = exc(w, "write_failed", "J101");
      return (
        tries.length >= 2 &&
        tries.every((c) => c.request.intent_id === intent) &&
        cards.length === 1 &&
        cards[0].intent_id === intent &&
        cards[0].photos.length === 2 &&
        wf100.length === 1 && wf100[0].owner === OFFICE_MANAGER.name &&
        wf101.length === 1 && wf101[0].owner === OFFICE_MANAGER.name &&
        w.jobs.get("J101").cards.size === 0
      );
    },
    describe,
  },
  {
    checkId: "complete-only-when-written",
    world: () => new JobWorld({ jobs: [J100(), J300()] }),
    drive: async (build, w) => {
      const a = w.capture(MIA.mobile, simple("J100"));
      const b = w.capture(MIA.mobile, {
        ...simple("J300"),
        parts_used: [{ spoken: "relief valve", qty: 1 }, { spoken: "Rheem element 3.6kW", qty: 1 }, { spoken: "flexi hose", qty: 2 }],
      });
      await run(build, w);
      w.advance(3 * MIN);
      yes(w, MIA.mobile, a);
      yes(w, MIA.mobile, b);
      w.fault("J100", "refused");
      await run(build, w);
      w.advance(2 * MIN);
      await run(build, w);
      await run(build, w);
    },
    holds: (w) =>
      ["J100", "J300"].every((job) => {
        const done = completions(w, job);
        if (done.length !== 1) return false;
        const at = w.calls.indexOf(done[0]);
        const landed = w.calls.findIndex((c) => c.port === "close_job" && c.jobId === job && c.response?.external_ids?.length > 0);
        return landed >= 0 && landed < at && w.jobs.get(job).status === "Completed";
      }) && exc(w, "write_failed", "J100").length === 1 && w.exceptions.filter((e) => e.job_id === "J300").length === 2,
    describe,
  },
  {
    checkId: "parked-to-the-desk",
    world: () => new JobWorld({ jobs: [J100(), J200()] }),
    drive: async (build, w) => {
      const a = w.capture(MIA.mobile, { ...MIA_J100, parts_used: [...MIA_J100.parts_used, { spoken: "flexi hose", qty: 1 }] });
      const b = w.capture(SAM.mobile, SAM_J200);
      await run(build, w);
      w.advance(3 * MIN);
      yes(w, MIA.mobile, a);
      yes(w, SAM.mobile, b);
      await run(build, w);
      await run(build, w);
      await run(build, w);
    },
    holds: (w) => {
      const parked = w.exceptions.filter((e) => ["not_in_book", "ambiguous", "variation"].includes(e.reason));
      const one = (job, reason, words, owner) => {
        const hit = parked.filter((e) => e.job_id === job && e.reason === reason);
        return hit.length === 1 && hit[0].words === words && hit[0].owner === owner;
      };
      return (
        parked.length === 3 &&
        one("J100", "not_in_book", "Rheem element 3.6kW", OFFICE_MANAGER.name) &&
        one("J100", "ambiguous", "flexi hose", OFFICE_MANAGER.name) &&
        one("J200", "variation", "tempering valve", VARIATION_PRICER)
      );
    },
    describe,
  },
  {
    checkId: "logged-by-job",
    world: () => new JobWorld({ jobs: [J100(), J200()] }),
    drive: async (build, w) => {
      const a = w.capture(MIA.mobile, simple("J100"));
      const b = w.capture(SAM.mobile, SAM_J200);
      await run(build, w);
      w.advance(3 * MIN);
      yes(w, MIA.mobile, a);
      yes(w, SAM.mobile, b);
      w.fault("J100", "lost");
      await run(build, w);
      w.advance(2 * MIN);
      await run(build, w);
    },
    holds: (w) =>
      w.inbox
        .filter((m) => m.kind === "capture")
        .every((cap) => {
          const job = cap.job_number;
          const entries = w.calls.filter((c) => c.port === "write_log" && c.request.job_id === job && c.request.capture_id === cap.message_id).map((c) => c.request);
          const stored = w.calls.some((c) => c.port === "evidence" && c.captureId === cap.message_id);
          const drafted = entries.filter((e) => e.step === "drafted" && e.draft_id === `D-${cap.message_id}`);
          const tech = w.jobs.get(job).assigned_techs[0].tech_id;
          const confirmed = entries.filter((e) => e.step === "confirmed" && e.by === tech && typeof e.confirmed_at === "string");
          const writes = entries.filter((e) => e.step === "write");
          const tries = closeCalls(w, job);
          const whole = writes.every((e) => (e.ok === true && Array.isArray(e.external_ids) && e.external_ids.length > 0) || (e.ok === false && typeof e.reason === "string"));
          return stored && drafted.length === 1 && confirmed.length === 1 && writes.length === tries.length && tries.length >= 1 && whole;
        }) &&
      closeCalls(w, "J100").length >= 2,
    describe,
  },
  {
    checkId: "survives-the-builder",
    // A precondition: the runner reports it as evidence_required and never
    // scores it on the build's say-so. Declared: AI Pathway maintains it, and it
    // runs on the business's own Office Voice account and job system.
    world: () => new JobWorld(),
    drive: async () => {},
    holds: () => false,
    describe: () => "Declared, not proved: maintained by AI Pathway, runs on the business's own accounts.",
  },
];

// The pass test runs on a real job in the business's own ServiceM8 or Simpro.
// On the stub it reports with_us; this build does not hand-roll the live write.
export const liveScenarios = [];
