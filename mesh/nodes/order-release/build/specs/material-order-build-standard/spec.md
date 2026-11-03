# AIP-BS-MATERIAL-ORDER: material-order-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/material-order-build-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/material-order-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/material-order-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Ten of these twelve checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one is quoted as a scoped build. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **lines-come-from-the-job** Every ordered line traces to a material line on the job. An order line exists because the job carries a material line with that catalogue code and quantity. Nothing is ordered that the job does not list, and nothing on the job is dropped without a parked reason.
- **stock-checked-before-ordering** Stock on hand is read before the order, and a line stock covers is reserved rather than ordered. Before any order is written, stock on hand is read. A line the store or the van already covers is reserved against the job and does not appear on a purchase order. An order that ignores stock fails.
- **supplier-catalogue-is-the-only-source** Every line carries the supplier's catalogue code and price, read at order time, and a line no catalogue holds parks the order. The price on a line is the supplier's catalogue price for that code, read when the order is drafted. No price is typed, remembered or averaged. A code no supplier's catalogue holds parks the order with reason not_in_catalogue and a person is told.
- **one-order-per-job-and-supplier** One order per job and supplier, written once, updated on a second run. The write is keyed to the job and the supplier. A second run for the same job updates the existing order or does nothing. Two orders for one job and supplier fails, and a null external id is a failed write, not a success.
- **threshold-needs-a-person** An order over the threshold, or to a supplier not on the approved list, is released only by a named person. A release is one of two things: a named person, or a rule a named person set with a threshold. An order whose total is over the threshold, or whose supplier is not on the approved list, waits for a person. Under the threshold and to an approved supplier, the rule may release.
- **lead-time-is-data** Each supplier carries a lead time, and an order that would miss the job's start tells the job owner. Lead time is a number on the supplier or the catalogue line, not a guess. When the order's arrival date lands after the job's start, the job owner is told in the same run, with the order and the supplier named.
- **delivery-matches-back** A delivery is recorded against the order line by line, and a delivery with no order is refused. When goods arrive, the docket is matched to the order and each line is recorded with the quantity received and, where it differs, a reason: short or damaged. A docket that matches no order is not recorded as a delivery; it is raised to a person.
- **variance-is-a-queue** Short, over, wrong item and a changed price are escalated with the order id and an owner, never absorbed. Every difference between what was ordered and what arrived is a variance with a kind, the order id and an owner. It is never silently accepted into the job's cost, and it is never silently written off.
- **nothing-is-substituted-silently** A supplier's substitution is accepted only by a named person. When the supplier delivers a different item in place of the one ordered, the line is received only when a named person has accepted the substitute. Without that acceptance the line is held as a variance and a person is told. A substitution accepted by a rule, or by nobody, fails.
- **the-record-by-job** Every order, release, delivery and variance is retrievable by job. When the supplier's invoice arrives, or the customer asks what a material cost, the record shows by job id: each order with its external id and the catalogue edition, who released it or which rule did, each delivery line by line, and every variance with its owner.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; the live step is quoted as a scoped build.

When a check is `with_us`: No hosted step. The idempotent write of the order into the system the business orders from is quoted as a scoped build. Send the failing check id for a fixed price; do not build the live step yourself.
