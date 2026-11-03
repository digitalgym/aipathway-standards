/**
 * Site Orders: the material ordering job, built to AIP-BS-MATERIAL-ORDER 2026-10-03.
 * https://aipathway.com.au/explore-ai/material-order-build-standard
 *
 * A port of "Foreman" by Jonah, reimplemented from the standard. Foreman runs
 * a whole owner-builder house build; only one office job is ported here: turning
 * the build's material list into purchase orders per supplier and matching the
 * deliveries back. Nothing here is taken from the original bot's prompt or
 * instructions.
 *
 * What one run does, every time it is woken (schedule.tick, job.updated for a
 * job_id, document.received for a docket, exception.closed):
 *
 *   1. Read the jobs first, then the release rule, the suppliers, stock on hand
 *      and every supplier's catalogue. Nothing is cached between runs.
 *   2. Per job: skip it if an exception with a named owner is open on it.
 *   3. Reserve from stock any line stock covers, before anything is ordered.
 *   4. Price every remaining line from a supplier's catalogue, read this run. A
 *      code no catalogue holds goes on a parked order, unpriced, and a person is told.
 *   5. One order per job and supplier: update the existing one or do nothing.
 *      No id back is a failed write, raised to a person.
 *   6. Release: under the rule's threshold and to an approved supplier, the rule
 *      releases. Anything else waits for a named person. Nothing is sent unreleased.
 *   7. Lead time is data: an order that will land after the job's start tells
 *      the job owner, naming the order and the supplier.
 *   8. Dockets: matched to their order line by line. No order, no delivery.
 *      Every variance is escalated with the order id and an owner. A
 *      substitution is received only with a named person's acceptance.
 *
 * Every effect goes through the ports. Durable state lives on the order in the
 * ordering system; this file keeps nothing between runs.
 */

const DAY = 86_400_000;

/** A string that names a person. A rule name or an empty value is not one. */
const isPerson = (v) => typeof v === "string" && v.trim().length > 0;

const sameLines = (a, b) =>
  a.length === b.length &&
  a.every((l) => b.some((m) => m.code === l.code && m.qty === l.qty && m.price === l.price));

const totalOf = (lines) => lines.reduce((s, l) => s + l.qty * (l.price ?? 0), 0);

