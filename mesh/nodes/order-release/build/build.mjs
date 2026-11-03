/**
 * Order Release: one office job, built to AIP-BS-MATERIAL-ORDER 2026-10-03.
 *
 * Each run takes every job's material list and turns what stock does not cover
 * into one purchase order per job and supplier, priced only from that
 * supplier's catalogue. An order goes to the supplier only once it is
 * released: by the business's release rule when it is under the spending
 * limit and to an approved supplier, otherwise by a named person. Anything
 * the run cannot settle (an order waiting for a person, a code no catalogue
 * holds, a write with no id back, a docket with no order, every delivery
 * variance) is raised to a named person with the order id. Nothing is kept
 * between runs: everything the next run needs is read back through the ports.
 *
 * Everything goes through the ports it is handed. Every port call is awaited,
 * so the same build runs against the stub and against a live system.
 */

const DAY = 86_400_000;

/** The key a pair of job and supplier is written under. A null supplier is the parked pile. */
const pairKey = (jobId, supplierId) => `${jobId}::${supplierId ?? "unpriced"}`;

/** Two sets of order lines are the same order when every code, quantity and price agrees. */
function sameLines(a, b) {
  const norm = (ls) =>
    ls
      .map((l) => `${l.code}|${l.qty}|${l.price ?? "none"}`)
      .sort()
      .join(",");
  return norm(a) === norm(b);
}

const total = (lines) => lines.reduce((s, l) => s + l.qty * (l.price ?? 0), 0);

/**
 * Pick the supplier for a code: only suppliers whose catalogue holds it, an
 * approved one before an unapproved one, then the lower catalogue price. The
 * build never approves a supplier; it only reads the flag a person set.
 */
function supplierForCode(code, suppliers, catalogues) {
  const holders = suppliers
    .map((s) => ({ s, item: catalogues.get(s.id)?.items.find((i) => i.code === code) }))
    .filter((x) => x.item);
  if (holders.length === 0) return null;
  holders.sort((a, b) => Number(b.s.approved) - Number(a.s.approved) || a.item.price - b.item.price);
  return holders[0];
}

