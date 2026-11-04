/**
 * One scenario per check of job-brief-build-standard, for Arrival Brief.
 *
 * Scaffolded by `npx @aipathway/conformance init job-brief-build-standard`; the
 * checks themselves are fetched at run time from
 * https://aipathway.com.au/explore-ai/job-brief-build-standard
 *
 * Each world is a BriefWorld (brief-world.mjs): a Cairns plumbing business with
 * three techs, its job system's slots, site history, quotes and asset records,
 * the techs' agreed channels, a delivery log and an exception desk. Every
 * `holds` reads the world's trace (`world.calls`) and what the world holds,
 * never the build, and returns a strict true or false.
 *
 * mutants.mjs runs these scenarios against a do-nothing build and a set of
 * deliberately broken builds, and fails unless every check claimed here goes
 * red for the builds that break it.
 */

import { BriefWorld, PairWorld, MIA, SAM, LENA, SYSTEM, BRIEF_DAY, OFFICE_MANAGER } from "./brief-world.mjs";

const HOUR = 3_600_000;
const run = async (build, world) => build(world.ports());
const at = (hm, date = BRIEF_DAY) => `${date}T${hm}:00+10:00`;
const slot = (slot_id, job_id, tech_id, s, e, date = BRIEF_DAY) => ({ slot_id, job_id, tech_id, date, start: at(s, date), end: at(e, date) });

/** Every brief that actually went out, in order. */
const briefs = (w) => w.calls.filter((c) => c.port === "notify" && c.response?.report_id).map((c) => c.request.brief);
const allLines = (w) => briefs(w).flatMap((b) => b.jobs.flatMap((j) => j.lines.map((l) => ({ ...l, job: j.job_external_id }))));
const jobOf = (w, id) => w.jobs.find((j) => j.job_id === id);
const describe = (w) =>
  `${w.calls.length} port call(s); ${briefs(w).length} brief(s) sent; ${allLines(w).length} line(s); exceptions ${w.exceptions.map((e) => `${e.ref}:${e.kind}->${e.owner}`).join(", ") || "none"}`;

/** The record's words, or a prefix of them followed by "...". */
const quotedOrCut = (text, original) => {
  if (typeof text !== "string" || typeof original !== "string") return false;
  if (text === original.trim()) return true;
  if (!text.endsWith("...")) return false;
  const head = text.slice(0, -3);
  return head.length > 0 && original.startsWith(head);
};

// ── Fixtures ──

const J1 = { job_id: "J1", customer_id: "C-WALSH", site_id: "S-WATTLE", address: "12 Wattle St, Edge Hill QLD 4870", description: "Hot water not heating" };
const J2 = { job_id: "J2", customer_id: "C-NGUYEN", site_id: "S-BANKSIA", address: "4 Banksia Ct, Manoora QLD 4870", description: "Kitchen mixer dripping" };
const J3 = { job_id: "J3", customer_id: "C-RAO", site_id: "S-REEF", address: "9 Reef St, Edge Hill QLD 4870", description: "Blocked drain" };
const J4 = { job_id: "J4", customer_id: "C-DOYLE", site_id: "S-WATTLE14", address: "14 Wattle St, Edge Hill QLD 4870", description: "Leaking toilet cistern" };
const J5 = { job_id: "J5", customer_id: "C-WALSH", site_id: "S-WATTLE", address: "12 Wattle St, Edge Hill QLD 4870", description: "Annual backflow test" };

const LONG_NOTE = "Customer was difficult about the invoice last time, wants a call before arrival";

