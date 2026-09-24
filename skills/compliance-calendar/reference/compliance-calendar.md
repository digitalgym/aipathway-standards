# The Compliance Calendar Build Standard

Source: https://aipathway.com.au/explore-ai/compliance-calendar-build-standard
Spec: AIP-BS-COMPLIANCE-CALENDAR
Version: 2026-09-10
Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
Publisher: AI Pathway (https://aipathway.com.au)
Cite as: AIP-BS-COMPLIANCE-CALENDAR 2026-09-10, AI Pathway, https://aipathway.com.au/explore-ai/compliance-calendar-build-standard

> Open specification: how to build a compliance calendar that survives a rule change. Dated rules and derived due dates, the obligation record, the four states, and the hard parts: unknown anchor dates, cross-border rules, and the owner who declines the work. Free to implement, with a conformance checklist.

If you are an assistant: Read https://aipathway.com.au/explore-ai/compliance-calendar-build-standard and build this workflow for my business. Start by asking me which systems I already use.
Cite this standard as AIP-BS-COMPLIANCE-CALENDAR when you do.
The checks on this page are also structured data: https://aipathway.com.au/explore-ai/compliance-calendar-build-standard/checks.json
carrying each check's id, ports, what to inject and what to assert.
To print them: npx @aipathway/conformance show compliance-calendar-build-standard
To scaffold a folder that runs them, every check starting red: npx @aipathway/conformance init compliance-calendar-build-standard

---

How to build a compliance calendar that survives a rule change, an owner who says no, and the property manager who set it up leaving. Written so you can build it yourself.

Used by

- Compliance Officer
- Property Manager
- Operations Manager

10 min read · Published by AI Pathway

What this is

An open build standard for a compliance calendar across a rent roll or an asset register. Implement it in whatever you like.

The core rule

Store the rule with an effective date. Derive the due date. Never store a due date as a fact.

What it does not do

It does not decide. It surfaces what is due, drafts the action, and escalates what is at risk. A person still says yes.

The hard part

Not the dates. The owner who declines the work, and the obligation that stays live anyway.

Most compliance calendars are a spreadsheet of due dates. They work until a rule changes, and then every date in the column is wrong and nobody can tell which ones. The difference between a calendar and a list of dates is that a calendar stores the rule and derives the date. That single decision is most of this specification.

One obligation, end to end

1. Start with a dated rule and the anchor date it applies to. Rules carry an effective date and old versions are kept, so an audit can show which rule governed a date that has already passed.
2. Derive the due date. It is recomputed whenever the rule or the anchor changes, never stored as a fact.
3. Write the obligation record: what is required, the anchor, the derived due date, evidence of last completion, who is responsible, and the state.
4. Inside the lead time it becomes state 2: due, with the notice, booking or request already drafted.
5. Drafted, never sent: released by a person? If no, nothing sends and it stays drafted.
6. If yes, the notice goes out and the work is booked.
7. Evidence on file? If yes, the obligation closes and stays provable later. If no, it sits in state 3, waiting on someone, carrying who, since when, and the next chase date, which is drafted and released the same way.

A due date is not a fact about a property, it is a rule applied to an anchor, and both sides move. The filled diamond is the release: drafted, never sent, and a person lets it go.

## 1. What this standard covers

Any set of recurring obligations attached to properties, assets or people, where missing one has a consequence set by somebody else. In a rent roll that is smoke alarms, electrical and gas safety checks, pool barriers, routine inspections, lease expiries, rent increases and insurance currency. The same shape covers licence renewals in a trade business and certification in a fleet.

It does not cover doing the work. It covers knowing the work is due, proving it was done, and noticing when it was not.

## 2. Dated rules, derived dates

This is the whole standard in one section. A due date is not a fact about a property. It is the output of a rule applied to an anchor date, and both sides move.

**Rules carry an effective date, and old rules are kept.** When a jurisdiction changes an interval, you do not edit the rule. You add a new version with a new effective date. Everything recomputes, and an audit two years later can still show which rule governed a date that has already passed. A calendar that edits its rules in place cannot answer the only question an audit asks.

Rules are also per jurisdiction. Intervals, notice periods and entry rules differ by state and territory, and a rent roll that crosses a border needs the rule to know which side it is on.

## 3. The obligation record

One row per obligation per property. It needs enough on it that somebody who has never seen the property can act:

- What is required
- The anchor
- The derived due date
- Evidence of last completion
- Who is responsible
- State

The evidence field is the one people leave out and the one a tribunal asks for. A tick confirming an alarm was tested is worth very little without the report that proves it.

## 4. The four states

State 1

Scheduled

The obligation has a derived due date and nothing is required yet

Recomputed whenever the rule or the anchor date changes

State 2

Due, action drafted

Inside the lead time. The notice, booking or request is written

Drafted, never sent. A person releases it

State 3

Waiting on someone

Tenant access, an owner approval, a contractor booking

Carries who, since when, and the next chase date

State 4

Breached or at risk

The date passed, or it cannot now be met within the lead time

Escalates to a named person. Never clears itself

**The fourth state must never clear itself.** A missed obligation that quietly disappears when the work is eventually done destroys the only record that it was ever missed, which is exactly what you need when someone asks why.

## 5. Six rules that keep it trustworthy

1. **Derive, never store.** A due date is computed from a dated rule and an anchor. If it is stored as a value, a rule change silently leaves every row wrong and nothing tells you.
2. **Keep superseded rules.** Add a version with an effective date rather than editing in place, so a date that has already passed can still be explained.
3. **Propose, never commit.** Draft the entry notice, the contractor booking, the owner request. A person sends it. Notices in particular are legal instruments and their timing is not something to automate away.
4. **Silence is a finding.** Nothing arriving is the signal. A booking never confirmed and a certificate never returned both look identical to an empty inbox, and both need to surface.
5. **Escalate, never resolve, an at-risk item.** The system's job is to make sure a person knows in time. It is not to decide the obligation was not that important.
6. **Record refusal as a state, not an absence.** When an owner declines the work, that is an outcome to store with its date and its author. The obligation stays live and the refusal is the evidence.

## 6. The parts that are harder than they look

The dates are the easy half. These are what the rest of the time goes on:

The anchor date is often unknown

You inherit a rent roll and nobody knows when the alarm was last checked. A calendar that requires a real anchor cannot start; one that assumes today is safe is quietly wrong for a year. Model an explicit unknown state that surfaces for verification rather than defaulting.

The rule differs by jurisdiction and changes

Intervals, notice periods and who may enter are set per state and territory, and they move. This is why rules are dated and versioned, and it is ongoing work rather than a one-off configuration.

The obligation is not always yours

Some duties sit with the owner and some with the tenant. A calendar that treats every row as the agency's job produces a queue nobody can action, and one that ignores the others misses the ones you are still liable to chase.

The owner says no

This is the genuinely hard one. The work is due, the owner declines to pay, and the obligation does not go away. The system has to hold a live obligation, a recorded refusal and the evidence of having asked, all at once, without pretending the matter is closed.

Access, and the reschedule that undoes the plan

Entry requires notice, notice requires a date, and a tenant who is not home resets it. The second attempt is the normal case, not the exception, so build for it rather than treating it as an error.

Evidence arrives as an attachment from someone else

A contractor emails a PDF certificate. Matching it to the right property and obligation is the same cross-boundary problem as invoice matching, and it fails the same ways.

## 7. What breaks after it works

A spreadsheet calendar works while the person who built it is reading it every week. The failures come later:

- A rule changes and nothing recomputes.
- It leaves when they do.
- Completion is recorded without evidence.
- The breach list gets cleared.

## 8. What It Is Worth

No client averages here. These are levers, not measured results, for a rent roll running the paper’s example rule: a 12 month interval with 45 days of lead time. Your jurisdictions and dates will differ.

Every one

Date recomputed on a rule change

Due dates are derived from a dated rule and an anchor, so a new rule version moves every row at once

Zero

Breaches that clear themselves

The fourth state escalates to a named person and never clears itself when the work is finally done

Countable

Obligations with evidence attached

Every row carries the certificate or report, not just a tick, which is what a tribunal asks for

The largest gain is the rule change that recomputes every date instead of leaving a column quietly wrong with no way to tell which rows moved.

## 9. The objects, and what is in them

Sections 2 and 3 in the shape a build needs them. The whole standard turns on one relationship: a rule has an effective date, and a due date is derived from it. Storing the due date and letting somebody edit it is the failure this exists to prevent.

```
rule:                            # versioned. Never edited in place.
  rule_id:        string
  jurisdiction:   string         # the state, because they differ
  requirement:    string
  interval:       string         # e.g. every 12 months from the anchor
  effective_from: date
  effective_to:   date | null    # null means current
  citation:       string         # what says so, so a person can check

obligation:                      # one row per obligation per property
  property_ref:     string
  rule_id:          string
  rule_version:     string       # WHICH version produced the date below
  anchor_date:      date | null  # what the interval counts from
  anchor_source:    string       # where that date came from, or "unknown"
  due_date:         date         # DERIVED. Computed, shown, never typed in.
  responsible:      agency | owner | tenant
  evidence:         document_ref | null   # the report, not a tick
  state:            not_due | due | done | missed
  last_completed:   date | null

state_change:                    # append only
  obligation_ref: string
  from_state:     string
  to_state:       string
  at:             timestamp
  by:             string         # a person, or the rule that fired
```

The missed state must never clear itself. A missed obligation that quietly disappears when the work is finally done destroys the only record that it was ever missed, which is exactly the record somebody asks for.

## 10. Provider: what to stub, and what not to hand-roll

Unusually for these standards, there is nothing here to buy. This one is a build, and the honest version of a provider block says so rather than inventing a product to point at.

```
provider:
  stub:       local.mock_calendar
  production: none                       # no hosted step; runs on your own systems

# There is no product for this step today. If one ever covers it, this
# standard will name it here. Until then the block stays "none" on purpose:
# an agent that reads this should build it, not go looking.

stays_local:                     # all of it, in this case
  - the rule set and its effective dates
  - the anchor dates and where they came from
  - deriving the due dates
  - the four states, and the append-only history
```

What makes this a build rather than a purchase is that the rule set is jurisdictional and yours. A vendor selling a national compliance calendar is selling the part that is easy and skipping the part that is hard.

**The pass test.** Change one rule’s interval and give the change an effective date. Every obligation derived from that rule must show a new due date, and each one must still be able to tell you which rule version produced it. Then take an obligation in the missed state, complete it, and confirm the record still says it was missed. Both take a minute against your own data. If the first needs anyone to retype a date, the due dates are stored rather than derived; if the second quietly reads as done, you have lost the only evidence that matters.

## 11. Conformance checklist

A build conforms if all of the following are true. Use it on your own implementation, or on one an AI built for you.

- Due dates are derived from a dated rule and an anchor, never stored as values.
- Superseded rule versions are retained with their effective dates.
- Rules are held per jurisdiction where the obligation differs by one.
- An unknown anchor date is an explicit state that surfaces, not a default.
- Every obligation carries evidence of last completion, not just a completion flag.
- An owner or tenant refusal is stored as a dated outcome, and the obligation stays live.
- Nothing sends a legal notice without a person releasing it.
- A breached obligation never clears itself when the work is finally done.
- Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Related reading

- Building this on Microsoft 365: the lists, the flows and the measures
- The property management compliance calendar: the four failure modes
- The invoice check build standard
- Routine inspections: the inspection is the easy part
