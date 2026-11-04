/**
 * Service Due: a build to AIP-BS-NEXT-SERVICE (2026-10-24).
 *
 * One run, woken by job.completed or the morning schedule.tick, keeping
 * nothing between runs. Everything it knows it reads back through the ports:
 *
 *   1. Capture: every completed job's equipment goes onto the register once,
 *      exactly as the technician recorded it. A typed next-due date is ignored.
 *   2. Replies: each new reply is logged word for word against its asset by the
 *      message id it answers. STOP withdraws consent for good. YES becomes one
 *      booking request (no time, no price) and a person is told its job number.
 *      Anything else goes to a person as unclear_reply.
 *   3. Dates: for each asset with no open exception, the next service date and
 *      the warranty expiry are worked out from the written schedule and the
 *      record on every run. A gap in the record is raised, never guessed.
 *   4. Reminders: inside the written lead time, once per date, only if the job
 *      system has no open job for the unit and only on a channel the customer
 *      agreed to. Each reminder is DRAFTED onto the morning list and goes only
 *      once a named person releases it. One follow-up after the written gap,
 *      also released by a person, then nothing more for that date.
 *
 * A person releases every message, books the time and prices the work.
 */

const OWNER = "service coordinator"; // the exception owner and the person told about each booking request
const SENDER = "Example Plumbing & Gas";

const DAY = 86_400_000;
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

/** Calendar months on a YYYY-MM-DD date, clamped to the month's last day. */
export function addMonths(day, months) {
  const [y, m, d] = day.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return isoDay(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)));
}

const addDays = (day, n) => isoDay(Date.parse(`${day}T00:00:00.000Z`) + n * DAY);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const spoken = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

const unit = (a) => [a.make, a.model].filter(Boolean).join(" ");

const firstName = (name) => String(name ?? "").split(" ")[0] || "there";

/** The words. A warranty reminder states the date on our record and nothing about cover. */
function body({ kind, stage, asset, dueOn, name }) {
  const hi = `Hi ${firstName(name)},`;
  const tail = `Reply YES and we will call to book a time, or use the booking link. Reply STOP to opt out. ${SENDER}`;
  const again = stage === "follow_up" ? " Just following up on our earlier note." : "";
  if (kind === "warranty") {
    return `${hi}${again} the warranty on your ${unit(asset)} ends on ${spoken(dueOn)}, according to our record. If you would like it serviced before then, ${tail}`;
  }
  return `${hi}${again} your ${unit(asset)} is due for its service on ${spoken(dueOn)}. ${tail}`;
}

