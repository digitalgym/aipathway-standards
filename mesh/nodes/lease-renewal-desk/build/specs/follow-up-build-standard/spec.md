# AIP-BS-FOLLOW-UP: follow-up-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/follow-up-build-standard (edition 2026-10-05)
**Markdown:** https://aipathway.com.au/explore-ai/follow-up-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/follow-up-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Eleven of these thirteen checks run on your own machine, against the stub, before you talk to anybody. The last one is a live call, and that one runs with us. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **open-item-is-an-object** Every thing owed is an open item with a kind, a record, a person and a due date. A chase exists only for an OpenItem: a kind from the closed list (quote_decision, signed_variation, certificate, po_number, form), the record it belongs to, who owes it, and when it was due. A chase with no open item behind it fails.
- **ranked-by-value-and-age-not-age-alone** The chase order is value at risk, then days open, never age alone. Items are ranked by the value at risk on the record, with days open breaking ties. A build that sorts by age chases the oldest small form while the large quote goes cold. The rule is Debtor Chasing's, lifted on purpose.
- **cadence-has-a-cap** Touches per item are capped and spaced, on a written cadence. Each kind has a cadence: a maximum number of touches and a minimum gap between them. A touch is made only through the gate, and the gate reads the cadence. A fourth touch inside a cap of three, or two touches closer than the gap, fails.
- **channel-follows-consent** A message goes only on a channel the contact has consented to. SMS or email is sent only where consent for that channel is recorded against the contact. A contact with email consent only is emailed, never texted. A touch on a channel with no consent fails.
- **the-call-discloses-first** A follow-up call opens with the AI identification and the recording notice. Before anything is asked, the call says it is an AI calling for the business and that the call is recorded. The first thing said on the line is the disclosure, and no ask precedes it.
- **one-ask-one-answer** The call asks for the one thing owed and records the answer as a date or a decision. The call asks for the item and nothing else. The answer is recorded as an Outcome: a date, a decision, a no, or a dispute. Never as a sentence in a transcript that somebody has to read later. A call that ends with no recorded outcome fails.
- **stops-the-moment-it-arrives** When the item arrives, the chase stops that run. The signed document comes back, the PO number lands, the decision is given: the arrival is filed as evidence against the item and the item leaves the chase. A touch after arrival fails.
- **disputed-or-declined-stops-and-escalates** A no, a dispute, or stop contacting me ends the chase and goes to a person. A no is recorded as declined and a dispute as a dispute. Either ends the chase that moment and routes the item to a named person with what was said. The machine never argues, never re-asks and never offers a concession. A further touch fails.
- **never-nags-a-person-who-is-waiting-on-us** No touch goes out while the ball is with the business. If the record shows the business owes the contact something first, a revised drawing, a corrected quote, an answer to their question, no touch goes out for that item until it is cleared. Chasing a person who is waiting on us fails.
- **escalates-after-the-cap** An item still open at the cap goes to a named person with its history, not into a longer loop. When the cap is reached and nothing has arrived, the item is escalated once to a named person, carrying every touch so far, and that person is told. It is never put on a second cadence by the machine.
- **the-record-by-item** Every touch, its channel, its outcome and the arrival are retrievable by item. When the customer says nobody told them, or says they were told five times, the record for the item answers: each touch with its channel and time, each outcome, the escalation if any, and the arrival with its evidence.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: runs on the production provider, reports `with_us`.

When a check is `with_us`: Enable Get Paid on Office Voice / Recover; npx @aipathway/conformance connect gets the owner a key and the links to connect their systems. There is no production run of these checks yet: AIPATHWAY_PROVIDER=office_voice.recover needs a live port map that is not published, so the stub run is the finished build. Do not hand-roll the live step.
