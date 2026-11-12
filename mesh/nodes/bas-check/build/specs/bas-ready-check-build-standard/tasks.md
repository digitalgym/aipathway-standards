# Tasks: bas-ready-check-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **period-from-the-ledger** The period's transactions come from the ledger, by its own ids and dates
  - inject: A quarter with transactions inside it, one bill dated two days after the quarter ends with GST claimed and nothing attached, and settings naming the quarter.
  - assert: The build read the ledger for exactly the period set, the list names that period, and no flag cites a transaction dated outside it. The bill after quarter end is on no flag.
- [ ] **every-flag-cites-its-source** Every flag cites the transaction it came from, and that transaction reads back
  - inject: The base quarter, with a bill carrying several bait problems at once.
  - assert: Every line flag cites at least one transaction id the world holds in the period, with that transaction's own date and total. Every period flag names the period. A flag with no source, or citing an id that does not exist, fails.
- [ ] **tax-invoice-held** GST claimed above the tax invoice threshold with no tax invoice attached is flagged
  - inject: Three purchases with GST claimed: one above the threshold with a document attached, one above it with nothing attached, one small one below it with nothing attached.
  - assert: Exactly one tax_invoice flag, citing the purchase above the threshold with nothing attached. The attached purchase and the small one are on no tax_invoice flag.
  - on the stub: The stub says whether a document is attached because it was told. Only the real ledger proves the build read attachment presence from the ledger's own record of it, and no stub or ledger proves the attached document is a valid tax invoice: that stays with the person.
- [ ] **code-differs-from-usual** A GST code that differs from what that supplier or account usually carries is flagged, with the usual code shown
  - inject: A supplier coded GST on six bills in the prior two quarters, then coded GST-free on one bill this quarter. A new supplier with one bill and no history.
  - assert: One usual_code flag cites the GST-free bill and states the usual code and its count. The new supplier's bill is on no usual_code flag. A flag that names a code as correct, or a flag on a supplier with no history, fails.
- [ ] **gst-on-no-gst-accounts** GST claimed on an account the business marked as carrying no GST is flagged
  - inject: A bank fee line with GST claimed, in an account on the business's no-GST list, and a repairs line with GST claimed in an account not on it.
  - assert: One no_gst_account flag, citing the bank fee transaction. The repairs line is on no no_gst_account flag.
- [ ] **capital-coded-capital** A purchase in a capital account not coded capital, or the reverse, is flagged when the business reports G10 and G11
  - inject: Full reporting. A plant and equipment purchase in the fixed asset account coded with the non-capital GST code, and a repairs bill coded correctly.
  - assert: One capital flag citing the plant purchase. Run again with simpler BAS set: no capital flag, and capital appears under not checked.
- [ ] **unreconciled-and-uncoded** Transactions inside the period that are unreconciled or carry no tax code are flagged
  - inject: One bank spend line with no tax code, one coded but unreconciled, and the rest reconciled and coded.
  - assert: One uncoded flag and one unreconciled flag, each citing its own transaction. No reconciled, coded line is flagged under either.
- [ ] **swing-against-comparable** Period totals that swing against the comparable period beyond the business's band are flagged, with both figures
  - inject: A comparable quarter where sales and GST on sales are close to this quarter and GST on purchases is far lower, with a band of 25 percent.
  - assert: Exactly one swing flag, for GST on purchases, stating both figures and both periods. Sales and GST on sales are on no swing flag.
- [ ] **control-account-agrees** The GST control account's movement for the period is compared with the GST the transactions report, and a difference is flagged
  - inject: A manual journal of $500 posted straight to the GST account inside the quarter, with no tax code.
  - assert: One control_account flag whose stated difference equals the world's actual difference to the cent, and it cites the journal.
- [ ] **lists-what-it-could-not-check** Whatever it could not check is listed, with the reason
  - inject: A ledger that cannot read attachments or reconciliation status, on simpler BAS.
  - assert: Not checked names tax_invoice, reconciliation and capital, each with a reason. No tax_invoice, unreconciled or capital flag is raised.
  - on the stub: The stub says what the ledger can read because it was configured to. Only a run against the real ledger shows which of its reads actually work on the business's plan and file.
- [ ] **flags-never-decides** Read only: one list to the named person, nothing written, nothing lodged, no advice
  - inject: The base quarter, run once.
  - assert: Exactly one list published, to the named reviewer. No call in the trace writes anything. No flag's text tells the reader what to change, claim or lodge.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the check runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Your build does this on the business's own systems; prove it there by hand and attach the evidence.
