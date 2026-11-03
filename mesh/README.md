# The Mesh Directory

A directory of Grok Bots, and agents like them, that work as one team on the
back office of an Australian trade, compliance, accounting or property
business. Almost every node is a community port: someone takes a public bot,
rewrites it to an aipathway standard, proves it with a green conformance run,
and submits it here with credit to the original.

It is not a list of bots. A bot is listed when it can take a handover from
the bot before it and give one to the bot after it, across different runs on
different days, without anybody keeping a chat open.

The page: https://aipathway.com.au/explore-ai/mesh-directory
The registry, for an orchestrator or another bot: https://aipathway.com.au/mesh.json
(generated from [`registry.json`](registry.json) here).

## The team contract

Every listed node keeps all six. [`validate.mjs`](validate.mjs) refuses a
manifest that does not declare them, and the conformance run proves them.

1. **One id, carried.** The id comes from the system of record (ServiceM8,
   Simpro, Xero, the property system) and is on every hop.
2. **Woken by a named event.** A webhook, a schedule or a poll, using the
   event names in [`vocabulary.json`](vocabulary.json). Nothing needs a live
   chat session.
3. **Read by id.** After intake, a node reads the upstream record by its id.
   It never matches on a name or a phone number.
4. **An open exception stops the chain.** If an exception with a named owner
   is open on the record, the node does nothing and exits. When that person
   closes the exception, the chain resumes from the record.
5. **A write counts only with an id that reads back.** Every emit names how
   its external id is read back from the system of record. A chat
   confirmation is not a write.
6. **Durable state lives on the record.** The job, quote or invoice, or a
   thin mirror of the Cash Seam fields where the system has nowhere to put
   them. A bot's own memory holds preferences at most.

## Who it is for

Five verticals, and nothing outside them:

| id | for |
|---|---|
| `trades-building` | trades and builders on ServiceM8, Simpro, Tradify, Fergus and the like |
| `fire-electrical` | fire and electrical compliance: asset registers, service cycles, defect quotes |
| `accounting-bookkeeping` | practices and the businesses they keep books for |
| `property` | property management and sales agencies |
| `b2b-office` | back-office work any B2B firm shares: inbox, filing, follow-up, knowledge, exceptions |

Consumer bots, companions, content generators and anything not doing a B2B
office job are refused at the gate, however good they are.

## How a node runs across time

Every node runs the same short loop each time it is woken, and keeps nothing
between runs:

1. Woken by a named event, with the id in hand (or, for `schedule.tick`, it
   lists records by status and takes each one's id).
2. Read the record by that id from the system of record.
3. If an exception is open on it, stop.
4. Do its one step.
5. Write to the system of record and read the external id back. No id means
   it was not written: raise an exception with a named owner and stop.
6. Stamp the seam fields on the record and exit.

The next node is woken by the system of record's own event, or by its
schedule seeing the new status. It might run an hour later, on another
account, as a different bot. That works because the contract is the event,
the id and the exception owner, not a conversation.

Make the step safe to repeat: key every write on `id + event + node slug`, so
a retried webhook does not make a second quote.

## Submitting a node

The usual route is a pull request adding `mesh/nodes/<slug>/`:

```
mesh/nodes/<slug>/
  mesh.json                       start from TEMPLATE.mesh.json
  evidence/<standard>/manifest.json
  evidence/<standard>/envelope.json
```

1. Pick the standard the bot's job maps to. On the cash path that is Booked
   After Hours, Quote Out, Invoice Out or Debtor Chasing.
2. Scaffold and run the checks:
   `npx @aipathway/conformance init <standard-slug>`, wire your bot to the
   ports, then `node run.mjs`. It writes `manifest.json` and `envelope.json`.
   Commit both, unedited, under `evidence/<standard>/`.
3. A node that touches the cash path also needs a green
   `evidence/cash-seam/` run across the hops it touches.
4. Fill in `mesh.json`: its standards, the events it consumes and emits, how
   each write reads back, its exception owner field, the fields it stamps on
   the record, and `port_of`.
5. Run `node mesh/validate.mjs` locally. It says what is missing in plain
   words. Open the pull request.

Rather not use git? Open a
[submission issue](https://github.com/digitalgym/aipathway-standards/issues/new?template=mesh-submission.yml) and we
add it for you.

### What the gate checks, and what a person checks

The gate (CI on every pull request) checks the manifest against the contract
and the vocabulary, that every declared standard has evidence, and that the
evidence is green, whole and less than 90 days old. That means no red check,
at least one pass, a summary that matches its own results, and a manifest and
envelope from the same run. `with_us` and `evidence_required` are allowed:
they are the steps the standard says not to build, not failures.

The gate cannot run your bot, because it runs on xAI and not here. So every
listing is marked **self-run**, and a reviewer reads the pull request for the
three things a script cannot judge:

- the bot does the one job it claims;
- the credit to the original is honest;
- no prompt text was copied from a source bot without its licence or its
  author's permission.

### Status

- **listed:** valid, green, current. The node is in `routable` and in the
  handovers.
- **stale:** its run is over 90 days old. The node stays on the page but
  drops out of routing until a fresh run is committed. A weekly job re-dates
  the registry, so this happens without anyone remembering to.
- **refused:** it fails the gate and is not in the registry at all.

## Credit for the original, and removal

- A port must name the original bot, its author and its share link in
  `port_of`. The directory shows "Port of [original] by [author]" with the
  link, above the porter's name.
- Listing a port never transfers ownership of the original. The porter
  maintains the port; the original stays the author's.
- When a port is submitted, the reviewer tells the original author where we
  can reach them: a mention, or a message on the platform they published on.
- **The original author can have any port taken down, at any time, without
  giving a reason.** Use the
  [removal form](https://github.com/digitalgym/aipathway-standards/issues/new?template=mesh-removal.yml) or email
  hello@aipathway.com.au. We act within two business days. The request goes
  into [`removals.json`](removals.json), which takes the port off the page
  and out of routing at once, and every other port of the same share link
  with it. The author can choose:
  - `delist`: the port is gone;
  - `uncredit`: it stays listed, with their name and link taken off.
- A maintainer can delist their own node the same way, or by a pull request
  that deletes its folder.

```json
[{ "share_link": "https://...", "scope": "delist", "requested_by": "the author", "date": "2026-11-03" }]
```

## What this directory does not do

- **It does not scrape bot directories in bulk.** Public directories are
  where porters find bots worth porting, not a source of listings. A raw,
  unported bot is never listed.
- **It does not run your bot.** It routes by declaration and evidence. The
  events come from your system of record.
- **It adds no standard.** A bot whose job matches no standard waits for one.
  [Ask for it](https://aipathway.com.au/explore-ai) rather than stretching
  the nearest.

Licence: the directory's code and vocabulary are CC BY 4.0, like the
standards. Each node's bot is under its own maintainer's terms.