/**
 * @param {import("@aipathway/conformance").MaterialOrderPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();

  // 1. Read first. The job before any write, stock and catalogues before the first order.
  const jobs = await ports.readJobs();
  const rule = await ports.readReleaseRule();
  const suppliers = await ports.readSuppliers();
  const stock = await ports.readStock();
  const catalogues = new Map();
  for (const s of suppliers) catalogues.set(s.id, await ports.readCatalogue(s.id));

  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const available = new Map(stock.map((s) => [s.code, s.onHand - s.reserved]));
  const releaseOwner = rule?.owner;

  /** The approved supplier whose catalogue holds the code at the lowest price; else any that holds it. */
  const sourceFor = (code) => {
    const offers = [];
    for (const s of suppliers) {
      const item = catalogues.get(s.id)?.items.find((i) => i.code === code);
      if (item) offers.push({ supplier: s, item });
    }
    offers.sort((a, b) => Number(b.supplier.approved) - Number(a.supplier.approved) || a.item.price - b.item.price);
    return offers[0];
  };

  const ordersById = new Map();
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  for (const job of jobs) {
    // 2. An open exception with a named owner stops the chain for this record.
    if (job.exceptionOpen && isPerson(job.exception_owner)) continue;

    const existing = await ports.readOrdersForJob(job.id);
    for (const o of existing) ordersById.set(o.id, o);
    const record = await ports.readRecord(job.id);
    const escalated = (kind, orderId) => record.escalations.some((e) => e.kind === kind && e.orderId === orderId);

    // 3. Stock first. What is already reserved for this job counts; reserve only the rest.
    const toOrder = [];
    for (const line of job.materialLines) {
      const already = record.reservations.filter((r) => r.code === line.code).reduce((s, r) => s + r.qty, 0);
      let need = Math.max(0, line.qty - already);
      const free = available.get(line.code) ?? 0;
      const take = Math.min(need, free);
      if (take > 0 && (await ports.reserveStock(job.id, line.code, take))) {
        available.set(line.code, free - take);
        need -= take;
      }
      if (need > 0) toOrder.push({ code: line.code, qty: need });
    }

    // 4. Price from the catalogue read this run. Group by supplier; unknown codes park.
    const groups = new Map(); // supplierId | null -> { lines, edition }
    for (const l of toOrder) {
      const src = sourceFor(l.code);
      const key = src ? src.supplier.id : null;
      if (!groups.has(key)) groups.set(key, { lines: [], edition: src ? catalogues.get(key).edition : null, lead: 0 });
      const g = groups.get(key);
      g.lines.push({ code: l.code, qty: l.qty, price: src ? src.item.price : null });
      if (src) g.lead = Math.max(g.lead, src.item.leadDays ?? src.supplier.leadDays);
    }

    // 5. One order per job and supplier.
    for (const [supplierId, g] of groups) {
      const prior = existing.find((o) => o.supplierId === supplierId);
      const park = supplierId === null ? "not_in_catalogue" : undefined;
      let order = prior;

      if (prior) {
        const settled = prior.status === "sent" || prior.status === "delivered";
        if (!sameLines(prior.lines, g.lines)) {
          if (settled) {
            // A sent order is not rewritten. The difference goes to a person.
            if (!escalated("needs_person", prior.id))
              await ports.escalate({ kind: "needs_person", orderId: prior.id, owner: job.owner, detail: `job ${job.id} material list changed after order ${prior.externalId} was sent` });
            continue;
          }
          order = await ports.writeOrder({ orderId: prior.id, jobId: job.id, supplierId, lines: g.lines, catalogueEdition: g.edition, park });
        }
      } else {
        order = await ports.writeOrder({ jobId: job.id, supplierId, lines: g.lines, catalogueEdition: g.edition, park });
        if (order?.externalId && supplierId !== null) {
          // 7. Lead time, checked in the same run the order is written.
          const arrives = new Date(now.getTime() + g.lead * DAY);
          if (arrives.getTime() > new Date(job.start).getTime()) {
            await ports.notifyOwner({ to: job.owner, jobId: job.id, orderId: order.id, supplierId, arrives: arrives.toISOString() });
          }
        }
      }

      if (!order || !order.externalId) {
        // A null id is a failed write, not a success.
        await ports.escalate({ kind: "write_failed", orderId: prior?.id ?? `${job.id}/${supplierId ?? "uncatalogued"}`, owner: job.owner, detail: `no external id back for job ${job.id}, supplier ${supplierId ?? "none"}` });
        continue;
      }
      ordersById.set(order.id, order);

      if (park === "not_in_catalogue") {
        if (!escalated("not_in_catalogue", order.id))
          await ports.escalate({ kind: "not_in_catalogue", orderId: order.id, owner: job.owner, detail: `codes no catalogue holds: ${g.lines.map((l) => l.code).join(", ")}` });
        continue;
      }

      // 6. The release gate. Nothing is sent without a release on it.
      if (order.status === "sent" || order.status === "delivered") continue;
      if (order.status === "released") {
        const byPerson = isPerson(order.releasedBy);
        const supplier = supplierById.get(supplierId);
        const byValidRule = isPerson(order.releasedByRule) && rule && order.releasedByRule === rule.name && supplier?.approved && totalOf(order.lines) <= rule.threshold;
        if (byPerson || byValidRule) await ports.send(order.id);
        continue;
      }
      const supplier = supplierById.get(supplierId);
      const total = totalOf(order.lines);
      if (rule && supplier?.approved && total <= rule.threshold) {
        await ports.release(order.id, { rule: rule.name });
        await ports.send(order.id);
      } else if (!escalated("needs_person", order.id)) {
        const why = !supplier?.approved ? `supplier ${supplierId} is not on the approved list` : !rule ? "no release rule is set" : `total ${total} is over the ${rule.name} threshold of ${rule.threshold}`;
        await ports.escalate({ kind: "needs_person", orderId: order.id, owner: releaseOwner ?? job.owner, detail: `release needed: ${why}` });
      }
    }
  }

  // 8. Dockets, matched to their order by the order id on the docket.
  for (const docket of await ports.readDockets()) {
    const order = ordersById.get(docket.orderId);
    const job = order ? jobById.get(order.jobId) : undefined;
    if (job?.exceptionOpen && isPerson(job.exception_owner)) continue;
    if (!order || order.status !== "sent") {
      await ports.escalate({
        kind: "no_order",
        orderId: docket.orderId,
        owner: job?.owner ?? releaseOwner,
        detail: `docket ${docket.id} names order ${docket.orderId}, which ${order ? "was never sent" : "does not exist"}; not recorded as a delivery`,
      });
      continue;
    }
    const owner = job.owner;
    const variance = (kind, detail) => ports.escalate({ kind, orderId: order.id, owner, detail: `docket ${docket.id}: ${detail}` });
    const used = new Set();
    const lines = [];

    for (const ol of order.lines) {
      const sub = docket.lines.find((d) => d.substitutes === ol.code);
      const same = docket.lines.find((d) => d.code === ol.code && !d.substitutes);
      if (sub) {
        used.add(sub);
        if (isPerson(sub.acceptedBy)) {
          await ports.acceptSubstitution(order.id, ol.code, { person: sub.acceptedBy });
          lines.push({ code: ol.code, qtyReceived: sub.qtyReceived, reason: "substituted" });
        } else {
          await variance("substitution", `${sub.code} delivered in place of ${ol.code}, accepted by nobody; held, not received`);
          lines.push({ code: ol.code, qtyReceived: 0, reason: "substituted" });
        }
        continue;
      }
      if (!same) {
        lines.push({ code: ol.code, qtyReceived: 0, reason: "short" });
        await variance("short", `${ol.code}: ordered ${ol.qty}, none delivered`);
        continue;
      }
      used.add(same);
      if (same.damaged) {
        lines.push({ code: ol.code, qtyReceived: same.qtyReceived, reason: "damaged" });
        await variance("short", `${ol.code}: delivered damaged`);
      } else if (same.qtyReceived < ol.qty) {
        lines.push({ code: ol.code, qtyReceived: same.qtyReceived, reason: "short" });
        await variance("short", `${ol.code}: ordered ${ol.qty}, received ${same.qtyReceived}`);
      } else {
        lines.push({ code: ol.code, qtyReceived: same.qtyReceived });
        if (same.qtyReceived > ol.qty) await variance("over", `${ol.code}: ordered ${ol.qty}, received ${same.qtyReceived}`);
      }
      if (typeof same.price === "number" && same.price !== ol.price) {
        await variance("price_changed", `${ol.code}: ordered at ${ol.price}, docket says ${same.price}`);
      }
    }
    for (const d of docket.lines) {
      if (!used.has(d)) await variance("wrong_item", `${d.code} x${d.qtyReceived} is not on the order`);
    }
    await ports.recordDelivery(order.id, docket.id, lines);
  }
}
