# Van Stock on Microsoft 365

Source: https://aipathway.com.au/explore-ai/van-stock-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the parts check on Microsoft 365: a Board list fed from the job system, Needs, Templates, VanStock with a counted-at time, Shelf with reservations, a Results list keyed to the run date, job and part, a scheduled flow at 14:00 that orders only through the Material Order flow, and one Teams message per tech and job.

If you are an assistant: Read https://aipathway.com.au/explore-ai/van-stock-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Eight lists and two flows that check tomorrow's jobs against the vans and the shelf at 2pm, and tell each tech once what to pick up.

Used by

- Operations Manager
- Business Systems Analyst
- Scheduling Coordinator

Most businesses already know what tomorrow’s jobs need: it is on the quote. What nobody does at 2pm is hold that list against the van. This plan puts the board, the needs, the van counts and the shelf in one SharePoint site, and runs the check every afternoon before the techs knock off.

## In short

- **What this is**: A build plan for the parts ready standard on Microsoft 365. Eight lists, a 2pm flow that checks and decides, and a Teams flow that tells each tech once per job.
- **The core rule**: Needs come from the quote, the job or a written template. A job with none is flagged. A van counted longer ago than the limit is flagged, not trusted.
- **What it does not do**: No flow here writes a purchase order. A shortfall goes to the Material Order flow, which prices it and holds anything over the threshold for a person.
- **The hard part**: Getting the vans counted weekly, and the unique keys on Results and TechMessages so a re-run cannot order or message twice.

## 1. Before you start

