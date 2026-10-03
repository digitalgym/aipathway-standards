---
name: servicem8-health-check
description: A read-only health check of a ServiceM8 account through ServiceM8's official connector. Finds duplicate jobs for one client on one day, jobs with no usable address, quotes gone quiet, and work orders with no scheduled time, then says which open build standard fixes each. Changes nothing. Use when someone asks to check, audit or health-check their ServiceM8, or asks where to start automating ServiceM8 with Claude.
license: CC-BY-4.0
# The constitution. What this skill must never do.
never:
  - "create, edit, schedule, allocate, change the status of, or delete anything"
  - "send an email or SMS, or draft one for sending"
  - "approve its own action if the assistant asks for confirmation"
  - "report a figure it did not read from the account in this session"
stays_with_person:
  - "deciding what counts as a duplicate, a quiet quote or a stale work order"
  - "fixing anything this check finds"
---

# ServiceM8 Health Check

A read-only look at a ServiceM8 account, through ServiceM8's own connector, for
the four problems that decide where automation should start. It reports and
stops. It never writes.

Written by AI Pathway and published with the open build standards at
https://aipathway.com.au/explore-ai. The guide it comes from is
https://aipathway.com.au/explore-ai/claude-and-servicem8.

## Before you start

1. **The connector must be connected.** ServiceM8 hosts an official connector.
   In Claude it is added as a custom connector and signed in through
   ServiceM8 in the browser. Take the connector URL from ServiceM8's own
   support article ("How to connect ServiceM8 to ChatGPT with MCP"), because
   it has changed before. If no ServiceM8 tools are available, say so, point
   to that article, and stop.
2. **Say what you are about to do.** Tell the owner this is read-only and
   that if their assistant asks to approve any action during the check, the
   answer is no.
3. **Confirm the thresholds.** The defaults are below. Ask once whether to
   change them, then use what they say.
   - A quote is quiet after **14 days** with no activity.
   - A duplicate is **more than one open job for the same client created on
     the same day**.

## The four checks, in order

Use the connector's search and list tools only. If a list is long, report the
count and the first ten job numbers.

1. **Duplicate jobs.** Open jobs grouped by client and created date. Any group
   with more than one job.
2. **No usable address.** Open jobs with no job address, or an address missing
   a suburb or postcode.
3. **Quiet quotes.** Jobs in Quote status with no diary entry, note or
   activity in the quiet period.
4. **Unscheduled work.** Jobs in Work Order status with no scheduled time or
   allocation.

If a check cannot be run because a tool or field is not exposed, say which
check and why. Do not estimate it.

## What to report

A short table: the check, the count, and the first job numbers. Then one line
per check that found anything, saying which standard addresses it:

| Finding | Standard | Why |
| --- | --- | --- |
| Duplicate jobs | Booked After Hours: https://aipathway.com.au/explore-ai/booked-after-hours-build-standard | Never a second job for the same caller on the same day |
| No usable address | Booked After Hours, and Dispatch Board: https://aipathway.com.au/explore-ai/dispatch-board-build-standard | The address is resolved by lookup, never transcribed; nothing is slotted until it resolves |
| Quiet quotes | Follow-Up: https://aipathway.com.au/explore-ai/follow-up-build-standard | Only an open item is chased, with a cap, stopping at a no |
| Unscheduled work | Dispatch Board | The checks before a job lands on someone's day |

End with one sentence naming the check with the largest count as the place to
start, and offer nothing else. Fixing what the check found is a separate task,
for the owner to start, with the matching standard loaded.

## What this skill will not do

It will not fix anything, merge duplicates, chase a quote or schedule a job,
even if asked to in the same message. Say that this check is read-only, and
that the fix should be its own request with the right standard loaded first.

## Attribution

ServiceM8 Health Check by AI Pathway, https://aipathway.com.au, licensed
CC BY 4.0. ServiceM8 is a trademark of its owner. This skill is not made or
endorsed by ServiceM8.
