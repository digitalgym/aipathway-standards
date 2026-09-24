---
name: booked-after-hours
description: The open build standard for answering a trade business phone out of hours. Disclosure and recording consent before the first question, a fixed emergency / routine / quote taxonomy, the address resolved by lookup rather than transcribed, one job written not two, typed escalation with the on-call rule, a stub to build against, and a pass test you can stage on your own phone in a minute. Use when building, reviewing or auditing this workflow. Carries the AIP-BS-BOOKED-AFTER-HOURS open standard, free to implement under CC BY 4.0.
license: CC-BY-4.0
# The constitution. Loaded with the skill, not read from the essay. What a
# build to this standard must never do, and what stays with a person.
never:
  - "guess or transcribe an address; resolve it by lookup or flag it"
  - "write a second job for the same caller on the same day"
  - "quote a price or a rate"
  - "wake the on-call for anything but a real emergency"
  - "stand up telephony, disclosure, recording or a register check of your own"
stays_with_person:
  - "the on-call judgement after an escalate"
  - "any price or licence claim"
  - "sending a quote"
---

# Booked After Hours Build Standard

**Spec:** AIP-BS-BOOKED-AFTER-HOURS · **Version:** 2026-09-18 · **Canonical:** https://aipathway.com.au/explore-ai/booked-after-hours-build-standard

The open build standard for answering a trade business phone out of hours. Disclosure and recording consent before the first question, a fixed emergency / routine / quote taxonomy, the address resolved by lookup rather than transcribed, one job written not two, typed escalation with the on-call rule, a stub to build against, and a pass test you can stage on your own phone in a minute.

## Read the standard first

The full specification is in `reference/booked-after-hours.md` in this skill. Read it
before writing code. It is about 3,000 words and it is the whole job: the
checks in order, the objects with their fields, what must never be automated,
and a pass test.

For the current version, fetch https://aipathway.com.au/explore-ai/booked-after-hours-build-standard.md. This copy is 2026-09-18.

The checks are also structured data, so you do not have to infer a test plan from
the prose: https://aipathway.com.au/explore-ai/booked-after-hours-build-standard/checks.json gives each check a stable id, the ports it
observes, what to inject and what to assert. `npx @aipathway/conformance show
booked-after-hours-build-standard` prints them and comes with a stub and a runner, so a build can be
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
- 3. The job taxonomy is fixed
- 4. The address is verified, never transcribed
- 5. The outcome object
- 6. Write-back, and writing once
- 7. Escalation and the on-call rule
- 8. Provider and hosting
- 9. Switching it on, if you decide to
- 10. The pass test
- 11. Conformance checklist

## Attribution

AIP-BS-BOOKED-AFTER-HOURS, 2026-09-18, AI Pathway, https://aipathway.com.au/explore-ai/booked-after-hours-build-standard

Licensed CC BY 4.0. Free to implement, including commercially. If you build to
this standard, cite the spec ID: a workflow built to a shared standard can be
audited and handed over, which is the whole reason it is published.
