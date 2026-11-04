# Agreement Chase: follow-up-build-standard conformance harness

Agreement Chase gets each new commercial customer's signed service agreement
and signed rate sheet back before their first job. Each document is an open
item on the onboarding register, on the first job, due the day before it. It
chases the document on a capped cadence over consented channels, files the
signed copy as evidence the day it lands, and hands a no, a dispute or the cap
to a named person. It never writes or changes the agreement or a rate, never
takes "it's signed" on the phone as the signature, and never decides whether
the first job goes ahead without it: that stays with a person.

`build.mjs` says what it does, in the standard's order.

    npm install
    node run.mjs

## The three files

| file | whose | what |
|---|---|---|
| `build.mjs` | yours | the build. The only file that does the job |
| `scenarios.mjs` | yours | one `holds` per check |
| `run.mjs` | ours | fetches the checks, runs, prints. No edits needed |

The checks are fetched at run time from
https://aipathway.com.au/explore-ai/follow-up-build-standard. The committed
run is in `../evidence/follow-up/`.

The call on a live line is the hosted step and is not built here; the pass test
reports `with_us`. There is no production run for this standard yet, so
`AIPATHWAY_ENV=production` is refused rather than rerunning the stub under a
production label.

CC BY 4.0
