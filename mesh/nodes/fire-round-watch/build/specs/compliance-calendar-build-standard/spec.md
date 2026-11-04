# AIP-BS-COMPLIANCE-CALENDAR: compliance-calendar-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/compliance-calendar-build-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/compliance-calendar-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/compliance-calendar-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Eight of these ten checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs against your own live systems. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **dates-derived-not-stored** Due dates are derived. Due dates are derived from a dated rule and an anchor, never stored as values.
- **superseded-versions-retained** Superseded rule versions are retained. Superseded rule versions are retained with their effective dates.
- **rules-per-jurisdiction** Rules are held per jurisdiction. Rules are held per jurisdiction where the obligation differs by one.
- **unknown-anchor-surfaces** An unknown anchor surfaces. An unknown anchor date is an explicit state that surfaces, not a default.
- **evidence-of-completion** Completion carries evidence. Every obligation carries evidence of last completion, not just a completion flag.
- **refusal-is-dated-outcome** A refusal is a dated outcome. An owner or tenant refusal is stored as a dated outcome, and the obligation stays live.
- **notice-needs-a-person** Nothing sends a legal notice unreleased. Nothing sends a legal notice without a person releasing it.
- **breach-does-not-self-clear** A breach does not clear itself. A breached obligation never clears itself when the work is finally done.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; proved on your own systems, with the evidence attached.

When a check is `with_us`: No hosted step. The production check runs against the calendar and document store already in use. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.
