# AIP-BS-PROGRESS-CLAIM-DRAFT: progress-claim-draft-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/progress-claim-draft-build-standard (edition 2026-11-05)
**Markdown:** https://aipathway.com.au/explore-ai/progress-claim-draft-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/progress-claim-draft-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Ten of these twelve checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs against your own live systems. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **waiver-accepted-first** Nothing is drafted until the account owner has accepted the waiver and indemnity, at the version now published. Before any draft, the build reads the acceptance on file. It counts only when it names a person, their role and a date, and carries the version of the wording now published. With none, or one recorded for an earlier version, nothing is drafted and the account owner is told, with reason no_waiver_acceptance.
- **contract-figures-from-the-record** The contract sum, the schedule of values and what was claimed before come only from the contract record. Every scheduled value and every figure claimed before is the contract record's, read at draft time. A schedule whose lines do not add up to the contract sum parks the draft with reason schedule_mismatch. No figure is typed, recalled or adjusted to make it fit.
- **percent-from-a-person** Percent complete comes only from a person's site assessment for this period, with who and when. Each line's percent complete is the one a named person entered for this claim period, with the date they assessed it. The build never estimates it, carries last period's figure forward, or works it out from cost or time. A line with no entry for this period, or an entry with no name or date, parks the draft with reason no_assessment.
- **variation-needs-a-signature** A variation is included only with the client's signed acceptance attached. A variation line is drafted only when its signed acceptance is attached to the draft. Without one, the draft is parked with reason unsigned_variation and the project manager is told. A variation's value is the one on the signed acceptance, never a quote or an estimate.
- **cumulative-arithmetic** This claim is the value to date less what was claimed before, shown line by line and checked to the cent. Each line shows its scheduled value, the percent complete, the value to date (scheduled value times percent), what was claimed before, and this claim (value to date less claimed before), in cents. The totals are the sums of the lines. A line whose value to date is below what was claimed before parks the draft with reason below_previous: the build does not decide a credit.
- **one-claim-per-contract-per-period** One draft per contract per claim period, written once and updated on a second run. The draft is keyed to the contract and the claim period. A second run in the same period updates that draft or does nothing; it never makes a second claim. A null id back is a failed write, not a success.
- **draft-marker** Every draft carries the draft marker, and only a person takes it off. Every draft carries the words "DRAFT: not a payment claim until reviewed and served by you". No build write drops or changes it. It comes off only when a named person releases the draft, and the record says who and when.
- **draft-and-hold-only** The build drafts and holds: it never serves, sends, values work, dates a payment, or touches a payment schedule. No draft is served, sent, lodged or certified by the build. No draft or note states a due date, a payment schedule or a reply to one, a retention release, or anything about adjudication. Those are the builder's, under their contract and their state's Act.
- **held-for-the-project-manager** Every draft is held for the contract's named project manager, with its reason when parked. Ready or parked, every draft is put in front of the project manager the contract names, a parked one with its reason. Nothing goes to the client, and nothing parked is released by the build.
- **the-record-by-contract** The contract, the period, every line's figures, where each percent came from, the signed variations and the waiver version are retrievable by contract and period. When the client or an adjudicator asks how a figure was reached, the record shows the contract, each line's arithmetic, who assessed each percent and when, each variation's signed acceptance, the version of the waiver accepted, and who released the draft.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; proved on your own systems, with the evidence attached.

When a check is `with_us`: No hosted step, and none is offered: Office Voice has no progress claim tool. The production check runs on the builder's own contract records and site assessments, and the claim itself is served by the builder. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.
