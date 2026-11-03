# AIP-BS-CITED-ANSWER: cited-answer-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/cited-answer-build-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/cited-answer-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/cited-answer-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Eight of these ten checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs against your own live systems. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **answers-carry-a-card** Every production answer carries a source card. An answer with no card is in the declined queue, not the answered queue.
- **cards-are-specific** Cards name an edition, a jurisdiction and an effective date. Not just a document title or a page number.
- **superseded-cannot-answer** Superseded clauses cannot produce a live answer. Retiring a clause changes or stops the answers drawn from it.
- **change-accepted-by-a-person** Instrument changes are accepted before production. A change to an instrument is accepted by a named person before it reaches production. The acceptance is stored with their name and the date.
- **declining-is-implemented** Declining is an implemented output. Not an error state, and not a fallback paragraph, with a route to a person.
- **policy-is-a-field** Public and internal answers run different policies. The policy is a field on the answer, not a line in a prompt.
- **answers-stored-with-cards** Answers are stored with their cards. You can list every answer that relied on an instrument that just moved.
- **no-certificate** Nothing issues, implies or forecloses a certificate. The signature stays with the licensed person.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; proved on your own systems, with the evidence attached.

When a check is `with_us`: No hosted step. The production check runs over the source cards and change feed the office owns. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.
