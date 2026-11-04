/**
 * Arrival Brief: the build. AIP-BS-JOB-BRIEF, 2026-11-01.
 *
 * Each run, for the brief's day: read the slots, group them by tech, and for
 * every job read the job's own customer's records at that site. Hazard and
 * access lines lead each job, and a site with none says so under "missing".
 * Every line is read back by its record id before it is shown, and dropped if
 * the record is gone, undated or another customer's. Notes are quoted or cut
 * with an ellipsis, never reworded. Open quotes carry their age, never a price.
 * One brief per tech on the channel they agreed to, again only when a slot
 * moves. Nothing is written to the job system: there is no port for it.
 *
 * `makeBuild(flags)` exists so mutants.mjs can break one rule at a time. The
 * listed build is `build`, with no flags.
 */

const KIND_ORDER = ["hazard", "access", "last_visit", "open_quote", "asset", "parts", "customer_note"];

const pad = (n) => String(n).padStart(2, "0");

/** Local wall-clock parts of an instant, at a fixed offset. */
function local(at, offsetMin) {
  const d = new Date(at.getTime() + offsetMin * 60_000);
  return { date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, hm: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}

function addDays(date, n) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

/** The record's own words, or the first part of them cut at a word with an ellipsis. */
function quoteText(text, max) {
  const t = String(text).trim();
  if (t.length <= max) return t;
  let cut = t.slice(0, Math.max(1, max - 3));
  const sp = cut.lastIndexOf(" ");
  if (sp > 0) cut = cut.slice(0, sp);
  return `${cut.replace(/[\s,;:.]+$/, "")}...`;
}

export function makeBuild(flags = {}) {
  return async function build(ports) {
    const rule = await ports.readRule();
    const now = ports.now();
    const here = local(now, rule.timezone_offset_minutes);
    // Evening runs prepare tomorrow; runs before prepare_from brief today.
    const forDate = flags.alwaysToday ? here.date : here.hm >= rule.prepare_from ? addDays(here.date, 1) : here.date;
    const maxLine = rule.max_line;

    const slots = flags.ignoreSlotDate ? await ports.readSlots() : await ports.readSlots(forDate);
    const byTech = new Map();
    for (const s of slots) {
      if (!byTech.has(s.tech_id)) byTech.set(s.tech_id, []);
      byTech.get(s.tech_id).push(s);
    }

    for (const [techId, techSlots] of byTech) {
      // An open exception on this tech's brief stops it until a person closes it.
      if (!flags.ignoreOpenExceptions) {
        const open = await ports.readExceptions(techId);
        if (open.length > 0) continue;
      }

      techSlots.sort((a, b) => a.start.localeCompare(b.start));
      const jobs = [];
      for (const slot of techSlots) {
        const job = await ports.readJob(slot.job_id);
        const window = flags.restateWindow ? { start: slot.start.slice(0, 13) + ":00", end: slot.end.slice(0, 13) + ":00" } : { start: slot.start, end: slot.end };
        if (!job) {
          const open = await ports.readExceptions(slot.job_id);
          if (open.length === 0)
            await ports.raiseException({ ref: slot.job_id, kind: "job_not_found", owner: rule.owners.jobs, detail: `Slot ${slot.slot_id} points at job ${slot.job_id}, which the job system does not return.` });
          jobs.push({ job_external_id: slot.job_id, window, lines: [], missing: ["access", "hazard", "asset"], unreadable: true });
          continue;
        }

        const scope = flags.readByAddress ? { site_id: job.site_id } : { site_id: job.site_id, customer_id: job.customer_id };
        const history = await ports.readHistory(scope);
        const quotes = await ports.readQuotes(scope);
        const assets = await ports.readAssets(scope);
        const mine = (r) => flags.readByAddress || r.customer_id === job.customer_id;

        /** candidate lines, each with the record it must cite */
        const cand = [];
        const words = (r) => (flags.reword ? reword(r.text) : quoteText(r.text, maxLine));
        for (const r of history.filter(mine)) {
          if (r.kind === "hazard" || r.kind === "access") cand.push({ kind: r.kind, text: flags.inventAccess ? r.text : words(r), author: r.author ?? null, rec: r });
        }
        const visits = history.filter((r) => mine(r) && r.kind === "visit" && (flags.keepUndated || r.at)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
        if (visits[0]) cand.push({ kind: "last_visit", text: words(visits[0]), author: visits[0].author ?? null, rec: visits[0] });
        const openQuotes = quotes.filter((q) => mine(q) && (flags.allQuotes || q.status === "open"));
        for (const q of openQuotes) {
          const age = daysBetween(q.at, forDate);
          const price = flags.priceQuotes ? ` for $${Number(q.total).toLocaleString("en-AU")}` : "";
          cand.push({ kind: "open_quote", text: `Quote ${q.quote_id} (${q.description})${price} open ${age} days.`, author: null, rec: { ...q, record_id: q.quote_id }, quote_id: q.quote_id, age_days: age });
        }
        for (const a of assets.filter(mine)) cand.push({ kind: "asset", text: words(a), author: null, rec: { ...a, record_id: a.asset_id } });
        for (const r of history.filter((r) => mine(r) && r.kind === "parts" && r.job_id === job.job_id)) cand.push({ kind: "parts", text: words(r), author: r.author ?? null, rec: r });
        if (rule.customer_notes === "quote" || flags.ignoreNoteSetting) {
          const notes = history.filter((r) => mine(r) && r.kind === "note").sort((a, b) => String(b.at).localeCompare(String(a.at)));
          for (const r of notes) cand.push({ kind: "customer_note", text: words(r), author: r.author ?? null, rec: r });
        }
        if (flags.inventAccess && !cand.some((c) => c.kind === "access")) cand.push({ kind: "access", text: "Gate code 1234.", author: null, rec: null });

        // The gate: every line is read back by its record id, and dropped unless
        // the record exists, has its own date, and is this customer's.
        const lines = [];
        for (const c of cand) {
          let source = null;
          if (c.rec) {
            if (flags.noCite) source = { system: rule.system, record: c.rec.record_id, at: c.rec.at ?? null };
            else {
              const back = await ports.cite(rule.system, c.rec.record_id);
              if (back && back.at && back.customer_id === job.customer_id) source = { system: rule.system, record: back.record, at: back.at };
              else if (back && flags.keepUndated) source = { system: rule.system, record: back.record, at: back.at };
            }
          }
          if (!source && !flags.keepUnsourced) continue;
          if (flags.dropSourceField) source = undefined;
          const line = { kind: c.kind, text: c.text, author: c.author, ...(source !== undefined ? { source } : {}) };
          if (c.kind === "open_quote") Object.assign(line, { quote_id: c.quote_id, age_days: c.age_days });
          lines.push(line);
        }
        if (!flags.noOrder) lines.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
        else lines.sort((a, b) => KIND_ORDER.indexOf(b.kind) - KIND_ORDER.indexOf(a.kind));

        const missing = [];
        if (!flags.noMissing) {
          if (!lines.some((l) => l.kind === "access")) missing.push("access");
          if (!lines.some((l) => l.kind === "hazard")) missing.push("hazard");
          if (!lines.some((l) => l.kind === "asset")) missing.push("asset");
        }
        jobs.push({ job_external_id: job.job_id, address: job.address, window, lines, missing });
      }

      const slotsKey = techSlots.map((s) => `${s.job_id}@${s.start}/${s.end}`).join("|");
      const brief = { for_date: forDate, tech_id: techId, jobs };

      // Delivered once per set of slots. A rerun with nothing changed sends nothing.
      const prior = await ports.readDeliveries(techId, forDate);
      if (!flags.noDedupe && prior.some((d) => d.slots_key === slotsKey)) continue;
      brief.updated = prior.length > 0;

      const gate = flags.skipGate ? { channel: null } : await ports.gate(techId);
      let channel = gate.channel;
      if (!channel) {
        if (flags.guessChannel) channel = `sms:${techId}`;
        else {
          if (!flags.noPark) {
            await ports.raiseException({ ref: techId, kind: "no_agreed_channel", owner: rule.owners.channels, detail: `No agreed channel for ${techId}; brief for ${forDate} not sent.` });
          }
          continue;
        }
      }
      const key = `${techId}+${forDate}+${slotsKey}+arrival-brief`;
      const sent = await ports.notify(techId, channel, brief, key);
      if (!sent || !sent.report_id) {
        await ports.raiseException({ ref: techId, kind: "send_unconfirmed", owner: rule.owners.delivery, detail: `Brief for ${forDate} came back with no message id.` });
        continue;
      }
      await ports.writeDelivery({ tech_id: techId, for_date: forDate, channel, sent_at: now.toISOString(), slots_key: slotsKey, report_id: sent.report_id });
    }
  };
}

/** What a fluent model does to a note, for the mutant that breaks check 3. */
function reword(text) {
  return `Difficult customer, tread carefully: ${String(text).toLowerCase().slice(0, 30)}`;
}

export const build = makeBuild();
