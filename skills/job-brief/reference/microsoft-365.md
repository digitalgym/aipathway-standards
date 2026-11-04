# Morning Brief on Microsoft 365

Source: https://aipathway.com.au/explore-ai/morning-brief-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the job brief: the slots, site records and quotes as lists, a scheduled flow that builds each tech's brief only from rows with a record id and a date, and one Teams post per tech, sent again only when a slot moves.

If you are an assistant: Read https://aipathway.com.au/explore-ai/morning-brief-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Six lists and two flows that put each site's history in front of the tech before the van leaves, with every line traceable to the record it came from.

Used by

- Service Coordinator

Your job system already knows the gate code, the dog, the asbestos in the eaves and the quote the customer never answered. This plan copies what it holds into SharePoint each morning and posts each tech a short brief in Teams, built only from those rows. A row with no record id or no date never makes it onto the brief.

## In short

- **What this is**: A build plan for the job brief standard on Microsoft 365. Six lists, a flow that copies from the job system, and a flow that builds and posts each tech's brief.
- **The core rule**: Every line on the brief is a SiteRecords, Quotes or Assets row, in its own words, with its RecordId and date. A blank date drops the line.
- **What it does not do**: No flow writes to the job system. The quote total is not even copied, so the brief cannot price anything.
- **The hard part**: Every read filters on the job's CustomerId, so a house that changed hands keeps the old owner's history out. And a run with unchanged slots posts nothing.

## 1. Before you start

