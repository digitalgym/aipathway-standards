# AIP-BS-TWO-RECORDS: two-records-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/two-records-build-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/two-records-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/two-records-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Ten of these twelve checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs against your own live systems. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **a-pair-is-declared-not-guessed** A pair is declared in a written contract, never guessed. Every reconciliation names its two sources, the shared key that joins them, and which source is master for each field, in a contract a person wrote. A run with no declared master fails.
- **keys-join-ids-not-labels** Records are joined on the shared id, never on a name or an amount. The join key is the id the contract names. Two records with the same customer name, or the same amount, are not a pair unless they share that id.
- **matched-is-silent-mismatched-is-an-object** A matched pair produces nothing; a mismatch produces a Difference, never a corrected record. Agreement is counted and not shown. A disagreement becomes a Difference carrying the field, both values and the master's value. No record in either source is changed by the comparison.
- **nothing-is-auto-corrected** A correction is proposed with both values and written only after a named person accepts it. The run proposes the master's value for the other source. The write happens once, after a named person accepts the proposal, and never before. A write with no acceptance fails.
- **orphans-are-a-queue** A record with no partner is an orphan with a reason and an owner, not a silent gap. A record in one source with no record under the same id in the other is raised as an orphan naming the source, a reason and the person who owns it. It is counted on the run and never dropped.
- **tolerance-is-written-down** Rounding and timing tolerances are declared per field with a value, and never assumed. A tolerance is a number a person wrote against a field in the contract. A difference inside it is recorded as within_tolerance, still an object. A field with no declared tolerance has none, so any difference on it is open.
- **runs-on-a-schedule-and-publishes-regardless** The run publishes on schedule with its counts, including the all-clear. Every scheduled run publishes a count of matched, within tolerance, mismatched, orphaned and corrected, even when every number but matched is zero. Its absence is never the signal.
- **thresholds-route-to-a-person** A difference over the declared threshold, or too many mismatches, reaches a named person that run. The contract declares an amount and a rate. A single difference over the amount, or a run whose open mismatches exceed the rate, goes to the named person in the same run, not the next one.
- **history-survives-the-fix** Every accepted correction keeps both original values and the person who accepted. The Difference keeps both values as they were. The Correction records the proposed value, who accepted, when, and the id the write returned. A fix that overwrites the history fails.
- **the-record-by-key** For any shared id, the runs, differences and corrections are retrievable. When somebody asks why the ledger says what it says about a job, the record by that id shows every run that raised a difference on it, each difference with both values, and each correction with who accepted it.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; proved on your own systems, with the evidence attached.

When a check is `with_us`: No hosted step. The production check runs over the business's own two sources with a person on every correction. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.
