---
name: knowledge-graph
description: How to turn a knowledge base into a graph an assistant can trust. Pile, index and graph as three layers with only the third the standard; a versioned key contract of seven node types and eight edge types; sources registered as instruments with an edition and a checksum; nodes that reach live only through a named person with a replayable locator; scope as an APPLIES_TO edge; supersession and conflict as written edges the model never resolves; a change delta that lists every affected node; an index that may propose and never answer; and the detach test. Free to implement, with a conformance checklist. Use when building, reviewing or auditing this workflow. Carries the AIP-BS-KNOWLEDGE-GRAPH open standard, free to implement under CC BY 4.0.
license: CC-BY-4.0
# The constitution. Loaded with the skill, not read from the essay. What a
# build to this standard must never do, and what stays with a person.
never:
  - "let production read the index or the pile instead of live nodes"
  - "promote a node to live on confidence"
  - "invent a node type or an edge type the contract does not name"
  - "let the model pick a winner between two live nodes"
  - "treat customer files or interviews as a source"
stays_with_person:
  - "accepting a source into the library"
  - "accepting a proposed node or edge as live"
  - "resolving a conflict"
  - "accepting a change delta so affected nodes may answer again"
  - "declaring two entities the same thing"
  - "any statement that the graph is complete or approved for client use"
---

# Knowledge Graph Build Standard

**Spec:** AIP-BS-KNOWLEDGE-GRAPH · **Version:** 2026-09-26 · **Canonical:** https://aipathway.com.au/explore-ai/knowledge-graph-build-standard

Open specification: how to turn a knowledge base into a graph an assistant can trust. Pile, index and graph as three layers with only the third the standard; a versioned key contract of seven node types and eight edge types; sources registered as instruments with an edition and a checksum; nodes that reach live only through a named person with a replayable locator; scope as an APPLIES_TO edge; supersession and conflict as written edges the model never resolves; a change delta that lists every affected node; an index that may propose and never answer; and the detach test. Free to implement, with a conformance checklist.

## Read the standard first

The full specification is in `reference/knowledge-graph.md` in this skill. Read it
before writing code. It is about 3,000 words and it is the whole job: the
checks in order, the objects with their fields, what must never be automated,
and a pass test.

For the current version, fetch https://aipathway.com.au/explore-ai/knowledge-graph-build-standard.md. This copy is 2026-09-26.

The checks are also structured data, so you do not have to infer a test plan from
the prose: https://aipathway.com.au/explore-ai/knowledge-graph-build-standard/checks.json gives each check a stable id, the ports it
observes, what to inject and what to assert. `npx @aipathway/conformance show
knowledge-graph-build-standard` prints them and comes with a stub and a runner, so a build can be
driven through those ports and asserted without a live phone number. Verdicts
are not pass/fail: a check needing a live number returns `with_us` rather than
failing you, and one asking what you measured before building returns
`evidence_required`, which no amount of working code turns green.

## How to use it

1. **Follow the checks in the order the standard gives them.** The order is the
   claim. A build that does the same things in a different order usually fails
   the pass test, and the standard says why at each step.
2. **Use the object shapes as given.** The standard defines the records this
   workflow turns on. Renaming fields is fine; dropping one is how the workflow
   stops being auditable six months later.
3. **Implement the conformance checklist.** It is what a working build looks
   like, written so a person can hold a vendor or a DIY build to it.
4. **Run the pass test.** It is written so a stub cannot pass it. If your build
   passes it by doing nothing, read it again.
5. **Respect the boundary.** Every standard names what stays with a person.
   Those are not conservative defaults: they are the points where an Australian
   business carries a legal or commercial obligation a machine cannot hold.

## The step not to hand-roll

The standard names one step that is a liability rather than a feature, and says
whether a product covers it. Where it says `production: none`, no product
covers that step today and you should build it. Where it names one, building the
stub is the right first move and shipping the stub to real customers is not.

## If they are on Microsoft 365

Where `reference/microsoft-365.md` exists in this skill, it is the build plan
for this standard on SharePoint, Power Automate and Power BI: the lists with
their columns, each check against the thing that enforces it, the flows as
trigger and logic, the DAX, the order to build in, and the traps. Read it after
the standard, not instead of it. Where the two disagree, the standard wins.

## What this skill will not do

It will not tell you it is finished. Conformance is the checklist and the pass
test, both in the reference, and both are things you run rather than things this
skill asserts.

## The work, in order

- 1. What this standard covers
- 2. Pile, index, graph
- 3. The key contract
- 4. The objects, and what is in them
- 5. The checks, in order
- 6. The four queues for a node
- 7. What the index is allowed to do
- 8. What stays with a person
- 9. Provider: what to stub, and what not to hand-roll
- 10. Conformance checklist

## Attribution

AIP-BS-KNOWLEDGE-GRAPH, 2026-09-26, AI Pathway, https://aipathway.com.au/explore-ai/knowledge-graph-build-standard

Licensed CC BY 4.0. Free to implement, including commercially. If you build to
this standard, cite the spec ID: a workflow built to a shared standard can be
audited and handed over, which is the whole reason it is published.