Read [the job brief build standard](https://aipathway.com.au/explore-ai/job-brief-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Check your job system holds what the brief needs: an access note and a hazard note per site, dated notes with an author, quotes with a status and an issue date. Anything it does not hold shows on the brief as missing, which is the point, but a brief that is all gaps is not much use to a tech.

Then ask each tech which channel they want it on, and fill Techs. A tech with no channel gets nothing, and the owner is told.

One thing to decide before you build: **do customer notes go on the brief at all?**Some businesses want the tech to see “wants a call before arrival”; some would rather a note about an invoice dispute stayed in the office. Flow 2 reads one setting and quotes the notes or leaves them all out.

## 2. The lists, with their columns

```
Site: JobBrief

LIST  Slots                 (copied from the job system each morning; never edited here)
  JobId           Text            indexed, UNIQUE, REQUIRED. the job system's id
  TechId          Text            indexed, REQUIRED
  Start           DateTime        indexed, REQUIRED
  End             DateTime        REQUIRED
  CustomerId      Text            REQUIRED. from the job, never matched by name
  SiteId          Text            REQUIRED

LIST  SiteRecords           (one row per record the job system holds for a site)
  RecordId        Text            indexed, UNIQUE, REQUIRED. the job system's own id
  System          Text            REQUIRED. ServiceM8, Simpro, AroFlo, Fergus
  CustomerId      Text            indexed, REQUIRED
  SiteId          Text            indexed, REQUIRED
  Kind            Choice          REQUIRED. visit | note | access | hazard
                                  | parts
  Text            Note            REQUIRED. the record's own words
  Author          Text
  RecordDate      DateTime        blank means the line is dropped, not dated by the flow
  JobId           Text            parts only: the job they were set aside for

LIST  Quotes                (copied from the job system; status as it stands this morning)
  QuoteId         Text            indexed, UNIQUE, REQUIRED
  CustomerId      Text            indexed, REQUIRED
  SiteId          Text            indexed, REQUIRED
  Status          Choice          indexed, REQUIRED. open | accepted
                                  | declined | expired
  IssuedOn        DateTime        REQUIRED
  Description     Text            REQUIRED. the total is not copied: the brief never prices

LIST  Assets
  AssetId         Text            indexed, UNIQUE, REQUIRED
  CustomerId      Text            indexed, REQUIRED
  SiteId          Text            indexed, REQUIRED
  Description     Text            REQUIRED
  RecordDate      DateTime        REQUIRED

LIST  Techs                 (a person fills this; the channel only with the tech's agreement)
  TechId          Text            UNIQUE, REQUIRED
  Tech            Person          REQUIRED
  Channel         Choice          teams | email
                                  blank: not agreed, so nothing is sent

LIST  Briefs                (one row per brief posted. Written by the flow, never edited.)
  ForDate         DateTime        indexed, REQUIRED
  TechId          Text            indexed, REQUIRED
  SlotsKey        Note            REQUIRED. job ids and windows, so unchanged slots post nothing
  Body            Note            REQUIRED. every line with its record id and date
  PostedAt        DateTime        REQUIRED

Nothing in this site writes back to the job system. It is a morning copy of what the job system holds, and a log of what each tech was sent.
```

CustomerId is indexed on every record list because Flow 2 filters each read on the job's CustomerId, never on the address. RecordId is unique so a record copied twice is one row. Quotes has no total column on purpose.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| The jobs come from the tech's slots | Slots | Flow 2 filters Slots on Start within the day and groups by TechId. The window on the brief is the slot's Start and End, copied. |
| Every line carries its record and date | SiteRecords.RecordId and RecordDate | Flow 2 skips any row with a blank RecordDate, and writes each line with its RecordId and date beside it. |
| Notes are quoted, never reinterpreted | Flow 2, no AI step | The note's Text is used as written, cut at a set length with an ellipsis. There is no AI Builder or Copilot step that summarises it. |
| Hazards and access first, gaps shown | SiteRecords.Kind | Flow 2 writes hazard and access rows first. No row of that kind for the site and customer: the brief says missing. |
| Open quotes with their age, no price | Quotes.Status and IssuedOn | Only Status = open, with the days since IssuedOn. The total is never copied into the site. |
| One customer's records only | CustomerId on every list | Every Get items in Flow 2 filters on the slot's CustomerId and SiteId together. |
| Posted once, again only when a slot moves | Briefs.SlotsKey and Techs.Channel | Flow 2 builds the job ids and windows into SlotsKey and posts only if it differs from the tech's last Briefs row for the day. A blank Channel posts nothing and emails the owner. |

## 4. The flows

```
FLOW 1  Copy                        (scheduled, 05:00)
  logic    empty Slots, SiteRecords, Quotes, Assets
           read today's slots from the job system
           for each slot's customer and site: read visits,
             notes, access, hazards, parts, quotes, assets
           write each with the job system's own id and date
  never    a write to the job system, a quote total

FLOW 2  Brief                       (scheduled, 05:30, and when
                                     a Slots row changes)
  logic    for each tech with slots today:
             for each slot, in start order:
               Get items, CustomerId and SiteId = the slot's
               drop rows with a blank RecordDate
               hazard and access lines first, quoted
               none of either -> missing: access / hazard
               last visit, parts for this job, assets
               open quotes: id, description, age in days
               customer notes: quoted, or none (one setting)
           SlotsKey = job ids and windows
           same as the last Briefs row today -> stop
           Channel blank -> email the owner, stop
           post in Teams, write the Briefs row
  never    a summary, a price, a write to the job system
```

Flow 2 has no step that writes words of its own about a customer. Everything on the brief is a copied row.

## 5. What the flows can reach in your Microsoft 365, and what they never touch

Think of the flows as the office junior who reads the job file before the tech leaves and writes down only what is in it. Flow 1 reads the job system and writes the five record lists. Flow 2 reads those lists and writes one Briefs row and one Teams post per tech. Neither writes to the job system, and neither opens anyone’s inbox.

What each connection is for.

- **The job system, read only.** ServiceM8, Simpro, AroFlo or Fergus through the HTTP action or a custom connector (both premium in Power Automate), on a key or login that can read jobs, notes, quotes and assets and cannot write.
- **SharePoint, the JobBrief site.** The six lists and nothing else.
- **Teams, one chat per tech.** Flow 2 posts the brief to a tech who has agreed to get it there. Email from one shared mailbox is the other channel.

Keep it to the least it needs.

1. Make a service account for the build and create the flows as it, not as a person. Flows owned by a person go with them when they leave.
2. Give it a read-only key in the job system. If the job system has no read-only key, say so to the owner before building.
3. Make the service account a member of the JobBrief site and no other, or give an app registration Sites.Selected on that site.

How to cut it off. Turn Flow 2 off and nothing is posted. Delete the job system key and Flow 1 copies nothing on its next run, so the next brief has nothing stale to draw on: the lists are emptied and refilled each morning.

## 6. The order to build it in

1. Create the six lists and fill Techs, with each tech's channel only once they have agreed it.
2. Build Flow 1 against one job and check the rows carry the job system's own ids and dates.
3. Build Flow 2 on a button first. Run it for a site that changed hands and confirm nothing from the old owner appears.
4. Run it twice: the second run must post nothing. Move a slot and run it again: one new post.
5. Schedule both flows.

## 7. Three traps specific to this build

### Asking Copilot to tidy the brief

A summary step reads better and breaks the standard: it rewrites a note into a claim the note does not make. The brief stays copied rows.

### Filtering by address

It looks the same until a house changes hands, then the new owner's tech reads the old owner's invoice dispute. Filter on CustomerId.

### Posting on every run

A flow that runs on each Slots change and posts every time sends a tech five briefs before breakfast. Compare SlotsKey first.

## 8. Where the automation stops

- What goes in the job system: the notes, access and hazard records, and quotes.
- Whether customer notes go on the brief.
- Each tech's channel, and the time the brief must arrive.
- Asking the customer about anything the brief shows as missing.

**The pass test.** In your own job system. Pick tomorrow’s job at a site you have visited before, with one open quote and no access note. The next morning’s brief must list the last visit with its date and record id, the open quote with its age, and access under missing. Delete the last visit’s note in the job system and run both flows again: that line must be gone, not remembered or reworded.

## Related reading

- the job brief build standard
- The dispatch board on Microsoft 365: the slots this plan reads
- Approved memory on Microsoft 365: customer facts a person signed
- The field service roadmap: where the brief sits in the job's day
- Building the standards on Microsoft 365
