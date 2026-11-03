# AIP-BS-ADVICE-FILE: advice-file-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/advice-file-build-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/advice-file-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/advice-file-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Twelve of these fourteen checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one is quoted as a scoped build. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **disclosure-before-first-field** Disclosure and consent are recorded before the first field. On every recorded channel, the recording and transcription notice is given and recorded before the first question. Refused consent means notes typed by a person, not a file the assistant pretends it heard.
- **verbatim-before-fields** Verbatim is stored before any field is filled. The client's own words are kept with a span before classification is applied. Classification is applied to a copy, never to the only copy.
- **keys-from-the-contract** Only published field keys are writable, and completeness is computed. "Client seems comfortable with repayments" is not a field. Serviceability inputs are. Completeness is a function of the required keys for that purpose, never a flag somebody sets.
- **lookups-resolved-not-transcribed** Anything with a lookup is resolved, read back, and written as resolved. Address, employer, existing lender, product: the spoken value is the query, the resolved value is what is written. Low confidence becomes a MissingField with reason asked_unclear, not a guessed value.
- **one-file-per-client** One live file per client, updated and never duplicated. The CRM record is the file. A second interview on the same client updates it. A null external_id is a failed interview, not a completed one.
- **gaps-become-owned-tasks** Every blocking gap is a task with an owner and a due date, raised once. Each missing required key becomes a MissingField and, where it blocks the next stage, one task with a named owner and a due date. A reminder in chat does not count, and a task is not raised twice for the same gap.
- **panel-answers-carry-a-card** Lender policy is a cited answer, never a recalled one. A panel question is answered from clauses with an edition and an effective date, with a source card, or it is declined to a person. The model's memory of what a lender does is not a source.
- **superseded-policy-cannot-answer** A retired clause cannot answer, and a new one answers only once a person accepts it. When the lender moves the policy, answers drawn from the old clause change or decline, and the new clause answers only after a named person accepts it.
- **recommendation-is-gated** A recommendation cannot leave draft with a blocking gap or no card, and is sent by a person. Ready_for_person is a gate, not a vibe. A draft with an open blocking MissingField or an empty source_card_ids stays in draft or blocked. Sent_by is a person, and a machine cannot occupy it.
- **coaching-cites-the-file** Coaching cites a span or a clause, and breach_suspect goes to a named person. A CoachingEvent without an evidence span or a source card is a note, and notes do not roll into a score. A finding marked breach_suspect is escalated to a named compliance person, not softened into tone.
- **log-retrievable-by-interview** Recording, transcript, extracts, writes, cards, tasks and coaching are retrievable together. Everything the interview produced can be listed by interview id and by file id. If the recording dies and the fields remain, the file is hearsay.
- **detached-library-declines** With the library detached, the assistant declines. Ask the policy question with the panel library removed. The only conforming output is a decline. A remembered answer fails, even when the words are right.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; the live step is quoted as a scoped build.

When a check is `with_us`: No hosted product. The live write into the network's own CRM tenant, against a dated panel library it controls, is the step not to hand-roll, and it is quoted as a scoped build. Send the failing check id for a fixed price; do not build the live step yourself.
