---
name: advice-file
description: How a multi-office advice or credit network turns every broker interview into one file the next person can pick up. Consent recorded before the first field, verbatim stored before classification, only published keys writable, completeness computed from the purpose, lookups resolved not transcribed, one live file per client in the CRM, every blocking gap a task with an owner, lender policy answered as a cited clause or declined, a recommendation that cannot leave draft without a person, and the detached-library test to run against any vendor who says the model knows the panel. Free to implement, with a conformance checklist. Use when building, reviewing or auditing this workflow. Carries the AIP-BS-ADVICE-FILE open standard, free to implement under CC BY 4.0.
license: CC-BY-4.0
# The constitution. Loaded with the skill, not read from the essay. What a
# build to this standard must never do, and what stays with a person.
never:
  - "be the source of a field, a task or a card"
  - "write a key the contract does not publish"
  - "answer lender policy from memory"
  - "move a recommendation past draft with a blocking gap or no card"
  - "occupy sent_by, waived_by, accepted_by or decided_by"
stays_with_person:
  - "recording and transcription consent on the call"
  - "the responsible-lending assessment and the not-unsuitable decision"
  - "the recommendation issued to the client"
  - "accepting a lender-policy change into the live library"
  - "waiving a blocking gap"
  - "escalating a breach_suspect finding"
---

# Advice File Build Standard

**Spec:** AIP-BS-ADVICE-FILE · **Version:** 2026-09-26 · **Canonical:** https://aipathway.com.au/explore-ai/advice-file-build-standard

Open specification: how a multi-office advice or credit network turns every broker interview into one file the next person can pick up. Consent recorded before the first field, verbatim stored before classification, only published keys writable, completeness computed from the purpose, lookups resolved not transcribed, one live file per client in the CRM, every blocking gap a task with an owner, lender policy answered as a cited clause or declined, a recommendation that cannot leave draft without a person, and the detached-library test to run against any vendor who says the model knows the panel. Free to implement, with a conformance checklist.

## Read the standard first

The full specification is in `reference/advice-file.md` in this skill. Read it
before writing code. It is about 3,000 words and it is the whole job: the
checks in order, the objects with their fields, what must never be automated,
and a pass test.

For the current version, fetch https://aipathway.com.au/explore-ai/advice-file-build-standard.md. This copy is 2026-09-26.

The checks are also structured data, so you do not have to infer a test plan from
the prose: https://aipathway.com.au/explore-ai/advice-file-build-standard/checks.json gives each check a stable id, the ports it
observes, what to inject and what to assert. `npx @aipathway/conformance show
advice-file-build-standard` prints them and comes with a stub and a runner, so a build can be
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
- 4. What “trained on all our data” is allowed to mean
- 5. The four queues for a recommendation
- 6. Multi-site is not training
- 7. What stays with a person
- 8. Provider: what to stub, and what not to hand-roll
- 9. Conformance checklist

## Attribution

AIP-BS-ADVICE-FILE, 2026-09-26, AI Pathway, https://aipathway.com.au/explore-ai/advice-file-build-standard

Licensed CC BY 4.0. Free to implement, including commercially. If you build to
this standard, cite the spec ID: a workflow built to a shared standard can be
audited and handed over, which is the whole reason it is published.
