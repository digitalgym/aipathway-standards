# AIP-BS-RENT-ARREARS: rent-arrears-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/rent-arrears-build-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/rent-arrears-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/rent-arrears-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Nine of these eleven checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs with us. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **derived-every-run** The arrears position is derived every run. The arrears position is derived from the ledger on every run, never cached.
- **paid-to-date-drives-timing** Paid-to date drives escalation timing. Paid-to date is reported alongside the balance, and drives escalation timing.
- **thresholds-are-dated-rules** Statutory thresholds are dated rules. Statutory thresholds are held as dated, per-jurisdiction rules, not constants.
- **stops-checked-per-message** Stop conditions are checked per message. Every stop condition is evaluated immediately before each message, not once per sequence.
- **stale-ledger-escalates** An unmatched or stale ledger escalates. A tenancy with an unmatched or stale ledger is escalated, never chased.
- **notices-need-a-person** Notices are never served without a person. Notices are drafted and never served without a person.
- **no-automatic-fee** No fee is applied automatically. No fee or charge is applied automatically.
- **messages-retained** Every message is retained. Every message sent is retained with its timestamp and recipient.
- **automation-discloses** Automation discloses itself and stops on hardship. If a conversation is automated, it discloses itself, respects contact hours, and stops on hardship.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: runs on the production provider, reports `with_us`.

When a check is `with_us`: Enable Get Paid on Office Voice / Recover; npx @aipathway/conformance connect gets the owner a key and the links to connect their systems. There is no production run of these checks yet: AIPATHWAY_PROVIDER=office_voice.recover needs a live port map that is not published, so the stub run is the finished build. Do not hand-roll the live step.
