# AIP-BS-UNCODED-QUERY: uncoded-query-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/uncoded-query-build-standard (edition 2026-11-12)
**Markdown:** https://aipathway.com.au/explore-ai/uncoded-query-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/uncoded-query-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Thirteen of these fifteen checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one is quoted as a scoped build. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **lines-from-the-ledger** Only lines the ledger still shows as uncoded are asked about. The lines come from the client's ledger at the time of the run: transactions parked on a suspense or uncategorised account, and bank lines not yet reconciled. A line coded by hand since the last run is not asked about.
- **one-list-per-client-per-cycle** One question list per client per cycle, with every open line in it. Each client gets one list a cycle, grouping all of that client's uncoded lines. A second run in the same cycle sends no second list, and a line that lands mid-cycle waits for the next list rather than starting another one.
- **plain-question-per-line** Each line is one plain question with a place to answer it. A line is put to the client as the amount, who it went to or came from as the statement printed it, and the date, then "what was it for?" Every list carries a link where each line can be answered on its own.
- **no-tax-advice** No tax advice and no bookkeeping words reach the client. Nothing sent to a client says whether something is deductible or claimable, names a tax code or an account code, or mentions suspense or reconciling. The client is asked what a payment was for; what that means for tax is the practice's call.
- **never-ask-twice** A line already answered is never asked about again. Once the client has answered a line, it leaves every reminder, and next cycle's list does not carry it even while the coding waits for approval and the ledger still shows it as uncoded.
- **reminders-then-a-person** Reminders on the schedule the practice set, then a person. Reminders go only for unanswered lines, no sooner than the interval the practice set and no more than the number it set. After the last one goes unanswered, the client's open lines go to a person, who decides whether to ring. The build places no call.
- **answer-kept-as-written** The client's answer is kept word for word, with who and when. Each answer is recorded against its line exactly as the client typed it, with who answered and when, before anything is proposed from it.
- **proposal-from-chart-and-history** The proposed coding comes from the client's own chart, and their own history first. Every proposal is an account and a tax code from this client's chart. Where this client has coded the same payee before, that coding is proposed; otherwise the answer is matched to the client's own accounts. The chart is read in the run before any proposal.
- **never-invents-an-account** No account or tax code the client's chart lacks is ever proposed or written. When an answer fits no account in the client's chart, the line goes to a person as no_account_fits with the answer, and nothing is proposed. The build never creates an account, never borrows one from another client and never makes up a tax code.
- **approved-before-written** Nothing is written until a named person approves that exact coding. A proposal is not a write. The build writes a coding only when a person has approved it, by name, for that line, and it writes exactly the account and tax code they approved.
- **never-reconciles** The build never reconciles a bank line; a person does. The build changes the coding of a transaction already in the ledger: by editing it, or by a journal off the suspense account where the ledger will not take the edit. A bank line the ledger has not reconciled gets its question, its proposal and its approval, and then goes to a person with the approved coding to reconcile. The build never matches, creates a transaction for, or reconciles a bank line.
- **written-once** An approved coding is written once, however often the build runs. Every write carries one key for that line and that approval, so a retry after a timeout cannot write twice. A later run reads the ledger first and writes nothing for a line that already holds its approved coding.
- **read-back-and-record** Every write is read back, and a mismatch goes to a person. After a write, the build reads the line back from the ledger and records what the ledger now holds against the approval. If it differs from what was approved, the line goes to a person as readback_mismatch and is not written again.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; the live step is quoted as a scoped build.

When a check is `with_us`: No hosted product writes a coding. The approval-gated, keyed write into the client's own ledger is built against that ledger's API, quoted as a scoped build. No follow-up call is offered: Office Voice has no lawful basis for one here, so the call stays with the person. Send the failing check id for a fixed price; do not build the live step yourself.
