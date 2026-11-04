# Lead Payback: build and conformance harness

Lead Payback publishes a trade business's monthly lead source report at
9:00 am AEST on the first working day after each month ends, built to
AIP-BS-RECURRING-REPORT 2026-10-03. For each lead source or ad campaign the
office tags on the job record, it reads the jobs won that month from the job
system (Simpro here) and the invoiced value on those jobs from the ledger
(Xero), less credit notes, AUD ex GST. Jobs with no lead source recorded are
counted as their own line, never spread across the campaigns.

The commentary names each source with only the figures it carries: "Google
Ads hot water campaign: jobs won 14, invoiced value 38200." and which source
brought the most invoiced value. It never writes a cost per job, a return on
ad spend, a percentage or a total it worked out itself.

Every figure cites a definition, a source and an as-of time. The owner sees
jobs and dollars per source; the marketing contractor sees jobs won only. A
figure it cannot read publishes as unavailable and its owner is told. A
campaign's invoiced value falling past a threshold a person set goes to the
named person. A correction is only ever a new version by a named person. It
reads, and writes only the report: it never edits a job, a lead source tag or
an invoice, and what to spend on a campaign stays with a person.

    npm install
    node run.mjs        # the conformance run; writes manifest.json and envelope.json
    node mutants.mjs    # proves every scenario goes red for a do-nothing and a broken build

Scaffolded by `npx @aipathway/conformance init recurring-report-build-standard`.

## The register

Each measure is one row in the definitions register, named
`<lead source> | <line>`, the line being jobs won or invoiced value. Lead
sources are named in words, without digits, so a name never appears in the
prose as a stray figure. Each invoice is tied to its job by the job_id in the
invoice reference, and each job to its source by the lead source field on the
job record; nothing is matched on a customer name.

## The files

| file | whose | what |
|---|---|---|
| `build.mjs` | ours | the build |
| `scenarios.mjs` | ours | one `holds` per check |
| `mutants.mjs` | ours | the do-nothing and broken builds every scenario must fail |
| `run.mjs` | the harness | fetches the checks, runs, prints. No edits |

## What the stub cannot prove

Check 11 (it survives the builder) is evidence from the business, not code.
Check 12 (the pass test) runs on two real month-ends over the business's own
Simpro and Xero and is reported `with_us`. There is no hosted step for this
standard, so `conformance connect` does not apply.

CC BY 4.0
