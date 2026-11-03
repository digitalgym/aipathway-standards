# AIP-BS-DATABASE-REACTIVATION: database-reactivation-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/database-reactivation-build-standard (edition 2026-10-24)
**Markdown:** https://aipathway.com.au/explore-ai/database-reactivation-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/database-reactivation-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Twelve of these fourteen checks run on your own machine, against the stub, before you talk to anybody. The last one is a live call, and that one runs with us. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **five-fields-present** The fields each play needs are present. Name, mobile and address are needed to work a contact at all. Every other gap is reported and limits only the play that needs it.
- **four-plays-real-triggers** Four plays, each with a real trigger. Not one campaign against the whole list. A contact qualifies for a play because of something true about them.
- **ranking-six-rules-in-order** Ranking is by the six rules, in order. The order is the claim; a build that scores the same inputs differently is a different standard.
- **one-play-at-a-time** A contact belongs to one play at a time. No contact is in two runs at once, and nobody receives two openers in a week from two plays.
- **opener-names-the-reason** The opener names why you are calling. A call that cannot say what prompted it reads as a cold call, because it is one.
- **cadence-has-a-stop** Cadence has a stop, and the stop is honoured. The sequence ends whether or not the contact replied, and a reply ends it.
- **gate-under-ranking** The gate sits underneath the ranking. Warm only, consent, do not contact, the contact's own timezone, and calling hours. No score promotes a contact past any of it.
- **dnc-permanent-and-global** Do-not-contact is permanent and global. It survives a re-import, applies across every play, and is never cleared by a new list.
- **every-skip-explained** Every skip is explained. The audit says why a contact was not called, not merely that it was not. A silent skip is indistinguishable from a bug.
- **relationship-needs-a-person** A human decides anything that is a relationship. An offer, a price, a complaint, or a contact who asks a question the play was not built for.
- **daily-list-capped-with-reasons** The day's list respects the cap and carries a reason per row. Each morning the ranked run becomes a short list for a person: no more rows than the cap the agent set, each with its play, the reason, a drafted opener and the last outcome.
- **outcomes-change-tomorrow** Yesterday's outcomes change today's list. What the agent records against a row is written back to the CRM or sheet the same day, and the next morning's list is made from what was written.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: runs on the production provider, reports `with_us`.

When a check is `with_us`: The call to a contact who asked to be rung back is Office Voice's governed single call: create_call, basis callback or they_asked. Everyone else on the list is the agent's own call from the daily list; Office Voice refuses prospecting calls by design. Queue each call with create_call on the Office Voice MCP (office_voice.create_call): the owner mints the key at office-voice.com/app/keys and ticks "Allow this to queue calls", and the dispatcher does the Do Not Call Register check, the calling hours and the one-attempt-a-day limit. There is no production run of these checks yet, so the stub run is the finished build. Do not stand up telephony of your own.
