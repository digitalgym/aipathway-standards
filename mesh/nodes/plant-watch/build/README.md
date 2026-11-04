# Plant Watch

The inspections an Australian builder's own plant and equipment must have (an
elevating work platform's periodic and major inspections, a scissor lift's
check, height safety harnesses, test and tag on site power tools and leads, a
registered item's renewal with the state WHS regulator), kept as a compliance
calendar to AIP-BS-COMPLIANCE-CALENDAR 2026-10-03.

Each morning it derives every item's next due date from the business's own
dated rule for that check and state, applied to the date the last completed
check was filed on the item's record. Inside the lead time it raises an
inspection-due reminder to the named person; once overdue, a reminder every
run that the item should not be used until its check is filed. Where the rule
names an outside inspector or tester, the booking request is drafted and held
for a named person to release. The exception desk delivers the reminders; this
build writes no telephony and sends nothing.

An inspection counts as done only when the completed report or test record is
filed on the item's record and read back by obligation id. A "done" with
nothing attached is refused and stays live. A decision to park an item rather
than inspect it is dated and the obligation stays live. An overdue item stays
overdue on the record after the check is finally filed. Plant Watch never says
an item is safe: the competent person's report does that.

The fixtures in `scenarios.mjs` are illustrative intervals, not what any
Australian Standard, WHS regulator or manufacturer sets.

## Run it

    npm install
    node run.mjs          # the conformance run; writes manifest.json and envelope.json
    node broken/check.mjs # the same scenarios against the broken builds

## Proving the scenarios can fail

Before the committed run, the scenarios were run against a do-nothing build and
eight broken builds (`broken/builds.mjs`, each the real build with one port
wrapped). Every check claimed as pass or shape_only goes red for the do-nothing
build and for at least one targeted broken build:

| check | red under |
|---|---|
| 1 dates derived | do-nothing; stored-dates (keeps the first due date it saw) |
| 2 superseded versions | do-nothing; no-history (never explains a past due date) |
| 3 per jurisdiction | do-nothing; national-rule (one state's date for every state) |
| 4 unknown anchor | do-nothing; default-today (assumes today for a missing last check) |
| 5 evidence of completion | do-nothing; tick-is-done (counts a done with no report) |
| 6 refusal is dated | do-nothing; refusal-closes; self-clearing |
| 7 notice needs a person | do-nothing; auto-release (releases its own booking); self-clearing |
| 8 breach does not self-clear | do-nothing; self-clearing (works out overdue itself, drops done items) |

Check 9 is evidence_required (who else can explain it, whose account it runs
on) and check 10 is with_us: the pass test runs by hand on the business's own
plant register and document store.
