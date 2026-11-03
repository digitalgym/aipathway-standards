# AIP-BS-KNOWLEDGE-BASE: knowledge-base-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/knowledge-base-build-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/knowledge-base-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/knowledge-base-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Eleven of these thirteen checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs against your own live systems. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **register-before-index** Every source is on the register before anything is indexed. A file is registered with a title, a location and an owner before a passage from it is chunked or embedded. Indexing an unregistered file fails.
- **one-canonical-copy** Duplicates resolve to one canonical copy, and only the canonical is indexed. Two copies of the same source are one register entry with the others marked duplicate_of. The index holds the canonical copy once.
- **owner-is-a-person** Every source has a named owner, and a team is not an owner. The owner is the person who is asked when the source moves or goes missing. "Operations" cannot be asked anything.
- **edition-and-checksum-on-arrival** Retrieved date, checksum and edition are recorded when the source arrives. A source without a checksum cannot be watched. One without an edition, where the issuer publishes one, cannot be handed to the graph.
- **customer-material-quarantined** Customer material is registered as such, restricted, and kept out of the shared index. Client files, interviews and emails are inventoried with kind customer_material and an access list. They are never chunked into the search everyone uses.
- **locators-are-replayable** Every indexed passage names its source and a locator that can be opened. Page and section, offsets in a stable file version, or seconds on a recording. "Chunk 47" is not a locator.
- **search-finds-never-answers** Search returns passages with their source and locator, and composes nothing. A query returns what was found and where. It does not return a paragraph the model wrote. Answering is the Cited Answer standard, over the graph.
- **missing-is-a-gap-with-an-owner** A source that should exist and cannot be found is a gap with an owner and a date. The current edition of an instrument the business relies on, not on the drive, is not a blank row. It is a task for a person.
- **watch-on-a-schedule** Every source on the drive is re-fetched on a schedule, and a changed checksum reaches its owner. The watch runs whether or not anything changed. When a checksum moves, the register records the new one, marks the old copy superseded, and the owner is told the same run. A source held only by the issuer gets a recheck task to its owner on the same schedule, and the confirmation is recorded.
- **retention-follows-kind** Retention and access follow the kind of source. An issued instrument is kept with every edition. Customer material carries an expiry and an access list. The kind decides, not the folder it was found in.
- **handover-carries-the-register** A source reaches the graph only from the register, carrying its id, edition, checksum and locator scheme. The Knowledge Graph standard registers a source as an instrument. That instrument is this register entry, not a fresh upload. A graph source with no register id has skipped this standard.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; proved on your own systems, with the evidence attached.

When a check is `with_us`: No hosted step. The production check runs over the business's real drive and mailbox with its real owners. The watch is the part not to hand-roll: a scheduled re-fetch and checksum compare of every source, with the owner told when it moves. It is a schedule and a table, not a product. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.
