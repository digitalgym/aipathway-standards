/**
 * Parts Check: the afternoon-before parts check, built to AIP-BS-PARTS-READY
 * 2026-11-01. https://aipathway.com.au/explore-ai/parts-ready-build-standard
 *
 * An original build. Each afternoon before the cut-off it takes tomorrow's
 * dispatched board, works out what each job needs from the record, checks it
 * against the tech's van (with when it was counted) and the shelf, and raises
 * every shortfall for ordering through Material Order's path. It never
 * substitutes a part, never guesses a needs list, and never writes or releases
 * a purchase order itself: Material Order holds each one for a named person.
 *
 * What one run does, every time it is woken (schedule.tick, or job.updated /
 * exception.closed for one job id):
 *
 *   1. Read the business's rule (cut-off, van limit, exception owner), then
 *      tomorrow's board by job id, then its own earlier Results and messages.
 *   2. Read the shelf and the supplier list once, before any reservation or order.
 *   3. For each job: read it by id. Needs come from the accepted quote, else the
 *      job's materials, else its type's template. None: flagged, never guessed.
 *   4. Read the tech's van with its as-of time. Older than the limit: every line
 *      flagged stock_unknown, nothing reported on the van.
 *   5. Each line: on the van; else reserved from the shelf; else, if a supplier
 *      lists it and it can arrive before the slot, queued for an order; else
 *      flagged (lead_time_after_job or not_in_stock). An equivalent part is
 *      only ever a suggestion on the flag.
 *   6. One order request per supplier per run, each line naming its job. A line
 *      with a Result already is never requested again.
 *   7. One message per tech and job, carrying the job id, and never a second.
 *   8. Publish the date's result every run, quiet or not.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Tomorrow's date in the business's own timezone. */
function tomorrow(now, offsetMinutes) {
  const local = new Date(now.getTime() + offsetMinutes * 60_000);
  return new Date(local.getTime() + DAY).toISOString().slice(0, 10);
}

function cutoffFor(now, rule) {
  const local = new Date(now.getTime() + rule.utc_offset_minutes * 60_000).toISOString().slice(0, 10);
  const [h, m] = String(rule.cutoff ?? "15:00").split(":").map(Number);
  return new Date(Date.parse(`${local}T00:00:00Z`) + (h * 60 + m - rule.utc_offset_minutes) * 60_000);
}

/** The needs, from the record, in the standard's order. Null when there are none. */
async function needsFor(ports, job, slot, f) {
  if (f.templateFirst) {
    const t = await ports.readTemplate(slot.job_type);
    if (Array.isArray(t) && t.length) return { source: "template", lines: t };
  }
  if (Array.isArray(job?.quote_lines) && job.quote_lines.length) return { source: "quote", lines: job.quote_lines };
  if (Array.isArray(job?.materials) && job.materials.length) return { source: "job", lines: job.materials };
  const t = await ports.readTemplate(slot.job_type);
  if (Array.isArray(t) && t.length) return { source: "template", lines: t };
  if (f.guessNeeds) return { source: "template", lines: [{ catalogue_code: "ISO-15", qty: 1 }] };
  return null;
}

/** A part in stock marked as able to stand in for `code`: a suggestion for a person, nothing more. */
function equivalentFor(code, van, shelf) {
  const v = (van?.lines ?? []).find((l) => (l.stands_in_for ?? []).includes(code) && l.qty > 0);
  if (v) return { catalogue_code: v.catalogue_code, where: "van" };
  const s = shelf.find((i) => (i.stands_in_for ?? []).includes(code) && i.on_hand - i.reserved > 0);
  if (s) return { catalogue_code: s.catalogue_code, where: s.location };
  return null;
}

/**
 * A build with one or more rules broken on purpose, for mutants.mjs. With no
 * faults it is the listed build.
 */
