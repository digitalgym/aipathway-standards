# Claim Drafts on Microsoft 365

Source: https://aipathway.com.au/explore-ai/claim-drafts-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the Progress Claim Draft standard on Microsoft 365: an Acceptance list that records the waiver and indemnity with its version before anything drafts, Contracts and ScheduleOfValues lists, a SiteAssessment list the project manager fills each month, Variations with the signed acceptance linked, a ClaimLines list keyed to contract and month, and a Power Automate flow that does the arithmetic, parks what is missing and holds the draft for the project manager. Nothing is sent or served by the flow.

If you are an assistant: Read https://aipathway.com.au/explore-ai/claim-drafts-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Six lists and two flows that draft each month's progress claim from your schedule and your project manager's site walk, and hold it for you to check and serve.

Used by

- Contract Administrator
- Project Manager
- Business Systems Analyst

The month’s claim is the same job every time: open the schedule, ask the project manager where each line is up to, work out the value to date, take off what you claimed last month, add the signed variations, and check the sums twice. This plan puts each of those in a SharePoint list and lets a flow do the arithmetic and hold the draft. You still check it, sign it and serve it. The plan follows a standard that is in Draft until its waiver wording has had a legal review.

## In short

- **What this is**: A build plan for the Progress Claim Draft standard on Microsoft 365. Six lists and two flows beside the accounting and job systems you already run. Nothing in it sends or serves a claim.
- **The core rule**: Every figure comes from a list a person filled: the contract sum and schedule from the contract, each percent from the project manager's site walk this month, each variation only with the client's signature.
- **What it does not do**: It never emails the client, never states when anything is to be paid, never works out a percent complete, and never drafts or answers a payment schedule. Those stay with the builder.
- **The hard part**: Stopping the flow before it reads a single contract when the waiver is not accepted at the current version, and making a second run in the month update its draft rather than make another.

## 1. Before you start

