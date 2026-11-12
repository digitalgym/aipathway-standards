# Tasks: uncoded-query-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **lines-from-the-ledger** Only lines the ledger still shows as uncoded are asked about
  - inject: Three uncoded lines for one client, one of which the bookkeeper codes by hand before the monthly run.
  - assert: The question list carries the two lines still uncoded and not the one coded by hand, and the ledger was read in the same run before the list was sent.
  - on the stub: The stub proves the order and the filter. Only a live ledger proves the read is the real suspense account and the real unreconciled lines, which each ledger exposes differently.
- [ ] **one-list-per-client-per-cycle** One question list per client per cycle, with every open line in it
  - inject: Two clients, each with uncoded lines. The build runs three times in the cycle, and a new line lands for one client between the first and second runs.
  - assert: Exactly one list per client in the cycle, each carrying every line that was uncoded at the first run, and no list carries a line from another client.
- [ ] **plain-question-per-line** Each line is one plain question with a place to answer it
  - inject: A client with a $412.50 payment to BUNNINGS on 3 October and a $1,200.00 deposit from J SMITH on 5 October.
  - assert: The list holds one question per line, each carrying the amount, the payee as printed and the date, and the list carries an answer link for that client.
- [ ] **no-tax-advice** No tax advice and no bookkeeping words reach the client
  - inject: A month with a list and two reminders to a client whose lines include a hardware store, a fuel card and a transfer.
  - assert: No list or reminder text matches the published advice words.
- [ ] **never-ask-twice** A line already answered is never asked about again
  - inject: A client answers one of two lines. A reminder falls due, the cycle rolls over, and the answered line is still uncoded in the ledger because nobody has approved it yet.
  - assert: The reminder carries only the unanswered line, and the next cycle's list does not carry the answered one.
- [ ] **reminders-then-a-person** Reminders on the schedule the practice set, then a person
  - inject: A client who never answers. The practice set a reminder every three days, two at most. The build runs every day for twelve days.
  - assert: Two reminders, each at least three days after the message before it, then one hand-off naming the open lines, and no message to the client after it.
- [ ] **answer-kept-as-written** The client's answer is kept word for word, with who and when
  - inject: A client answers "tiles and grout for the Smith St job" against one line.
  - assert: The record for that line holds the answer word for word with the client's name and the time, ahead of any proposal for it.
- [ ] **proposal-from-chart-and-history** The proposed coding comes from the client's own chart, and their own history first
  - inject: A client who has coded BUNNINGS to Materials before answers "tiles and grout", and answers "fuel for the ute" against a payee with no history.
  - assert: The BUNNINGS line is proposed to the account its history holds, the fuel line to the client's own fuel account with that account's tax code, and the chart was read before the first proposal.
- [ ] **never-invents-an-account** No account or tax code the client's chart lacks is ever proposed or written
  - inject: A client answers "bought some crypto" and has no account that fits; another client of the practice has a Crypto Assets account.
  - assert: A no_account_fits hand-off carries the answer, and no proposal or write attempt for that line names an account or tax code outside that client's chart.
- [ ] **approved-before-written** Nothing is written until a named person approves that exact coding
  - inject: Two answered lines with proposals. A person approves one as proposed and approves the other to a different account than proposed. A third line is proposed and never approved.
  - assert: The first is written as proposed, the second as the person approved it, and the third is never written. No write precedes its approval.
  - on the stub: The stub proves nothing leaves without a release event carrying a named person. Only the live path proves what left is what was released, rather than something regenerated after the approval.
- [ ] **never-reconciles** The build never reconciles a bank line; a person does
  - inject: A client answers a line that is an unreconciled bank line, and a person approves its coding.
  - assert: No write is attempted for that line, and a reconcile_by_person hand-off names it with the approved account and tax code.
- [ ] **written-once** An approved coding is written once, however often the build runs
  - inject: An approved line whose first write lands in the ledger and then times out. The build runs three times.
  - assert: The ledger changed for that line exactly once, and every write attempt for it carried the same key.
- [ ] **read-back-and-record** Every write is read back, and a mismatch goes to a person
  - inject: Two approved lines. The ledger stores the first as approved and stores the second with a different tax code than the one written.
  - assert: Both writes are followed by a read of that line. The first is recorded as written with the ledger's coding, and the second is handed off as readback_mismatch with one landed write.
  - on the stub: The stub proves the read follows the write and a mismatch is handed off. Only a live ledger proves what it actually stores: a locked period, a tax code it rewrites, or a transaction it will not edit.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the question lists, the proposals and the writes runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Quoted as a scoped build: send the check id, do not build it yourself.
