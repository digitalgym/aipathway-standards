---
name: compliance-calendar
description: How to build a compliance calendar that survives a rule change. Dated rules and derived due dates, the obligation record, the four states, and the hard parts: unknown anchor dates, cross-border rules, and the owner who declines the work. Free to implement, with a conformance checklist. Use when building, reviewing or auditing this workflow. Carries the AIP-BS-COMPLIANCE-CALENDAR open standard, free to implement under CC BY 4.0.
license: CC-BY-4.0
---

# Compliance Calendar Build Standard

**Spec:** AIP-BS-COMPLIANCE-CALENDAR · **Version:** 2026-09-10 · **Canonical:** https://aipathway.com.au/explore-ai/compliance-calendar-build-standard

Open specification: how to build a compliance calendar that survives a rule change. Dated rules and derived due dates, the obligation record, the four states, and the hard parts: unknown anchor dates, cross-border rules, and the owner who declines the work. Free to implement, with a conformance checklist.

## Read the standard first

The full specification is in `reference/compliance-calendar.md` in this skill. Read it
before writing code. It is about 3,000 words and it is the whole job: the
checks in order, the objects with their fields, what must never be automated,
and a pass test.

For the current version, fetch https://aipathway.com.au/explore-ai/compliance-calendar-build-standard.md. This copy is 2026-09-10.

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

- 1. What this standard covers
- 2. Dated rules, derived dates
- 3. The obligation record
- 4. The four states
- 5. Six rules that keep it trustworthy
- 6. The parts that are harder than they look
- 7. What breaks after it works
- 8. What It Is Worth
- 9. The objects, and what is in them
- 10. Provider: what to stub, and what not to hand-roll
- 11. Conformance checklist

## Attribution

AIP-BS-COMPLIANCE-CALENDAR, 2026-09-10, AI Pathway, https://aipathway.com.au/explore-ai/compliance-calendar-build-standard

Licensed CC BY 4.0. Free to implement, including commercially. If you build to
this standard, cite the spec ID: a workflow built to a shared standard can be
audited and handed over, which is the whole reason it is published.
