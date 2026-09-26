---
name: knowledge-base
description: The phase before a knowledge graph. Every source the business relies on inventoried on one register with a named owner, a location, a checksum and an edition; duplicates resolved to one canonical copy; customer material quarantined from the shared index; passages indexed with replayable locators; search that returns passages and never a composed answer; a scheduled watch that catches a changed checksum and tells the owner; and a handover to the Knowledge Graph standard that carries the register id. Built on Microsoft 365 or Google Workspace. Free to implement, with a conformance checklist. Use when building, reviewing or auditing this workflow. Carries the AIP-BS-KNOWLEDGE-BASE open standard, free to implement under CC BY 4.0.
license: CC-BY-4.0
# The constitution. Loaded with the skill, not read from the essay. What a
# build to this standard must never do, and what stays with a person.
never:
  - "index a file that is not on the register"
  - "name a team as an owner"
  - "put customer material in the shared index"
  - "return a composed answer from search"
  - "hand the graph a source the register does not hold"
stays_with_person:
  - "owning a source, and answering for it when it moves"
  - "deciding which copy is canonical"
  - "closing a gap for a source that cannot be found"
  - "who may read customer material and for how long"
---

# Knowledge Base Build Standard

**Spec:** AIP-BS-KNOWLEDGE-BASE · **Version:** 2026-09-26 · **Canonical:** https://aipathway.com.au/explore-ai/knowledge-base-build-standard

Open specification: the phase before a knowledge graph. Every source the business relies on inventoried on one register with a named owner, a location, a checksum and an edition; duplicates resolved to one canonical copy; customer material quarantined from the shared index; passages indexed with replayable locators; search that returns passages and never a composed answer; a scheduled watch that catches a changed checksum and tells the owner; and a handover to the Knowledge Graph standard that carries the register id. Built on Microsoft 365 or Google Workspace. Free to implement, with a conformance checklist.

## Read the standard first

The full specification is in `reference/knowledge-base.md` in this skill. Read it
before writing code. It is about 3,000 words and it is the whole job: the
checks in order, the objects with their fields, what must never be automated,
and a pass test.

For the current version, fetch https://aipathway.com.au/explore-ai/knowledge-base-build-standard.md. This copy is 2026-09-26.

The checks are also structured data, so you do not have to infer a test plan from
the prose: https://aipathway.com.au/explore-ai/knowledge-base-build-standard/checks.json gives each check a stable id, the ports it
observes, what to inject and what to assert. `npx @aipathway/conformance show
knowledge-base-build-standard` prints them and comes with a stub and a runner, so a build can be
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
- 2. The kinds of source
- 3. The objects, and what is in them
- 4. The checks, in order
- 5. Search finds, and never answers
- 6. Building it on Microsoft 365 or Workspace
- 7. The handover to the graph
- 8. What stays with a person
- 9. Provider: what to stub, and what not to hand-roll
- 10. Conformance checklist

## Attribution

AIP-BS-KNOWLEDGE-BASE, 2026-09-26, AI Pathway, https://aipathway.com.au/explore-ai/knowledge-base-build-standard

Licensed CC BY 4.0. Free to implement, including commercially. If you build to
this standard, cite the spec ID: a workflow built to a shared standard can be
audited and handed over, which is the whole reason it is published.
