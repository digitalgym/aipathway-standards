# Tasks: knowledge-graph-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **key-contract-before-extract** The key contract is written and versioned before the first extract
  - inject: A build that reads the contract, then proposes one node of a published type and one of a type the contract does not name.
  - assert: The contract read precedes the first proposal in the trace. The published type is accepted as proposed. The invented type is refused and the refusal is recorded. A build that never reads the contract fails.
- [ ] **source-is-an-instrument** Every source is registered as an instrument, not a file path
  - inject: Two sources registered: one with every field, one with a title and a link only.
  - assert: The complete one is registered as proposed. The bare one is refused with the missing fields named. A source accepted without a checksum fails.
- [ ] **nothing-live-without-acceptance** No node is live without a named acceptance and a replayable locator
  - inject: A source accepted by a person, nodes proposed from it, one accepted with a name, one accepted with no name, one with no locator.
  - assert: Exactly one node is live: the one with a name and a locator. The nameless acceptance and the locator-less node are refused, and both refusals are recorded. A live node with empty provenance fails.
- [ ] **production-reads-live-nodes** Production reads live nodes, and a card names a node, never a file
  - inject: A question the live graph covers, with the index also holding a matching chunk.
  - assert: The answer's citations are node ids that are live on the asked-about date. A citation that is a filename or a chunk id fails, and so does an answer with no node id.
- [ ] **identity-from-the-system-of-record** Entity identity comes from a system of record, or SAME_AS is an accepted edge
  - inject: A source naming a lender in full, and a CRM key for the same lender.
  - assert: Either one Entity node carrying the CRM id, or two nodes joined by a SAME_AS edge that carries accepted_by. Two nodes with no edge, or a merge by label, fails.
  - on the stub: The stub carries a register the runner seeded. Only a live CRM or panel proves the id the build wrote is the id the business actually uses.
- [ ] **scope-is-an-edge** Scope is an APPLIES_TO edge, and an unscoped clause cannot answer a scoped question
  - inject: Two live clauses on the same topic, one scoped to a state and one with no scope, and a question about that state.
  - assert: The answer cites the scoped clause only. An answer citing the unscoped clause for a scoped question fails.
- [ ] **supersedes-and-conflicts-are-written** Supersession and conflict are written edges, and the model never picks a winner
  - inject: A replacement clause accepted, and separately two live clauses that answer one question differently.
  - assert: The superseded node is out of live and the edge exists. The conflicting pair carries a CONFLICTS edge and an escalation to a named person, and neither is cited until a person's pick is recorded.
- [ ] **change-computes-affected-nodes** Replacing a source produces a delta with a computed list of affected nodes
  - inject: A source replaced by a new edition with a different checksum, after nodes were built from it and answers were given.
  - assert: The delta's affected node ids equal the nodes whose provenance is that source, and those nodes are no longer live. A delta with an empty or guessed list, or nodes still live after the move, fails.
- [ ] **queues-are-states** Proposed, live, conflict, change_pending and retired are states, not labels
  - inject: A clause cited, then retired, then the same question asked again.
  - assert: The second answer does not cite the retired node. The retired node is still returned when asked what an earlier answer relied on. Citing a retired node as live fails.
- [ ] **index-proposes-only** The index can propose and rank. Emptying it does not empty the graph and does not invent an answer
  - inject: The index detached, then the covered question from check 4 and an uncovered question.
  - assert: The covered question cites the same node as before. The uncovered one declines. An answer that appears only while the index is attached, or a new paragraph with no node id, fails.
- [ ] **customer-material-is-not-a-source** Customer files and interviews are not sources unless a person promotes a claim
  - inject: A customer interview transcript in the same folder as the policy, and a claim in it that a build might want as a Fact.
  - assert: No source of kind customer_material is accepted. The claim exists as a Fact only if promoted with a person's name, and that Fact carries provenance. A live node built from unpromoted customer material fails.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the graph, the acceptances and the change list runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Your build does this on the business's own systems; prove it there by hand and attach the evidence.
