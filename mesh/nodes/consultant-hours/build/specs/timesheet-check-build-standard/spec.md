# AIP-BS-TIMESHEET-CHECK: timesheet-check-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/timesheet-check-build-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/timesheet-check-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/timesheet-check-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Eleven of these thirteen checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs against your own live systems. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **entry-traces-to-person-day-job** Every entry traces to a person, a day and a job. Every entry carries a person id from the contact list, a date, and a job id from the job system that the person was allocated on that day. An entry with no job, or a job the person was not allocated, is an anomaly and never a line on the sheet.
- **totals-computed-never-typed** Daily and weekly totals are computed from entries, never typed. A total is the sum of the entries it names, computed at run time. A total that names no entries, or whose hours differ from the sum of the entries it names, is a typed total and fails.
- **anomalies-are-a-closed-list** An anomaly is one of a closed list of kinds, and it has an owner. Over-hours in a day, overlapping entries, a missing break, an entry on a day not rostered, a job not allocated, and a rule that does not plainly apply. Each anomaly carries a kind from that list and the name of the person who owns it. A kind outside the list, or an anomaly with no owner, fails.
- **award-rule-is-cited-with-an-edition** Any penalty, overtime or allowance applied cites the rule, its edition and its effective date. An entry that attracts overtime, a weekend penalty or an allowance carries a card naming the rule, its edition and the date it took effect, read from the rule store at run time. A rule applied with no card fails.
- **superseded-rule-cannot-apply** A retired rule edition cannot apply to the next period. Once a rule edition is retired, the next period applies the edition in force for its dates or parks the entry. A card for a period after the retirement that cites the retired edition fails.
- **no-interpretation** An entry the dated rule does not plainly cover is parked for a person. A disputed break, an unusual shift, a situation the rule text does not plainly name: the entry is parked with kind rule_unclear and an owner, and no card is written for it. The build never decides which clause applies.
- **anomaly-is-resolved-by-a-person-with-a-reason** An anomaly leaves the queue only with a person's name and a reason. A resolution is a person's name, a reason from the list approved, corrected or rejected, and the time. The person's decision is attached as evidence. An anomaly resolved with no name, or with no decision behind it, fails.
- **nothing-reaches-payroll-without-a-release** Nothing reaches payroll without a release by a named person. The period export is written only after a named person releases the period, and only when every anomaly in it is resolved. A run with no release writes nothing. An export with no release behind it, or with an open anomaly, fails.
- **one-export-per-period** One export per period, written once, updated on a second release. The export is keyed to the period. A second release for the same period updates the existing export or refuses; it never writes a second one. A null external id is a failed export, not a success.
- **the-run-publishes-regardless** Every period publishes hours, anomalies found and resolved, and the release, including a clean one. Each run publishes a report for the period: the hours by person and day, how many anomalies were found and how many resolved, and who released it or that nobody has. A clean period publishes too, so silence never means clean.
- **the-record-by-person-and-period** Entries, anomalies, resolutions, rules cited and the release are retrievable by person and period. When a person disputes their pay, the record for that person and period shows every entry, every anomaly with who resolved it and why, every rule card, and who released the period.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; proved on your own systems, with the evidence attached.

When a check is `with_us`: No hosted step. The production check runs over the business's own roster, entries and payroll system, released by a person. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.