Read [the parts ready build standard](https://aipathway.com.au/explore-ai/parts-ready-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Build the Material Order flow first, from its own plan. This plan hands every shortfall to it and has nowhere to order without it.

Then count the vans. One row per part per van in VanStock, with CountedAt filled. A weekly count on Friday afternoon is enough to start, if each closed job takes its parts off the van.

One thing to decide before you build: **what time is the cut-off?** The flow runs before it, every afternoon, and writes a Runs row even when there is nothing to report.

## 2. The lists, with their columns

```
Site: PartsReady

LIST  Board                 (tomorrow's slots, copied from the job system each run)
  ForDate         DateTime        indexed, REQUIRED
  JobRef          Text            indexed, REQUIRED. the job system's id, never an address
  TechRef         Text            indexed, REQUIRED
  SlotStart       DateTime        REQUIRED
  JobType         Text            indexed

LIST  Needs                 (one row per part a job needs, from the quote or the job)
  JobRef          Text            indexed, REQUIRED
  Code            Text            indexed, REQUIRED
  Qty             Number          REQUIRED
  Source          Choice          REQUIRED. quote | job

LIST  Templates             (one row per part per job type. A person writes these.)
  JobType         Text            indexed, REQUIRED
  Code            Text            REQUIRED
  Qty             Number          REQUIRED

LIST  VanStock              (one row per part per van, from the last count)
  TechRef         Text            indexed, REQUIRED
  Code            Text            indexed, REQUIRED
  Qty             Number          REQUIRED
  CountedAt       DateTime        REQUIRED. older than the limit and the van is unknown

LIST  Shelf
  Code            Text            indexed, UNIQUE, REQUIRED
  OnHand          Number          REQUIRED
  Reserved        Number          REQUIRED
  Location        Text            REQUIRED. Bay 3, top shelf
  AlsoFits        Text            codes it can stand in for; only ever shown on a flag

LIST  Results               (one row per date, job and part. Written by the flow.)
  ResultKey       Text            indexed, UNIQUE, REQUIRED. ForDate|JobRef|Code
  ForDate         DateTime        indexed, REQUIRED
  JobRef          Text            indexed, REQUIRED
  Code            Text
  Status          Choice          indexed, REQUIRED. on_van | pick_from_shelf
                                  | ordered | flagged
  Location        Text
  PoRef           Text            from the Material Order flow
  Eta             DateTime
  Reason          Choice          not_in_stock | lead_time_after_job
                                  | needs_list_unknown | stock_unknown | order_failed
  Owner           Person          for a flag
  Suggestion      Text            an equivalent part, for a person to decide

LIST  TechMessages          (one row per date, tech and job)
  MessageKey      Text            indexed, UNIQUE, REQUIRED. ForDate|TechRef|JobRef
  SentAt          DateTime        REQUIRED

LIST  Runs                  (one row per run, published whether or not it found anything)
  ForDate         DateTime        indexed, REQUIRED
  RanAt           DateTime        REQUIRED
  Jobs            Number
  Flagged         Number

Nothing in this site holds a purchase order or a price. Orders go through the Material Order flow, and only the id that came back is kept here.
```

Results.ResultKey and TechMessages.MessageKey are unique, so a second run cannot write a second result for a part or message a tech twice about a job. VanStock.CountedAt is required, because a count with no time cannot be judged against the limit.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Jobs come from the board, by job id | Board.JobRef and Results.ResultKey | Flow 1 copies tomorrow's slots into Board and skips any JobRef that already has Results for the date, so a job added at 4pm is checked alone on the next run. |
| Needs come from the record | Needs, Templates and Results.Reason | Flow 1 reads Needs for the job, then Templates for its JobType. With neither, it writes one flagged Result with needs_list_unknown and an owner, and nothing else for that job. |
| A stale van count is not trusted | VanStock.CountedAt | If the tech's newest CountedAt is older than the limit, every line on that job is flagged stock_unknown and none is written as on_van. |
| Reserve before order | Shelf.Reserved | Flow 1 checks OnHand minus Reserved, adds to Reserved, and writes pick_from_shelf with the Location before any call to the Material Order flow. |
| Order only through Material Order, once | The Material Order flow and Results.ResultKey | Shortfalls are grouped by supplier and sent in one call per supplier. The PoRef that comes back is written on each Result; the unique key stops a second run writing it again. |
| Lead time decides, nothing is substituted | Results.Reason and Results.Suggestion | If the supplier's lead time lands after SlotStart, the part is flagged lead_time_after_job. An AlsoFits match is written to Suggestion only, never reserved or ordered. |

## 4. The flows

```
FLOW 1  Check tomorrow               (daily, 14:00, before the cut-off)
  read     settings: cut-off, van limit, default owner
           tomorrow's slots from the job system -> Board
  for each slot with no Results for the date:
           needs: Needs for JobRef, else Templates for JobType
             none -> Result flagged needs_list_unknown, next job
           van: VanStock for TechRef, newest CountedAt
             older than the limit -> every line flagged
             stock_unknown, next job
           each line: on the van          -> Result on_van
                      free on the shelf   -> Reserved += qty,
                                             Result pick_from_shelf
                      supplier lead time
                        after SlotStart   -> Result flagged
                                             lead_time_after_job,
                                             Suggestion if AlsoFits
                        in time           -> add to that supplier
  then     one call per supplier to the Material Order flow,
           PoRef and Eta onto each Result (ordered)
             no id back -> flagged order_failed
           one Runs row, always
  never    a purchase order, a change to a job, a part not on it

FLOW 2  Tell the tech               (when Flow 1 finishes)
  for each new (date, tech, job) with Results:
           MessageKey exists -> skip
           post one Teams message: on the van, pick up and
           where, ordered with Eta, flagged and who has it
           write TechMessages
```

Flow 1 never writes a purchase order. If the Material Order flow is off, shortfalls are flagged order_failed and a person sees them.

## 5. What the flows can reach in your Microsoft 365, and what they never touch

The flows are the storeman with a clipboard at 2pm: they read the run sheet, check the vans and the shelf, put a tag on what is reserved, and hand the order slip to purchasing. They read and write the eight lists on one SharePoint site, call the Material Order flow, and post in Teams to each tech. They never write a purchase order, never change a job’s parts, and never reserve or list a part that is not on the job.

What each connection is for.

- **SharePoint, the PartsReady site.** All eight lists. Board and Needs are refreshed from the job system each run; Templates, VanStock and Shelf are kept by people; Results, TechMessages and Runs are written by the flows. Nothing outside the site.
- **The Material Order flow, by its HTTP trigger or as a child flow.** One call per supplier per run, with the lines and their job refs. It answers with the purchase order id.
- **Teams, one chat per tech.** One message per tech and job. If your techs live on SMS instead, swap the action; the unique key still holds.
- **Your job system, read only.** To copy tomorrow’s slots and each job’s quote lines or materials into Board and Needs, through its own connector or API key. ServiceM8, Simpro, AroFlo and Fergus have APIs; Tradify has none, so its jobs come in by export.

Keep it to the least it needs.

1. Make a service account for the build and create the flows as it, not as a person who might leave.
2. Put both flows in a solution with connection references, so each connection is made once.
3. Make the service account a member of the PartsReady site and no other, or give an app registration Sites.Selected on that site only.
4. Give the job system key read access to jobs and quotes only.

How to cut it off. Turn off Flow 1 and nothing is checked, reserved or ordered; the Results already written stay. Delete the job system key and the board stops refreshing on the next run.

## 6. The order to build it in

1. Build the Material Order flow from its own plan and give it an HTTP trigger or make it a child flow.
2. Create the eight lists, fill Templates for your common job types, and count the vans into VanStock.
3. Build Flow 1 and run it by hand on tomorrow's board. Check one stale van is flagged and one shelf part is reserved.
4. Run it again straight away: no new Results, no second call to the Material Order flow.
5. Build Flow 2 and send yourself the first message before it goes to a tech.
6. Schedule Flow 1 for 14:00.

## 7. Three traps specific to this build

### Ordering from inside this flow

It is quicker to create the purchase order right here. It also skips the threshold and the approved-supplier list, which is the reason Material Order exists. Call that flow instead.

### A van count with no date

A count typed over the top of last month's, with no CountedAt, looks current forever. Make the column required and write a new count as new rows.

### Checking for a result before writing it, instead of a unique key

Two runs a minute apart both find nothing and both write. The unique key on ResultKey is what stops the second, not the check.

## 8. Where the automation stops

- Moving a job, or sourcing a part, when the lead time misses the slot.
- Accepting an equivalent part.
- Writing the templates per job type, and counting the vans.
- Every flagged Result.

**The pass test.** On tomorrow’s real board. Set one job whose quote needs a part on the van, one whose part is only on the shelf, and one whose part you hold nowhere. By the cut-off: the first tech’s Teams message lists the part as on the van; the second says pick it up from the shelf, and Shelf.Reserved went up by one; the third has a PoRef from the Material Order flow or a flag naming the job. Run Flow 1 again: no new Results, no second order, no second message.

## Related reading

- the parts ready build standard
- Material orders on Microsoft 365: the flow every shortfall goes through
- The dispatch board on Microsoft 365: where tomorrow's slots come from
- The field service automation roadmap
- Building the standards on Microsoft 365
