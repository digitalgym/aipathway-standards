# Tasks: ledger-write-preview-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **every-draft-previewed-or-parked** Every draft gets a preview or is parked
  - inject: Nine drafts across six document types, run on an ordinary day.
  - assert: Every draft has a preview or a parked item after the first run, and every write names a preview of its own draft.
- [ ] **lines-recomputed** Every line amount is recomputed from its inputs
  - inject: An invoice with a 15% discount on a line of three at $19.99, and a line of 2.5 hours at $19.99.
  - assert: Every draft whose stated totals agree has a preview, and every preview line amount equals quantity x unit price x (1 - discount), rounded to the cent.
- [ ] **tax-from-the-ledger-rate** Tax is recomputed per line from the ledger's own rate
  - inject: An invoice stated before tax, a spend money stated including tax, and a line on a GST free rate.
  - assert: Every draft whose stated totals agree has a preview, every preview line's tax equals the per-line figure from the ledger's rate, and every preview cites a rates read served before it was written.
- [ ] **totals-recomputed** The subtotal, total tax and total are recomputed
  - inject: The same drafts, some stated before tax and some including it.
  - assert: Every draft whose stated totals agree has a preview, and every preview's subtotal, total tax and total equal the figures recomputed from its inputs.
- [ ] **journal-balances** The preview shows the exact journal, and it balances
  - inject: An invoice, a bill, a credit note, spend and receive money, and a manual journal whose debits are $10.00 more than its credits.
  - assert: Every preview's journal balances and holds the lines the document posts; the unbalanced journal has one unbalanced item parked and no preview.
- [ ] **a-cent-is-a-difference** A draft whose totals differ by a cent is parked, never adjusted
  - inject: An invoice whose stated tax is one cent more than the per-line tax, released along with everything else in the book.
  - assert: That draft has one totals_differ item carrying the stated and the recomputed totals, no preview and no write; no draft whose totals agree is parked as differing.
- [ ] **no-guessed-tax-rate** A tax rate the ledger does not hold is never guessed
  - inject: A bill with a line coded to a tax type the ledger does not hold.
  - assert: That draft has an unknown_tax_rate item parked, no preview and no write.
- [ ] **released-by-a-named-person** Nothing is written until a named person releases the preview
  - inject: The build runs before any release; then a person releases every preview but one, and the build runs again.
  - assert: Every write follows a release by a named person of the preview it carries, for the same draft; the draft left unreleased has no write.
  - on the stub: On the stub a release is a row the runner adds. Live, the release has to come from a named person through the business's own approval step, and only the business's own records prove it was a person and not a rule.
- [ ] **writes-once** Each released document is written exactly once
  - inject: Five released previews; the first write lands but its answer is lost, and the build runs again.
  - assert: The ledger holds exactly one document per released draft, every attempt for a draft carried the same key, and the lost answer was parked as write_failed.
  - on the stub: On the stub one document per key is the runner's memory. Only a real ledger proves a retry after a timeout does not write the invoice twice, through whatever it offers: an idempotency key, a request id, or a read of the reference before a retry.
- [ ] **read-back-compared** The document is read back and its totals compared with the preview
  - inject: Five released previews, one of which the ledger stores with total tax one cent lower than the preview.
  - assert: Every written document has a recorded read-back made after a read of it; the one that differs has one readback_differs item with both totals, and no other draft has one.
  - on the stub: On the stub the stored totals are what the runner chose. Live, a ledger may round tax on the document rather than per line, or apply its own rounding setting; only the business's own ledger shows what it stores.
- [ ] **dry-run-writes-nothing** A dry run writes nothing
  - inject: The same drafts with dry run on; a person releases every preview and the build runs again.
  - assert: Previews are written as on an ordinary day, and there is no write to the ledger at all.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the preview and the write runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Do not build it.
