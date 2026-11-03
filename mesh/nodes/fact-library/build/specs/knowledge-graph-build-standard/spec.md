# AIP-BS-KNOWLEDGE-GRAPH: knowledge-graph-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/knowledge-graph-build-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/knowledge-graph-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/knowledge-graph-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Eleven of these thirteen checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs against your own live systems. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **key-contract-before-extract** The key contract is written and versioned before the first extract. Node types, edge types, predicates and required fields are a closed list at each version. An extract that invents a type has forked the graph and is refused.
- **source-is-an-instrument** Every source is registered as an instrument, not a file path. Title, issuer, edition, jurisdiction, effective dates, checksum and retrieved_at. A drive link with no edition is a pile entry, not a Source.
- **nothing-live-without-acceptance** No node is live without a named acceptance and a replayable locator. Ingestion is not production. A node reaches live only when a named person accepts it, and only when its provenance names a passage with a locator that can be opened and highlighted.
- **production-reads-live-nodes** Production reads live nodes, and a card names a node, never a file. Cited Answer and Advice File attach source cards from live nodes. An answer that cites a passage hash, a chunk id or a filename has not used the graph.
- **identity-from-the-system-of-record** Entity identity comes from a system of record, or SAME_AS is an accepted edge. A lender, a product, a site or a person carries the id the CRM, the panel or the register already uses. Two labels that look alike are two things until a person accepts SAME_AS. An embedding that thinks they match is not identity.
- **scope-is-an-edge** Scope is an APPLIES_TO edge, and an unscoped clause cannot answer a scoped question. A clause with no jurisdiction, product, work type or entity on it can decline or sit in conflict. It cannot answer a question asked about one state or one product.
- **supersedes-and-conflicts-are-written** Supersession and conflict are written edges, and the model never picks a winner. A new node retires the old through SUPERSEDES and the old cannot answer. Two live nodes that disagree get a CONFLICTS edge and a named person, never an average and never a confidence score.
- **change-computes-affected-nodes** Replacing a source produces a delta with a computed list of affected nodes. When the checksum moves, the graph lists every node built from that source and every historic answer that used them. If you cannot produce that list, you have an index.
- **queues-are-states** Proposed, live, conflict, change_pending and retired are states, not labels. A retired node must not appear on a new source card. It must remain findable for the answers that used it.
- **index-proposes-only** The index can propose and rank. Emptying it does not empty the graph and does not invent an answer. Detach the vector index and the model weights. The live nodes are unchanged. A question the graph covers still answers from the same node; a question it does not cover declines.
- **customer-material-is-not-a-source** Customer files and interviews are not sources unless a person promotes a claim. A claim from an interview becomes a Fact only when a named person promotes it, and the Fact still needs provenance. A crawler finding it in the same drive does not make it policy.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; proved on your own systems, with the evidence attached.

When a check is `with_us`: No hosted step. The production check runs over the business's own corpus, register ids and accepted library. Identity, the change list and acceptance are the three parts not to hand-roll, and they are data, not a product. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.