const wattle = () => [
  { record_id: "H3", kind: "hazard", customer_id: "C-WALSH", site_id: "S-WATTLE", text: "Asbestos sheeting in the laundry eaves. Do not drill.", author: "Mia Russo", at: "2025-09-10" },
  { record_id: "H5", kind: "access", customer_id: "C-WALSH", site_id: "S-WATTLE", text: "Key safe on the side gate, code given by phone on the day.", author: "Office", at: "2026-03-01" },
  { record_id: "H1", kind: "visit", customer_id: "C-WALSH", site_id: "S-WATTLE", text: "Replaced the tempering valve. Hot water unit is 14 years old and close to the end of its life.", author: "Mia Russo", at: "2026-03-04" },
  { record_id: "H0", kind: "visit", customer_id: "C-WALSH", site_id: "S-WATTLE", text: "Cleared the shower drain.", author: "Mia Russo", at: "2025-06-12" },
  { record_id: "H4", kind: "note", customer_id: "C-WALSH", site_id: "S-WATTLE", text: LONG_NOTE, author: "Jo Bell", at: "2026-03-05" },
  { record_id: "H9", kind: "note", customer_id: "C-WALSH", site_id: "S-WATTLE", text: "Dog in the backyard, friendly but jumps.", author: "Jo Bell", at: null },
  { record_id: "H6", kind: "parts", customer_id: "C-WALSH", site_id: "S-WATTLE", job_id: "J1", text: "2 x 15mm tempering valve, set aside on shelf B.", author: "Store", at: "2026-11-03" },
];
const banksia = () => [{ record_id: "H20", kind: "visit", customer_id: "C-NGUYEN", site_id: "S-BANKSIA", text: "Installed a new kitchen mixer.", author: "Sam Okafor", at: "2026-05-20" }];
const wattleQuotes = () => [
  { quote_id: "Q1", customer_id: "C-WALSH", site_id: "S-WATTLE", status: "open", description: "Replace hot water unit", total: 4850, at: "2026-09-25" },
  { quote_id: "Q2", customer_id: "C-WALSH", site_id: "S-WATTLE", status: "accepted", description: "Tempering valve", total: 389, at: "2026-02-20" },
  { quote_id: "Q3", customer_id: "C-WALSH", site_id: "S-WATTLE", status: "declined", description: "Solar hot water", total: 7200, at: "2025-12-01" },
  { quote_id: "Q4", customer_id: "C-WALSH", site_id: "S-WATTLE", status: "expired", description: "Water filter", total: 640, at: "2025-08-01" },
];
const wattleAssets = () => [{ asset_id: "A1", customer_id: "C-WALSH", site_id: "S-WATTLE", text: "Rheem 315L electric hot water unit.", at: "2026-03-04" }];

/** The standard business: two jobs for Mia, one for Lena, one for Sam, plus bait. */
const standardWorld = (opts = {}) =>
  new BriefWorld({
    jobs: [J1, J2, J3, J4, J5],
    slots: [
      slot("SL1", "J1", MIA.tech_id, "07:30", "09:30"),
      slot("SL2", "J2", MIA.tech_id, "10:15", "12:15"),
      slot("SL3", "J3", LENA.tech_id, "08:45", "10:45"),
      slot("SL4", "J5", MIA.tech_id, "07:30", "09:00", "2026-11-06"), // the day after: not on this brief
      // J4 is on the same street as J1 and is slotted to nobody.
    ],
    records: [...wattle(), ...banksia()],
    quotes: wattleQuotes(),
    assets: wattleAssets(),
    ...opts,
  });