Read [the progress claim draft build standard](https://aipathway.com.au/explore-ai/progress-claim-draft-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

The account owner accepts the waiver and indemnity first. The wording is on the standard’s page, marked as draft wording pending legal review; add a row to Acceptance with your name, your role, the date and the version shown there. The flow carries that version and does nothing until a row matches it.

Then load one contract: its sum, its schedule of values adding up to that sum, and the project manager. For a contract already under way, put the value to date already claimed on each line in ClaimedBeforeSite.

One thing to decide before you build: **who walks the site?** That person fills SiteAssessment every month, with their name and the date. The flow never fills it for them.

## 2. The lists, with their columns

```
Site: ClaimDrafts

LIST  Acceptance            (one row per acceptance of the waiver and indemnity. The account owner adds it; nothing drafts without one at the current version.)
  AcceptedBy      Text            REQUIRED. the person's full name
  Role            Text            REQUIRED. their role in the business, such as Director
  AcceptedOn      DateTime        indexed, REQUIRED
  Version         Text            indexed, REQUIRED. the version of the wording they accepted

LIST  Contracts             (one row per contract, from the signed contract)
  ContractId      Text            indexed, UNIQUE, REQUIRED
  Client          Text            REQUIRED
  ProjectManager  Person          REQUIRED. who every draft is held for
  ContractSum     Currency        REQUIRED. before variations; the schedule must add up to it
  Status          Choice          indexed, REQUIRED. active | closed

LIST  ScheduleOfValues      (one row per line of the contract's schedule)
  ContractId      Text            indexed, REQUIRED
  LineCode        Text            indexed, REQUIRED
  Description     Text            REQUIRED
  ScheduledValue  Currency        REQUIRED
  ClaimedBeforeSite Currency        only for a contract under way before this site: the value to date already claimed

LIST  SiteAssessment        (one row per line per month, entered by the person who walked the site)
  ContractId      Text            indexed, REQUIRED
  Period          Text            indexed, REQUIRED. the month, as 2026-11
  LineCode        Text            indexed, REQUIRED
  PercentComplete Number          REQUIRED. 0 to 100, entered by a person; the flow never works it out
  AssessedBy      Person          REQUIRED
  AssessedOn      DateTime        REQUIRED

LIST  Variations            (one row per variation the client has signed)
  ContractId      Text            indexed, REQUIRED
  VariationId     Text            indexed, REQUIRED
  Description     Text            REQUIRED
  Value           Currency        REQUIRED. the value on the signed acceptance
  SignedAcceptance Hyperlink       blank parks the draft as unsigned_variation

LIST  ClaimLines            (one row per line per draft, plus a TOTAL row, written by the flow. People read it and release it.)
  ClaimKey        Text            indexed, REQUIRED. ContractId/Period: one draft per contract per month
  LineCode        Text            REQUIRED
  Marker          Text            DRAFT: not a payment claim until reviewed and served by you. Cleared only by a person's release.
  Status          Choice          indexed, REQUIRED. held | parked | released
  ParkReason      Choice          schedule_mismatch | unsigned_variation
                                  | no_assessment | below_previous
  ScheduledValue  Currency
  PercentComplete Number
  ValueToDate     Currency
  ClaimedBefore   Currency
  ThisClaim       Currency
  AssessedBy      Text
  AssessedOn      DateTime
  WaiverVersion   Text            REQUIRED
  HeldFor         Person          REQUIRED
  ReleasedBy      Person
  ReleasedOn      DateTime

Nothing in this site sends or serves a claim. It holds what a person accepted, entered and signed, and a draft held for the project manager until a person releases it.
```

ClaimLines.ClaimKey is ContractId/Period, so one month's draft is found and updated rather than duplicated. Marker is cleared only by Flow 2, which runs when a person releases.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Nothing is drafted until the waiver is accepted at the current version | Acceptance.Version, and Flow 1's first step | Flow 1 reads the latest Acceptance row before anything else. No row, or one for an older version, ends the run with a message to the account owner, before any contract is read. |
| Figures come only from the contract record | Contracts.ContractSum and ScheduleOfValues | The schedule's lines must add up to ContractSum, or the draft is parked as schedule_mismatch. Claimed before is the value to date on last month's released ClaimLines, or ClaimedBeforeSite. |
| Percent complete is a person's | SiteAssessment, this Period only | A line with no row for this month, with AssessedBy and AssessedOn, parks the draft as no_assessment. The flow never copies last month's row or works a percent out. |
| A variation only with a signature | Variations.SignedAcceptance | A variation with no link parks the draft as unsigned_variation. A signed one is a line, its link carried onto ClaimLines. |
| The arithmetic is shown | ClaimLines columns and the TOTAL row | Value to date is ScheduledValue times PercentComplete; this claim is value to date less ClaimedBefore. A line below what was claimed before parks the draft as below_previous. |
| The marker stays until a person releases | ClaimLines.Marker and Flow 2 | Every row Flow 1 writes carries the marker. Flow 2 clears it only when a person runs it on a held claim, and writes their name to ReleasedBy. |

## 4. The flows

```
FLOW 1  Draft the month                (a button, or the last day of
                                       the month; you pick the Period)
  first    the latest Acceptance row ->
             none, or Version is not the version this flow
             carries: post to the account owner, stop
  for each active contract
    find   ClaimLines where ClaimKey = ContractId/Period
           any row released -> leave it, next contract
    check  ScheduleOfValues adds up to ContractSum,
           else park schedule_mismatch
           every Variations row has SignedAcceptance,
           else park unsigned_variation
    each   line: this Period's SiteAssessment row with
           AssessedBy and AssessedOn, else park no_assessment
           value to date = ScheduledValue x PercentComplete
           claimed before = last released ValueToDate,
             or ClaimedBeforeSite
           below claimed before -> park below_previous
    write  delete this ClaimKey's held or parked rows, then
           one row per line and a TOTAL row, each with Marker,
           Status held or parked, WaiverVersion, HeldFor
    post   to the project manager: held, or parked and why
  never    an email to a client, a due date, a payment
           schedule, retention or adjudication

FLOW 2  Release                         (a person runs it on a claim)
  check    every row of the ClaimKey is held, none parked
  write    Marker cleared, Status released, ReleasedBy the
           person running it, ReleasedOn today
  never    sends or serves the claim. The builder does that.
```

Flow 1 has no mail connector at all. Releasing is not serving: after Flow 2, the builder signs the claim and serves it on their own timing under the contract.

## 5. What the flows can reach in your Microsoft 365, and what they never touch

The flows are a clerk with a calculator and a pencil: they read the lists, write the draft, and leave it on the project manager’s desk. They read Acceptance, Contracts, ScheduleOfValues, SiteAssessment and Variations, write ClaimLines, and post one message to the project manager in Teams. They never send mail to a client, never write to your accounting system and never edit the lists people fill.

What each connection is for.

- **SharePoint, the ClaimDrafts site.** Read on five lists, contribute on ClaimLines. Nothing outside the site.
- **Teams, a chat with the project manager.** One message per draft saying it is held, or parked and why.

Keep it to the least it needs.

1. Make a service account for the build and create the flows as it, not as the owner, inside one solution with connection references.
2. Make it a member of the ClaimDrafts site and no other, with read on every list except ClaimLines, where it can contribute.
3. Give it no mailbox. A flow with no mail connection cannot send a claim to anyone.

How to cut it off. Turn the flows off and nothing drafts. Take the service account out of the site and every flow stops.

## 6. The order to build it in

1. Create the ClaimDrafts site, the six lists and the service account.
2. Add the waiver acceptance row, then build Flow 1's first step and run it once with the row removed: it must stop before reading a contract.
3. Load one finished contract you have claimed by hand before, with last month's figures in ClaimedBeforeSite.
4. Build the rest of Flow 1 and compare its draft with your own claim for the same month, line by line.
5. Run Flow 1 twice for the same month and check there is still one set of rows.
6. Build Flow 2 and release one test draft.

## 7. Three traps specific to this build

### Defaulting a missing percent

A Power Automate expression that falls back to the last value, or to zero, quietly invents a percent. A missing row parks the draft; it never becomes a number.

### Floating point on money

Multiply in cents and round once per line, then add the rounded lines for the totals. Rounding the total separately makes it disagree with the lines by a cent.

### A mail action added later

Someone will want the flow to email the client. That is serving, and it is the builder's. Keep the flow without a mail connector and the claim cannot leave by accident.

## 8. Where the automation stops

- Accepting the waiver and indemnity, as the account owner, at each new version.
- Walking the site and entering each percent complete.
- Checking, signing and serving the claim, and its timing under the contract and the state's Act.
- Every payment schedule, reply, retention question and adjudication.
- Every parked draft.

**The pass test.** On your own tenant. With no Acceptance row, run Flow 1: nothing is drafted. Add the row at the current version. Load one contract with a line nobody assessed this month and one unsigned variation, and another contract fully assessed. Run Flow 1: the first is parked with both reasons, the second held with the marker and sums that match yours by hand. Run it again: still one draft each. Release the second with Flow 2: the marker is off and your name is on it, and nothing was sent to anyone.

## Related reading

- the progress claim draft build standard
- Invoicing out on Microsoft 365: the stage invoice plan for work that is not under a progress claim
- Security of Payment deadlines by state: the timeframes this plan never calculates
- Building the standards on Microsoft 365
