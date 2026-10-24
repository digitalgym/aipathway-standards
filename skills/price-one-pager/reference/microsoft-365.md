# Comparable Sales on Microsoft 365

Source: https://aipathway.com.au/explore-ai/comparable-sales-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the price one-pager: the selection rules and sales as lists, the range worked out by a flow from verified sales only, an approval before the vendor sees it, and a record library nobody can edit.

If you are an assistant: Read https://aipathway.com.au/explore-ai/comparable-sales-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

The price one-pager on licences you already hold: rules read first, a range from verified sales only, an approval per version, and a record of what the vendor saw.

Used by

- AI Officer
- Business Systems Analyst
- Operations Manager

Most offices already keep comparable sales somewhere in Microsoft 365: a spreadsheet on a shared drive, a folder of appraisal PDFs. What they do not keep is which rules chose the sales, or a copy of the page the vendor actually saw. This plan puts both in the tenant.

## In short

- **What this is**: A build plan for the Price One-Pager standard on Microsoft 365. Four lists and a library, two flows and an approval.
- **The core rule**: The range is worked out by a flow from verified sales only. The agent's estimate lives in its own columns and no formula combines the two.
- **What it does not do**: It never sets the price and never sends anything to the vendor. The agent approves each version and gives it to the vendor themselves.
- **The hard part**: The sales are only as good as where they came from, and a library a site owner can edit is not yet a record that survives a dispute.

## 1. Before you start

