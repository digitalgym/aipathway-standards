# Margin Watch: build and conformance harness

Margin Watch publishes a trade business's weekly job margin report every
Friday at 4:00 pm AEST, built to AIP-BS-RECURRING-REPORT 2026-10-03. For each
open job it reads the accepted quote's labour and material lines, the time
booked to the job at cost rate and the job's margin to date from the job
system (ServiceM8 here), and the supplier bills coded to the job from the
ledger (Xero), all AUD ex GST.

The commentary lists each job where an actual line is running above its
quoted line, and names the line: "Hartley bathroom: actual labour is 9800,
above quoted labour of 7200." It only ever writes values the figure list
carries, never an overrun, a percentage or a total it worked out itself.

Every figure cites a definition, a source and an as-of time. The owner sees
every line; the external accountant sees margins only. A figure it cannot read
publishes as unavailable and its owner is told. A margin falling past a
threshold a person set goes to the named person. A correction is only ever a
new version by a named person. It reads, and writes only the report: it never
edits a job, a quote or a bill, and what to do about a job stays with a person.

    npm install
    node run.mjs        # the conformance run; writes manifest.json and envelope.json
    node mutants.mjs    # proves every scenario goes red for a do-nothing and a broken build

Scaffolded by `npx @aipathway/conformance init recurring-report-build-standard`.

## The register

Each measure is one row in the definitions register, named
`<job name> | <line>`, the line being quoted labour, actual labour, quoted
materials, actual materials or margin. Jobs are named by site, not by job
number, so a job number never appears in the prose as a stray figure; the
job_id lives in the definition's query.

## The files

| file | whose | what |
|---|---|---|
| `build.mjs` | ours | the build |
| `scenarios.mjs` | ours | one `holds` per check |
| `mutants.mjs` | ours | the do-nothing and broken builds every scenario must fail |
| `run.mjs` | the harness | fetches the checks, runs, prints. No edits |

## What the stub cannot prove

Check 11 (it survives the builder) is evidence from the business, not code.
Check 12 (the pass test) runs on two real Fridays over the business's own
ServiceM8 and Xero and is reported `with_us`. There is no hosted step for
this standard, so `conformance connect` does not apply.

CC BY 4.0
