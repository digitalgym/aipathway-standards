# AIP-BS-INVOICE-OUT: invoice-out-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/invoice-out-build-standard (edition 2026-10-05)
**Markdown:** https://aipathway.com.au/explore-ai/invoice-out-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/invoice-out-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Ten of these twelve checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs with us. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **completion-is-the-trigger** The job's completion is the only trigger. An invoice is drafted because the job system says the job is complete, never because somebody remembered. A job that is not complete produces no invoice.
- **lines-come-from-the-job** Every invoice line traces to a line on the job. Labour, materials, the callout: each invoice line is a job line with a catalogue code. Nothing is added that the job does not carry, and nothing on the job is dropped without a parked reason.
- **rates-only-from-the-book** Every line is priced from the price book, and a line the book does not cover parks the invoice. The rate on a line is the book's rate for that code, read at draft time. No rate is typed, averaged or recalled. A code the book does not hold parks the invoice with reason not_in_pricebook.
- **variation-needs-a-signature** A variation is billed only with a signed acceptance attached. A variation line on the job is invoiced only when the customer's signed acceptance is attached to the invoice. Without one, the invoice is parked with reason unsigned_variation and a person is told.
- **stage-invoice-never-claim** A job under a building contract is invoiced as a stage invoice, and the claim stays with the builder. Where the job carries a contract stage, the invoice names that stage and is a stage invoice. The words progress claim never appear, and nothing here serves, certifies or argues a claim under security of payment law.
- **one-invoice-per-job** One invoice per job, written once, updated on a second event. The write is keyed to the job. A second completion event for the same job updates the existing invoice or does nothing. A null external id is a failed write, not a success.
- **written-into-the-ledger** The invoice exists in the ledger the business runs, with an external id back. The draft is written into Xero, MYOB, or the job system's own invoicing, never into a document we render and hold. The ledger's own id is stored against the job.
- **send-is-a-gate** Nothing is sent without a release by a person, or by a rule a person set with a threshold. A draft leaves as sent only after a release event that names the person, or names the rule and shows the invoice is under the threshold that rule carries. Over the threshold goes to a person.
- **parked-is-a-queue** A parked invoice is a queue with a reason and an owner, and nothing parked is sent. Parked means a person has a reason in front of them: not_in_pricebook, unsigned_variation, write_failed. It is never silence, and it is never sent.
- **the-record-by-job** Job id, invoice id, the lines, the rates read, who released and when it was sent are retrievable by job. When the customer disputes the bill, the record shows the job, the book edition the rates came from, and the person who released it.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: runs on the production provider, reports `with_us`.

When a check is `with_us`: Enable Get Paid on Office Voice / Recover. Then run the same checks against us: mint a key at office-voice.com/app/keys and OFFICE_VOICE_API_KEY=<key> AIPATHWAY_ENV=production AIPATHWAY_PROVIDER=office_voice.draft_invoice node run.mjs. Do not hand-roll the live step.