export function makeBuild(f = {}) {
  return async function build(ports, config = {}) {
    const now = ports.now();
    const rule = await ports.readRule();
    const owner = f.noOwner ? undefined : rule.exception_owner;
    const forDate = tomorrow(now, rule.utc_offset_minutes ?? 600);
    const staleMs = (rule.van_stale_hours ?? 24) * HOUR;

    const board = (await ports.readBoard(f.anyDate ? undefined : forDate)).filter((s) => !config.jobId || s.job_external_id === config.jobId);

    const prior = f.noDedupe ? [] : await ports.readResults(forDate);
    const priorMsgs = f.noDedupe || f.messageEveryRun ? [] : await ports.readMessages(forDate);
    const shelfRead = f.skipShelf ? { items: [] } : await ports.readShelf();
    const shelf = shelfRead.items;
    const suppliers = await ports.readSuppliers();

    const vans = new Map();
    const vanUsed = new Map(); // code per tech already promised to an earlier job this run
    const queued = new Map(); // supplier_id -> [{ job, line, slot }]
    const touched = new Map(); // job_external_id -> { slot, lines: [] } for this run
    const held = new Set();

    const flag = async (slot, code, reason, extra = {}) => {
      const exc = await ports.raiseException({
        for_date: forDate,
        job_external_id: slot.job_external_id,
        tech_id: slot.tech_id,
        catalogue_code: code,
        reason,
        owner,
        ...extra,
      });
      return exc?.exception_id ?? null;
    };

    const record = async (slot, row) => {
      const full = { for_date: forDate, job_external_id: slot.job_external_id, tech_id: slot.tech_id, ...row };
      await ports.writeResult(full);
      const t = touched.get(slot.job_external_id) ?? { slot, lines: [] };
      t.lines.push(full);
      touched.set(slot.job_external_id, t);
    };

    for (const slot of board) {
      const jobId = slot.job_external_id;
      const mine = prior.filter((r) => r.job_external_id === jobId);
      const excs = await ports.readExceptions(jobId);
      const openIds = new Set(excs.filter((e) => e.open).map((e) => e.exception_id));
      const ours = new Set(mine.map((r) => r.exception_id).filter(Boolean));
      // An open exception someone else raised on this job stops it here.
      if ([...openIds].some((id) => !ours.has(id))) {
        held.add(jobId);
        continue;
      }
      // A line is settled once it has a Result, unless it was flagged and that flag has since been closed.
      const settled = (code) => {
        const r = mine.find((x) => x.catalogue_code === code);
        return r && (r.status !== "flagged" || openIds.has(r.exception_id));
      };

      const job = await ports.readJob(jobId);
      const needs = await needsFor(ports, job, slot, f);
      if (!needs) {
        if (settled(null)) continue;
        const exception_id = await flag(slot, null, "needs_list_unknown");
        await record(slot, { catalogue_code: null, status: "flagged", reason: "needs_list_unknown", exception_id });
        continue;
      }

      const lines = needs.lines.filter((l) => !settled(l.catalogue_code));
      if (lines.length === 0) continue;

      if (!vans.has(slot.tech_id)) vans.set(slot.tech_id, await ports.readVan(slot.tech_id));
      const van = vans.get(slot.tech_id);
      const asOf = van?.as_of ? Date.parse(van.as_of) : NaN;
      const vanFresh = f.trustStale ? true : Number.isFinite(asOf) && now.getTime() - asOf <= staleMs;
      const used = vanUsed.get(slot.tech_id) ?? new Map();
      vanUsed.set(slot.tech_id, used);
      const slotStart = Date.parse(slot.start);

      for (const line of lines) {
        const code = line.catalogue_code;
        const qty = line.qty ?? 1;
        if (!vanFresh) {
          const exception_id = await flag(slot, code, "stock_unknown", { van_as_of: van?.as_of ?? null });
          await record(slot, { catalogue_code: code, qty, status: "flagged", reason: "stock_unknown", exception_id });
          continue;
        }
        const onVan = (van.lines ?? []).find((l) => l.catalogue_code === code)?.qty ?? 0;
        if (onVan - (used.get(code) ?? 0) >= qty) {
          used.set(code, (used.get(code) ?? 0) + qty);
          await record(slot, { catalogue_code: code, qty, status: "on_van" });
          continue;
        }
        const item = shelf.find((i) => i.catalogue_code === code);
        if (item && item.on_hand - item.reserved >= qty) {
          const r = await ports.reserve({ for_date: forDate, job_external_id: jobId, catalogue_code: code, qty });
          if (r?.reservation_id) {
            item.reserved += qty;
            await record(slot, { catalogue_code: code, qty, status: "pick_from_shelf", location: r.location ?? item.location, reservation_id: r.reservation_id });
            continue;
          }
        }
        const listing = suppliers.filter((s) => (s.codes ?? []).includes(code));
        const inTime = listing
          .filter((s) => f.ignoreLeadTime || now.getTime() + s.lead_hours * HOUR <= slotStart)
          .sort((a, b) => a.lead_hours - b.lead_hours)[0];
        const eq = equivalentFor(code, van, shelf);
        if (f.substitute && !inTime && eq) {
          // Broken on purpose: swaps in the equivalent without a person.
          if (eq.where === "van") await record(slot, { catalogue_code: eq.catalogue_code, qty, status: "on_van" });
          else {
            const r = await ports.reserve({ for_date: forDate, job_external_id: jobId, catalogue_code: eq.catalogue_code, qty });
            await record(slot, { catalogue_code: eq.catalogue_code, qty, status: "pick_from_shelf", location: eq.where, reservation_id: r?.reservation_id });
          }
          continue;
        }
        if (inTime) {
          const key = f.orderPerJob ? `${inTime.supplier_id}|${jobId}` : inTime.supplier_id;
          const q = queued.get(key) ?? { supplier_id: inTime.supplier_id, items: [] };
          q.items.push({ slot, code, qty });
          queued.set(key, q);
          continue;
        }
        const reason = listing.length ? "lead_time_after_job" : "not_in_stock";
        const suggestion = eq ? { equivalent: eq.catalogue_code, where: eq.where, note: "a person decides; nothing was reserved, ordered or listed for it" } : undefined;
        const exception_id = await flag(slot, code, reason, suggestion ? { suggestion } : {});
        await record(slot, { catalogue_code: code, qty, status: "flagged", reason, exception_id });
      }
    }

    // One request per supplier per run, each line naming its job. Material Order prices and holds it.
    for (const { supplier_id, items } of queued.values()) {
      const res = await ports.requestOrder({
        supplier_id,
        for_date: forDate,
        requested_by: "parts-check",
        lines: items.map((i) => ({ job_external_id: i.slot.job_external_id, catalogue_code: i.code, qty: i.qty })),
      });
      for (const i of items) {
        if (res?.po_external_id) {
          await record(i.slot, { catalogue_code: i.code, qty: i.qty, status: "ordered", supplier_id, po_external_id: res.po_external_id, eta: res.eta ?? null });
        } else {
          const exception_id = await flag(i.slot, i.code, "order_failed", { supplier_id });
          await record(i.slot, { catalogue_code: i.code, qty: i.qty, status: "flagged", reason: "order_failed", exception_id });
        }
      }
    }

    // One message per tech and job, with the job id. Never a second for the same date.
    const said = new Set(priorMsgs.map((m) => `${m.tech_id}|${m.job_external_id}`));
    const toTell = f.messageEveryRun
      ? board.map((s) => ({ slot: s, lines: [...prior, ...[...touched.values()].flatMap((t) => t.lines)].filter((r) => r.job_external_id === s.job_external_id) }))
      : [...touched.values()];
    for (const { slot, lines } of toTell) {
      const real = lines.filter((l) => l.catalogue_code !== null);
      if (real.length === 0) continue;
      const key = `${slot.tech_id}|${slot.job_external_id}`;
      if (said.has(key)) continue;
      said.add(key);
      const time = new Date(Date.parse(slot.start) + (rule.utc_offset_minutes ?? 600) * 60_000).toISOString().slice(11, 16);
      const parts = real.map((l) => {
        if (l.status === "on_van") return { catalogue_code: l.catalogue_code, qty: l.qty, status: "on_van", text: `${l.catalogue_code} x${l.qty} is on your van` };
        if (l.status === "pick_from_shelf")
          return { catalogue_code: l.catalogue_code, qty: l.qty, status: l.status, ...(f.noLocation ? {} : { location: l.location }), text: `pick up ${l.catalogue_code} x${l.qty}${f.noLocation ? "" : ` from ${l.location}`}, reserved for you` };
        if (l.status === "ordered") return { catalogue_code: l.catalogue_code, qty: l.qty, status: l.status, eta: l.eta, text: `${l.catalogue_code} x${l.qty} is on order` };
        return { catalogue_code: l.catalogue_code, qty: l.qty, status: "flagged", reason: l.reason, text: `${l.catalogue_code} x${l.qty}: flagged (${l.reason}), a person is on it` };
      });
      await ports.notify({
        for_date: forDate,
        tech_id: slot.tech_id,
        job_external_id: slot.job_external_id,
        lines: parts,
        body: `Tomorrow, job ${slot.job_external_id} at ${time}: ${parts.map((p) => p.text).join("; ")}.`,
      });
    }

    // The date's result, every run, quiet or not.
    const all = [...prior.filter((p) => !touched.get(p.job_external_id)?.lines.some((l) => l.catalogue_code === p.catalogue_code)), ...[...touched.values()].flatMap((t) => t.lines)];
    const fullBoard = config.jobId ? await ports.readBoard(forDate) : board;
    const jobs = fullBoard.map((s) => ({
      job_external_id: s.job_external_id,
      tech_id: s.tech_id,
      start: s.start,
      held: held.has(s.job_external_id),
      lines: all.filter((r) => r.job_external_id === s.job_external_id).map((r) => ({ catalogue_code: r.catalogue_code, status: r.status, reason: r.reason, location: r.location, po_external_id: r.po_external_id })),
    }));
    const flagged = all.filter((r) => r.status === "flagged").length;
    if (f.quietSilent && flagged === 0 && queued.size === 0) return;
    await ports.publishReport({
      for_date: forDate,
      cutoff: cutoffFor(now, rule).toISOString(),
      all_clear: flagged === 0,
      jobs,
      counts: {
        on_van: all.filter((r) => r.status === "on_van").length,
        pick_from_shelf: all.filter((r) => r.status === "pick_from_shelf").length,
        ordered: all.filter((r) => r.status === "ordered").length,
        flagged,
      },
    });
  };
}

export const build = makeBuild();
