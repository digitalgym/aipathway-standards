---
name: rejected-pack
description: How to stop a licence, insurance or compliance pack failing after the work is done. The parent standard for Invoice Check, the Compliance Calendar and QA Proofcheck. One graph, eight checks in a fixed order, four queues, a named human gate, and the binding layer that is the hard step. Free to implement, with a twelve-point conformance checklist. Use when building, reviewing or auditing this workflow. Carries the AIP-BS-REJECTED-PACK open standard, free to implement under CC BY 4.0.
license: CC-BY-4.0
# The constitution. Loaded with the skill, not read from the essay. What a
# build to this standard must never do, and what stays with a person.
never:
  - "complete a pack with no evidence attached"
  - "bind or file"
  - "invent a missing item"
  - "skip a check in the eight"
stays_with_person:
  - "the binding sign-off"
  - "the named human gate"
  - "what the pack asserts"
---

# Rejected Pack Build Standard

**Spec:** AIP-BS-REJECTED-PACK · **Version:** 2026-09-15 · **Canonical:** https://aipathway.com.au/explore-ai/rejected-pack-build-standard

Open specification: how to stop a licence, insurance or compliance pack failing after the work is done. The parent standard for Invoice Check, the Compliance Calendar and QA Proofcheck. One graph, eight checks in a fixed order, four queues, a named human gate, and the binding layer that is the hard step. Free to implement, with a twelve-point conformance checklist.

## Read the standard first

The full specification is in `reference/rejected-pack.md` in this skill. Read it
before writing code. It is about 3,000 words and it is the whole job: the
checks in order, the objects with their fields, what must never be automated,
and a pass test.

For the current version, fetch https://aipathway.com.au/explore-ai/rejected-pack-build-standard.md. This copy is 2026-09-15.

The checks are also structured data, so you do not have to infer a test plan from
the prose: https://aipathway.com.au/explore-ai/rejected-pack-build-standard/checks.json gives each check a stable id, the ports it
observes, what to inject and what to assert. `npx @aipathway/conformance show
rejected-pack-build-standard` prints them and comes with a stub and a runner, so a build can be
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

- 1. What this standard is
- 2. What this is not
- 3. The three objects you are building
- 4. Eight checks in order
- 5. Four queues, not one inbox
- 6. Exceptions: what happens instead of a shrug
- 7. The parts that are harder than they look
- 8. The binding layer is the hard step
- 9. The workflow, end to end
- 10. The Australian default set
- 11. Sequencing against the other four jobs
- 12. What It Is Worth
- 13. The three objects, as fields
- 14. Provider: what to stub, and what not to hand-roll
- 15. Conformance checklist

## Attribution

AIP-BS-REJECTED-PACK, 2026-09-15, AI Pathway, https://aipathway.com.au/explore-ai/rejected-pack-build-standard

Licensed CC BY 4.0. Free to implement, including commercially. If you build to
this standard, cite the spec ID: a workflow built to a shared standard can be
audited and handed over, which is the whole reason it is published.
