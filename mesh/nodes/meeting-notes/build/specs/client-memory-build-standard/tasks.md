# Tasks: client-memory-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **agent-proposes-only** An agent proposes; it never writes an approved item
  - inject: A call ends. The client said invoices should go to the accounts address. The call summary, written by a different model, adds that the client is happy to pay on the day. Nobody has decided anything.
  - assert: Two proposals exist, both proposed, neither carrying an approver or an approval time. The first has a stated source naming the call. The second has an inferred source naming the call and the system that inferred it. No write_memory call happened. A proposal sent as approved, with an approver, or with the inference labelled stated, fails.
- [ ] **approval-names-a-person** Only a decision by an authorised person changes a proposal, and the record says who and when
  - inject: Three proposals. The owner approves one, the office manager rejects one, and an auto-approver run by another agent approves the third.
  - assert: The first is approved with the owner's name and the time of the owner's decision. The second is rejected with the manager's name and time. The third is still proposed, and an escalation names the decision as unauthorised_approver. Every write_memory names a decision that arrived on the approval surface. A commit with no decision, or by someone not on the list, fails.
- [ ] **approved-never-overwritten** An approved item is never overwritten: a change is a new version, and the old one holds until it is approved
  - inject: An approved standing instruction: invoices to the accounts address. On a later call the client says to send them to Jan instead. An invoice comes due before anybody decides. Then the owner approves the change, and another invoice comes due.
  - assert: The change is proposed with supersedes naming the first instruction. The first invoice goes to the accounts address. After approval the first instruction is superseded and points at the second, which is version 2, and the second invoice goes to Jan. The first instruction's content never changed. An invoice to Jan before the approval, or an edit to the approved item, fails.
- [ ] **read-by-client-id** Every other standard reads the approved slice by the client id on the job, never by name or phone
  - inject: Two clients with the same name and different client ids. One has an approved instruction for where quotes go, and a pending proposal for a different address. A quote comes due for each.
  - assert: Every memory read names the client id from the job it is acting on, and no client search by name or phone runs. The first client's quote goes to the approved address, not the proposed one. The second client's quote goes to the contact on their own job. Either quote following the other client's instruction, or the pending proposal, fails.
- [ ] **critical-instructions-applied** A critical standing instruction is read fresh and followed on every later interaction
  - inject: A client with one approved critical instruction. Over three weeks, as separate events with nothing carried between runs: a quote, an invoice and two chases.
  - assert: All four drafts follow the instruction, and each one was preceded by a read of that client's memory made after the previous draft for that client. One draft that ignores it, or a draft with no fresh read before it, fails.
  - on the stub: On the stub an instruction is a field and a draft is a field, so following it is a comparison. Only a live call proves the model follows an instruction in speech, like asking for the spouse, when the caller pushes the other way.
- [ ] **review-flags-drift** A review lists every approved standing instruction, flags drift, and changes nothing
  - inject: A review comes due. Three clients: one instruction followed every time since it was approved, one a later invoice ignored, and two approved instructions for the same client that disagree.
  - assert: One review, listing each approved standing instruction once with its version. The first is ok, the second is not_applied naming the draft that missed it, and the third pair are each contradicted naming the other. No write_memory happened during the review, every approved item is unchanged, and any proposal made names the item it would replace. A review that fixes anything itself, or misses a flag, fails.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the memory record and the list of approvers runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Quoted as a scoped build: send the check id, do not build it yourself.
