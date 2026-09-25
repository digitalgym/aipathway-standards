# @aipathway/conformance

Run a published [AI Pathway build standard](https://aipathway.com.au/explore-ai)
against your own build, on your own machine, before you talk to anybody.

```bash
npx @aipathway/conformance init booked-after-hours-build-standard
cd booked-after-hours-build-standard && npm install && node run.mjs
```

That writes a folder that runs: the harness, a build file to implement, and one
scenario per check carrying that check's own words. Every check starts red.
Going green is the work, and a green run means something because a red one was
possible.

```bash
npx @aipathway/conformance list     # the standards
npx @aipathway/conformance show <slug>   # every check, what it injects, what it asserts
npx @aipathway/conformance json <slug>   # the same, for your own harness
npx @aipathway/conformance init <slug> [dir]
```

## What `init` writes

| file | whose | what |
|---|---|---|
| `build.mjs` | yours | the build. The only file that does the job |
| `scenarios.mjs` | yours | one `holds` per check, generated with the check's own words |
| `run.mjs` | ours | fetches the checks, runs, prints. No edits needed |
| `AGENTS.md` | ours | the same instructions, written for a coding agent |

It does not look for, patch or launch your existing code. It writes a new folder
beside it, because guessing how somebody's project boots is how a tool becomes a
framework.

## What this is

Each standard is a set of numbered checks. Most of them can be proved on a stub
on your laptop. A few cannot: they need a live number, a real ledger or a real
register, and those say so rather than failing you for not having one.

The verdicts mean different things and each one has a different next step.

| verdict | meaning | what you do |
|---|---|---|
| `pass` | asserted green here | nothing |
| `fail` | asserted red here | this is a fixture. It names one check |
| `shape_only` | shape holds on the stub, truth needs the live provider | re-runs when you switch provider |
| `with_us` | cannot be proved here | the step the standard says not to hand-roll |
| `evidence_required` | not a software check | go and do it, then attach what proves it |

A `fail` is the useful one. It names a single check, carries what went in and
what your build did, and is enough to act on without anybody reconstructing your
business.

## The one rule that makes it work

**Everything your build does to the outside world goes through the ports.** The
runner owns the world your build writes into, so a build that calls a vendor SDK
directly leaves that world empty and the run reports `no write observed through
the port` rather than quietly passing. That is not pedantry: it is the only way a
result means anything.

```ts
import { StubWorld, runStandard, fetchChecks } from "@aipathway/conformance";

const std = await fetchChecks("booked-after-hours-build-standard");

// Your build takes the ports and does the job. Nothing else.
const build = (p) => {
  p.disclose("This is an AI assistant and the call is being recorded.");
  const said = p.hear() ?? "";
  const addr = p.resolveAddress(said);
  if (!addr?.inArea) return;
  const open = p.findOpenJob("+61400000001");
  if (open) return void p.updateJob(open.id, "intent-1");
  const job = p.writeJob({ phone: "+61400000001", address: addr.resolved, type: "emergency" }, "intent-1");
  if (job) p.notify("on-call", job.id, "emergency");
};
```

You supply a scenario per check: the world it starts in, how to drive your build,
and what "held" means. The check tells you what to inject and what to assert; the
scenario is the few lines that connect that to your code.

## The checks are not in this package

They are fetched from the site, so a standard corrected on Tuesday does not need
a release here, and you cannot end up conformant against a stale copy. The
package is the harness. The site is the standard.

## The standards

Eleven, each one a job that leaks money in an Australian small business. Every one
publishes its checks as data at the same `/checks.json` path.

| Standard | The job |
|---|---|
| [booked-after-hours](https://aipathway.com.au/explore-ai/booked-after-hours-build-standard) | The phone answered out of hours, the job written once |
| [debtor-chasing](https://aipathway.com.au/explore-ai/debtor-chasing-build-standard) | Overdue invoices chased against a live ledger |
| [rent-arrears](https://aipathway.com.au/explore-ai/rent-arrears-build-standard) | Arrears worked without breaching a tenancy rule |
| [database-reactivation](https://aipathway.com.au/explore-ai/database-reactivation-build-standard) | A dormant contact list worked properly |
| [invoice-check](https://aipathway.com.au/explore-ai/invoice-check-build-standard) | Subcontractor invoices matched before they are paid |
| [rejected-pack](https://aipathway.com.au/explore-ai/rejected-pack-build-standard) | Paperwork that fails after the work is done |
| [compliance-calendar](https://aipathway.com.au/explore-ai/compliance-calendar-build-standard) | Obligations that fall due on somebody else's schedule |
| [cited-answer](https://aipathway.com.au/explore-ai/cited-answer-build-standard) | Answers that carry their source and stop when it moves |
| [multi-site-conformance](https://aipathway.com.au/explore-ai/multi-site-conformance-build-standard) | Branches that have quietly diverged |
| [fire-service-pack](https://aipathway.com.au/explore-ai/fire-service-pack-standard) | Service evidence bound to the right asset |
| [quote-out](https://aipathway.com.au/explore-ai/quote-out-build-standard) | A job that exists turned into a draft quote, priced only from the book |

## Also available

- **The standards themselves**: [aipathway.com.au/explore-ai](https://aipathway.com.au/explore-ai),
  free under CC BY 4.0, with a Markdown twin at `.md` on any URL.
- **As Agent Skills**: [github.com/digitalgym/aipathway-standards](https://github.com/digitalgym/aipathway-standards),
  installable with `/plugin marketplace add digitalgym/aipathway-standards`.
- **This package's source**: [packages/conformance](https://github.com/digitalgym/aipathway-standards/tree/main/packages/conformance)
  in the same repo. It is generated from the standards rather than hand-written,
  so corrections go to the standard and the package follows.
- **For agents**: [AGENTS.md](https://aipathway.com.au/AGENTS.md),
  [llms.txt](https://aipathway.com.au/llms.txt),
  [llms-full.txt](https://aipathway.com.au/llms-full.txt).

## Who publishes this

[AI Pathway](https://aipathway.com.au), Brisbane. We publish the standards free
and sell the one step in each that should not be hand-rolled, which is usually
the part carrying an Australian legal obligation a machine cannot hold: a live
number with AI disclosure, Do Not Call Register checks, calling hours by state,
and a record that survives a dispute.

If a check will not come good, [send the failing run](https://aipathway.com.au/explore-ai)
from the foot of that standard's page. It names one check, so it gets a fixed
price rather than a discovery call.

## Licence

CC BY 4.0. The standards are free to implement, free to fork, and free to build a
competing product against. If a check is wrong, say so: the fastest way is to run
it and send what came out.
