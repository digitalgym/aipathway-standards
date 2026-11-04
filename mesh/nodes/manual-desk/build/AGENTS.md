# Build knowledge-base-build-standard

You are implementing a published build standard. The standard is the
specification; this folder is the harness that proves you met it.

Source: https://aipathway.com.au/explore-ai/knowledge-base-build-standard
Markdown: https://aipathway.com.au/explore-ai/knowledge-base-build-standard.md

## Do this in order

1. Read the standard at the Markdown URL above. It is the whole specification.
2. Implement `build.mjs`. It receives the ports and does the job.
3. Fill in `holds` in `scenarios.mjs`, one per check. Each carries the
   check's own conformance statement, what to inject, and what to assert.
4. Run `node run.mjs`. Every check starts red. Go green.
5. This standard has no hosted provider, and there is no production run for it
   yet: the stub run is the finished build. Do not run `conformance connect`; it
   gets a key for a provider this standard does not use. No hosted step. The production check runs over the business's real drive and mailbox with its real owners. The watch is the part not to hand-roll: a scheduled re-fetch and checksum compare of every source, with the owner told when it moves. It is a schedule and a table, not a product. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.

## Await every port call

Write `await ports.writeJob(...)`, never `ports.writeJob(...)`. A real
write is asynchronous and the stub's is not; awaiting a plain value yields the
value, so one build written this way runs against both. A build that does not
await works on the stub and then silently drops its writes against a real
system.

## Assert on the trace, not on stub memory

`holds` should read `world.calls`, the recorded port calls. Reaching into
stub-only state such as `world.jobs` makes the scenario stub-only: in
production that job lives in the operator's own system. To assert on it there,
read it back through a port, which puts the read in the trace where it belongs.

## The one rule

Everything the build does to the outside world goes through the ports it is
handed. Do not import a vendor SDK, open a socket, or reach for the network.
The runner owns the world the build writes into: a build that goes around the
ports leaves it empty, and the run reports that rather than passing.

## Verdicts, and what each one means

| verdict | meaning | what you do |
|---|---|---|
| `pass` | asserted green here | nothing |
| `fail` | asserted red here | fix the build, or the assertion |
| `shape_only` | shape holds on the stub, truth needs the live provider | re-runs when the provider flips |
| `with_us` | cannot be proved here at all | prove it by hand on the business's own systems and attach the evidence |
| `evidence_required` | not a software check | the operator does it, then attaches proof |

## What you cannot build, and should not try

Some checks are `with_us`. This standard has no hosted provider for them:
they need the business's real systems or a person, which a stub cannot hold,
and the run reports `with_us` rather than failing the build. No hosted step. The production check runs over the business's real drive and mailbox with its real owners. The watch is the part not to hand-roll: a scheduled re-fetch and checksum compare of every source, with the owner told when it moves. It is a schedule and a table, not a product. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.

Getting every other check green is the finished job.

## If you run Spec Kit

`specs/<standard>/spec.md`, `plan.md` and `tasks.md` and
`.specify/memory/constitution.md` are here in the shape Specify expects.
spec.md points at the standard rather than copying it; tasks.md is one task per
check. `/speckit-implement` and `node run.mjs` converge on the same build.
Load the constitution first.

## The manifest

Every run writes `manifest.json`: spec, edition, provider, one verdict per
check, and the next action for anything not green. Hand that over. It is the
record of the build, and the thing to send with a failing check id for a fixed
price.

## When the standard moves

The run prints the edition it asserted against. If the site's edition is newer
than the one in your last manifest, rebuild from the standard; do not patch the
generated board. The spec is the source of truth and this folder is disposable.