export const scenarios = [
  {
    checkId: "jobs-from-the-slots",
    world: () => standardWorld(),
    drive: run,
    holds: (w) => {
      const sent = briefs(w);
      const expect = { [MIA.tech_id]: ["SL1", "SL2"], [LENA.tech_id]: ["SL3"] };
      if (sent.length !== 2) return false;
      for (const [tech, slotIds] of Object.entries(expect)) {
        const b = sent.find((x) => x.tech_id === tech);
        if (!b || b.for_date !== BRIEF_DAY) return false;
        const want = slotIds.map((id) => w.slots.find((s) => s.slot_id === id));
        if (b.jobs.length !== want.length) return false;
        for (const s of want) {
          const j = b.jobs.find((x) => x.job_external_id === s.job_id);
          if (!j || j.window?.start !== s.start || j.window?.end !== s.end) return false;
        }
      }
      return true;
    },
    describe,
  },
  {
    checkId: "every-line-has-a-source",
    world: () => standardWorld(),
    drive: run,
    holds: (w) => {
      const lines = allLines(w);
      if (lines.length < 5) return false;
      for (const l of lines) {
        const s = l.source;
        if (!s || s.system !== SYSTEM || typeof s.record !== "string" || typeof s.at !== "string") return false;
        const r = w.lookup(s.record);
        if (!r || !r.at || r.at !== s.at) return false;
        if (r.customer_id !== jobOf(w, l.job).customer_id) return false;
      }
      return !lines.some((l) => l.source?.record === "H9" || /Dog in the backyard/.test(l.text));
    },
    describe,
  },
  {
    checkId: "quote-do-not-characterise",
    world: () => new PairWorld(standardWorld(), standardWorld({ settings: { customer_notes: "omit" } })),
    drive: async (build, pw) => {
      await build(pw.a.ports());
      await build(pw.b.ports());
    },
    holds: (pw) => {
      const quoted = allLines(pw.a);
      const notes = quoted.filter((l) => l.kind === "customer_note");
      const h4 = notes.find((l) => l.source?.record === "H4");
      if (!h4 || h4.author !== "Jo Bell" || h4.source.at !== "2026-03-05") return false;
      // Every line that carries a record's words carries them quoted or cut, never reworded.
      for (const l of quoted.filter((x) => ["customer_note", "last_visit", "hazard", "access", "asset", "parts"].includes(x.kind))) {
        const r = pw.a.lookup(l.source?.record);
        if (!r || !quotedOrCut(l.text, r.text)) return false;
      }
      const omitted = allLines(pw.b);
      if (omitted.length === 0) return false;
      return !omitted.some((l) => l.kind === "customer_note");
    },
    describe: (pw) => `quote: ${describe(pw.a)} | omit: ${describe(pw.b)}`,
  },
  {
    checkId: "hazards-and-access-first",
    world: () => standardWorld(),
    drive: run,
    holds: (w) => {
      const b = briefs(w).find((x) => x.tech_id === MIA.tech_id);
      if (!b) return false;
      const j1 = b.jobs.find((j) => j.job_external_id === "J1");
      const j2 = b.jobs.find((j) => j.job_external_id === "J2");
      if (!j1 || !j2) return false;
      const lead = (k) => k === "hazard" || k === "access";
      const firstOther = j1.lines.findIndex((l) => !lead(l.kind));
      const lastLead = j1.lines.map((l) => lead(l.kind)).lastIndexOf(true);
      if (lastLead < 0 || firstOther < 0 || lastLead > firstOther) return false;
      if (!j1.lines.some((l) => l.kind === "hazard") || !j1.lines.some((l) => l.kind === "access")) return false;
      if (j1.missing.includes("access") || j1.missing.includes("hazard")) return false;
      if (!Array.isArray(j2.missing) || !j2.missing.includes("access") || !j2.missing.includes("hazard")) return false;
      return !j2.lines.some((l) => lead(l.kind));
    },
    describe,
  },
  {
    checkId: "open-quotes-with-age",
    world: () => standardWorld(),
    drive: run,
    holds: (w) => {
      const lines = allLines(w);
      const q = lines.filter((l) => l.kind === "open_quote");
      if (q.length !== 1) return false;
      const [only] = q;
      // Q1 dated 25 September; the brief is for 5 November: 41 days.
      if (only.source?.record !== "Q1" || only.age_days !== 41 || !/\b41 days\b/.test(only.text)) return false;
      if (lines.some((l) => ["Q2", "Q3", "Q4"].includes(l.source?.record) || /\bQ[234]\b/.test(l.text))) return false;
      return !lines.some((l) => /\$\s?\d|\b\d[\d,]*(\.\d\d)?\s?(AUD|dollars)\b|\b4,?850\b|discount/i.test(l.text));
    },
    describe,
  },
  {
    checkId: "client-material-stays-scoped",
    world: () =>
      new BriefWorld({
        jobs: [{ job_id: "J7", customer_id: "C-NEW", site_id: "S-FIG", address: "7 Fig Tree Rd, Bungalow QLD 4870", description: "Gas hot water service" }],
        slots: [slot("SL7", "J7", MIA.tech_id, "07:30", "09:30")],
        records: [
          { record_id: "O1", kind: "visit", customer_id: "C-OLD", site_id: "S-FIG", text: "Old owner: replaced the toilet suite.", author: "Sam Okafor", at: "2026-08-02" },
          { record_id: "O2", kind: "visit", customer_id: "C-OLD", site_id: "S-FIG", text: "Old owner: cleared the sewer line.", author: "Sam Okafor", at: "2026-07-11" },
          { record_id: "O3", kind: "visit", customer_id: "C-OLD", site_id: "S-FIG", text: "Old owner: fixed the outdoor tap.", author: "Mia Russo", at: "2026-06-01" },
          { record_id: "O4", kind: "note", customer_id: "C-OLD", site_id: "S-FIG", text: "Disputed the last invoice.", author: "Jo Bell", at: "2026-08-03" },
          { record_id: "O5", kind: "access", customer_id: "C-OLD", site_id: "S-FIG", text: "Gate code 4471.", author: "Office", at: "2026-06-01" },
          { record_id: "N1", kind: "visit", customer_id: "C-NEW", site_id: "S-FIG", text: "Serviced the gas hot water unit.", author: "Mia Russo", at: "2026-02-15" },
        ],
        quotes: [{ quote_id: "OQ1", customer_id: "C-OLD", site_id: "S-FIG", status: "open", description: "New toilet suite", total: 1200, at: "2026-08-05" }],
        assets: [{ asset_id: "NA1", customer_id: "C-NEW", site_id: "S-FIG", text: "Rinnai 26L continuous flow gas unit.", at: "2026-02-15" }],
      }),
    drive: run,
    holds: (w) => {
      const lines = allLines(w);
      if (!lines.some((l) => l.source?.record === "N1") || !lines.some((l) => l.source?.record === "NA1")) return false;
      if (lines.some((l) => w.lookup(l.source?.record)?.customer_id !== "C-NEW" || /Old owner|Disputed|4471|OQ1/.test(l.text))) return false;
      const reads = w.calls.filter((c) => ["read_history", "read_quote", "read_asset"].includes(c.port));
      for (const p of ["read_history", "read_quote", "read_asset"]) if (!reads.some((c) => c.port === p)) return false;
      return reads.every((c) => c.request?.customer_id === "C-NEW");
    },
    describe,
  },
  {
    checkId: "delivered-once-on-an-agreed-channel",
    world: () =>
      new BriefWorld({
        jobs: [J1, J2],
        slots: [slot("SL1", "J1", MIA.tech_id, "07:30", "09:30"), slot("SL2", "J2", SAM.tech_id, "10:15", "12:15")],
        records: [...wattle(), ...banksia()],
        quotes: wattleQuotes(),
        assets: wattleAssets(),
      }),
    drive: async (build, w) => {
      await run(build, w); // 8pm
      w.advance(HOUR);
      await run(build, w); // 9pm, nothing changed
      w.advance(HOUR);
      w.moveSlot("SL1", at("11:00"), at("13:00"));
      w.movedAt = w.ports().now().toISOString();
      await run(build, w); // 10pm, Mia's slot moved
    },
    holds: (w) => {
      const sendBy = Date.parse(at("06:00"));
      const mia = w.calls.map((c, i) => ({ c, i })).filter(({ c }) => c.port === "notify" && c.request.tech_id === MIA.tech_id);
      if (mia.length !== 2 || !mia.every(({ c }) => c.response?.report_id)) return false;
      let prev = -1;
      for (const { c, i } of mia) {
        const gated = w.calls.slice(prev + 1, i).some((g) => g.port === "gate" && g.request.tech_id === MIA.tech_id && g.response.channel === c.request.channel);
        if (!gated || c.request.channel !== MIA.channel) return false;
        prev = i;
      }
      const [first, second] = mia.map(({ c }) => c);
      if (first.request.brief.for_date !== BRIEF_DAY || Date.parse(first.at) > sendBy) return false;
      if (Date.parse(second.at) < Date.parse(w.movedAt) || second.request.brief.updated !== true) return false;
      if (second.request.brief.jobs[0]?.window?.start !== at("11:00")) return false;
      if (w.calls.some((c) => c.port === "notify" && c.request.tech_id === SAM.tech_id)) return false;
      const parked = w.exceptions.filter((e) => e.ref === SAM.tech_id);
      return parked.length === 1 && parked[0].open === true && parked[0].kind === "no_agreed_channel" && parked[0].owner === OFFICE_MANAGER;
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    // A precondition: the runner reports it as evidence_required and never
    // scores it on the build's say-so. Declared: AI Pathway maintains it; it runs
    // on the business's own job system account and its own scheduler.
    world: () => new BriefWorld(),
    drive: async () => {},
    holds: () => false,
    describe: () => "Declared, not proved: maintained by AI Pathway, runs on the business's own job system and scheduler.",
  },
];

// The pass test runs on the business's own ServiceM8, Simpro, AroFlo or Fergus:
// a real job, a real note deleted there, and the brief rebuilt. On the stub it
// reports with_us; this build does not pretend a stub proves it.
export const liveScenarios = [];