const YES = /^\s*(yes|yep|yeah|y|ok|okay|sure)\b[\s.!]*(please)?[\s.!]*$/i;
const STOP = /\b(stop|unsubscribe|opt[\s-]?out|do not contact|don't contact|remove me|no more)\b/i;
const classify = (text) => (STOP.test(text) ? "stop" : YES.test(text) ? "yes" : "unclear");

/** The two derived dates for an asset, or the gaps that stop it. */
function derive(asset, rules) {
  const gaps = [];
  if (!asset.equipmentType) gaps.push("missing_equipment_type");
  if (!asset.installedOn) gaps.push("missing_install_date");
  if (!asset.model) gaps.push("missing_model");
  const rule = asset.equipmentType ? rules.find((r) => r.equipmentType === asset.equipmentType) : null;
  if (asset.equipmentType && !rule) gaps.push("no_schedule");
  if (gaps.length) return { gaps, dates: [] };
  const anchor = asset.lastServicedOn ?? asset.installedOn;
  const dates = [{ kind: "service", dueOn: addMonths(anchor, rule.serviceMonths), rule: `${rule.equipmentType}: ${rule.serviceMonths} months (changed ${rule.changedOn} by ${rule.changedBy})` }];
  if (Number.isInteger(asset.warrantyMonths) && asset.warrantyMonths > 0) {
    dates.push({ kind: "warranty", dueOn: addMonths(asset.installedOn, asset.warrantyMonths), rule: `warranty term on record: ${asset.warrantyMonths} months` });
  }
  return { gaps: [], dates };
}

const fieldsOf = (eq) => ({
  equipmentType: eq.equipmentType ?? null,
  make: eq.make ?? null,
  model: eq.model ?? null,
  serial: eq.serial ?? null,
  installedOn: eq.installedOn ?? null,
  lastServicedOn: eq.servicedOn ?? null,
  warrantyMonths: Number.isInteger(eq.warrantyMonths) ? eq.warrantyMonths : null,
});

/**
 * @param {ReturnType<import("./service-book-world.mjs").ServiceBookWorld["ports"]>} ports
 */
export async function build(ports) {
  const today = isoDay(await ports.now());

  // ── 1. Capture, once per completed job. ──
  let assets = await ports.readAssets();
  const captured = new Set(assets.flatMap((a) => a.records.map((r) => r.sourceJobId)));
  for (const job of await ports.listCompletedJobs()) {
    if (job.status !== "complete" || !job.equipment || captured.has(job.id)) continue;
    const res = await ports.recordService({ sourceJobId: job.id, assetId: job.assetId ?? null, customerId: job.customerId, fields: fieldsOf(job.equipment) });
    if (!res?.id) {
      await ports.escalate({ kind: "write_failed", assetId: job.assetId ?? null, detail: `job ${job.id}: the register returned no asset id`, owner: OWNER });
      continue;
    }
    captured.add(job.id);
  }
  assets = await ports.readAssets();
  const byId = new Map(assets.map((a) => [a.id, a]));

  // ── 2. Replies, each once, matched by the message id it answers. ──
  const seenReplies = new Set(assets.flatMap((a) => a.history.filter((h) => h.type === "reply").map((h) => h.replyId)));
  const sentIndex = new Map();
  for (const a of assets) for (const h of a.history) if (h.type === "sent") sentIndex.set(h.messageId, { asset: a, entry: h });

  for (const r of await ports.readInbox()) {
    if (seenReplies.has(r.id)) continue;
    let asset = null;
    let dueOn = null;
    let kind = null;
    if (r.inReplyTo && sentIndex.has(r.inReplyTo)) {
      const hit = sentIndex.get(r.inReplyTo);
      asset = hit.asset;
      dueOn = hit.entry.dueOn;
      kind = hit.entry.kind;
    } else if (r.channel === "link" && r.assetId && byId.has(r.assetId)) {
      asset = byId.get(r.assetId);
      dueOn = r.dueOn;
      kind = "service";
    }
    if (!asset) continue; // not ours to read: no id we issued
    const outcome = r.channel === "link" ? "yes" : classify(r.text);
    seenReplies.add(r.id);
    await ports.evidence(asset.id, { type: "reply", replyId: r.id, inReplyTo: r.inReplyTo, channel: r.channel, kind, dueOn, replyText: r.text, outcome });

    if (outcome === "stop") {
      await ports.recordConsent({ customerId: asset.customerId, withdrawn: true, said: r.text, replyId: r.id });
      await ports.evidence(asset.id, { type: "stop", customerId: asset.customerId, said: r.text, replyId: r.id });
    } else if (outcome === "unclear") {
      await ports.escalate({ kind: "unclear_reply", assetId: asset.id, replyId: r.id, detail: `reply to be answered by a person: "${r.text}"`, owner: OWNER });
    } else {
      // A yes: one booking request per asset and date, checked against the job system first.
      const open = await ports.openJobsFor(asset.id);
      const already = open.some((j) => j.kind === "booking_request") ||
        asset.history.some((h) => h.type === "booking_request" && h.dueOn === dueOn);
      if (already) continue;
      const intentId = `${asset.id}:${dueOn}:booking_request:service-due`;
      const res = await ports.writeJob({ kind: "booking_request", customerId: asset.customerId, assetId: asset.id, dueOn, replyText: r.text, note: "Customer said yes. Book a time and price the work." }, intentId);
      const back = res?.id ? await ports.readJob(res.id) : null;
      if (!back || back.assetId !== asset.id) {
        await ports.escalate({ kind: "write_failed", assetId: asset.id, replyId: r.id, detail: "booking request did not read back", owner: OWNER });
        continue;
      }
      asset.history.push({ type: "booking_request", dueOn, jobNumber: back.id });
      await ports.evidence(asset.id, { type: "booking_request", dueOn, jobNumber: back.id, replyText: r.text });
      await ports.notify(OWNER, back.id, `booking request waiting for ${unit(asset)} (${asset.id}): book a time and price it`);
    }
  }

  // ── 3 and 4. Dates and reminders. ──
  assets = await ports.readAssets();
  const { rules, settings } = await ports.readSchedule();
  const lead = settings.leadDays;
  const gap = settings.followUpDays;

  for (const asset of assets) {
    if (asset.openExceptions.length > 0) continue; // an open exception stops this asset until a person clears it

    const { gaps, dates } = derive(asset, rules);
    if (gaps.length) {
      for (const kind of gaps) await ports.escalate({ kind, assetId: asset.id, detail: `${asset.id} (job ${asset.sourceJobId}): ${kind.replace(/_/g, " ")}`, owner: OWNER });
      continue;
    }

    for (const { kind, dueOn, rule } of dates) {
      const sentFor = (stage) => asset.history.find((h) => h.type === "sent" && h.kind === kind && h.dueOn === dueOn && h.stage === stage);
      const draftFor = (stage) => asset.history.find((h) => h.type === "drafted" && h.kind === kind && h.dueOn === dueOn && h.stage === stage);
      const replied = asset.history.some((h) => h.type === "reply" && h.kind === kind && h.dueOn === dueOn);
      const reminder = sentFor("reminder");

      let stage = null;
      if (!reminder) {
        if (today < addDays(dueOn, -lead) || today > dueOn) continue; // outside the window, or gone
        stage = "reminder";
      } else {
        if (replied || sentFor("follow_up")) continue;
        if (today < addDays(isoDay(reminder.sentAt), gap) || today > dueOn) continue;
        stage = "follow_up";
      }

      // Already booked means no reminder.
      const open = await ports.openJobsFor(asset.id);
      if (open.length > 0) continue;

      const consent = await ports.consentOf(asset.customerId);
      if (!consent || consent.optedOut) continue;
      const channel = consent.sms ? "sms" : consent.email ? "email" : null;
      if (!channel) {
        await ports.escalate({ kind: "no_consent", assetId: asset.id, detail: `${asset.customerId} agreed to neither SMS nor email`, owner: OWNER });
        break;
      }

      let draft = draftFor(stage);
      if (!draft) {
        const text = body({ kind, stage, asset, dueOn, name: consent.name });
        const d = await ports.draftMessage({ assetId: asset.id, customerId: asset.customerId, kind, dueOn, stage, channel, body: text, rule });
        if (!d?.id) continue;
        draft = { draftId: d.id, channel, body: text };
        await ports.evidence(asset.id, { type: "drafted", kind, dueOn, stage, channel, draftId: d.id, body: text, rule });
        await ports.evidence(asset.id, { type: "service_due", kind, dueOn, rule });
      }

      const rel = await ports.releaseOf(draft.draftId);
      if (!rel?.released) continue; // stays on the morning list for the named person

      const s = await ports.sendMessage({ draftId: draft.draftId });
      if (!s?.sent || !s.id) {
        await ports.escalate({ kind: "send_refused", assetId: asset.id, detail: `send refused: ${s?.refused ?? "no id"}`, owner: OWNER });
        break;
      }
      const sentAt = (await ports.now()).toISOString();
      asset.history.push({ type: "sent", kind, dueOn, stage, messageId: s.id, sentAt });
      await ports.evidence(asset.id, { type: "sent", kind, dueOn, stage, channel: draft.channel, messageId: s.id, draftId: draft.draftId, releasedBy: rel.by, sentAt, body: draft.body });
    }
  }
}
