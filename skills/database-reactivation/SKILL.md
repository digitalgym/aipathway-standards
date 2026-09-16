---
name: database-reactivation
description: The method for working an agent's own database. Four plays with real triggers, the six ranking rules that decide which contact rings first, the opener that works and the one that does not, plus what breaks after a self-built version starts working. Use when building, reviewing or auditing this workflow. Carries the AIP-BS-DATABASE-REACTIVATION open standard, free to implement under CC BY 4.0.
license: CC-BY-4.0
---

# Database Reactivation Build Standard

**Spec:** AIP-BS-DATABASE-REACTIVATION · **Version:** 2026-09-11 · **Canonical:** https://aipathway.com.au/explore-ai/database-reactivation-build-standard

Build standard: the method for working an agent's own database. Four plays with real triggers, the six ranking rules that decide which contact rings first, the opener that works and the one that does not, plus what breaks after a self-built version starts working.

## Read the standard first

The full specification is in `reference/database-reactivation.md` in this skill. Read it
before writing code. It is about 3,000 words and it is the whole job: the
checks in order, the objects with their fields, what must never be automated,
and a pass test.

For the current version, fetch https://aipathway.com.au/explore-ai/database-reactivation-build-standard.md. This copy is 2026-09-11.

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

## What this skill will not do

It will not tell you it is finished. Conformance is the checklist and the pass
test, both in the reference, and both are things you run rather than things this
skill asserts.

## The work, in order

- 1. The Five Fields That Matter
- 2. Four Plays, Not One Campaign
- 3. Which Contact Rings First
- 4. The Opener Is the Whole Call
- 5. Cadence, and When to Stop
- 6. The Gate, Which Is the Step to Not Hand-Roll
- 7. Hand Us the List
- 8. Parts That Are Harder Than They Look
- 9. What It Is Worth
- 10. What Breaks After It Works
- 11. Conformance checklist

## Attribution

AIP-BS-DATABASE-REACTIVATION, 2026-09-11, AI Pathway, https://aipathway.com.au/explore-ai/database-reactivation-build-standard

Licensed CC BY 4.0. Free to implement, including commercially. If you build to
this standard, cite the spec ID: a workflow built to a shared standard can be
audited and handed over, which is the whole reason it is published.
