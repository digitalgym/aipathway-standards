/**
 * Van Stock: the van's shelves first, then one purchase order per job and
 * supplier for what the van does not carry, then every delivery docket
 * matched back line by line.
 *
 * Built to AIP-BS-MATERIAL-ORDER 2026-10-03
 * (https://aipathway.com.au/explore-ai/material-order-build-standard).
 *
 * Every run is the same short loop and keeps nothing between runs:
 *
 *   1. Read the jobs, the van and store stock, the supplier list, the release
 *      rule a person set, and every supplier's catalogue (read now, at order
 *      time, never remembered).
 *   2. For each job, by its id: read what is already ordered and reserved.
 *      A job carrying an open exception is left alone.
 *   3. Reserve from stock what the van or store covers. Order only the rest.
 *   4. Price each remaining line from the catalogue that holds its code. A
 *      code no catalogue holds goes on one parked order with no price, and the
 *      job owner is told.
 *   5. One order per job and supplier: update the one that exists, or write a
 *      new one and treat a missing id as a failed write, raised to a person.
 *   6. Release by the rule only under its threshold and to an approved
 *      supplier. Everything else waits for a named person.
 *   7. Lead time is data: an order that lands after the job starts tells the
 *      job owner in the same run.
 *   8. Dockets: matched to a sent order line by line, with every short, over,
 *      wrong item, changed price, damage and unaccepted substitution raised
 *      with the order id and an owner. A docket with no sent order is refused.
 *
 * Everything goes through the ports. The live write into the supplier portal
 * or job-system purchasing is a scoped build the standard says not to hand-roll.
 *
 * `makeBuild(breaks)` exists so mutants.mjs can prove each scenario goes red
 * when the behaviour it guards is removed. `build` is the real thing, with no
 * breaks.
 */

const DAY = 86_400_000;

const sameLines = (a, b) =>
  a.length === b.length &&
  a.every((l, i) => l.code === b[i].code && l.qty === b[i].qty && l.price === b[i].price);

const isoDate = (d) => d.toISOString().slice(0, 10);

