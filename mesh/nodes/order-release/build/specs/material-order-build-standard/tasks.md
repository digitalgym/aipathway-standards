# Tasks: material-order-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **lines-come-from-the-job** Every ordered line traces to a material line on the job
  - inject: One job with four material lines, each with a catalogue code and a quantity.
  - assert: The job is read before any order is written. The ordered lines, plus any line reserved from stock, match the job's codes and quantities exactly. An order line with no job line fails.
- [ ] **stock-checked-before-ordering** Stock on hand is read before the order, and a line stock covers is reserved rather than ordered
  - inject: The same job, with stock on hand covering one of its four lines in full.
  - assert: The stock read precedes the first order write. The covered line is reserved against the job and appears on no order. The other three lines are ordered. Ordering the covered line fails.
- [ ] **supplier-catalogue-is-the-only-source** Every line carries the supplier's catalogue code and price, read at order time, and a line no catalogue holds parks the order
  - inject: A job whose lines include one code that no supplier's catalogue holds.
  - assert: Each catalogue is read before the first order write. Every priced line's price equals that supplier's catalogue price for its code. The unknown code sits on a parked order with reason not_in_catalogue and no price. A typed price fails.
- [ ] **one-order-per-job-and-supplier** One order per job and supplier, written once, updated on a second run
  - inject: The same job run through the build twice, an hour apart.
  - assert: Exactly one order exists per job and supplier, each with an external id from the ordering system, and the second run produced an update or no write. A second order for the same pair, or a null id treated as success, fails.
- [ ] **threshold-needs-a-person** An order over the threshold, or to a supplier not on the approved list, is released only by a named person
  - inject: Three orders: one under the threshold to an approved supplier, one over it, one to a supplier not on the approved list.
  - assert: The first carries the rule's name on its release. The second and third are released only by a person's name or still wait, and each was routed to a person. A release by rule over the threshold or to an unapproved supplier fails, and a send with no release fails.
  - on the stub: The stub proves nothing leaves without a release event carrying a named person. Only the live path proves what left is what was released, rather than something regenerated after the approval.
- [ ] **lead-time-is-data** Each supplier carries a lead time, and an order that would miss the job's start tells the job owner
  - inject: A job starting in three days, with one line from a supplier whose lead time is ten days and the rest from a supplier at two.
  - assert: The supplier list is read. One notification names the job owner, the slow supplier's order and the arrival date. No notification is raised for the order that arrives in time. A late order with no notification fails.
- [ ] **delivery-matches-back** A delivery is recorded against the order line by line, and a delivery with no order is refused
  - inject: Two dockets: one against a sent order with one line short, one against an order number that does not exist.
  - assert: The first docket produces a delivery record on its order with a line per ordered line, the short line carrying its received quantity and reason short. The second produces no delivery record and an escalation naming the docket. A delivery attached to no order fails.
- [ ] **variance-is-a-queue** Short, over, wrong item and a changed price are escalated with the order id and an owner, never absorbed
  - inject: One delivery carrying a short line, an over-supplied line, a line the order does not hold, and a line whose docket price differs from the order.
  - assert: Four escalations exist, one per kind: short, over, wrong_item and price_changed. Each names the order id and a person as owner. A variance with no escalation, or one with no owner, fails.
- [ ] **nothing-is-substituted-silently** A supplier's substitution is accepted only by a named person
  - inject: One delivery with two substituted lines: one the site supervisor signed for on the docket by name, one nobody accepted.
  - assert: The signed line carries an acceptance naming the supervisor. The other is escalated as a substitution and is not counted as received. An acceptance with no person's name fails.
- [ ] **the-record-by-job** Every order, release, delivery and variance is retrievable by job
  - inject: One job ordered, released, delivered short and escalated.
  - assert: A read by job id returns the orders with external ids and catalogue editions, the release with a name or a rule, the delivery lines and the variance. A record missing the release or the delivery fails.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the catalogue and the release rule runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Quoted as a scoped build: send the check id, do not build it yourself.
