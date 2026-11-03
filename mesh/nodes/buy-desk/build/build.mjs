/**
 * Buy Desk: the buying and the receipts for a job, to AIP-BS-MATERIAL-ORDER.
 *
 * One run, woken by schedule.tick, job.updated or a docket landing
 * (document.received). It keeps nothing between runs: everything it needs is
 * read back from the job system and the ordering system by id.
 *
 * Per job, in the standard's order:
 *   1. read the job's material lines (the only source of a line);
 *   2. read stock on hand; a line stock covers in full is reserved, not ordered;
 *   3. read every supplier's catalogue at order time; the catalogue price is the
 *      only price; a code no catalogue holds goes on a parked order, unpriced,
 *      and the job owner is told;
 *   4. one order per job and supplier: read the existing orders first and update
 *      by id, never create a second; no external id back is a failed write;
 *   5. release by the named rule only under its threshold and to an approved
 *      supplier; everything else waits for a named person and is routed to one;
 *   6. lead time is data: an order arriving after the job's start tells the job
 *      owner in the same run.
 * Then every unmatched docket:
 *   7. matched to a sent order line by line, or refused and raised to a person;
 *   8. short, over, wrong item and a changed price each raised with the order
 *      id and an owner, never absorbed;
 *   9. a substitute is received only with a person's name on it.
 *
 * The money rules are locked: there is no port here that sends an order
 * without a release, approves a supplier, or writes a variance into cost.
 * Nothing is emailed; an order goes to the supplier only through the ordering
 * system's own send, after release.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Who a refused docket goes to when no job can be named from it. */
const PURCHASING_FALLBACK = "purchasing officer (set in the exception desk)";

function sameLines(a, b) {
  if (a.length !== b.length) return false;
  const key = (l) => `${l.code}|${l.qty}|${l.price}`;
  const x = a.map(key).sort();
  const y = b.map(key).sort();
  return x.every((k, i) => k === y[i]);
}

function total(lines) {
  return lines.reduce((s, l) => s + l.qty * (l.price ?? 0), 0);
}

/** An escalation for this order and kind is already open: do not raise it again. */
function alreadyRaised(record, orderId, kind) {
  return record.escalations.some((e) => e.orderId === orderId && e.kind === kind);
}

/**
 * @param {import("@aipathway/conformance").MaterialOrderPorts} ports
 */
