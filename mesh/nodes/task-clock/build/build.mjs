/**
 * Task Clock: one list of office follow-up tasks, built to
 * AIP-BS-EXCEPTION-DESK 2026-11-01
 * (https://aipathway.com.au/explore-ai/exception-desk-build-standard).
 *
 * Anyone in the office, a sheet or a bot adds a follow-up task as a row on the
 * Tasks tab, against the job, quote or invoice it is about. Task Clock reads
 * that record by its id, gives the task its owner and due time from the
 * routing table the owner wrote, keeps one task per record and kind, nudges
 * once when a task goes late, and puts the open list in front of the office
 * every morning. A person ticks each task off with what they did. Task Clock
 * never ticks one off, never sends to a customer, and never works a dispute
 * or a hardship claim.
 *
 * The late nudge is the standard's one escalation. It goes to the person the
 * routing table names for late tasks of that kind; where the owner left that
 * blank, it goes to the task's own owner.
 *
 * Every run, whatever woke it: intake, then the late nudges, then the morning
 * list if it is due and not yet out. Nothing is kept between runs.
 */

export const CLOSED_TYPES = [
  "price_not_in_book",
  "variation",
  "unassignable",
  "parts_shortfall",
  "write_failed",
  "address_unresolved",
  "promise_broken",
  "dispute",
  "hardship",
  "stock_unknown",
  "needs_list_unknown",
  "unclassified_fault",
  "tech_unconfirmed",
  "other",
];

const STOP_CHASE = ["dispute", "hardship"];
const HOUR = 3_600_000;

function localParts(date, timeZone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return { day: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}

const toMinute = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};

const when = (iso, timeZone) =>
  new Intl.DateTimeFormat("en-AU", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );

export async function build(ports) {
  const routing = await ports.readRouting();
  const tz = routing.time_zone ?? "Australia/Brisbane";
  const routeFor = (type) => routing.rows.find((r) => r.type === type) ?? routing.rows.find((r) => r.type === "other") ?? null;

  // 1. Intake: every new row on the Tasks tab.
  for (const row of await ports.readTasksTab()) {
    await intake(ports, row, routeFor, tz);
  }

  // 2. One nudge per late task, never early, never twice, never on a ticked-off task.
  const now = ports.now();
  for (const task of await ports.listTasks({ status: "open" })) {
    if (task.escalated_at) continue;
    if (new Date(task.due_at).getTime() > now.getTime()) continue;
    const route = routeFor(task.type);
    // A dispute or hardship task is spoken of to its owner and nobody else.
    const to = task.stop_chase ? task.owner : (route?.escalate_to || task.owner);
    await ports.nudge(
      to,
      task.id,
      `Late: ${task.reason} (${task.record.system} ${task.record.external_id}), owned by ${task.owner}, was due ${when(task.due_at, tz)}. Tick it off with what was done.`,
    );
    await ports.writeTask({ op: "update", id: task.id, fields: { escalated_at: now.toISOString(), escalated_to: to } });
  }

  // 3. The morning list, once a day, at or after the set time, also when nothing is open.
  const here = localParts(now, tz);
  if (here.minute < toMinute(routing.summary_at ?? "07:30")) return;
  if (await ports.readList(here.day)) return;
  const open = await ports.listTasks({ status: "open" });
  const by_type = {};
  const by_owner = {};
  for (const t of open) {
    by_type[t.type] = (by_type[t.type] ?? 0) + 1;
    by_owner[t.owner] = (by_owner[t.owner] ?? 0) + 1;
  }
  const overdue = open.filter((t) => new Date(t.due_at).getTime() <= now.getTime()).map((t) => t.id);
  const other_labels = [...new Set(open.filter((t) => t.type === "other" && t.arrived_as).map((t) => t.arrived_as))];
  const lines = open.map(
    (t) => `${t.owner}: ${t.reason} (${t.record.external_id}), due ${when(t.due_at, tz)}${overdue.includes(t.id) ? ", LATE" : ""}`,
  );
  await ports.publishList({
    day: here.day,
    by_type,
    by_owner,
    overdue,
    other_labels,
    none: open.length === 0,
    text: open.length === 0 ? `Office tasks, ${here.day}: none open.` : [`Office tasks, ${here.day}: ${open.length} open, ${overdue.length} late.`, ...lines].join("\n"),
  });
}

async function intake(ports, row, routeFor, tz) {
  const from = row.from ?? {};
  const raiser = from.standard ?? from.person ?? "unknown";
  const sendBack = (why) =>
    ports.notify(raiser, { row_id: row.row_id, kind: "sent_back" }, `Not added: ${why}. Add it again with the id the job system or Xero issued.`);

  const rec = row.record;
  if (!rec || !rec.system || !rec.external_id) return sendBack("no record id");
  let held = null;
  if (rec.system === "servicem8") held = await ports.readJob(rec.system, rec.external_id);
  else if (rec.system === "xero") held = await ports.readLedger(rec.system, rec.external_id);
  else return sendBack(`${rec.system} is not a system this list reads`);
  if (!held) return sendBack(`${rec.system} does not hold ${rec.external_id}`);

  const label = String(row.label ?? "other");
  const type = CLOSED_TYPES.includes(label) ? label : "other";
  const reason = type === "other" && label !== "other" ? `[${label}] ${row.reason ?? ""}`.trim() : String(row.reason ?? "");

  const [open] = await ports.listTasks({ status: "open", system: rec.system, external_id: rec.external_id, type });

  // The cause went away upstream: mark it, leave it open for a person.
  if (row.resolved) {
    if (open) await ports.writeTask({ op: "update", id: open.id, fields: { resolved_upstream: true, resolved_note: String(row.reason ?? "") } });
    return;
  }

  const now = ports.now();
  if (open) {
    await ports.writeTask({
      op: "update",
      id: open.id,
      fields: { reason, raise_count: (open.raise_count ?? 1) + 1, last_raised_at: now.toISOString() },
    });
    return;
  }

  const route = routeFor(type);
  if (!route) return sendBack(`the routing table has no row for ${type} or other`);

  // Owner and clock from the routing table only. Any owner or due date on the row is ignored.
  const task = {
    raised_by: { standard: raiser, surface: from.surface ?? "workspace" },
    type,
    arrived_as: type === "other" ? label : null,
    record: { system: rec.system, external_id: rec.external_id },
    reason,
    evidence_uri: row.evidence_uri ?? null,
    owner: route.owner,
    raised_at: now.toISOString(),
    due_at: new Date(now.getTime() + Number(route.clock_hours) * HOUR).toISOString(),
    raise_count: 1,
    last_raised_at: now.toISOString(),
    resolved_upstream: false,
    stop_chase: STOP_CHASE.includes(type) ? type : null,
    escalated_at: null,
    escalated_to: null,
    status: "open",
  };
  const { id } = await ports.writeTask({ op: "create", task });
  if (!id) return sendBack("the task list returned no id, so nothing was added");
  await ports.notify(route.owner, { task_id: id, kind: "new_task" }, `New task for you: ${reason} (${rec.system} ${rec.external_id}), due ${when(task.due_at, tz)}.`);
}
