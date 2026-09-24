---
name: quote-out
description: The open build standard for turning a job that already exists into a quote: the job as the only trigger, the customer's own price list as the only source of a rate, work the book does not cover parked rather than estimated, one quote per job across every intake door, the draft written into ServiceM8, Simpro or Xero rather than rendered by the agent, sending left with a person, and a pass test staged on a real tenant that a stub cannot fake. Use when building, reviewing or auditing this workflow. Carries the AIP-BS-QUOTE-OUT open standard, free to implement under CC BY 4.0.
license: CC-BY-4.0
---

# Quote Out Build Standard

**Spec:** AIP-BS-QUOTE-OUT · **Version:** 2026-09-21 · **Canonical:** https://aipathway.com.au/explore-ai/quote-out-build-standard

The open build standard for turning a job that already exists into a quote: the job as the only trigger, the customer's own price list as the only source of a rate, work the book does not cover parked rather than estimated, one quote per job across every intake door, the draft written into ServiceM8, Simpro or Xero rather than rendered by the agent, sending left with a person, and a pass test staged on a real tenant that a stub cannot fake.

## Read the standard first

The full specification is in `reference/quote-out.md` in this skill. Read it
before writing code. It is about 3,000 words and it is the whole job: the
checks in order, the objects with their fields, what must never be automated,
and a pass test.

For the current version, fetch https://aipathway.com.au/explore-ai/quote-out-build-standard.md. This copy is 2026-09-21.

The checks are also structured data, so you do not have to infer a test plan from
the prose: https://aipathway.com.au/explore-ai/quote-out-build-standard/checks.json gives each check a stable id, the ports it
observes, what to inject and what to assert. `npx @aipathway/conformance show
quote-out-build-standard` prints them and comes with a stub and a runner, so a build can be
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

- 1. Scope, and what is out of it
- 2. The checks, in order
- 3. The price list is the only source of a rate
- 4. What gets parked
- 5. The quote object
- 6. Write-back, and writing once
- 7. Sending stays with a person
- 8. Provider and hosting
- 10. Conformance checklist

## Attribution

AIP-BS-QUOTE-OUT, 2026-09-21, AI Pathway, https://aipathway.com.au/explore-ai/quote-out-build-standard

Licensed CC BY 4.0. Free to implement, including commercially. If you build to
this standard, cite the spec ID: a workflow built to a shared standard can be
audited and handed over, which is the whole reason it is published.
