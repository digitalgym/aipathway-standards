# AIP-BS-QUOTE-OUT: quote-out-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/quote-out-build-standard (edition 2026-11-05)
**Markdown:** https://aipathway.com.au/explore-ai/quote-out-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/quote-out-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Fourteen of these fifteen checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs with us.

## Requirements, as the checks the build is held to

- **job-is-the-trigger** A job is the only trigger. The quote is drafted from an existing job record, never from a raw call or email. Both doors reach this standard through the same job.
- **pricebook-is-the-only-source** The price list is the only source of a rate. Every priced line traces to a line in the customer's own price list. No rate is inferred, averaged, or recalled from another job.
- **unpriceable-is-parked** What cannot be priced is parked. Work with no matching price-list line parks the quote with a reason. It is never estimated, and the quote is not drafted around it.
- **no-variation-pricing** Variations and discounts stay with a person. A variation to an accepted quote, and any discount, escalates rather than drafting. The standard prices the catalogue, not the negotiation.
- **one-quote-per-job** One quote per job. A job already carrying a draft or a sent quote is kept, not duplicated, and duplicate_of records it. Mail then call is still one quote.
- **draft-quote-verified** The write is verified. A draft counts as drafted only once the system of record returns an id for it. A null id raises an alert.
- **draft-never-sends** The draft does not send itself. The quote is left in a state a person releases. Nothing reaches the customer without that release.
- **quote-is-not-ours** The quote lives in their system. The quote is created in the system of record the business already runs. Nothing we hold is the copy that counts.
- **log-survives** The log survives. The source job, the price-list lines used, the draft and the outcome are retained together and retrievable by quote_id.
- **pricebook-is-current** The price list was read, not remembered. Rates are read from the live price list at draft time. A cached copy older than the agreed window parks the quote rather than pricing it.
- **options-are-tiers-of-one-quote** Options are tiers of one quote. A job quoted with options still has one quote: two or three named options inside it (Good, Better and Best unless the business renames them), never more than three. Options differ only by catalogue lines, and no option carries a discount. Where the system of record cannot hold options on one quote, one draft per option carries the job id and the option label, and the set counts as the one quote for duplicate_of.
- **every-option-from-the-book** Every option is priced from the book. Every line in every option traces to a line in the customer's own price list, read at draft time. One line any option cannot price parks the whole quote; the other options are not drafted around it.
- **tiers-from-the-tier-map** Tiers come from the business's tier map. Which catalogue lines make each option, and what each option is called, come from the business's own tier map. The model never chooses the lines for a tier and never invents a tier. Work with no usable tier map entry parks rather than being split into options by the build.
- **chosen-option-closes-the-others** The chosen option closes the others. The customer picks one option and a person marks it. The build then tells a person which other options to void or decline. It never marks a choice, never voids or declines an option itself, and nothing is sent.

## Out of scope for the build, by design

- **pass-test** The pass test passes: runs on the production provider, reports `with_us`.

When a check is `with_us`: Enable Booked After Hours on Office Voice / Front Desk. Then run the same checks against us: mint a key at office-voice.com/app/keys and OFFICE_VOICE_API_KEY=<key> AIPATHWAY_ENV=production AIPATHWAY_PROVIDER=office_voice.draft_quote node run.mjs. Do not hand-roll the live step.
