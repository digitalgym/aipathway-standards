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

- **a-pair-is-declared-not-guessed** A person writes down which two records are compared, never a guess. Every comparison names its two systems, the shared reference that links them, and which system is right for each detail, all written down by a person. A run that does not say which system is right fails.
- **keys-join-ids-not-labels** Records are matched on the shared reference, never on a name or an amount. The match uses the reference the person wrote down. Two records with the same customer name, or the same amount, are not a pair unless they share that reference.
- **matched-is-silent-mismatched-is-an-object** Records that agree stay quiet, and a mismatch is shown side by side, never corrected. Agreement is counted but not shown. A disagreement is recorded as a difference showing the detail, both values and the value from the system that is right. Comparing never changes a record in either system.
- **nothing-is-auto-corrected** A fix is proposed with both values, and saved only after a named person accepts it. It proposes the right system's value for the other system. The change is saved once, after a named person accepts it, and never before. A change saved with no acceptance fails.
- **orphans-are-a-queue** A record missing from the other system is flagged with a reason and an owner. A record in one system with nothing under the same reference in the other is flagged as unmatched, naming the system, a reason and the person who owns it. It is counted in the run and never dropped.
- **tolerance-is-written-down** Any allowance for rounding or timing is a number a person set for each detail, never assumed. A tolerance is a number a person wrote down against one detail. A difference inside it is still recorded (status: within_tolerance). A detail with no tolerance written down has none, so any difference on it stays open.
- **runs-on-a-schedule-and-publishes-regardless** Every scheduled run reports its counts, including the all-clear. Every scheduled run reports how many records matched, were within tolerance, mismatched, had no match and were corrected, even when every number but matched is zero. A missing report is never taken to mean all is well.
- **thresholds-route-to-a-person** A difference over the set limit, or too many mismatches, reaches a named person in the same run. A person sets an amount and a rate. A single difference over the amount, or a run whose open mismatches go over the rate, goes to the named person in the same run, not the next one.
- **history-survives-the-fix** Every accepted fix keeps both original values and who accepted it. The difference keeps both values as they were. The fix records the proposed value, who accepted it, when, and the reference the other system gave back when it saved. A fix that overwrites the history fails.
- **the-record-by-key** For any shared reference, every run, difference and fix can be looked up. When somebody asks why your accounts say what they say about a job, the record for that reference shows every run that found a difference on it, each difference with both values, and each fix with who accepted it.
- **survives-the-builder** It keeps working if the person who built it leaves. Someone other than the person who built it can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; proved on your own systems, with the evidence attached.

When a check is `with_us`: No hosted step. The production check runs over the business's own two sources with a person on every correction. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.
