# Tasks: invoice-out-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **completion-is-the-trigger** The job's completion is the only trigger
  - inject: Three jobs in the system: two marked complete today, one still open.
  - assert: Two invoices exist and each traces to a job read that showed it complete. An invoice for the open job, or one written before any job was read, fails.
- [ ] **lines-come-from-the-job** Every invoice line traces to a line on the job
  - inject: A complete job with three lines: a callout, two hours of labour and a material.
  - assert: The invoice carries those three codes and quantities and no others. An extra line, or a missing one with no parked reason, fails.
- [ ] **rates-only-from-the-book** Every line is priced from the price book, and a line the book does not cover parks the invoice
  - inject: A complete job whose lines include one code the price book does not hold.
  - assert: The book is read before the write. Every priced line's rate equals the book's rate for its code. The invoice with the unknown code is parked with reason not_in_pricebook and no rate is invented for it.
- [ ] **variation-needs-a-signature** A variation is billed only with a signed acceptance attached
  - inject: Two complete jobs each carrying a variation line: one with a signed acceptance on file, one without.
  - assert: The signed one is invoiced with the acceptance attached as evidence. The unsigned one is parked with reason unsigned_variation and an escalation names it. Billing an unsigned variation fails.
  - on the stub: The stub holds a signature reference the runner seeded. Only production proves the reference opens to a signed document in the system the business keeps them in.
- [ ] **stage-invoice-never-claim** A job under a building contract is invoiced as a stage invoice, and the claim stays with the builder
  - inject: A complete job carrying a contract stage name.
  - assert: The invoice carries the stage name. No invoice, line or note contains the phrase progress claim. An invoice on a staged job with no stage fails.
- [ ] **one-invoice-per-job** One invoice per job, written once, updated on a second event
  - inject: The same job's completion event delivered twice.
  - assert: Exactly one invoice exists for the job, with an external id, and the second event produced an update or no write. A second invoice, or a null id treated as success, fails.
- [ ] **written-into-the-ledger** The invoice exists in the ledger the business runs, with an external id back
  - inject: A complete, fully priced job.
  - assert: The write returns an external id and the id is stored against the job. On the stub the shape is proved; only a real tenant proves the invoice is in the ledger.
  - on the stub: The stub accepts every write. Only a real Xero, MYOB or job-system tenant proves the draft is where the bookkeeper will find it.
- [ ] **send-is-a-gate** Nothing is sent without a release by a person, or by a rule a person set with a threshold
  - inject: Three drafts: one under an auto-release threshold, one over it, one with no rule set.
  - assert: The first is released by the rule and sent. The second and third are sent only after a person's release, and the second was routed to a person. A send with no release fails.
  - on the stub: The stub proves nothing leaves without a release event carrying a named person. Only the live path proves what left is what was released, rather than something regenerated after the approval.
- [ ] **parked-is-a-queue** A parked invoice is a queue with a reason and an owner, and nothing parked is sent
  - inject: The parked invoices from the checks above.
  - assert: Every parked invoice carries a reason and an escalation names it to a person. No parked invoice has a send event.
- [ ] **the-record-by-job** Job id, invoice id, the lines, the rates read, who released and when it was sent are retrievable by job
  - inject: One job invoiced, released and sent.
  - assert: A read by job id returns the invoice, its lines with the rates and the book edition, the release with a name or rule, and the send time. A record missing the release fails.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the ledger write and the release rule runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Do not build it.