/**
 * @param {import("@aipathway/conformance").MaterialOrderPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();

  // Read everything first. The order is the claim: jobs, then stock, then the
  // supplier list and each catalogue, then the rule, and only then any write.
  const jobs = await ports.readJobs();
  const stock = await ports.readStock();
  const suppliers = await ports.readSuppliers();
  const catalogues = new Map();
  for (const s of suppliers) {
    const c = await ports.readCatalogue(s.id);
    if (c) catalogues.set(s.id, c);
  }
  const rule = await ports.readReleaseRule();
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  const freeStock = new Map(stock.map((s) => [s.code, Math.max(0, s.onHand - s.reserved)]));
  /** Every order this run can see, by its id, so a docket is matched by id and nothing else. */
  const ordersById = new Map();
  /** The owner of each job, by job id, so a variance names the person who owns the job. */
  const ownerOfJob = new Map(jobs.map((j) => [j.id, j.owner]));

  for (const job of jobs) {
    const existing = await ports.readOrdersForJob(job.id);
    const record = await ports.readRecord(job.id);
    for (const o of existing) ordersById.set(o.id, o);

    // An order that already carries an escalation is waiting on a person.
    // It is left exactly as it is: no rewrite, no second escalation, no send,
    // until the person acts on the record. A release by a named person is that
    // act for an order waiting on its release.
    const openOn = new Set(record.escalations.map((e) => e.orderId));
    const byPair = new Map(existing.map((o) => [pairKey(o.jobId, o.supplierId), o]));

    // 1 and 2. Every line comes from the job. What stock covers is reserved
    // against the job, counting what an earlier run already reserved.
    const alreadyReserved = new Map();
    for (const r of record.reservations) alreadyReserved.set(r.code, (alreadyReserved.get(r.code) ?? 0) + r.qty);

    /** pairKey -> { supplierId, lines[] } */
    const wanted = new Map();
    const want = (supplierId, line) => {
      const k = pairKey(job.id, supplierId);
      if (!wanted.has(k)) wanted.set(k, { supplierId, lines: [] });
      wanted.get(k).lines.push(line);
    };

    for (const line of job.materialLines) {
      let need = line.qty - (alreadyReserved.get(line.code) ?? 0);
      if (need <= 0) continue;
      const free = freeStock.get(line.code) ?? 0;
      const take = Math.min(free, need);
      if (take > 0 && (await ports.reserveStock(job.id, line.code, take))) {
        freeStock.set(line.code, free - take);
        need -= take;
      }
      if (need <= 0) continue;

      // 3. The price is the supplier's catalogue price for the code, read this run.
      const pick = supplierForCode(line.code, suppliers, catalogues);
      if (!pick) want(null, { code: line.code, qty: need, price: null });
      else want(pick.s.id, { code: line.code, qty: need, price: pick.item.price });
    }

    for (const [k, w] of wanted) {
      const prior = byPair.get(k);
      const parked = w.supplierId === null;
      const edition = parked ? null : (catalogues.get(w.supplierId)?.edition ?? null);

      // 4. One order per job and supplier. A pair that already has an order is
      // updated by its id, or left alone; it is never written a second time.
      let order = prior ?? null;
      if (prior) {
        const settled = openOn.has(prior.id) || ["released", "sent", "delivered"].includes(prior.status);
        if (!settled && !sameLines(prior.lines, w.lines)) {
          const updated = await ports.writeOrder({
            orderId: prior.id,
            jobId: job.id,
            supplierId: w.supplierId,
            lines: w.lines,
            catalogueEdition: edition,
            ...(parked ? { park: "not_in_catalogue" } : {}),
          });
          if (updated && updated.externalId) order = updated;
        }
      } else {
        order = await ports.writeOrder({
          jobId: job.id,
          supplierId: w.supplierId,
          lines: w.lines,
          catalogueEdition: edition,
          ...(parked ? { park: "not_in_catalogue" } : {}),
        });
        if (!order || !order.externalId) {
          // A null id is a failed write, not a success. Nothing is sent, and a
          // person is told, keyed to the job and supplier the write was for.
          await ports.escalate({
            kind: "write_failed",
            orderId: order?.id ?? pairKey(job.id, w.supplierId),
            owner: rule?.owner ?? job.owner,
            detail: `No id came back writing the order for job ${job.id} to supplier ${w.supplierId ?? "(none)"}. Nothing was sent.`,
          });
          continue;
        }
        ordersById.set(order.id, order);
        if (parked) {
          await ports.escalate({
            kind: "not_in_catalogue",
            orderId: order.id,
            owner: job.owner,
            detail: `No supplier catalogue holds ${w.lines.map((l) => l.code).join(", ")} for job ${job.id}. Parked unpriced until a person prices it.`,
          });
          continue;
        }
      }
      if (parked || !order) continue;
      byPair.set(k, order);
    }

    // 5 and 6. Release, send, and check the lead time, for every priced order
    // on the job that is not already gone and not waiting on an open exception.
    for (const order of byPair.values()) {
      if (!order.supplierId || order.status === "parked") continue;
      if (order.status === "sent" || order.status === "delivered") continue;
      const supplier = supplierById.get(order.supplierId);
      const personReleased = order.status === "released" && Boolean(order.releasedBy);
      if (openOn.has(order.id) && !personReleased) continue;

      const orderTotal = total(order.lines);
      const ruleMay = Boolean(rule) && Boolean(supplier?.approved) && orderTotal < rule.threshold;

      if (!personReleased) {
        if (!ruleMay) {
          const why = !supplier?.approved
            ? `${supplier?.name ?? order.supplierId} is not on the approved supplier list`
            : !rule
              ? "no release rule is set"
              : `the order total $${orderTotal.toFixed(2)} is over the $${rule.threshold.toFixed(2)} limit`;
          await ports.escalate({
            kind: "needs_person",
            orderId: order.id,
            owner: rule?.owner ?? job.owner,
            detail: `Order ${order.id} for job ${job.id} waits for a named person's release: ${why}.`,
          });
          continue;
        }
        await ports.release(order.id, { rule: rule.name });
      }
      await ports.send(order.id);

      // Lead time is data: the longest of the supplier's and each line's own.
      const cat = catalogues.get(order.supplierId);
      const lead = Math.max(
        supplier?.leadDays ?? 0,
        ...order.lines.map((l) => cat?.items.find((i) => i.code === l.code)?.leadDays ?? 0),
      );
      const arrives = new Date(now.getTime() + lead * DAY);
      if (arrives.getTime() > Date.parse(job.start)) {
        await ports.notifyOwner({
          to: job.owner,
          jobId: job.id,
          orderId: order.id,
          supplierId: order.supplierId,
          arrives: arrives.toISOString().slice(0, 10),
        });
      }
    }
  }

  // 7, 8 and 9. Each docket is matched to its order by the order id it
  // carries, line by line. A docket with no sent order is never a delivery.
  const dockets = await ports.readDockets();
  for (const d of dockets) {
    const order = ordersById.get(d.orderId);
    if (!order || !["sent", "delivered"].includes(order.status)) {
      await ports.escalate({
        kind: "no_order",
        orderId: d.orderId,
        owner: rule?.owner ?? jobs[0]?.owner ?? "the purchasing officer",
        detail: `Docket ${d.id} names order ${d.orderId}, which is not a sent order. Not recorded as a delivery.`,
      });
      continue;
    }
    const owner = ownerOfJob.get(order.jobId) ?? rule?.owner;
    const orderedCodes = new Set(order.lines.map((l) => l.code));
    const lines = [];

    for (const ol of order.lines) {
      const straight = d.lines.filter((l) => l.code === ol.code && !l.substitutes);
      const subs = d.lines.filter((l) => l.substitutes === ol.code);

      if (subs.length > 0) {
        // A substitute is received only when a named person signed for it.
        const sub = subs[0];
        if (sub.acceptedBy) {
          await ports.acceptSubstitution(order.id, ol.code, { person: sub.acceptedBy });
          lines.push({ code: ol.code, qtyReceived: sub.qtyReceived, reason: "substituted" });
        } else {
          lines.push({ code: ol.code, qtyReceived: 0, reason: "substituted" });
          await ports.escalate({
            kind: "substitution",
            orderId: order.id,
            owner,
            detail: `${sub.code} arrived in place of ${ol.code} and nobody accepted it. Held, not received.`,
          });
        }
        continue;
      }

      const received = straight.reduce((s, l) => s + l.qtyReceived, 0);
      const damaged = straight.some((l) => l.damaged);
      const line = { code: ol.code, qtyReceived: damaged ? 0 : received };
      if (damaged) line.reason = "damaged";
      else if (received < ol.qty) line.reason = "short";
      lines.push(line);

      if (damaged || received < ol.qty) {
        await ports.escalate({
          kind: "short",
          orderId: order.id,
          owner,
          detail: `${ol.code}: ordered ${ol.qty}, received ${damaged ? `${received} damaged` : received}.`,
        });
      } else if (received > ol.qty) {
        await ports.escalate({ kind: "over", orderId: order.id, owner, detail: `${ol.code}: ordered ${ol.qty}, received ${received}.` });
      }
      const priced = straight.find((l) => typeof l.price === "number" && l.price !== ol.price);
      if (priced) {
        await ports.escalate({
          kind: "price_changed",
          orderId: order.id,
          owner,
          detail: `${ol.code}: ordered at $${ol.price}, docket says $${priced.price}.`,
        });
      }
    }

    // A line the order does not hold, standing in for nothing, is a wrong item.
    for (const l of d.lines) {
      if (!orderedCodes.has(l.code) && !l.substitutes) {
        await ports.escalate({ kind: "wrong_item", orderId: order.id, owner, detail: `${l.code} x${l.qtyReceived} arrived and is not on the order.` });
      }
    }
    await ports.recordDelivery(order.id, d.id, lines);
  }
}