/** @param {Record<string, boolean>} breaks deliberately broken behaviour, for mutants.mjs only */
export function makeBuild(breaks = {}) {
  return async function build(ports) {
    const now = await ports.now();
    const jobs = await ports.readJobs();
    // Stock is read before anything is ordered (check 2).
    const stock = breaks.ignoreStock ? [] : await ports.readStock();
    const suppliers = await ports.readSuppliers();
    const rule = await ports.readReleaseRule();

    // Every catalogue read at order time (check 3).
    const catalogues = new Map();
    for (const s of suppliers) {
      const c = await ports.readCatalogue(s.id);
      if (c) catalogues.set(s.id, c);
    }
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));

    /** The supplier whose catalogue holds a code: approved first, then any. */
    const sourceFor = (code) => {
      const holders = suppliers.filter((s) => catalogues.get(s.id)?.items.some((i) => i.code === code));
      return holders.find((s) => s.approved) ?? holders[0] ?? null;
    };

    const available = new Map(stock.map((s) => [s.code, s.onHand - s.reserved]));
    const ordersById = new Map();
    const ownerOfOrder = new Map();
    const defaultOwner = rule?.owner ?? jobs[0]?.owner ?? null;

    for (const job of jobs) {
      // An open exception on the job stops the chain until its owner closes it.
      if (job.openException) continue;

      const existing = await ports.readOrdersForJob(job.id);
      const record = await ports.readRecord(job.id);
      for (const o of existing) {
        ordersById.set(o.id, o);
        ownerOfOrder.set(o.id, job.owner);
      }
      const alreadyEscalated = (orderId, kind) =>
        record.escalations.some((e) => e.orderId === orderId && e.kind === kind);

      // 1. Stock first. A job already ordered keeps the reservations it has.
      const reservedFor = new Map();
      for (const r of record.reservations) reservedFor.set(r.code, (reservedFor.get(r.code) ?? 0) + r.qty);
      const toOrder = [];
      for (const line of job.materialLines) {
        let covered = reservedFor.get(line.code) ?? 0;
        if (existing.length === 0 && covered < line.qty) {
          const free = available.get(line.code) ?? 0;
          const take = Math.min(free, line.qty - covered);
          if (take > 0 && (await ports.reserveStock(job.id, line.code, take))) {
            available.set(line.code, free - take);
            covered += take;
          }
        }
        const rest = line.qty - covered;
        if (rest > 0) toOrder.push({ code: line.code, qty: rest });
      }
      if (breaks.extraLine) toOrder.push({ code: toOrder[0]?.code ?? "EXTRA", qty: 1 });

      // 2. Group by supplier, priced from that supplier's catalogue.
      const groups = new Map(); // supplierId | null -> lines
      for (const l of toOrder) {
        const s = sourceFor(l.code);
        const key = s ? s.id : null;
        const item = s ? catalogues.get(s.id).items.find((i) => i.code === l.code) : null;
        const price = item ? (breaks.typedPrice ? Math.round(item.price * 1.1 * 100) / 100 : item.price) : null;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ code: l.code, qty: l.qty, price });
      }

      for (const [supplierId, lines] of groups) {
        const supplier = supplierId ? supplierById.get(supplierId) : null;
        const edition = supplierId ? catalogues.get(supplierId).edition : null;
        const park = supplierId ? undefined : "not_in_catalogue";
        const prior = breaks.noDedupe ? undefined : existing.find((o) => o.supplierId === supplierId);

        let order;
        let created = false;
        if (prior) {
          order = prior;
          const editable = prior.status === "draft" || prior.status === "parked";
          if (editable && !sameLines(prior.lines, lines)) {
            const updated = await ports.writeOrder({ orderId: prior.id, jobId: job.id, supplierId, lines, catalogueEdition: edition, park });
            if (updated) order = updated;
          }
        } else {
          order = await ports.writeOrder({ jobId: job.id, supplierId, lines, catalogueEdition: edition, park });
          created = true;
          if (!order || !order.externalId) {
            // No id back means it was not written. Parked, with a person named.
            await ports.escalate({
              kind: "write_failed",
              orderId: order?.id ?? `${job.id}/${supplierId ?? "unpriced"}`,
              owner: job.owner,
              detail: `Order for job ${job.id} to ${supplier?.name ?? "no supplier"} was not written: no id came back.`,
            });
            continue;
          }
        }
        ordersById.set(order.id, order);
        ownerOfOrder.set(order.id, job.owner);

        if (park) {
          if (!alreadyEscalated(order.id, "not_in_catalogue")) {
            await ports.escalate({
              kind: "not_in_catalogue",
              orderId: order.id,
              owner: job.owner,
              detail: `No supplier catalogue holds ${lines.map((l) => l.code).join(", ")}. Price it, or change the line on the job.`,
            });
          }
          continue;
        }

        // 3. The release gate.
        if (order.status === "draft") {
          const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
          const ruleMay = rule && supplier?.approved && total < rule.threshold;
          if (ruleMay || breaks.releaseAll) {
            await ports.release(order.id, { rule: rule?.name ?? "auto" });
            await ports.send(order.id);
            order = { ...order, status: "sent" };
          } else if (!alreadyEscalated(order.id, "needs_person")) {
            const why = !supplier?.approved
              ? `${supplier?.name ?? supplierId} is not on the approved supplier list`
              : rule
                ? `total $${total.toFixed(2)} ex GST is over the ${rule.name} threshold of $${rule.threshold.toFixed(2)}`
                : "no release rule is set";
            await ports.escalate({
              kind: "needs_person",
              orderId: order.id,
              owner: rule?.owner ?? job.owner,
              detail: `Order ${order.id} for job ${job.id} waits for a named person's release: ${why}.`,
            });
          }
        } else if (order.status === "released" && order.releasedBy) {
          // A person released it since the last run.
          await ports.send(order.id);
          order = { ...order, status: "sent" };
        }
        ordersById.set(order.id, order);

        // 4. Lead time against the job's start, told in the same run.
        if (created && !breaks.noLeadNotify) {
          const lead = Math.max(
            ...lines.map((l) => catalogues.get(supplierId).items.find((i) => i.code === l.code)?.leadDays ?? supplier.leadDays),
          );
          const arrives = new Date(now.getTime() + lead * DAY);
          if (isoDate(arrives) > job.start.slice(0, 10)) {
            await ports.notifyOwner({ to: job.owner, jobId: job.id, orderId: order.id, supplierId, arrives: isoDate(arrives) });
          }
        }
      }
    }

    // 5. Dockets, matched back line by line.
    if (breaks.skipDockets) return;
    for (const docket of await ports.readDockets()) {
      const order = ordersById.get(docket.orderId);
      if (!order || (order.status !== "sent" && order.status !== "delivered")) {
        if (breaks.acceptAnyDocket) {
          await ports.recordDelivery(docket.orderId, docket.id, docket.lines.map((l) => ({ code: l.code, qtyReceived: l.qtyReceived })));
          continue;
        }
        await ports.escalate({
          kind: "no_order",
          orderId: docket.orderId,
          owner: defaultOwner,
          detail: `Docket ${docket.id} names order ${docket.orderId}, which is not a sent order. Not recorded as a delivery.`,
        });
        continue;
      }
      const owner = ownerOfOrder.get(order.id) ?? defaultOwner;
      const raise = async (kind, detail) => {
        if (breaks.absorbVariance) return;
        await ports.escalate({ kind, orderId: order.id, owner, detail: `Docket ${docket.id}: ${detail}` });
      };

      const used = new Set();
      const lines = [];
      for (const ol of order.lines) {
        const subIdx = docket.lines.findIndex((d, i) => !used.has(i) && d.substitutes === ol.code);
        if (subIdx >= 0) {
          used.add(subIdx);
          const d = docket.lines[subIdx];
          const person = breaks.autoAcceptSubs ? undefined : d.acceptedBy;
          if (breaks.autoAcceptSubs) {
            await ports.acceptSubstitution(order.id, ol.code, { rule: "substitutes-ok" });
            lines.push({ code: ol.code, qtyReceived: d.qtyReceived, reason: "substituted" });
          } else if (person) {
            await ports.acceptSubstitution(order.id, ol.code, { person });
            lines.push({ code: ol.code, qtyReceived: d.qtyReceived, reason: "substituted" });
          } else {
            lines.push({ code: ol.code, qtyReceived: 0, reason: "substituted" });
            await raise("substitution", `${d.code} delivered in place of ${ol.code} and nobody has accepted it. Held, not received.`);
          }
          continue;
        }
        const idx = docket.lines.findIndex((d, i) => !used.has(i) && d.code === ol.code && !d.substitutes);
        const d = idx >= 0 ? docket.lines[idx] : null;
        if (idx >= 0) used.add(idx);
        const got = d?.qtyReceived ?? 0;
        const line = { code: ol.code, qtyReceived: got };
        if (d?.damaged) {
          line.reason = "damaged";
          await raise("needs_person", `${ol.code} arrived damaged.`);
        } else if (got < ol.qty) {
          line.reason = "short";
        }
        lines.push(line);
        if (got < ol.qty) await raise("short", `${ol.code} ordered ${ol.qty}, received ${got}.`);
        if (got > ol.qty) await raise("over", `${ol.code} ordered ${ol.qty}, received ${got}.`);
        if (d && typeof d.price === "number" && d.price !== ol.price) {
          await raise("price_changed", `${ol.code} ordered at $${ol.price}, docket says $${d.price}.`);
        }
      }
      for (const [i, d] of docket.lines.entries()) {
        if (used.has(i)) continue;
        await raise("wrong_item", `${d.code} x${d.qtyReceived} is on the docket and not on order ${order.id}.`);
      }
      await ports.recordDelivery(order.id, docket.id, lines);
    }
  };
}

export const build = makeBuild();
