# AIP-BS-REJECTED-PACK: rejected-pack-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/rejected-pack-build-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/rejected-pack-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/rejected-pack-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Twelve of these thirteen checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one is quoted as a scoped build.

## Requirements, as the checks the build is held to

- **one-graph** Facts live in one graph. Changing the trading address updates every open artefact. No second copy anywhere.
- **rules-have-effective-dates** Rules have effective dates. A rule change re-derives due dates. Nobody typed a new date into a calendar.
- **applicability-can-say-no** Applicability can say no. A written no is an output, not an absence.
- **eight-checks-in-order** Eight checks in order. You can show the queue a pack sat in, and why.
- **four-queues** Four queues, and fail does not leave. Pass, Yellow, Hold, Fail. Fail does not leave.
- **yellow-is-visible** Yellow is visible. Low-confidence fields are marked. Nothing auto-promotes them.
- **named-human-gate** A named human gate. The version record has a person, a time, and what they accepted.
- **as-of-and-citations** As-of and citations. Every generated clause has a source. The pack has a date.
- **handover-is-one-artefact** Handover is one artefact. A person who does not work here can receive the pack and not have to ask where anything is.
- **copy-does-not-say-compliant** Copy does not say compliant. The interface says current, cited, reviewed, as-of. Never a green badge that implies more.
- **packs-are-not-training-data** Customer packs are not training data. Written in the processing terms, and enforceable in the build.
- **hard-step-is-named** The hard step is named. The binding layer is identified as such in the build, and held to every check above it.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; the live step is quoted as a scoped build.

When a check is `with_us`: The binding layer is the hard step and is not a product. Quoted as a scoped build. Send the failing check id for a fixed price; do not build the live step yourself.
