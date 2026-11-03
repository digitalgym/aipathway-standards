# AIP-BS-PRICE-ONE-PAGER: price-one-pager-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/price-one-pager-build-standard (edition 2026-10-24)
**Markdown:** https://aipathway.com.au/explore-ai/price-one-pager-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/price-one-pager-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Twelve of these fourteen checks run on your own machine, against the stub, before you talk to anybody. The last one is live sales and a kept record, and that one is quoted as a scoped build. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **subject-from-the-record** The subject property comes from a record. Type, bedrooms, land size and address are read from a source, not typed from memory. A field the source does not hold is shown as unknown, never guessed.
- **rules-stated-first** The selection rules are written down before any sale is chosen. Distance, how recent, property type, and the bedroom and land size bands are read from one written rule set, and printed on the page.
- **comparables-meet-every-rule** Every comparable shown meets every stated rule. A sale outside any rule is not a comparable, however close its price is to the one the agent hoped for.
- **source-and-date-on-each** Each comparable carries its source and its sale date. Where the sale was recorded, when it sold, and when it was read. A sale with no source or no date is left off the page.
- **withheld-price-not-used** A withheld or unverified price is never part of the range. A sale whose price was withheld, or reported but not verified, may be listed so the vendor sees it exists, marked as such, and is left out of the arithmetic.
- **too-few-says-so** Too few comparables means no range, and the page says so. Below the minimum count, the page says there is not enough evidence for a range. It never widens a rule quietly to reach the count.
- **range-from-the-comparables** The range is worked out from the comparables and nothing else. Low is the lowest verified comparable price, high is the highest, and the middle is their median. No adjustment, no model estimate, no rounding toward a figure.
- **agent-estimate-separate** The agent's estimate is shown separately, labelled as theirs. It sits in its own box with the agent's name on it. It never replaces the range, is never averaged into it, and is never presented as what the evidence says.
- **underquote-flagged-to-agent** A quoted price below the evidence is flagged to the agent. If the lowest figure the agent intends to quote sits below the evidence range, the agent is told before anything reaches the vendor, with the sales that sit above it.
- **stale-data-held** Stale data is held, not shown as current. Sales read longer ago than the freshness window are read again or the page is marked stale and held. A one-pager never carries an old read under today's date.
- **agent-approves-first** The agent approves the exact version before the vendor sees it. Nothing goes to the vendor without the agent's recorded approval of that version. A change after approval is a new version and needs a new approval.
- **record-of-what-was-shown** What was shown, and when, is recorded and never overwritten. On release, the version, every comparable with its source and dates, the range, the agent's estimate, the approval, who it went to and the date are kept. A correction is a new version.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; the live step is quoted as a scoped build.

When a check is `with_us`: No hosted step. Live recorded sales, from a source the agency already licenses, with a source a person can follow, and a durable record of what was shown on what date, are the step not to hand-roll, and they are quoted as a scoped build. Send the failing check id for a fixed price; do not build the live step yourself.
