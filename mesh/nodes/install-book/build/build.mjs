/**
 * Install Book: the build, to AIP-BS-NEXT-SERVICE (2026-10-24).
 *
 * When an install or service job is marked complete, take the equipment off
 * the job's commissioning record or service sheet exactly as the technician
 * wrote it, work out the first (or next) service date from the business's
 * written schedule and the warranty end from the term on the record, remind
 * the customer once ahead of each date on a channel they agreed to, follow up
 * once, and turn a yes into one booking request with no time and no price for
 * a person to book.
 *
 * What it never does: hand the commissioning record to the customer, register
 * the warranty with the maker, book a time, price the work, or say what a
 * warranty covers. Those stay with a person.
 *
 * Every run reads everything it needs from the job system, the asset register,
 * the schedule and the record kept by asset. It keeps nothing between runs,
 * and no due date is ever stored: they are worked out on every run.
 */

const FIELDS = ["equipment_type", "make", "model", "serial", "installed_on", "serviced_on", "warranty_months"];
const TZ = "Australia/Brisbane";
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* ---------------- dates, as ISO calendar dates ---------------- */

function isoToday(now) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function addMonths(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(iso, days) {
  const t = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function spoken(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const blank = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/* ---------------- the register, read as assets ---------------- */

/** Fold the service records into one asset each. Nothing is guessed: a gap stays a gap. */
function assetsFrom(records) {
  const byAsset = new Map();
  for (const r of records) {
    if (!byAsset.has(r.asset_id)) byAsset.set(r.asset_id, []);
    byAsset.get(r.asset_id).push(r);
  }
  const out = [];
  for (const [asset_id, recs] of byAsset) {
    const base = recs.find((r) => r.job_kind === "install") ?? recs[0];
    const services = recs.map((r) => r.serviced_on).filter((d) => !blank(d)).sort();
    out.push({
      asset_id,
      customer_id: base.customer_id,
      source_job_id: base.source_job_id,
      equipment_type: base.equipment_type ?? null,
      make: base.make ?? null,
      model: base.model ?? null,
      serial: base.serial ?? null,
      installed_on: base.installed_on ?? null,
      last_serviced_on: services.length ? services[services.length - 1] : null,
      warranty_months: blank(base.warranty_months) ? null : base.warranty_months,
    });
  }
  return out;
}

function gapOf(asset) {
  if (blank(asset.equipment_type)) return "missing_equipment_type";
  if (blank(asset.installed_on)) return "missing_install_date";
  if (blank(asset.model)) return "missing_model";
  return null;
}

/* ---------------- replies ---------------- */

const STOP_RE = /^\s*(stop|unsubscribe|opt\s*out|cancel)\b|\b(stop (messaging|texting|emailing|contacting)|don'?t (text|email|contact)|remove me|no more (messages|texts|emails))\b/i;
const YES_RE = /^\s*(yes|y|yep|yeah|yes please|ok(ay)?,? book)\b[\s.!]*$/i;

function classify(reply) {
  if (STOP_RE.test(reply.text ?? "")) return "stop";
  if (reply.channel === "link") return "yes";
  if (YES_RE.test(reply.text ?? "")) return "yes";
  return "unclear";
}

/* ---------------- messages ---------------- */

function messageFor(asset, due, stage, firstName, business) {
  const unit = [asset.make, asset.model].filter((x) => !blank(x)).join(" ");
  const hello = firstName ? `Hi ${firstName}, ` : "Hi, ";
  const again = stage === "follow_up" ? "Just following up: " : "";
  if (due.kind === "service") {
    return (
      `${hello}${again}your ${unit} is due for its service on ${spoken(due.due_on)}. ` +
      `Reply YES and we will call to book a time, or use the booking link. Reply STOP to opt out. ${business}`
    );
  }
  return (
    `${hello}${again}the warranty on your ${unit} ends on ${spoken(due.due_on)}, according to our record. ` +
    `Reply YES and we will call to book a time to look at it, or use the booking link. Reply STOP to opt out. ${business}`
  );
}

/* ---------------- the run ---------------- */

/**
 * @param {ReturnType<import("./service-book-world.mjs").ServiceBookWorld["ports"]>} ports
 */
export async function build(ports) {
  const settings = await ports.readSettings();
  const today = isoToday(ports.now());

  // 1. Capture: each completed job, once, exactly as the job holds it.
  const { job_ids } = await ports.listCompletedJobs();
  const before = (await ports.readRegister()).records;
  for (const jobId of job_ids) {
    if (before.some((r) => r.source_job_id === jobId)) continue;
    const job = await ports.readJob(jobId);
    if (!job || job.status !== "complete" || !job.equipment || blank(job.asset_id)) continue;
    const rec = { asset_id: job.asset_id, customer_id: job.customer_id, source_job_id: job.job_id, job_kind: job.kind };
    for (const f of FIELDS) rec[f] = job.equipment[f] ?? null;
    const res = await ports.recordService(rec);
    if (!res?.record_id) {
      await ports.escalate({ ref: job.asset_id, kind: "next_service.record_not_written", detail: `${job.asset_id}; job ${job.job_id}` });
    }
  }
  const records = (await ports.readRegister()).records;
  const assets = assetsFrom(records);
  const assetById = new Map(assets.map((a) => [a.asset_id, a]));

  // 2. Replies first, so a yes or a stop lands before anything else is sent.
  const { replies } = await ports.readInbox();
  for (const reply of replies) {
    const asset = assetById.get(reply.asset_id);
    const seen = (await ports.readHistory(reply.asset_id)).entries.some((e) => e.reply_id === reply.reply_id);
    if (seen) continue;
    await ports.evidence({
      entry: "reply",
      asset_id: reply.asset_id,
      customer_id: reply.customer_id,
      reply_id: reply.reply_id,
      kind: reply.kind,
      due_on: reply.due_on,
      channel: reply.channel,
      text: reply.text,
    });
    const said = classify(reply);
    if (said === "stop") {
      await ports.recordConsent({ customer_id: reply.customer_id, withdrawn: true, said: reply.text, received_at: reply.received_at });
      await ports.evidence({ entry: "stop", asset_id: reply.asset_id, customer_id: reply.customer_id, reply_id: reply.reply_id, said: reply.text });
      continue;
    }
    if (said === "yes" && asset && asset.customer_id === reply.customer_id) {
      await bookOnce(ports, settings, asset, reply);
      continue;
    }
    await ports.escalate({ ref: reply.reply_id, kind: "unclear_reply", detail: `${reply.asset_id}; ${reply.text}` });
  }

  // 3. Each asset: stop on an open exception, name any gap, then work out the dates.
  for (const asset of assets) {
    if ((await ports.openExceptions(asset.asset_id)).exceptions.length > 0) continue;
    const gap = gapOf(asset);
    if (gap) {
      await ports.escalate({ ref: asset.asset_id, kind: gap, detail: `${asset.asset_id}; job ${asset.source_job_id}` });
      continue;
    }
    const rule = await ports.readSchedule(asset.equipment_type);
    if (!rule || typeof rule.service_months !== "number") {
      await ports.escalate({ ref: asset.asset_id, kind: "no_schedule", detail: `${asset.asset_id}; ${asset.equipment_type}` });
      continue;
    }
    const anchor = asset.last_serviced_on ?? asset.installed_on;
    const dues = [{ kind: "service", due_on: addMonths(anchor, rule.service_months) }];
    if (typeof asset.warranty_months === "number") {
      dues.push({ kind: "warranty", due_on: addMonths(asset.installed_on, asset.warranty_months) });
    }
    for (const due of dues) {
      const stop = await remind(ports, settings, today, asset, due);
      if (stop) break;
    }
  }
}

/** One reminder or one follow-up for one date, or nothing. Returns true when the asset is now halted. */
async function remind(ports, settings, today, asset, due) {
  if (due.due_on < today) return false;
  const entries = (await ports.readHistory(asset.asset_id)).entries.filter(
    (e) => e.kind === due.kind && e.due_on === due.due_on,
  );
  if (entries.some((e) => e.entry === "reply")) return false;
  const first = entries.find((e) => e.entry === "reminder");
  const follow = entries.find((e) => e.entry === "follow_up");
  let stage = null;
  if (!first) {
    if (today >= addDays(due.due_on, -settings.lead_days)) stage = "reminder";
  } else if (!follow) {
    if (today >= addDays(first.sent_on, settings.follow_up_days)) stage = "follow_up";
  }
  if (!stage) return false;

  const open = await ports.openJobsForAsset(asset.asset_id);
  if (open.jobs.length > 0) return false;

  const consent = await ports.consentFor(asset.customer_id);
  if (!consent || consent.withdrawn) return false;
  const channel = consent.sms ? "sms" : consent.email ? "email" : null;
  if (!channel) {
    await ports.escalate({ ref: asset.asset_id, kind: "no_consent", detail: `${asset.asset_id}; customer ${asset.customer_id}` });
    return true;
  }
  const body = messageFor(asset, due, stage, consent.first_name, settings.business_name);
  const res = await ports.sendMessage({
    customer_id: asset.customer_id,
    asset_id: asset.asset_id,
    kind: due.kind,
    due_on: due.due_on,
    stage,
    channel,
    body,
  });
  if (!res?.sent || !res.message_id) {
    await ports.escalate({ ref: asset.asset_id, kind: "next_service.send_refused", detail: `${asset.asset_id}; ${res?.refused ?? "no message id"}` });
    return true;
  }
  await ports.evidence({
    entry: stage,
    asset_id: asset.asset_id,
    customer_id: asset.customer_id,
    kind: due.kind,
    due_on: due.due_on,
    channel,
    message_id: res.message_id,
    sent_on: today,
    body,
  });
  return false;
}

/** A yes: look for a request first, write one only if none is there, read it back, tell a person. */
async function bookOnce(ports, settings, asset, reply) {
  if ((await ports.openExceptions(asset.asset_id)).exceptions.length > 0) return;
  const open = await ports.openJobsForAsset(asset.asset_id);
  if (open.jobs.length > 0) {
    await ports.evidence({ entry: "booking_already_open", asset_id: asset.asset_id, reply_id: reply.reply_id, job_id: open.jobs[0].job_id });
    return;
  }
  const unit = [asset.make, asset.model].filter((x) => !blank(x)).join(" ");
  const res = await ports.writeJob({
    kind: "booking_request",
    customer_id: asset.customer_id,
    asset_id: asset.asset_id,
    due_on: reply.due_on,
    description: `Booking request: ${reply.kind} for ${unit}${asset.serial ? ` (serial ${asset.serial})` : ""}. A person books the time and prices the work.`,
    reply_text: reply.text,
  });
  const back = res?.job_id ? await ports.readJob(res.job_id) : null;
  if (!back || back.asset_id !== asset.asset_id || back.customer_id !== asset.customer_id) {
    await ports.escalate({ ref: asset.asset_id, kind: "next_service.booking_not_read_back", detail: `${asset.asset_id}; reply ${reply.reply_id}` });
    return;
  }
  await ports.notify(settings.office, back.job_id, `Booking request ${back.job_id} is waiting: book a time and price the work.`);
  await ports.evidence({
    entry: "booking_request",
    asset_id: asset.asset_id,
    customer_id: asset.customer_id,
    reply_id: reply.reply_id,
    job_id: back.job_id,
  });
}
