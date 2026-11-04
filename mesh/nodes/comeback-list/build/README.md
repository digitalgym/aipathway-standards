# Comeback List

Every weekday morning, Comeback List reads the job history and hands the owner
a short list of past customers worth a message today: whose check-up has come
round, who has not used us in a year, who has a quote that never went ahead,
whose rental is coming up to a new lease year, or who is near a tech already
booked this week. Each row has the reason and a short text drafted for the
owner to send, with the business name and "Reply STOP to opt out."

Built to AIP-BS-DATABASE-REACTIVATION 2026-10-24, AI Pathway,
https://aipathway.com.au/explore-ai/database-reactivation-build-standard

## What it never does

- It never sends a text or an email, and never dials. The owner sends every
  message and marks what happened (sent, spoke, call me back, not interested,
  do not contact).
- It never answers a reply. A price question, a complaint or anything the play
  was not built for goes to the owner with the reason.
- It never lists a customer flagged do-not-contact, one with no consent on the
  record, or one with an open exception, whatever their rank.
- It never guesses a field. A missing job date or landlord flag limits only
  the play that needs it.

A customer who asked to be rung back is the one call the standard lets a
machine queue. That is Office Voice's governed `create_call` (basis
`callback`), hosted, off by default, and not built here.

## How the standard's fields read for a trade business

| standard | here |
|---|---|
| name and mobile | the customer's name and mobile, off the job system |
| address | the site address of their last job |
| purchase or settlement date | the date their last job was completed |
| last contact outcome | what happened the last time we reached out |
| investor or owner-occupier | a landlord's rental, or they live there, only when the record says |
| fresh sale nearby | a tech already booked near them this week |
| tenure play | check-up due: the owner's return interval for that kind of job has come round |
| equity play | a tech in the area this week |
| investor play | a landlord's rental, before the next lease year |
| lapsed play | a quote that never went ahead, or not used us in a year |

Each row carries the `job_id` of the customer's last completed job, so the
owner opens the job record it came from. The return intervals
(`RETURN_MONTHS`) and the ranking weights (`WEIGHTS`) are plain numbers at the
top of `build.mjs`, for the owner to edit.

## Spam Act

A drafted text from a business to a past customer is likely a commercial
electronic message under the Spam Act 2003 (Cth): it needs consent (express,
or inferred from the existing relationship in limited cases), has to identify
the business, and has to carry a working unsubscribe. Every draft names the
business and ends "Reply STOP to opt out.", and a STOP is marked
`do_not_contact`, which is permanent across every play. Check the instrument
before relying on this; it is not legal advice.

## Survives the builder (check 13)

Declared, not scored: the owner and the office manager can each explain the
list from this README and the weights at the top of `build.mjs`, and it runs
on the business's own job system account and the owner's own scheduler.

## Run the checks

    npm install
    node run.mjs

`run.mjs` fetches the checks from the standard and writes `manifest.json` and
`envelope.json`. The committed copy is in `../evidence/database-reactivation/`.

## Handing this to a coding agent

`AGENTS.md` in this folder is written for one.

CC BY 4.0