export function build(ports) {
  const now = ports.now();

  // Read everything the run turns on before any write.
  const jobs = ports.readJobs();
  const stock = ports.readStock();
  const suppliers = ports.readSuppliers();
  const rule = ports.readReleaseRule();
  const catalogues = new Map();
  for (const s of suppliers) {
    const c = ports.readCatalogue(s.id);
    if (c) catalogues.set(s.id, c);
  }

  const available = new Map(stock.map((s) => [s.code, s.onHand - s.reserved]));
  const ordersById = new Map();

  for (const job of jobs) {
    const record = ports.readRecord(job.id);
    const existing = ports.readOrdersForJob(job.id);
    for (const o of existing) ordersById.set(o.id, o);

    // Who takes a decision on this job's buying: the rule's owner where a
    // person set one, otherwise the job's owner.
    const releaseOwner = rule?.owner ?? job.owner;

    // 2. Stock first. Reservations already on the record are not repeated.
    const reservedForJob = new Map();
    for (const r of record.reservations) reservedForJob.set(r.code, (reservedForJob.get(r.code) ?? 0) + r.qty);

    /** supplierId (or "" for unpriced) -> lines */
    const bySupplier = new Map();
    for (const line of job.materialLines) {
      if ((reservedForJob.get(line.code) ?? 0) >= line.qty) continue;
      const free = available.get(line.code) ?? 0;
      if (free >= line.qty && ports.reserveStock(job.id, line.code, line.qty)) {
        available.set(line.code, free - line.qty);
        continue;
      }

      // 3. The catalogue is the only source of a price. An approved supplier
      // that holds the code wins; an unapproved one is used only when no
      // approved catalogue holds it, and then it waits for a person (check 5).
      let pick = null;
      for (const s of suppliers) {
        const item = catalogues.get(s.id)?.items.find((i) => i.code === line.code);
        if (!item) continue;
        if (!pick || (s.approved && !pick.supplier.approved)) pick = { supplier: s, item };
        if (pick.supplier.approved) break;
      }
      const key = pick ? pick.supplier.id : "";
      if (!bySupplier.has(key)) bySupplier.set(key, []);
      bySupplier.get(key).push({ code: line.code, qty: line.qty, price: pick ? pick.item.price : null, leadDays: pick?.item.leadDays });
    }

    for (const [supplierId, priced] of bySupplier) {
      const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
      const lines = priced.map(({ code, qty, price }) => ({ code, qty, price }));
      const parked = supplier === null;
      const edition = supplier ? catalogues.get(supplier.id).edition : null;

      // 4. One order per job and supplier. Read before write; update by id.
      const prior = existing.find((o) => (o.supplierId ?? "") === supplierId);
      if (prior && (prior.status === "sent" || prior.status === "delivered" || prior.status === "released")) {
        // It has left, or a person or rule has released it. A change now is a
        // person's call, raised once, never a silent re-order.
        if (!sameLines(prior.lines, lines) && !alreadyRaised(record, prior.id, "needs_person")) {
          ports.escalate({ kind: "needs_person", orderId: prior.id, owner: releaseOwner, detail: "material list changed after release; not re-ordered" });
        }
        continue;
      }
      // An order already waiting on a person is left alone until they act.
      if (prior && sameLines(prior.lines, lines)) continue;

      const order = ports.writeOrder({
        ...(prior ? { orderId: prior.id } : {}),
        jobId: job.id,
        supplierId: supplier ? supplier.id : null,
        lines,
        catalogueEdition: edition,
        ...(parked ? { park: "not_in_catalogue" } : {}),
      });

      // No external id back is a failed write, not a success.
      if (!order || !order.externalId) {
        const ref = order?.id ?? prior?.id ?? `${job.id}:${supplierId || "unpriced"}`;
        ports.escalate({ kind: "write_failed", orderId: ref, owner: releaseOwner, detail: `job ${job.id}, supplier ${supplierId || "none"}: no external id back` });
        continue;
      }
      ordersById.set(order.id, order);

      if (parked) {
        if (!alreadyRaised(record, order.id, "not_in_catalogue")) {
          ports.escalate({
            kind: "not_in_catalogue",
            orderId: order.id,
            owner: job.owner,
            detail: `no supplier catalogue holds ${lines.map((l) => l.code).join(", ")}`,
          });
        }
        continue;
      }

      // 6. Lead time is data: the line's own, else the supplier's.
      const leadDays = Math.max(supplier.leadDays, ...priced.map((p) => p.leadDays ?? 0));
      const arrives = new Date(now.getTime() + leadDays * DAY);
      if (!prior && arrives.getTime() > new Date(job.start).getTime()) {
        ports.notifyOwner({ to: job.owner, jobId: job.id, orderId: order.id, supplierId: supplier.id, arrives: arrives.toISOString().slice(0, 10) });
      }

      // 5. The locked money rule.
      const orderTotal = total(lines);
      if (rule && supplier.approved && orderTotal < rule.threshold) {
        ports.release(order.id, { rule: rule.name });
        ports.send(order.id);
      } else if (!alreadyRaised(record, order.id, "needs_person")) {
        const why = !supplier.approved ? `${supplier.name} is not on the approved list` : rule ? `total ${orderTotal.toFixed(2)} is not under ${rule.name} (${rule.threshold})` : "no release rule is set";
        ports.escalate({ kind: "needs_person", orderId: order.id, owner: releaseOwner, detail: `waiting for a named release: ${why}` });
      }
    }
  }

  // 7-9. Receipts: every docket not yet matched.
  for (const docket of ports.readDockets()) {
    const order = ordersById.get(docket.orderId);
    if (!order || (order.status !== "sent" && order.status !== "delivered")) {
      ports.escalate({
        kind: "no_order",
        orderId: docket.orderId,
        owner: rule?.owner ?? PURCHASING_FALLBACK,
        detail: `docket ${docket.id} names ${docket.orderId}, which is not a sent order; not recorded as a delivery`,
      });
      continue;
    }
    const job = jobs.find((j) => j.id === order.jobId);
    const owner = job?.owner ?? rule?.owner ?? PURCHASING_FALLBACK;
    const raise = (kind, detail) => ports.escalate({ kind, orderId: order.id, owner, detail: `docket ${docket.id}: ${detail}` });

    const used = new Set();
    const deliveryLines = [];
    for (const ol of order.lines) {
      const direct = docket.lines.findIndex((d, i) => !used.has(i) && d.code === ol.code && !d.substitutes);
      const sub = docket.lines.findIndex((d, i) => !used.has(i) && d.substitutes === ol.code);
      if (direct >= 0) {
        used.add(direct);
        const d = docket.lines[direct];
        const line = { code: ol.code, qtyReceived: d.qtyReceived };
        if (d.damaged) {
          line.reason = "damaged";
          raise("short", `${ol.code} damaged on arrival (${d.qtyReceived} of ${ol.qty})`);
        } else if (d.qtyReceived < ol.qty) {
          line.reason = "short";
          raise("short", `${ol.code} ${d.qtyReceived} of ${ol.qty}`);
        } else if (d.qtyReceived > ol.qty) {
          raise("over", `${ol.code} ${d.qtyReceived} against ${ol.qty} ordered`);
        }
        if (typeof d.price === "number" && d.price !== ol.price) {
          raise("price_changed", `${ol.code} docket ${d.price} against order ${ol.price}`);
        }
        deliveryLines.push(line);
      } else if (sub >= 0) {
        used.add(sub);
        const d = docket.lines[sub];
        const person = typeof d.acceptedBy === "string" ? d.acceptedBy.trim() : "";
        if (person) {
          ports.acceptSubstitution(order.id, ol.code, { person });
          deliveryLines.push({ code: ol.code, qtyReceived: d.qtyReceived, reason: "substituted" });
        } else {
          raise("substitution", `${d.code} sent in place of ${ol.code}; nobody accepted it`);
          deliveryLines.push({ code: ol.code, qtyReceived: 0, reason: "substituted" });
        }
      } else {
        raise("short", `${ol.code} 0 of ${ol.qty}`);
        deliveryLines.push({ code: ol.code, qtyReceived: 0, reason: "short" });
      }
    }
    docket.lines.forEach((d, i) => {
      if (!used.has(i)) raise("wrong_item", `${d.code} x${d.qtyReceived} is not on ${order.id}`);
    });
    ports.recordDelivery(order.id, docket.id, deliveryLines);
  }
}
