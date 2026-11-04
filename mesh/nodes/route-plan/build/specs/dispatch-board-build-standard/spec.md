# AIP-BS-DISPATCH-BOARD: dispatch-board-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/dispatch-board-build-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/dispatch-board-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/dispatch-board-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Ten of these twelve checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one is quoted as a scoped build. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **address-verified-before-slot** No slot until the address resolves. A job is given a slot only after its address resolves to a real place. An address that will not resolve leaves the job unslotted and named to a person, never slotted to where somebody hopes it is.
- **licence-is-a-rule-not-a-vibe** A licence requirement is a rule read from the record, never assumed. A job carrying a licence requirement (gas, electrical, height) is assigned only to a tech whose licence record covers that code and is current on the day. The rule is read before the assignment. No person overrides it, and no build infers it from a name or a job history.
- **window-and-travel-are-data** The slot sits inside the customer's window and after the previous job plus travel. A slot starts no earlier than the customer's window opens and ends no later than it closes. Where the tech has a previous job, the slot starts after that job's end plus the travel from its resolved address. Travel is read, never guessed.
- **one-slot-per-job** One slot per job, written once, updated on a second event. The write is keyed to the job. A second scheduling event for the same job updates the existing slot or does nothing. A null external id is a failed write, not a slot.
- **emergency-displaces-with-a-person** An emergency takes a slot only when a named dispatcher accepts the displacement. An emergency may displace a slotted job only after a named person accepts that displacement. The displaced job is re-slotted or escalated with a reason and an owner. It is never silently dropped from the board.
- **customer-told-once-with-consent** The customer is told once per slot, on a channel they consented to. One confirmation goes to the customer for each slot, on a channel with consent recorded, after the consent is checked. A second identical message, or a message to a customer with no consent on that channel, is a failure. A customer without consent is named to a person to phone.
- **tech-told-with-the-record** The tech's notification carries the job, the address, the window and what the customer said. The tech is told with the record: the job id, the resolved address, the customer's window, and the customer's own words about the fault. A bare notification saying there is a new job is not a notification.
- **change-propagates-once** A change to the job moves the slot and tells each affected party exactly once. When the job's time, address or tech changes after the slot is written, the slot is updated in place and one fresh message goes to each party the change touches. A change that leaves the old slot in place, or that messages anybody twice, is a failure.
- **unassignable-is-a-queue** A job that cannot be slotted is escalated with a reason and an owner. No licensed tech, an address that will not resolve, a window no tech can meet: each leaves the job in a queue with a reason and a named owner. Nothing is left off the board in silence.
- **the-record-by-job** Who was assigned, when, by whom or by which rule, and what the customer was told are retrievable by job. When the customer says nobody told them, the record shows the slot, the tech, the person or rule that set it, and the message the customer was sent with its time.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; the live step is quoted as a scoped build.

When a check is `with_us`: No hosted dispatch step. Office Voice already writes the booked time into ServiceM8 and Simpro, one slot per job with the id back, but only inside a Front Desk call, day or night; a board cannot call it and it reads no licences. When a job slips on the ServiceM8 or Simpro board, its running-late call rings the customer, switched on under Automations. For a board, the write into the job system's schedule and the customer message with consent are quoted as a scoped build. Send the failing check id for a fixed price; do not build the live step yourself.
