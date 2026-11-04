# AIP-BS-JOB-CLOSE: job-close-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/job-close-build-standard (edition 2026-11-01)
**Markdown:** https://aipathway.com.au/explore-ai/job-close-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/job-close-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Ten of these twelve checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs with us. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **job-exists-tech-on-it** The job exists and this tech is on it. A close starts from the job id the job system issued, read back from the job system before anything else. No job, no close: a close is never the thing that creates a job. A capture from a tech who is not assigned to that job goes to the office, not onto the card.
- **verbatim-stored-first** What the tech said is stored before anything is taken from it. The transcript, the notes, the photos and the parts as spoken are kept word for word as evidence first. The draft is worked out from the stored copy, so what the tech said can always be set beside what was written.
- **parts-from-the-book** Every part is a price book line or it is parked. Each part the tech names resolves to exactly one catalogue line in the business's own price book, at the price the book holds when the card is written. A part that matches nothing is parked as not_in_book; one that matches more than one line is parked as ambiguous. No price is ever estimated, averaged or remembered.
- **variation-never-priced** A variation is never priced at close. On a quoted job, a part or line the quote did not cover is parked as a variation and goes to the person who prices variations. It is not put on the card at any price, even one the book holds. Invoice Out bills it only once the customer has signed for it.
- **tech-confirms** The tech confirms the draft before it is written. The draft goes to the tech in one message: the work done, the lines, and what was parked. Only a yes from the assigned tech's own number, naming that draft, lets it be written. A yes from the office, or a draft the model marked confirmed itself, is not the tech's confirmation.
- **unconfirmed-to-supervisor** A draft nobody confirms goes to the tech's supervisor. If the tech has not confirmed within the written window, two hours by default, the draft is raised as not_confirmed to the tech's supervisor, once. It is not written and the job is not marked complete while it waits.
- **one-write-ids-back** One write, with the job system's ids back. The card, its lines and its photos are written once, with the intent id close:<tenant>:<job>:<capture>. A retry carries the same intent id and lands once. A write that returns no ids is treated as not written and raised as write_failed to the office manager.
- **complete-only-when-written** The job is marked complete only after the write returns ids. Completion is the last step and the only trigger Invoice Out accepts, so it happens only once the write has come back with the job system's ids. A parked item does not hold completion: it travels to Invoice Out, which parks the invoice.
- **parked-to-the-desk** Every parked item goes to the exceptions queue with an owner. Each part not in the book, ambiguous match and variation is raised once to the Exception Desk queue with the job id, the tech's words exactly and a named owner: the office manager for a part, the variation pricer for a variation. Nothing parked is left only in a message.
- **logged-by-job** The close is on the record, by job. For each job: what the tech sent, what was taken from it, who confirmed it and when, and what the write returned, ids or the reason it failed. The history of one close can be read in one place.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: runs on the production provider, reports `with_us`.

When a check is `with_us`: Office Voice's close_job writes the confirmed card into ServiceM8 once per intent id: the note, the job materials priced from ServiceM8's own catalogue, the photos, then Completed only when every part came back with an id. Lines with no catalogue code are parked on the Exception Desk. A tech can also close by text or picture message to the business's Office Voice number and reply YES. In Simpro it writes the note and the stage today; parts and photos park on the Exception Desk for a person to add. A ServiceM8 connection made before 2 November 2026 is reconnected once to allow materials and attachments. Call it on the Office Voice MCP (office_voice.close_job): the owner mints a key at office-voice.com/app/keys with the scope the tool names, on any Office Voice account. There is no production run of these checks yet, so the stub run is the finished build; AIPATHWAY_PROVIDER=office_voice.close_job needs a live port map that is not published. Do not hand-roll the write.
