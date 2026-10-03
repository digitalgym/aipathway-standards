# Quotes Out on Microsoft 365

Source: https://aipathway.com.au/explore-ai/quotes-out-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan: the job as the only trigger, a price list read at draft time rather than copied into a list, the whole quote parked when one line cannot be priced, and no send step anywhere in it.

If you are an assistant: Read https://aipathway.com.au/explore-ai/quotes-out-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

The quote is created in the job system, not here. That one sentence decides every list on this page, and it is the reason this plan is shaped differently from the others.

Used by

- AI Officer
- Business Systems Analyst
- Estimator
- Office Administrator

Every other plan in this set makes a SharePoint list the book. This one does not. The standard says the quote is drafted into ServiceM8, Simpro or Xero against the price list already in there, because a document we generated and held would make us a second place the office has to look. So what Microsoft 365 holds is the queue, the park and the log, and the one step it does not hold is the authenticated write into somebody else’s ledger.

## In short

- **What this is**: A build plan for the quote out standard on Microsoft 365. Five lists, four flows, seven measures, and deliberately no quote document anywhere in the tenant.
- **The core rule**: The quote is created in the job system against the price list already in it. These lists hold the queue and the log, never the copy that counts.
- **What it does not do**: There is no send step, because the standard has no send port. A person releases the draft in the system they already open every morning.
- **The hard part**: The read at draft time. A catalogue synced into a list is fast, tidy, and silently wrong the week after the office puts an increase through.

## 1. Before you start