Read [the Price One-Pager build standard](https://aipathway.com.au/explore-ai/price-one-pager-build-standard) first. It owns the rules, the range, the flags and the pass test. Where it and this page disagree, it wins. The shared conventions for this stack are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

## 2. The lists, with their columns

Four lists and one library. Versions is one row per build and Shown is append only, which is the whole difference between a page and a record.

```
Site: PriceEvidence

LIST  Rules                 (read before any sale is chosen)
  Setting         Text            indexed, UNIQUE, REQUIRED
  Value           Text            REQUIRED
  Meaning         Note

LIST  Sales
  SaleRef         Text            indexed, UNIQUE, REQUIRED. the source's own id for the sale
  Address         Text
  PropertyType    Choice          house | unit | townhouse | land
  Beds            Number
  LandSqm         Number
  DistanceKm      Number          from the subject, as the source reports it
  SoldOn          DateTime
  Price           Currency
  PriceStatus     Choice          REQUIRED. verified | unverified | withheld
                                  only verified enters the range
  Source          Text            blank means it never reaches the page
  ReadOn          DateTime        when the sale was read

LIST  Versions              (one row per build. Never edited once approved.)
  Property        Text            indexed, REQUIRED
  Version         Number          REQUIRED
  DraftJson       Note            the comparables, range, estimate and flags as built
  RangeLow        Currency
  RangeMedian     Currency
  RangeHigh       Currency
  AgentEstimateLow Currency        the agent's own view, never in the range
  AgentEstimateHigh Currency
  QuotedFrom      Currency
  Flags           Choice          too_few | underquote | stale
  ApprovedBy      Person
  ApprovedOn      DateTime
  ApprovalReason  Note            required when Flags holds underquote

LIBRARY  Shown              (append only: what the vendor was given, and when)
  Property        Text            indexed, REQUIRED
  Version         Number          REQUIRED
  GivenTo         Text
  GivenOn         DateTime        REQUIRED
  ApprovedBy      Person

No column on Sales is filled by a person guessing: a sale with no Source is left off the page.

Shown is append only. A correction is a new Version and a new file, never an edit to the old one.
```

Sales.Source is the provenance, all of it. A sale typed in with a source a person can name meets the standard's checks; live sales with a source you can follow are the step not to hand-roll.

## 3. Every check, and what enforces it

| The check | Enforced by | How |
| --- | --- | --- |
| Rules are read before any sale is chosen | Build flow | The first action reads Rules; every filter after it uses those values. The rules are written onto the version. |
| Every comparable meets every rule | Build flow | One filter per rule over Sales, each exclusion written with the rule it broke. |
| Source and date on each | Build flow | Rows with a blank Source or SoldOn never reach the comparables array. |
| Withheld or unverified never in the range | Build flow | Only PriceStatus = verified feeds the min, median and max. |
| Too few means no range | Build flow | Below MinCount the range columns stay blank and Flags gets too_few. |
| Underquote and stale are flagged | Build flow | QuotedFrom below RangeLow adds underquote; a ReadOn older than the window adds stale. Both hold the version. |
| Approval names the version | Approval | Start and wait for an approval on this Versions row. An edit creates a new row and a new approval. |
| What was shown is kept | Give flow | Writes the approved version as a file into Shown. Nothing in any flow updates or deletes a Shown file. |

## 4. The two flows and the approval

```
FLOW 1  Build a version
  trigger  manual, from the property row
  logic    read Rules (every value, before anything else)
           read Sales near the property
           exclude by each rule, recording the rule broken
           exclude a blank Source or SoldOn
           list unverified and withheld, outside the arithmetic
           comparables = the rest
           if count < MinCount: no range, flag too_few
           else RangeLow = min, RangeHigh = max, RangeMedian = median
           if QuotedFrom < RangeLow: flag underquote (holds)
           if oldest ReadOn older than FreshnessDays: flag stale (holds)
           create a NEW Versions row; never update an old one
  then     start an approval for that row, naming the version

FLOW 2  Give to the vendor
  trigger  manual, from an approved Versions row
  guard 1  the approval names THIS version
  guard 2  no stale flag; an underquote needs ApprovalReason
  logic    render the page, write it into Shown with
           Property, Version, GivenTo, GivenOn, ApprovedBy
  never    update or delete a file in Shown
```

Flow 1 never edits a Versions row it did not just create. An edit is a rebuild, and a rebuild is a new version that needs its own approval.

## 5. The order to build it in

1. Create Rules and fill it before anything else.
2. Create Sales, with PriceStatus as a closed choice and Source required in practice.
3. Create Versions and the Shown library. Put a retention label on Shown.
4. Build Flow 1 and run it on a property with a known answer before anything else.
5. Build the approval, then Flow 2 with both guards.
6. Run the pass test below.

## 6. Four traps specific to this build

### Filtering Sales in a view and calling it the rules

A view is a filter somebody can change while the page is open. The rules are a list the flow reads, and the values it read are copied onto the version, so the page and the record say the same thing.

### Letting the agent's estimate into a calculated column

A calculated column over the range and the estimate is the merge the standard forbids. Keep the estimate in its own columns, and never in a formula that touches the range.

### Editing a version after approval

SharePoint will let you. Turn off editing on approved rows with a flow that copies to a new version instead, or the approval no longer describes what was given.

### Assuming the library is the record

A site owner can delete a file. A retention label helps, and it is a setting someone can change. A record that has to survive a dispute is the step the standard says not to hand-roll.

## 7. Where the automation stops

- The agent's estimate and the price they quote.
- Approving each version, and the reason when the quote sits below the evidence.
- Writing the rules, before looking at the prices.
- Giving the page to the vendor.

**The pass test.** Two staged checks, no real vendor involved. First, add a sale that breaks the distance rule at a price you would like to see, and set QuotedFrom below the lowest comparable: the build must leave the far sale out with its rule named, flag underquote, and refuse Flow 2 until the approval carries a reason. Second, give version 1, then change one sale and rebuild: version 2 must need its own approval, and the Shown file for version 1 must be unchanged. The standard’s own pass test, on live sales with a record that survives, is the part this tenant cannot prove on its own.

## Related reading

- The Price One-Pager build standard
- Database reactivation on Microsoft 365
- Building the standards on Microsoft 365
