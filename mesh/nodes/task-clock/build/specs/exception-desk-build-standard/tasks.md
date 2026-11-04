# Tasks: exception-desk-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **names-its-record** Every item names its record by id, read from the system that holds it
  - inject: Three raises arrive. Quote Out parks job J-1042 in ServiceM8 on a line not in the price book. A bot raises a parts shortfall for "Mrs Patel's hot water job" with no record id. Invoice Out parks Xero invoice INV-9999, which the ledger does not hold.
  - assert: Exactly one item exists, for J-1042, naming ServiceM8 and J-1042, and a read of J-1042 came before its write. The other two raises are each sent back to the standard that raised them, naming why. No item exists without a record id.
  - on the stub: On the stub the job system and the ledger are maps the runner filled. Only a live tenant proves the id read is the one ServiceM8, Simpro, AroFlo, Fergus or Xero actually holds, and that a job merged or deleted since is refused.
- [ ] **type-from-the-closed-list** The type comes from the closed list
  - inject: A bot raises an item on a real job with the label missing_permit, which is not on the list, and Quote Out raises price_not_in_book on another.
  - assert: Two items. The first has type other and its reason contains missing_permit. The second has type price_not_in_book. No item in the queue has a type outside the closed list.
- [ ] **owner-and-clock-from-routing** The owner and the clock come from the routing table, never from the agent that raised it
  - inject: A bot raises a parts shortfall on J-1042 and suggests itself as owner, due in a week. The routing table says parts shortfalls go to Mel with four hours on the clock.
  - assert: The item's owner is Mel and its due time is four hours after it was raised. A read of the routing table came before the write, and the write carries neither the suggested owner nor the suggested due time.
- [ ] **one-item-per-record-and-type** One item per record and type: a second raise updates the open item
  - inject: A bot raises a parts shortfall on J-1042. Two hours later Parts Ready raises the same shortfall with a new reason, and Job Close raises write_failed on the same job.
  - assert: Two open items on J-1042. The shortfall item keeps its id and first due time, carries the newer reason and a raise count of two. The write_failed item is separate. No two open items share a record and a type.
- [ ] **nothing-auto-closes** Nothing closes itself: a person closes every item, with an outcome
  - inject: Two open items. Get Paid reports the invoice behind the first one was paid. The office manager closes the second on the queue's screen with the outcome "rang supplier, part on the 7:30 run".
  - assert: The first item is still open and marked resolved upstream. The second is closed by the office manager with her outcome and time. No write the desk attempted carried a closed status or a close.
- [ ] **disputes-stay-with-a-person** A dispute or a hardship claim is never worked by an agent
  - inject: A Front Desk call raises a dispute on invoice INV-2207, suggesting a payment plan be sent. A bot raises hardship on INV-2210. The routing table names the owner, Dana, for both.
  - assert: Both items are owned by Dana and carry the chase stop, so a chase on either invoice is held. No notify or escalate about either record went to anyone but Dana.
- [ ] **overdue-escalates-once** An overdue item escalates once
  - inject: A parts shortfall due at 2pm, with the routing table naming Dana as the escalation. The desk runs at 1pm, 3pm, 7pm and the next morning. A second item due at 2pm is closed by a person at 1:30pm.
  - assert: Exactly one escalation for the first item, to Dana, made at or after 2pm. None for the closed item.
- [ ] **daily-summary-even-when-empty** The daily summary goes out by the set time, including when there is nothing in it
  - inject: Two mornings with the summary set for 7am. On the first, three items are open and one is overdue. By the second, a person has closed all three. The desk runs at 6am and 7:05am each day.
  - assert: One summary each day, published at or after 7am and before 8am. The first counts three by type and by owner and lists the overdue one. The second has no items and says none.
  - on the stub: On the stub a summary is a record the runner reads. Only the live run proves it reached the owner's inbox or Teams channel on the morning it says, and that the counts match the queue the person sees.

## Not tasks

- pass-test The pass test passes: `with_us`. Do not build it.
