---
name: material-order
description: Turning a job's material list into purchase orders per supplier. Lines from the job by catalogue code, stock on hand checked and reserved first, the supplier's catalogue as the only source of a price, one order per job and supplier written once with an id back, a threshold and an approved-supplier list that need a named person's release, lead time as data, delivery matched back line by line, variances as a queue, no silent substitution. Free to implement, with a conformance checklist. Use when building, reviewing or auditing this workflow. Carries the AIP-BS-MATERIAL-ORDER open standard, free to implement under CC BY 4.0.
license: CC-BY-4.0
# The constitution. Loaded with the skill, not read from the essay. What a
# build to this standard must never do, and what stays with a person.
never:
  - "order a line the job does not carry"
  - "order what stock already covers"
  - "type a price; the supplier catalogue is the only source"
  - "order twice for one job and supplier"
  - "release over threshold or accept a substitution without a person"
stays_with_person:
  - "the release over threshold"
  - "approving a supplier"
  - "accepting a substitution"
  - "every variance"
---

# Material Order Build Standard

**Spec:** AIP-BS-MATERIAL-ORDER · **Version:** 2026-09-26 · **Canonical:** https://aipathway.com.au/explore-ai/material-order-build-standard

Open specification: turning a job's material list into purchase orders per supplier. Lines from the job by catalogue code, stock on hand checked and reserved first, the supplier's catalogue as the only source of a price, one order per job and supplier written once with an id back, a threshold and an approved-supplier list that need a named person's release, lead time as data, delivery matched back line by line, variances as a queue, no silent substitution. Free to implement, with a conformance checklist.

## Read the standard first

The full specification is in `reference/material-order.md` in this skill. Read it
before writing code. It is about 3,000 words and it is the whole job: the
checks in order, the objects with their fields, what must never be automated,
and a pass test.

For the current version, fetch https://aipathway.com.au/explore-ai/material-order-build-standard.md. This copy is 2026-09-26.

The checks are also structured data, so you do not have to infer a test plan from
the prose: https://aipathway.com.au/explore-ai/material-order-build-standard/checks.json gives each check a stable id, the ports it
observes, what to inject and what to assert. `npx @aipathway/conformance show
material-order-build-standard` prints them and comes with a stub and a runner, so a build can be
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
- 2. The objects, and what is in them
- 3. The checks, in order
- 4. The six queues
- 5. Delivery, and what it feeds
- 6. What stays with a person
- 7. Provider: what to stub, and what not to hand-roll
- 8. Conformance checklist

## Attribution

AIP-BS-MATERIAL-ORDER, 2026-09-26, AI Pathway, https://aipathway.com.au/explore-ai/material-order-build-standard

Licensed CC BY 4.0. Free to implement, including commercially. If you build to
this standard, cite the spec ID: a workflow built to a shared standard can be
audited and handed over, which is the whole reason it is published.
