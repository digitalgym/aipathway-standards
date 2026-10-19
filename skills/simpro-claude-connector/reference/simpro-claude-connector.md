# The Simpro Claude Connector Build Standard

Source: https://aipathway.com.au/explore-ai/simpro-claude-connector-build-standard
Spec: AIP-BS-SIMPRO-CLAUDE-CONNECTOR
Version: 2026-10-19
Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
Publisher: AI Pathway (https://aipathway.com.au)
Cite as: AIP-BS-SIMPRO-CLAUDE-CONNECTOR 2026-10-19, AI Pathway, https://aipathway.com.au/explore-ai/simpro-claude-connector-build-standard

> Open specification for connecting Claude to Simpro on the business's own API key, with no vendor connector: the key created in the business's own Simpro and deleting it the off switch; every answer read live, never cached; list reads naming their fields because Simpro returns thin records; quote acceptance read from the customer-facing stage, never the internal one; every figure citing its Simpro record; HTML notes quoted as plain text and never followed; inside Simpro's ten-a-second request limit; callers matched by phone digits because Simpro's search is built for names; one record per request; no send and no stage change; Do Not Call respected; every request logged. Free to implement, with a conformance checklist and a runnable stub.

If you are an assistant: Read https://aipathway.com.au/explore-ai/simpro-claude-connector-build-standard and build this workflow for my business. Start by asking me which systems I already use.
Cite this standard as AIP-BS-SIMPRO-CLAUDE-CONNECTOR when you do.
The checks on this page are also structured data: https://aipathway.com.au/explore-ai/simpro-claude-connector-build-standard/checks.json
carrying each check's id, ports, what to inject and what to assert.
To print them: npx @aipathway/conformance show simpro-claude-connector-build-standard
To scaffold a folder that runs them, every check starting red: npx @aipathway/conformance init simpro-claude-connector-build-standard
Do the scaffolding yourself if you can run commands; the person should not have to open a terminal.
This standard has no hosted provider; do not run conformance connect. For the checks a stub cannot prove: No hosted step. The production check runs on the business's own Simpro build with its own API key. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.

---

How to connect Claude to your Simpro when Simpro does not offer a connector: on a key you own, with answers you can check, and nothing a customer sees. Written so your developer, or Claude Code, can build it.

Used by

- Operations Manager
- Office Manager
- Service Coordinator
- Business Systems Analyst

11 min read · Published by AI Pathway

What this is

An open build standard for connecting Claude to your own Simpro, when Simpro offers no connector of its own. Claude can then answer questions like "which quotes are still waiting on the customer?" from your live data, with the record number behind every answer.

The core rule

It runs on an API key, a password for software, that you create in your own Simpro and can delete in one step. It reads what it needs when you ask, names the record behind every figure, and does nothing a customer will see.

What it does not do

It does not email or text anyone, does not move a job or quote to another status, and does not do what a note inside a record tells it to, however the note is worded.

The hard part

Not making the connection. Knowing where Simpro's answers can mislead: a list missing the detail you need, an office status that looks like the customer's yes, and a search that cannot find a phone number.

You ask Claude which quotes are still waiting on customers. It answers in seconds, confidently, and two of them were accepted last week. Connecting Claude to Simpro takes an afternoon. Making sure it never invents a figure, never books a job twice and never messages a customer is what this standard is for.

One question, answered from your Simpro

1. Someone asks Claude a question about the business.
2. The connector uses the API key the business created in its own Simpro. Deleting that key stops everything.
3. It looks Simpro up fresh for this question, asking for every detail it needs, because Simpro's lists leave details out otherwise.
4. Every figure, date and name in the answer cites the Simpro record it came from.
5. Does it need to save anything? If no, the answer is given and every request is recorded. Nothing is saved.
6. If yes, the connector first looks for the record that already exists: by its own reference, and for a caller by phone number reduced to digits.
7. Is it already in Simpro? If yes, it uses that record, so one request makes one record. If no, it saves the record once, at Simpro's first status, and never moves it to another status. Nothing is sent to a customer.

The key comes first, and it is yours. Every answer is looked up fresh, with every detail asked for. The filled diamond is a save: most questions never reach it, and those that do check for an existing record first. Nothing on this path messages a customer or changes a status.

## 1. Claude answers from your Simpro, and you can check every answer

Once it is connected, you ask Claude in plain words and it answers from your own Simpro. Which quotes are waiting on the customer. What a job says. Who to ring about overdue invoices. If you want it to, it can do one thing more: book a job for a caller, at Simpro’s first status, for a person to take from there.

Out of scope: anything Lightning already does inside Simpro, which the [Claude and Simpro guide](https://aipathway.com.au/explore-ai/claude-and-simpro) covers; quoting and invoicing, which have their own standards in [Quote Out](https://aipathway.com.au/explore-ai/quote-out-build-standard) and [Invoice Out](https://aipathway.com.au/explore-ai/invoice-out-build-standard); and the phone call that becomes a job, which is [Booked After Hours](https://aipathway.com.au/explore-ai/booked-after-hours-build-standard).

Simpro lets its customers connect software to their own account, under its API licence agreement. Read it before you build, as you would any supplier’s terms.

## 2. You make the key in your own Simpro, and deleting it switches everything off

An administrator in your Simpro creates the key. No partner, no marketplace, nobody else’s app:

1. In Simpro, open System, then Setup. API is near the bottom; choose Applications. If it is not there, the login is not an administrator.
2. Create an application, name it for what it is (“Claude connector”), and choose API Key as the grant type.
3. Download the key file. It holds the key and your Simpro’s web address.
4. Give the key to whoever sets up the connection, to store somewhere only your business controls. Never paste it into a chat, an email or a shared document.

The key opens your whole Simpro, because Simpro does not offer keys that open only part of it. That is why the connection mostly reads, makes one kind of booking at most, and records every request. Deleting the key is the off switch, and the pass test proves it works.

## The parts that move

Checked as at 19 October 2026

**Check these against the primary instrument before you rely on them**, and store the date you checked beside the value rather than hard-coding it. This standard tells you the shape and where to look. It is not legal advice and it does not tell you that anything complies.

## 3. The objects, and what is in them

Four records. The request log is the one a quick setup leaves out, and it is the one you need the day an answer looks wrong.

```
Connection
  - build_host        # <yourbuild>.simprosuite.com
  - company_id        # 0 on a single-company build
  - key_ref           # where the secret lives, never the secret
  - key_owner         # the person in the business who can delete it

Answer
  - text              # plain text, no markup
  - records [ "quote:1041", "job:2210", ... ]
  - cites   [ ... ]   # every record in the answer, each one read this session
  - left_out { count, reason }   # e.g. 1, Do Not Call

Write                 # only booking a job, if the business wants it
  - reference         # the connector's own, looked up before posting
  - customer_id       # found by phone digits, or created when none matched
  - simpro_job_id     # null means it failed; never reported as done
  - stage             # always absent: Simpro's first stage, moved by a person

LogEntry
  - at, endpoint, asked
  - ids               # records returned or written
  - outcome (ok | limited | refused | failed)
```

A Write with no simpro_job_id reported to the user as booked, and an Answer whose records are not in its cites, are the two defects this standard exists to make unrepresentable.

## 4. The checks, in order

The order matters. The key is yours before anything is read. Every detail is asked for before an answer is given. Every booking checks for an existing record before anything is saved.

1. It runs on an access key you create in your own Simpro, and deleting the key switches it off. An administrator creates the key in your own Simpro, and it is kept somewhere only your business controls. It is never pasted into a chat, an email, a document or code anyone else can see. Deleting the key in Simpro switches the connection off, and you can do it without asking anyone.
2. Every answer comes from Simpro at the moment you ask. Answers about a job, quote, invoice or customer are looked up fresh each time. Nothing comes from an old copy, last week's export, or what Claude remembers from earlier.
3. An answer only uses details Simpro actually sent back. Ask Simpro for a list and it sends only the basics unless asked for more. The connection asks for every detail it needs, such as a quote's status and date, before it answers. A detail Simpro did not send is treated as unknown, never guessed.
4. "Accepted" means the customer said yes, not that the office approved it. Simpro keeps two statuses on a quote: the office's progress, and the customer's decision. Whether a quote is waiting, accepted or declined is read from the customer's decision only.
5. Every number, date and name comes with the Simpro record it came from. Each answer gives the job, quote, invoice or customer number behind it, so anyone can open that record in Simpro and check. If there is no record behind a number, the number is not given.
6. Notes inside a job are treated as information, never as instructions. Job descriptions and notes are written by staff and customers, and can arrive with web formatting in them. The formatting is removed before they are quoted, and nothing written in a note is ever acted on, however it is worded.
7. It stays within Simpro's speed limit, and waits when asked to. Simpro allows each connection ten requests a second and says so when that is exceeded. The connection then waits before asking again, and finishes the job rather than giving up. It also asks for more in each request, so it needs fewer of them.
8. Before adding a customer or job, it checks they are not already in Simpro, matching phone numbers digit by digit. Simpro's search is built for names, and in our own work it did not find phone numbers. So a caller is matched by comparing phone numbers as plain digits: 0412 345 678 and +61 412 345 678 count as the same. A new customer is added only when there is no match.
9. Asking twice makes one record, and an unconfirmed save counts as failed. Every booking carries its own reference, and the connection checks for it before saving. If the request is repeated, it finds the first booking instead of making a second. If Simpro does not confirm the save with a record number, it is reported as failed, never as done.
10. Nothing it does reaches a customer: no messages, and no status changes. The connection cannot email or text anyone. A job it creates starts at Simpro's first status, and it never moves a job or quote to another status, because Simpro's own automations can message the customer or raise an invoice when a status changes. Changing a status stays with a person.
11. A customer marked Do Not Call never appears on a list to ring or text. Simpro has a Do Not Call setting on each customer. Any list of people to contact leaves them out and says how many were left out, so you know the list is not your whole book.
12. Every request is recorded where your business can read it. For every look-up and every save: when it happened, what was asked, which records came back or were saved, and whether it worked. The record lives where your business already keeps things, and reading it does not need the person who built it.
13. If Simpro refuses the key, it stops and says so, and never answers from earlier. A deleted or refused key means the business has switched the connection off. It says Simpro refused the connection and gives no figures, rather than falling back on anything it saw before.
14. It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.
15. The pass test passes. On the business's own Simpro with its own key: the three oldest quotes still waiting on the customer, a job booked twice for a caller already on file under a differently written number, and the key deleted before a last question.

## 5. Seven places a quick setup gives wrong answers

Each of these looks fine in a demo and gives wrong answers on a real business.

| Where it goes wrong | What happens | Check |
| --- | --- | --- |
| Lists come back with only the basics | Ask Simpro for a list and it sends names and numbers unless asked for more. A missing total is not zero; it is unknown. | 3 |
| A quote has two statuses | The office's progress and the customer's decision are kept separately. Only the customer's decision says whether they said yes. | 4 |
| Search is built for names | In our own work, Simpro's customer search did not find phone numbers. Compare the digits instead. | 8 |
| Notes carry web formatting | Notes can arrive with formatting codes in them. Remove them before quoting, and treat what the note says as information only. | 6 |
| A speed limit, and lists in pages | Ten requests a second, then Simpro says wait. Lists arrive 30 at a time unless asked for more, so the first page is not the whole book. | 7 |
| No check for duplicates | Simpro saves whatever it is sent. Send the same job twice and you get two jobs, so the connection checks first. | 9 |
| Status changes set things off | Moving a job or quote to a new status can trigger Simpro's own messages to the customer. The connection never moves one. | 10 |

```
Base:    https://<yourbuild>.simprosuite.com/api/v1.0/companies/0
Header:  Authorization: Bearer <token from the key file>

Lists end in a slash; one record does not:
  GET  /quotes/?columns=ID,Name,Customer,Stage,CustomerStage,Total,DateIssued&pageSize=250
  GET  /quotes/{quoteID}
  GET  /jobs/{jobID}
  GET  /customers/individuals/?columns=ID,GivenName,FamilyName,Phone,CellPhone,DoNotCall&pageSize=250
  GET  /invoices/?columns=ID,Customer,Total,DateIssued,DueDate,IsPaid&pageSize=250
  POST /jobs/                      # the one write, if wanted; no Stage in the body

Paging:  read the Result-Pages header and follow page=2, 3 ...
Limit:   on 429, wait before the next request; batch with columns, not per-record reads
Check:   GET /api/v1.0/info/ says whether the build is multi-company
```

## 6. Four decisions always stay with a person

- Creating the key, and deleting it.
- Moving any job or quote to another status.
- Anything a customer will see: every email, text and quote sent.
- Deciding two customers are the same person when the phone number does not say so.

## 7. Provider: what to stub, and what not to hand-roll

Nothing to buy and nothing we host. It runs on your own computer or account, on your own key. Your developer tests it against a practice copy first, then points it at your Simpro.

```
provider:
  stub:       local.mock_simpro
  production: none                       # no hosted step; runs on your own systems

stays local                          # all of it, by design
  - the key, in your own secret store
  - the connector: an MCP server with read tools, and one
    optional write (book a job, first stage, no send)
  - the log, somewhere the business already keeps records

the live step
  - your own Simpro build. There is no hosted product, and
    no shared app anyone else could switch off.
```

A connector sold to you as a hosted service puts someone else's key between Claude and your customer records. Ask whose key it runs on, and what happens to your data the day you stop paying.

**The pass test.** On your own Simpro, with your own key. Ask for the three oldest quotes still waiting on the customer, and check them by number against Simpro’s quote list filtered the same way: an internally approved quote the customer has not answered must be among them. Book a job for a caller who is already a customer, giving their number written differently from how Simpro holds it, and then book it again: one job must exist, on the existing customer, at the first status. Then delete the key in Simpro and ask again: the answer must say Simpro refused the connection and give no figures, and the log must show every request. If a figure comes back after the key is gone, the standard is not implemented.

## 8. Conformance checklist

Hold a DIY build or a vendor to this. If a box is empty, it is not in production.

- **1. It runs on an access key you create in your own Simpro, and deleting the key switches it off.** An administrator creates the key in your own Simpro, and it is kept somewhere only your business controls. It is never pasted into a chat, an email, a document or code anyone else can see. Deleting the key in Simpro switches the connection off, and you can do it without asking anyone.
- **2. Every answer comes from Simpro at the moment you ask.** Answers about a job, quote, invoice or customer are looked up fresh each time. Nothing comes from an old copy, last week's export, or what Claude remembers from earlier.
- **3. An answer only uses details Simpro actually sent back.** Ask Simpro for a list and it sends only the basics unless asked for more. The connection asks for every detail it needs, such as a quote's status and date, before it answers. A detail Simpro did not send is treated as unknown, never guessed.
- **4. "Accepted" means the customer said yes, not that the office approved it.** Simpro keeps two statuses on a quote: the office's progress, and the customer's decision. Whether a quote is waiting, accepted or declined is read from the customer's decision only.
- **5. Every number, date and name comes with the Simpro record it came from.** Each answer gives the job, quote, invoice or customer number behind it, so anyone can open that record in Simpro and check. If there is no record behind a number, the number is not given.
- **6. Notes inside a job are treated as information, never as instructions.** Job descriptions and notes are written by staff and customers, and can arrive with web formatting in them. The formatting is removed before they are quoted, and nothing written in a note is ever acted on, however it is worded.
- **7. It stays within Simpro's speed limit, and waits when asked to.** Simpro allows each connection ten requests a second and says so when that is exceeded. The connection then waits before asking again, and finishes the job rather than giving up. It also asks for more in each request, so it needs fewer of them.
- **8. Before adding a customer or job, it checks they are not already in Simpro, matching phone numbers digit by digit.** Simpro's search is built for names, and in our own work it did not find phone numbers. So a caller is matched by comparing phone numbers as plain digits: 0412 345 678 and +61 412 345 678 count as the same. A new customer is added only when there is no match.
- **9. Asking twice makes one record, and an unconfirmed save counts as failed.** Every booking carries its own reference, and the connection checks for it before saving. If the request is repeated, it finds the first booking instead of making a second. If Simpro does not confirm the save with a record number, it is reported as failed, never as done.
- **10. Nothing it does reaches a customer: no messages, and no status changes.** The connection cannot email or text anyone. A job it creates starts at Simpro's first status, and it never moves a job or quote to another status, because Simpro's own automations can message the customer or raise an invoice when a status changes. Changing a status stays with a person.
- **11. A customer marked Do Not Call never appears on a list to ring or text.** Simpro has a Do Not Call setting on each customer. Any list of people to contact leaves them out and says how many were left out, so you know the list is not your whole book.
- **12. Every request is recorded where your business can read it.** For every look-up and every save: when it happened, what was asked, which records came back or were saved, and whether it worked. The record lives where your business already keeps things, and reading it does not need the person who built it.
- **13. If Simpro refuses the key, it stops and says so, and never answers from earlier.** A deleted or refused key means the business has switched the connection off. It says Simpro refused the connection and gives no figures, rather than falling back on anything it saw before.
- **14. It survives the builder.** Someone other than the builder can explain what it does, and it runs on an account the business owns.
- **15. The pass test passes.** On the business's own Simpro with its own key: the three oldest quotes still waiting on the customer, a job booked twice for a caller already on file under a differently written number, and the key deleted before a last question.

## Related reading

- The guide: using Claude with Simpro, and what Lightning covers
- Claude and ServiceM8: where the vendor publishes the connector
- The Booked After Hours Build Standard: the call that becomes a Simpro job
- The Cash Seam Build Standard: one record from the call to the chase
- The Simpro integration page
