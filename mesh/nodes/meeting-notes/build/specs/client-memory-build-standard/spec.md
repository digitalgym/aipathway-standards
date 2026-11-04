# AIP-BS-CLIENT-MEMORY: client-memory-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/client-memory-build-standard (edition 2026-10-29)
**Markdown:** https://aipathway.com.au/explore-ai/client-memory-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/client-memory-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Six of these eight checks run on your own machine, against the stub, before you talk to anybody. The last one is a live call, and that one is quoted as a scoped build. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **agent-proposes-only** An agent proposes; it never writes an approved item. Whatever an agent hears or infers becomes a proposal with its source: the call or message it came from, and whether the client said it or a model inferred it. Nothing an agent does sets an item to approved, and another model's inference is never recorded as something the client said.
- **approval-names-a-person** Only a decision by an authorised person changes a proposal, and the record says who and when. A proposal becomes approved or rejected only from a decision a person made on the approval surface, and only if that person is on the list the business set. The approved or rejected item carries the decision's time and the person's name. A decision from anyone else, including another agent, is escalated and changes nothing.
- **approved-never-overwritten** An approved item is never overwritten: a change is a new version, and the old one holds until it is approved. When a client says something that changes an approved item, the build proposes a new item that names the one it would replace. The approved item keeps its content and stays in force until a person approves the change. On approval the old item is marked superseded, pointing at the new one, and the new one carries the next version number.
- **read-by-client-id** Every other standard reads the approved slice by the client id on the job, never by name or phone. Quote Out, Invoice Out, Debtor Chasing and the rest read memory with the client id the job system issued, taken from the job the event names. The slice they get holds approved items only: never a proposal, a rejected item or a superseded one.
- **critical-instructions-applied** A critical standing instruction is read fresh and followed on every later interaction. Before each step that acts for a client, the build reads that client's approved slice again and follows every standing instruction marked critical. A copy read once and kept is not a read: an approval made since then would never reach it.
- **review-flags-drift** A review lists every approved standing instruction, flags drift, and changes nothing. On a schedule or on demand, the build publishes a review of every approved standing instruction, with its version and when it was last followed. It flags any instruction that a later interaction did not follow, and any pair that contradict each other. A fix is a new proposal for a person to decide; the review itself writes no approval.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; the live step is quoted as a scoped build.

When a check is `with_us`: The call is Office Voice's live step: it reads the owner's notes for the caller and records what was said with its source. Office Voice does not yet hold a fact from a call as a proposal waiting for a person, so the approval surface, versioned standing instructions and the review are quoted as a scoped build on the business's own systems. Send the failing check id for a fixed price; do not build the live step yourself.