Read [the quote out build standard](https://aipathway.com.au/explore-ai/quote-out-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Decide which system of record the quote is created in, before you create a single list. The standard names three that expose a write for a quote record: ServiceM8, Simpro and Xero. It also says plainly that Tradify cannot meet this standard, because it has no public API and therefore no sanctioned route that creates a quote in it. If your answer is Tradify, nothing on this page changes that, and a SharePoint list that holds a quote you cannot write anywhere is the second system of record the standard exists to prevent.

Then accept the thing that makes this plan odd. Microsoft 365 is not the source of truth here and must not become it. There is no quote document library below, no generated PDF and no approval on one. The lists carry the work queue, the parked lines, and the log that answers where a number came from six months later.

## 2. The lists, with their columns

```
Site: QuotesOut

LIST  Jobs                  (a key and a clock, not the job)
  JobRef          Text            indexed. The job system's own id.
  JobSystem       Choice          servicem8 | simpro | xero
  SourceDoor      Choice          call | email | form
  CustomerRef     Text
  ReceivedAt      DateTime        the clock the whole build is about
  QuoteId         Text            blank means nothing has been drafted yet

LIST  Quotes                (one per job. Never two.)
  QuoteId         Text            indexed. Ours, stable across retries.
  JobRef          Text            indexed, REQUIRED. No job, no quote.
  ExternalId      Text            theirs. Blank means the write failed.
  State           Choice          draft | parked
                                  there is no sent value, on purpose
  TotalExGst      Currency        blank whenever an Unmatched row exists
  DuplicateOf     Text            set on every pass after the first
  DraftedAt       DateTime        stamped only when ExternalId arrives
  LastAttemptAt   DateTime

LIST  QuoteLines            (every priced line, and its provenance)
  QuoteId         Text            indexed
  CatalogueId     Text            REQUIRED. Their id, not a description.
  Description     Text
  Quantity        Number
  UnitRate        Currency        read at draft time, never remembered
  PricebookReadAt DateTime        REQUIRED. Older than the draft is a bug.

LIST  Unmatched             (the park queue. No rate column, ever.)
  QuoteId         Text            indexed
  Description     Text            the work the book does not cover
  ParkReason      Choice          not_in_pricebook
                                  | variation_to_accepted_quote | discount_requested | pricebook_unreadable
  OpenedAt        DateTime
  Owner           Person
  ResolvedAt      DateTime        blank means the quote is still parked

LIST  RunLog                (so one QuoteId answers everything)
  QuoteId         Text            indexed
  Sequence        Number
  Step            Choice          read_job | read_pricebook | draft_quote
                                  | escalate | notify
  CalledAt        DateTime
  Result          Text

Nothing here renders a quote. There is no document library on this site.
```

Unmatched has no rate column and that absence is the enforcement, exactly as the standard enforces sending by having no send port. A person who wants to price a parked line has to do it in the job system against the book, which is where it belongs and where the next person will find it.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| A job is the only trigger | List design | JobRef is required on Quotes and the drafting flow triggers on a Jobs row. An email arriving with no job behind it creates nothing, because creating the job is the other standard. |
| Every priced line traces to a line in the customer's own price list | Required column | CatalogueId is required on QuoteLines, so a row carrying a rate and no id cannot be saved. A rate inferred, averaged or recalled has nowhere to live. |
| Rates are read from the live price list at draft time | Price flow | The read runs inside the drafting flow and stamps PricebookReadAt on each line. A stale read is a measure on the front page, not something you find out about from a customer. |
| Work with no matching price-list line parks the quote | Price flow | One Unmatched row sets State to parked and leaves TotalExGst blank for the whole quote. The other three lines stay attached, ready for a person to finish. |
| Variations and discounts stay with a person | Choice column | variation and discount_requested are two of the four park reasons, so they reach the same queue as an uncovered line rather than a branch that tries to price them. |
| A job already carrying a quote keeps that quote, not a duplicate | Intake flow | The flow reads Quotes by JobRef before it creates anything, and a match writes DuplicateOf. The overnight form and the morning call are the same job, so they are the same QuoteId. |
| A draft counts as drafted only once the system of record returns an id | List design | DraftedAt is written in the same step as ExternalId and never before it. Blank ExternalId is the only definition of not drafted that survives contact with a vendor API. |
| The quote is left in a state a person releases | Absence of a field | State has no sent value and no flow here has a send action. A build cannot accidentally do what it has no capability to do, which is stronger than a rule somebody has to remember. |

## 4. The four flows

```
FLOW 1  Job in, once
  trigger  a scheduled read of the job system, or a Jobs item created
           by whatever already syncs it
  logic    upsert Jobs by JobRef and stamp ReceivedAt from the job,
             not from now
           read Quotes for a row on this JobRef
             one exists -> mark it for a re-run, write DuplicateOf,
                           and do NOT create a second row
             none       -> create the Quotes row, State and
                           ExternalId both blank
  never    trigger on an arriving email or a call record. A door with
           no job behind it is the after-hours standard's problem.

FLOW 2  Price it, or park it
  trigger  a Quotes item is created or marked for a re-run
  logic    read the price list from the job system NOW, for this draft
           for each piece of work:
             a catalogue line matches  -> QuoteLines row carrying
                                          CatalogueId and PricebookReadAt
             nothing matches           -> Unmatched row with a reason
                                          from the four
           any Unmatched row at all:
             State = parked, TotalExGst stays blank, stop here
           otherwise:
             State = draft, TotalExGst = sum of the lines
  never    read a price list that has been copied into SharePoint, and
           never write a UnitRate onto a line with no CatalogueId.

FLOW 3  Write it into their system, and verify
  trigger  a Quotes item where State = draft and ExternalId is blank
  logic    the write out to the job system that holds the job
           an id comes back -> ExternalId and DraftedAt, together
           nothing comes back -> ExternalId stays blank, post to the
                                 channel, and the quote is counted
                                 nowhere as drafted
  never    treat a successful action as a drafted quote. Power Automate
           marks the step green and carries on; the id is the evidence.

FLOW 4  The park queue
  trigger  an Unmatched item is created
  logic    assign Owner, post the quote and its priced lines to the
           channel with the parked line named
           when Owner writes ResolvedAt, mark the Quotes row for a
           re-run so FLOW 2 prices it from the book
  never    let anybody finish the quote in SharePoint. The line is
           priced in the job system, against the price list, or the
           whole point of section 3 is gone.
```

Flow 2 stops rather than drafting around the parked line, which is the standard's own sentence: sending three quarters of a quote is how a business ends up doing the fourth quarter for free. In Power Automate that means a terminate inside the loop, not a filter that quietly drops the unmatched item and carries on with a total.

## 5. The Power BI model and its measures

```
Hours To Draft =                      -- the number this standard is about
AVERAGEX (
    FILTER ( Quotes, NOT ISBLANK ( Quotes[DraftedAt] ) ),
    DATEDIFF (
        RELATED ( Jobs[ReceivedAt] ),
        Quotes[DraftedAt],
        HOUR
    )
)

Jobs Without A Quote =
CALCULATE ( COUNTROWS ( Jobs ), ISBLANK ( Jobs[QuoteId] ) )

Write Failures =                      -- must be near zero, and alert on it
CALCULATE (
    COUNTROWS ( Quotes ),
    Quotes[State] = "draft",
    ISBLANK ( Quotes[ExternalId] )
)

Parked Open =
CALCULATE ( COUNTROWS ( Unmatched ), ISBLANK ( Unmatched[ResolvedAt] ) )

Park Reason Mix =
CALCULATE (
    COUNTROWS ( Unmatched ),
    ALLEXCEPT ( Unmatched, Unmatched[ParkReason] )
)

Parked With A Total =                 -- must be zero
CALCULATE (
    COUNTROWS ( Quotes ),
    Quotes[State] = "parked",
    NOT ISBLANK ( Quotes[TotalExGst] )
)

Stale Rates =                         -- must be zero
CALCULATE (
    COUNTROWS ( QuoteLines ),
    FILTER (
        QuoteLines,
        QuoteLines[PricebookReadAt] < RELATED ( Quotes[LastAttemptAt] )
    )
)
```

Hours To Draft belongs on the front page and nothing else on this list competes with it. The standard is explicit that the expensive part of a late quote is the hours between the job existing and somebody starting the draft, so that gap is the claim the build is making and this is where it is true or visibly not.

## 6. The order to build it in

1. Create the five lists. Index JobRef and QuoteId on every one of them.
2. Build Flow 1 and let it run for a week doing nothing else. What you get on day one is a countable list of jobs with no quote against them and how long they have been that way, which is the argument the rest of the build is worth making.
3. Build Flow 2 with only the parking half. Every job parks with not_in_pricebook. It is useless as a quoting engine and immediately useful as a work queue, and it cannot invent a rate because it cannot price at all.
4. Build Flow 4 so the park queue has a named owner before anything can reach it. A queue nobody owns produces the same outcome as no queue.
5. Add catalogue matching to Flow 2. Watch CatalogueId and PricebookReadAt fill in, and check the stamps against the draft times before you trust a single rate.
6. Build Flow 3 against a test tenant. This is the step the standard says not to hand-roll, and it is the first thing here that needs anything from anybody else.
7. Connect Power BI. Hours To Draft on the front page, Write Failures and Parked With A Total alerted.
8. Run the pass test on a real job in a real tenant.

## 7. Four traps specific to this build

### Syncing the price list into a SharePoint list

This is the obvious move on this stack and it is the one the standard bans. A nightly flow that copies the catalogue into a list makes matching fast, cheap and local, and it also means the build quotes last quarter's rates the week after the office puts an increase through. The failure is silent: the quote is well formed, the catalogue ids are real, and the money is wrong. The read belongs inside Flow 2, at draft time, and if you must hold anything at all it carries a stamp and parks the quote once it is older than the window you agreed.

### Adding a quote document library

Somebody will suggest generating a PDF and storing it, because that is what SharePoint is good at, and the moment it exists the office has two places to look and yours is the one that goes stale. There is no document library on this site. If you find yourself building an approval on a generated quote, you have built the second system of record the standard's first rule exists to prevent.

### A sent value on State

The list looks unfinished without it and it will be added within a month, probably by someone tidying the Choice column. The absence of the value is the enforcement. The day it exists, a flow will be written that sets it, and the day after that something will be sending.

### Treating a successful action as a drafted quote

Power Automate marks the write step green and moves to the next one, so the obvious build stamps DraftedAt there. Then the dashboard says eleven quotes went out last night and four of them exist nowhere. Write ExternalId and DraftedAt in the same step, from the id the vendor returned, and let the blank be loud.

## 8. Where the automation stops

- Sending. The standard has no send port and these flows have no send action, so the last thirty seconds stay with a person who reads the draft in the job system and releases it.
- Pricing a variation to a quote that has already been accepted. It parks as variation and a person prices it, because it changes something already agreed.
- Any discount. The customer asking for a number off the book is a negotiation, and the standard prices the catalogue rather than the negotiation.
- Any line the price list does not cover. The whole quote parks with the priced lines attached. A build that estimates its way around a missing catalogue line is not a conforming build, it is a liability with a total on it.
- The authenticated write into ServiceM8, Simpro or Xero. That call leaves Microsoft 365 entirely, and holding the credential relationship with a vendor tenant is the step the standard tells you not to hand-roll.

**The pass test.** Stage one job in a test tenant where the work needs three things on your price list and one thing that is not on it. Run Flow 1 through Flow 3. You must get exactly one Quotes row at State parked, with TotalExGst blank, three QuoteLines each carrying a real CatalogueId and a PricebookReadAt stamped after the job arrived, and one Unmatched row reading not_in_pricebook. Nothing may exist in the tenant yet, because a parked quote is not a drafted one. Now add the missing item to the price list, resolve the Unmatched row, and let it run again: one draft in the tenant, one ExternalId, DuplicateOf pointing at the first pass, and still exactly one Quotes row. Twenty minutes on a test tenant. If the second pass created a second row, Flow 1 is writing before it reads. If the first pass produced a total, Flow 2 drafted around the parked line, and that is the one failure on this page that costs real money. If any line carries a UnitRate and no CatalogueId, you cannot tell anybody where that number came from, which was the whole reason for the column.

## Related reading

- the quote out build standard
- After hours on Microsoft 365, which creates the job this consumes
- Debtor chasing on Microsoft 365, which picks it up once a person has sent it
- Building the standards on Microsoft 365
