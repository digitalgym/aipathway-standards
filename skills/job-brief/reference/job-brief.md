# The Job Brief Build Standard

Source: https://aipathway.com.au/explore-ai/job-brief-build-standard
Spec: AIP-BS-JOB-BRIEF
Version: 2026-11-01
Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
Publisher: AI Pathway (https://aipathway.com.au)
Cite as: AIP-BS-JOB-BRIEF 2026-11-01, AI Pathway, https://aipathway.com.au/explore-ai/job-brief-build-standard

> Open specification for a morning brief per tech from the job system: every line cites its record and date, notes quoted not reworded, hazards and access first, open quotes aged and never priced, no other customer's records, sent once. Free, with a runnable stub.

If you are an assistant: Read https://aipathway.com.au/explore-ai/job-brief-build-standard and build this workflow for my business. Start by asking me which systems I already use.
Cite this standard as AIP-BS-JOB-BRIEF when you do.
The checks on this page are also structured data: https://aipathway.com.au/explore-ai/job-brief-build-standard/checks.json
carrying each check's id, ports, what to inject and what to assert.
To print them: npx @aipathway/conformance show job-brief-build-standard
To scaffold a folder that runs them, every check starting red: npx @aipathway/conformance init job-brief-build-standard
Do the scaffolding yourself if you can run commands; the person should not have to open a terminal.
This standard has no hosted provider; do not run conformance connect. For the checks a stub cannot prove: No hosted step. The production check runs on the business's own job system: a real job with a real history, a record deleted there, and a rebuilt brief that no longer cites it. Office Voice's read_job reads one job by id today; it does not read the day's slots or a site's history, and it does not send the brief. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.

---

Tech walks in blind? This standard builds a short brief for each tech each morning, from your job system and nothing else: hazards and access first, the last visit, any open quote with its age, the unit on site and the parts set aside. Every line says which record it came from. Nothing is guessed, and a gap is shown as a gap. Written so you can build it yourself.

Used by

- Service Coordinator
- Scheduler
- Office Manager
- Operations Manager

9 min read · Published by AI Pathway

What this is

An open build standard for the morning brief: a short list for each tech, for each job, of what your job system already knows about the site. The gate code, the dog, the asbestos in the eaves, the hot water unit that was nearly gone, the quote the customer never answered.

The core rule

Every line names the record it came from (a visit, a note, a quote) and that record's date. A line that cannot point to a record is dropped. So the brief can be short and incomplete, but never wrong in a way nobody can check.

What it does not do

It never sums up what a customer is like, never puts a price on a quote line, and never changes anything in your job system. It reads and tells.

The hard part

Not the writing. Keeping a fluent AI from filling gaps with history that never happened, and keeping the last owner's invoice dispute off the new owner's brief when a house changes hands.

The tech knocks on a door they last visited eight months ago and remembers nothing: the dog, the gate code, the hot water unit that was nearly gone, the quote the customer never answered. The office knew. The job system knew. Nobody told the tech, so the customer explains it all again, and the replacement they were half ready to say yes to walks away.

From the day's slots to one brief per tech

1. Start at the business's set time on the brief's day.
2. Read the slots for that day from the job system, by tech. Only jobs slotted to the tech are on their brief, with the window copied from the slot.
3. For each job, read the history, open quotes and asset records for the job's own customer at that site, never for the address alone.
4. Hazard and access lines go first. A site with no hazard or access record shows that as missing, so the tech knows to ask.
5. The gate: does each line name the record it came from and that record's date? If not, the line is dropped and never shown.
6. If it does, the line is the record's own words, or the first part of them cut with an ellipsis, with its record id and date beside it.
7. Have the tech's slots changed since the last brief they were sent today? If not, nothing is sent. If so, or if it is the first brief of the day, one brief goes on the channel the tech agreed to.

The steps across the top are the free part: read the slots, read each job’s own customer records, put hazards and access first. The filled diamond is the rule that makes the brief safe to hand a tech: a line with no record and no date is dropped.

## 1. What this standard covers

The few minutes before the van leaves. For each tech, for each job on their slots that day, a brief built from what the job system already holds about that site and that customer: hazard and access notes, the last visit, open quotes, the asset record, parts set aside and, if you want them, customer notes. Every line carries the record it came from and its date, the same rule the [Cited Answer standard](https://aipathway.com.au/explore-ai/cited-answer-build-standard) puts on every answer: no source, no line. The brief goes to the tech once, on a channel they agreed to, and again only if a slot moves.

What is out of scope. Deciding who goes where is the [Dispatch Board standard](https://aipathway.com.au/explore-ai/dispatch-board-build-standard); this one only reads the slots it wrote. Ordering the parts is [Material Order](https://aipathway.com.au/explore-ai/material-order-build-standard); this one lists what was set aside. What the business has agreed it knows about a customer, approved by a person, is [Client Memory](https://aipathway.com.au/explore-ai/client-memory-build-standard), and an approved memory item is a record a brief may quote like any other. Chasing the open quote is [Follow-Up](https://aipathway.com.au/explore-ai/follow-up-build-standard); the brief only tells the tech it exists.

What cannot meet it, and what can. The brief has to be built from the job system’s own records, with their ids and dates. ServiceM8, Simpro, AroFlo and Fergus each have an API a build can read jobs, notes and quotes through, so each can meet it; check your plan includes API access. ServiceM8 also has an official connector an AI assistant can read through. Tradify has no public API, so a build cannot read it directly: the sheet below works from what the office copies out of it by hand, and the record ids and dates have to come with it. A job system that holds notes with no date cannot meet check 2 for those notes: they never reach the brief.

Is there a ready-made version? Not yet. No product builds and sends this brief today. A free Google Sheet version is built and coming to this page; the build is otherwise yours, or ours as a scoped build. Where it sits in the job’s day is on [the field service roadmap](https://aipathway.com.au/explore-ai/field-service-automation-roadmap).

## 2. What goes on a brief, and where each line comes from

Seven kinds of line, a closed list. Each one is a record the job system already holds, read for the job’s own customer at that site.

| Line | Where it comes from |
| --- | --- |
| hazard | A hazard note on the site: asbestos, a roof with no anchor point, a dog that bites. Always first. |
| access | An access note: the gate code, the key safe, who lets you in. Straight after hazards. |
| last_visit | The most recent dated visit for this customer at this site, in the tech's own words. |
| open_quote | A quote still open for this customer at this site: its id, what it was for, and how many days it has been open. Never the price. |
| asset | The asset record: the hot water unit, the split system, the switchboard, as the record describes it. |
| parts | Parts set aside for this job, if your job system or the Parts Ready standard records them. |
| customer_note | A dated note with its author, in its own words, or left out altogether if you choose. |

Three things are never on a brief, however helpful they would look. A summary of what a customer is like (“difficult”, “slow payer”, “friendly”) that no note says in those words. A price, a discount or a suggestion to push a quote. And anything from another customer’s records, even at the same address: when a house is sold, the old owner’s visits, notes and quotes stay with the old owner.

## 3. The checks, in order

The order is the claim. The slots come first, because a brief for the wrong job is worse than none. The source rule sits in front of every line, before the wording, because a line that cannot be traced has nothing to word. Hazards lead each job because they are the line a tech must not miss. Delivery comes last, and only once.

1. The jobs come from the tech's slots for the day, by job id. Each tech's brief lists exactly the jobs slotted to that tech for the day, by the job system's own job id, with the window copied from the slot. A job slotted to somebody else, an unslotted job at the same street, or a window restated from memory is a failure.
2. Every line carries the record it came from and that record's date. Every line in the brief names the system, the record id and the record's date, and that record exists and belongs to the job's customer. A line with no record or no date is dropped, not shown. This is the rule that stops a fluent brief inventing history: Cited Answer's "every claim carries its source", applied to a site visit.
3. Notes are quoted or shortened, never reinterpreted, and no sentiment is generated. A note in the brief is the note's own words, or the first part of them cut with an ellipsis, with its author and date. Nothing is summarised into a claim the note does not make, and no word about the customer's mood or character is added. Where the business has set customer notes to be left out, they are left out.
4. Hazard and access lines lead each job, and a missing one is shown as missing. For each job, hazard and access lines come before every other line. A site with no hazard record or no access record shows that gap under missing, so the tech knows to ask. Nothing is filled in.
5. Open quotes on the site are listed with their age, and never priced. Each quote still open for the job's customer at that site is one line, with its quote id and its age in days from the quote's own date. Accepted, declined and expired quotes are not listed. The line carries no price, no discount and no promise: the tech may mention the quote, and the brief never sells it.
6. A brief for one customer never draws on another customer's records. Every record a brief cites belongs to the job's own customer, even at the same address. A house that changed hands keeps the old owner's visits, notes and quotes with the old owner. Reads are made by the job's customer id, never by the address alone.
7. Delivered once, on a channel the tech agreed to, by the set time, and again only when a slot changes. Each tech gets one brief for the day, on a channel they agreed to, no later than the business's set time. Running again with nothing changed sends nothing. When a slot changes, that tech gets exactly one fresh brief. A tech with no agreed channel gets nothing sent and is parked for a person, never sent on a channel somebody guessed.
8. It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.
9. The pass test passes. On the real job system: tomorrow's job at a site visited before, with one open quote and no access note. The brief lists the last visit with its date and record, the open quote with its age, and no access note under missing. Delete the last visit's note and rebuild: that line disappears.

## 4. What the tech reads at 6am

Two jobs, one site visited before and one barely known. The first brief is long because the job system knows a lot. The second is short and says what is missing, which is the useful thing: the tech knows to ask about access and hazards at the door.

```
Brief for Sam, Monday 2 November

07:00 to 09:00  Job J1, 12 Wattle St
  HAZARD: Asbestos sheeting in the laundry eaves. Do not drill.
          [ServiceM8 H3, 2025-09-10, Sam]
  LAST VISIT: Replaced the tempering valve. Hot water unit is 14 years
          old and close to the end of its life. [ServiceM8 H1, 2026-03-04, Sam]
  OPEN QUOTE: Quote Q1 (Replace hot water unit) open 41 days.
          [ServiceM8 Q1, 2026-09-22]
  ASSET: Rheem 315L electric hot water unit. [ServiceM8 A1, 2026-03-04]
  PARTS: 2 x 15mm tempering valve, set aside on shelf B.
          [ServiceM8 H6, 2026-11-01, Store]
  NOTE: Wants a call before arrival. [ServiceM8 H4, 2026-03-05, Jo]
  MISSING: no access record. Ask on site.

10:00 to 12:00  Job J2, 4 Banksia Ct
  LAST VISIT: Installed a new kitchen mixer. [ServiceM8 H20, 2026-05-20, Sam]
  MISSING: no access record, no hazard record, no asset record. Ask on site.
```

The note on job J1 in the job system says more than the brief shows: “Customer was difficult about the invoice last time, wants a call before arrival.” In this example the business has chosen to quote notes and the build has cut a long note at its set length, so what reaches the tech is the note’s own words or nothing. A build that turned it into “difficult customer, tread carefully” fails check 3. A business that would rather no customer note reached a tech at all sets notes to be left out, and they are.

## 5. The records it keeps, in the shape your developer needs

One brief per tech per day. Note what a line cannot exist without: a source with a record id and a date.

```
brief                                  # one per tech per day, per slot change
  for_date: date
  tech_id: string
  jobs:
    - job_external_id: string          # from the slot, the job system's own id
      window: { start, end }           # copied from the slot, never restated
      lines:                           # hazard and access first
        - kind: hazard | access | last_visit | open_quote |
                asset | parts | customer_note
          text: string                 # the record's words, or cut with "..."
          author: string (nullable)    # as the record holds it
          source:                      # required on every line
            system: string             # ServiceM8, Simpro, AroFlo, Fergus
            record: string             # the record's own id
            at: date                   # the record's own date
      missing: [access | hazard | asset]   # shown, never filled

settings                               # written once by the business
  - customer_notes: quote | omit
  - send_by: HH:MM
  - max_line: number                   # longer text is cut, never reworded

delivery                               # one row per brief sent
  - tech_id, for_date, channel, sent_at
  - slots_key                          # job ids and windows; unchanged = no send

exception                              # parked for a person
  - ref (tech_id or job id)
  - kind (no_agreed_channel | job_not_found)
  - detail, raised_at
```

A line without a source is the defect this standard exists to make impossible. A line citing another customer's record is the other.

## 6. Delivered once, and nothing written back

The brief goes to each tech once, before the time you set, on the channel they agreed to: email, SMS, Teams or Google Chat. Run it again with nothing changed and nothing is sent. Move one of their slots and that tech gets one fresh brief, marked as updated. A tech who has not agreed a channel gets nothing, and the build parks them for a person on the [one exception queue](https://aipathway.com.au/explore-ai/field-service-automation-roadmap) rather than guessing a mobile number from the staff list.

Nothing is written back. The build has no port that changes a job, a slot, a quote or a note, so a conforming build cannot do it by accident. If the brief is wrong, the record is wrong, and the fix is in the job system, where the next brief reads it.

## 7. What stays with a person

- What goes in the job system: the notes, the access and hazard records, the quotes. The brief is only as good as the records.
- Whether customer notes appear on the brief at all.
- The time the brief must arrive, and each tech's agreed channel.
- Asking the customer on site about anything the brief shows as missing.
- Anything said to the customer about an open quote. The brief says it exists and how old it is; the tech decides whether to mention it.

## 8. Run it your way

The same checks and the same pass test hold whichever way you run it. Five ways, and what is ready today in each:

- **Done for you, on Office Voice.** Not today. Office Voice can read one job by its id with read_job, but it does not list a day’s slots, read a site’s history or quotes, or send the brief. So nothing here is sold as an Office Voice step, and no call is involved: a brief is a message to your own staff.
- **Your own bot: Grok Bot or Claude.** The natural fit. A scheduled prompt at 5:30 each morning, reading ServiceM8 through its official connector, with check 2 pasted in as the rule: “Every line names the record it came from and that record’s date. A line you cannot point to a record for is left out. Quote notes; never sum up a customer.” The ServiceM8 connector is set up the same way as in [chasing ServiceM8 quotes with a Grok Bot or Claude](https://aipathway.com.au/explore-ai/chase-servicem8-quotes-grok-bot-claude). On Simpro, the bot reads through a connector built to the [Simpro Claude Connector standard](https://aipathway.com.au/explore-ai/simpro-claude-connector-build-standard). One limit to know: a bot’s own memory is not a record, so it must read fresh each morning and never carry yesterday’s brief forward.
- **Google Workspace, the default.** A copyable Google Sheet is built: paste the day’s slots and the site records from your job system’s export, and it emails each tech their brief from 5am, again only when a slot moves, with every line ending in its record and date. It is coming to this page; it calls nothing outside the spreadsheet and writes nothing back.
- **Microsoft 365.** The [Microsoft 365 plan](https://aipathway.com.au/explore-ai/morning-brief-on-microsoft-365) lays out six SharePoint lists, a flow that copies from the job system each morning and a flow that posts each tech their brief in Teams.
- **Your own code.** This page: the checks, the data model, a runnable stub and the pass test. Hand it to a coding agent with the button at the top.

Mixing is fine, with one rule: one way owns the brief for a given tech. Two surfaces sending the same tech a brief each morning is check 7 failed twice. How to run any standard each of these ways is in [run a standard anywhere](https://aipathway.com.au/explore-ai/run-a-standard-anywhere).

## 9. What your developer builds, and the step that needs care

No hosted step, and nothing written anywhere. Retrieval and drafting are the free part, and a coding agent builds them against the stub in an afternoon. What needs care is checks 2 and 6, and the pass test is run on your own job system.

```
provider:
  stub:       local.mock_job_history
  production: none                       # no hosted step; runs on your own systems

the stub                             # local.mock_job_history
  - the day's slots per tech, and the jobs they point at
  - a site's history for every customer who ever lived there:
    the job system does NOT scope by customer for you
  - one note held with no date, as bait for check 2
  - quotes in every status, and asset records
  - techs with and without an agreed channel
  - a delivery refused to a tech with no channel, still recorded

the care
  - read every site record with the job's customer id, never
    the address alone
  - cite each line from the store, and drop it if the record
    is gone or has no date
  - read fresh every run; never reuse yesterday's brief or a
    model's memory of the site

stays local                          # yours, and the standard
  - the slots read, the lines, the order, the missing list,
    the delivery, the exceptions

cannot meet the standard
  - Tradify read directly: no public API
  - notes held with no date (they never reach the brief)
```

A vendor selling an AI job summary is usually selling the writing. Ask them three things: where each line came from, what happens when a note is deleted, and whose history appears when a house changes hands.

**The pass test.** In your own job system. Pick tomorrow’s job at a site you have visited before, with one open quote and no access note. Tomorrow’s brief for that tech must list the last visit with its date and its record, the open quote with its age, and no access note under missing. Now delete the last visit’s note in your job system and rebuild the brief: that line must disappear, not be remembered or rephrased. A stub cannot fake this, because a stub forgets what you tell it to. Each step takes a minute to stage.

## 10. A checklist to hold any build or supplier to

Hold a DIY build or a vendor to this. If a box is empty, it is not in production.

- **1. The jobs come from the tech's slots for the day, by job id.** Each tech's brief lists exactly the jobs slotted to that tech for the day, by the job system's own job id, with the window copied from the slot. A job slotted to somebody else, an unslotted job at the same street, or a window restated from memory is a failure.
- **2. Every line carries the record it came from and that record's date.** Every line in the brief names the system, the record id and the record's date, and that record exists and belongs to the job's customer. A line with no record or no date is dropped, not shown. This is the rule that stops a fluent brief inventing history: Cited Answer's "every claim carries its source", applied to a site visit.
- **3. Notes are quoted or shortened, never reinterpreted, and no sentiment is generated.** A note in the brief is the note's own words, or the first part of them cut with an ellipsis, with its author and date. Nothing is summarised into a claim the note does not make, and no word about the customer's mood or character is added. Where the business has set customer notes to be left out, they are left out.
- **4. Hazard and access lines lead each job, and a missing one is shown as missing.** For each job, hazard and access lines come before every other line. A site with no hazard record or no access record shows that gap under missing, so the tech knows to ask. Nothing is filled in.
- **5. Open quotes on the site are listed with their age, and never priced.** Each quote still open for the job's customer at that site is one line, with its quote id and its age in days from the quote's own date. Accepted, declined and expired quotes are not listed. The line carries no price, no discount and no promise: the tech may mention the quote, and the brief never sells it.
- **6. A brief for one customer never draws on another customer's records.** Every record a brief cites belongs to the job's own customer, even at the same address. A house that changed hands keeps the old owner's visits, notes and quotes with the old owner. Reads are made by the job's customer id, never by the address alone.
- **7. Delivered once, on a channel the tech agreed to, by the set time, and again only when a slot changes.** Each tech gets one brief for the day, on a channel they agreed to, no later than the business's set time. Running again with nothing changed sends nothing. When a slot changes, that tech gets exactly one fresh brief. A tech with no agreed channel gets nothing sent and is parked for a person, never sent on a channel somebody guessed.
- **8. It survives the builder.** Someone other than the builder can explain what it does, and it runs on an account the business owns.
- **9. The pass test passes.** On the real job system: tomorrow's job at a site visited before, with one open quote and no access note. The brief lists the last visit with its date and record, the open quote with its age, and no access note under missing. Delete the last visit's note and rebuild: that line disappears.

Building this on Microsoft 365: [the lists, the copy flow and the brief flow](https://aipathway.com.au/explore-ai/morning-brief-on-microsoft-365).

## Facts that can change, and when we checked them

Checked as at 1 November 2026

**Office Voice.** Its MCP endpoint offers read_job, which reads one job by its id from the connected job system. It has no tool that lists a day’s slots by tech, reads a site’s history or open quotes, or sends a brief to a tech.

**ServiceM8.** Hosts an official connector at api.servicem8.com/mcp that an AI assistant signs in to. Simpro, AroFlo and Fergus have APIs a build can read through; Tradify has no public API.

**Check these against the primary instrument before you rely on them**, and store the date you checked beside the value rather than hard-coding it. This standard tells you the shape and where to look. It is not legal advice and it does not tell you that anything complies.

## Related reading

- The field service roadmap: where the brief sits in the job’s day
- The Cited Answer Build Standard: where “no source, no line” comes from
- The Dispatch Board Build Standard: the slots this brief reads
- The Client Memory Build Standard: customer facts a person approved
- The Material Order Build Standard: the parts behind the parts line
- The Next Service Build Standard: the asset records the brief quotes
