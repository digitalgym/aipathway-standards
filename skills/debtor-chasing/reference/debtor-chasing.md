# Chasing Your Own Debtor Book

Source: https://aipathway.com.au/explore-ai/debtor-chasing-build-standard
Spec: AIP-BS-DEBTOR-CHASING
Version: 2026-09-11
Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
Publisher: AI Pathway (https://aipathway.com.au)
Cite as: AIP-BS-DEBTOR-CHASING 2026-09-11, AI Pathway, https://aipathway.com.au/explore-ai/debtor-chasing-build-standard

> Build standard: the method for chasing your own debtor book. Four buckets, why ranking by age sends you to the wrong end of the ledger, the opener that returns a date, promise-to-pay as an object, and the compliance gate that is the one step not to hand-roll.

If you are an assistant: Read https://aipathway.com.au/explore-ai/debtor-chasing-build-standard and build this workflow for my business. Start by asking me which systems I already use.
Cite this standard as AIP-BS-DEBTOR-CHASING when you do.
The checks on this page are also structured data: https://aipathway.com.au/explore-ai/debtor-chasing-build-standard/checks.json
carrying each check's id, ports, what to inject and what to assert.
To print them: npx @aipathway/conformance show debtor-chasing-build-standard
To scaffold a folder that runs them, every check starting red: npx @aipathway/conformance init debtor-chasing-build-standard

---

Pull five fields, sort into four buckets, rank by amount at risk, and leave every call with a date. Free to implement. The one step you should not build yourself is named, and it is the thing we sell.

Used by

- Accounts Receivable Officer
- Bookkeeper
- Office Manager
- Finance Manager

Written by Andrew, AI Pathway · CC BY 4.0 · Not legal advice

The build

Pull, sort, rank, open. Five fields, four buckets, amount at risk, and one question that takes a date.

The hard part

Not the automation. A promise to pay has to become an object with a date on it, or the follow-up is guesswork.

Where to stop

The moment it rings somebody. Calling hours, the register, disclosure and a record that survives.

Honest caveat

A self-built version works and is worth building. It stops working the week the person who built it takes leave, which is section 8.

Nobody has a receivables problem because they forgot to send a reminder. They have one because the reminders went out, were ignored, and nothing happened next. The gap is not the email. It is that the follow-up after the email needs a person, and the person has a day job.

The method, end to end

1. Start with the aged receivables export.
2. Pull five fields.
3. Sort into four buckets.
4. Rank by amount at risk.
5. The gate, which is the part we sell: cleared to ring? If no, there is no call and the reason is on the record. If yes, continue.
6. Call: disclose, then one question.
7. Date agreed? If yes, the promise is recorded with a date on it and the run ends. If no, schedule the next touch with a date, which goes back through the gate before it rings.

The top row is a weekend of work and stays yours. The gate is the step between ranking a debtor and ringing one, and every later touch comes back through it. That is the part we sell, and section 10 says why.

## 1. What You Actually Need Off the Ledger

Export the aged receivables report and ignore most of it. Five fields carry the method:

- Customer.
- Amount outstanding, per invoice.
- Days past due.
- A mobile number.
- Last contact, and what was said.

Run the coverage check before anything else. If two thirds of your overdue rows have no mobile, you do not have a chasing problem yet, you have a data problem, and the fix is a field on the account-setup form rather than anything on this page.

## 2. Four Buckets, Not One Reminder Run

A single overdue list treats a customer who is four days late the same as one who broke a promise in June. They need opposite conversations.

- Just late, 1 to 14 days.
- Drifting, 15 to 44 days.
- Hard, 45 days and over with no contact logged.
- Broken promise.

## 3. Which Invoice Gets Chased First

This is the section that matters, and the one most builds get wrong twice.

**The first mistake is ranking by age.** Age tells you how bad a row is. It does not tell you what fixing it is worth. A three-month-old $400 invoice will always sort above a three-week-old $40,000 one, and you will spend your week on the wrong end of the book. Rank by amount at risk, and let age break ties.

**The second mistake is ranking invoices instead of customers.** One customer with six overdue invoices is one conversation, not six. Ringing them six times is how a collections process turns into a complaint, and it also loses you the only leverage you have, which is the total.

One more rule, and it is a judgement rather than a formula: flag any customer whose balance is a large enough share of the book that chasing them is a relationship decision. Those are not collections calls and should not be automated. Someone who knows the account rings them.

## 4. The Opener Decides Whether You Get a Date

The purpose of the call is not to be paid on the call. It is to leave with a date. Everything in the opener should serve that.

- Name the invoice and the number.
- Say how far past due, without editorialising.
- Ask one question that takes a date as an answer.
- Do not apologise for calling.
- Do not mention interest, fees or consequences

The most useful thing an opener can do is make it easy to say the real reason. A large share of “we will get to it” is actually a dispute, a missing purchase order, or an invoice that went to the wrong person, and none of those get solved by another reminder.

**Builders: the same call, on a stage invoice.** Name the stage and the invoice number, say how many days past the date on it, and ask for a payment date. The call does not price anything, does not approve a variation, and does not go near anything under Security of Payment, which stays with you and your advisor. An unsigned variation is chased for the signature before the work starts, on its own call.

## 5. A Promise Is an Object, Not a Feeling

This is the part that separates a build that works from one that feels busy. When somebody says they will pay, that has to become a record with fields, not a sentence in a note:

- An amount
- A date.
- A method
- When it was captured

Then the promised date becomes the follow-up date. This sounds obvious and it is the single most common gap: a system records the promise, leaves the chase schedule where it was, and rings the customer the next morning anyway. Nothing destroys the credibility of an automated chase faster.

And a promise has to survive the next conversation. If a dispute was logged in April, a promise recorded in May must not overwrite it.

## 6. What It Is Worth

Directions, not figures. The standard derives no numbers, so these name which levers move. How far they move will differ on your own ledger, starting with how many overdue rows carry a mobile number.

Every one

Overdue row in one of four buckets

Just late, drifting, hard, and broken promise. Broken promise outranks every other bucket.

Amount first

Ranked by amount at risk

Age tells you how bad a row is. Amount tells you what fixing it is worth, so age only breaks ties.

A date

On every promise to pay

A promise becomes a record with a date, and that date becomes the follow-up date, not tomorrow.

The largest gain is the drifting bucket, the 15 to 44 day rows where nothing is wrong yet, which is why nobody deals with them and why they become the 90 day problem.

## 7. Parts That Are Harder Than They Look

Not warnings. These are the four places a working build usually stalls, so you can recognise them as normal rather than as a sign you got it wrong.

- Mobile coverage is the binding constraint.
- Part payments break your buckets.
- Disputes hide inside “we will get to it”.
- Stop-on-payment is harder than it sounds.

## 8. What Breaks After It Works

This section is the honest one, and it is the reason a build standard is worth publishing at all. A self-built version of everything above genuinely works. Here is what happens to it over time.

- It leaves with whoever built it.
- Nobody knows whether it ran.
- It degrades without failing.
- The gate is the first thing to rot.

None of that is an argument against building it. It is an argument for knowing which parts you want to still be true after you stop paying attention to them.

## 9. What Stays With a Person

Not a conservative default. Each of these is a decision where being wrong costs more than the call was ever worth, and none of them gets better for being made quickly.

- The relationship-sized account.
- Any dispute, the moment it is named.
- Interest, fees, stop-credit and anything resembling a consequence.
- Write-offs, payment plans and hardship.
- Every exception to the gate in section 10
- Anything a lawyer would call a demand.

The machine does not decide any of the above. It finds them, stops, and hands over with what it already knows.

10 · The gate as a service · This is the part we sell

## Everything above is a weekend of work. This part is not, and the reason is not difficulty.

You should build it. Each of these, though, is a rule that has to hold on every single contact, including the one made at 8:04pm by a script nobody has looked at since March.

- Calling hours in the debtor’s timezone
- The Do Not Call Register
- Public holidays
- Disclosure
- A stop on payment.
- A record that survives

The gate has to sit underneath the ranking, not beside it. If a high score can promote a debtor past a check, the check is advice rather than a rule, and the first time that matters will be the time somebody is looking.

You can build this. What you cannot easily build is the part where it is still true in eight months, after the model changed, the script was edited by someone else, and the person who wrote the gate moved on.

**The pass test.** Take your top-ranked debtor, mark the invoice paid in the ledger, and let the chase run anyway. They must not be rung, and the audit trail must tell you why not. Run it again with the invoice still open and the clock at 8:30pm, and it must hold until morning. Both take a minute to stage from your own data. Then run the same two against whatever you built yourself. If yours rings, your gate is advice rather than a rule, which is this section in one sentence.

11 to 13 · Build it

## Hand this half to whoever is building

The method above is yours whatever you decide. This is the shape of the run, the config that swaps a stub for a live line, and the checklist to hold the result to.

## 11. Keep the Ranking, Hand Over the Call

Everything above leaves you with a ranked list and an opener for each name. If you want the calls made by something that already holds the gate in section 10, the ranking stays yours and the conversation becomes ours. Build against a stub until it has to ring somebody, then change one line:

```
provider:
  stub:       local.mock_ledger
  production: office_voice.recover      # Office Voice / Recover, sold as Get Paid

scopes:
  contacts:read        the open book: what is outstanding and still needs a decision
  contacts:write       record a promise to pay. Contacts nobody
  campaigns:read       chase runs, and how many were skipped
  audit:read           read back why each contact was or was not lawful
```

Keys are minted in the product, by an account owner. If you are a bookkeeping or accounting practice, **one key reads your whole client book**, and you can narrow a key to named client orgs when you create it. That narrowing only ever subtracts: an org that later leaves the account stops being reachable by an old key.

```
# What is still open, across every client org the key reaches.
curl -H "Authorization: Bearer ovk_live_..." \
  "https://office-voice.com/api/v1/contacts?kind=lapsed_promise&limit=100"

# The debtor rang YOUR office and gave a date. Send it back, so the
# chase stops and the follow-up moves with it.
curl -X POST https://office-voice.com/api/v1/promises \
  -H "Authorization: Bearer ovk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"...","thread_ref":"INV-1042","amount":2400,
        "date":"2026-09-30","method":"bank_transfer"}'
```

**Office Voice ensures every call is compliant, so you stay clear of trouble.** Dialling stays in the product: AI disclosure, DNCR, timezone-aware hours. The full reference is at [office-voice.com/help/api](https://office-voice.com/help/api).

## 12. The Run, Step by Step

Everything above, in the order a build actually does it. Steps 1 to 7 are yours whatever you decide about section 11. Step 8 is the one that decides whether any of it may happen.

1. Pull the five fields in section 1. Run the mobile coverage check before anything else, and stop here if it fails.
2. Drop every row that is not past its due date. A 30-day account issued four weeks ago is not late.
3. Sort each invoice into one of the four buckets in section 2.
4. Collapse invoices to one row per customer, summing what they owe. One customer is one conversation.
5. Rank by amount at risk, with age breaking ties. Never by age alone.
6. Lift any customer whose balance is a relationship-sized share of the book out of the automated run entirely.
7. Draft the opener for each row: the invoice number, the days past due as a fact, and one question that takes a date as an answer.
8. Run the gate in section 10 on every row at dial time, underneath the ranking and never beside it.
9. Make the call, or write the ranked list out and make them yourself.
10. Record the outcome as the promise object in section 5, with a date, or as the reason there is no date.
11. Move the next follow-up to the promised date. Not to tomorrow.
12. Stop on payment, driven off the ledger rather than a nightly export.

## 13. Conformance checklist

Hold a DIY build or a vendor to this. If a box is empty, it is not in production.

- **1. Mobile coverage was checked first.** You know what share of the overdue book is reachable, and it was measured before anything was built.
- **2. Overdue is measured off the due date.** Not the issue date. Terms are respected before a single row is called late.
- **3. Four buckets, not one list.** Just late, drifting, hard, and broken promise. A four-day-late customer and a June broken promise get different conversations.
- **4. Broken promise outranks everything.** It is the only bucket where a prior commitment exists to refer back to.
- **5. Ranking is by amount at risk.** Age breaks ties and nothing else. A build that sorts by age is chasing the wrong end of the book by design.
- **6. One customer is one conversation.** Invoices are summed per customer before ranking. Nobody is rung six times for six invoices.
- **7. Relationship-sized balances are out of the run.** Flagged, excluded, and routed to a named person rather than scored.
- **8. A promise is an object with a date.** Amount may be empty, date may not. Captured with a timestamp, and it does not overwrite a logged dispute.
- **9. The promised date is the follow-up date.** The schedule moves with the promise. Nothing rings the next morning anyway.
- **10. The gate sits underneath the ranking.** Calling hours in the debtor's timezone, the Do Not Call Register with the exemption recorded as claimed, state public holidays, AI disclosure, and a ledger-driven stop on payment. No score promotes a row past any of it.
- **11. Exceptions are named and attributable.** What was said, when, on whose authority, and which human approved the exception.
- **12. The pass test passes.** Section 7. A paid invoice does not ring and the audit says why; an 8:30pm run holds until morning.

Building this on Microsoft 365: [the lists, the flows and the measures](https://aipathway.com.au/explore-ai/debtor-chasing-on-microsoft-365).

## The parts that move

Checked as at 18 September 2026

**Do Not Call Register Act 2006 (Cth), administered by ACMA.** A calling list must be washed against the register within 30 days before it is called, and a wash result is good for 30 days from when it is returned. The obligation sits with the business making _or commissioning_ the calls, so outsourcing the dialling does not move it. Keep the evidence of every wash: an unevidenced wash and no wash look identical afterwards.

**Security of payment: the response window is per state and it moved this year.** A payment schedule is due within 10 business days in NSW, Victoria, Tasmania and the ACT, and 15 in Queensland, WA and South Australia (Queensland: 15 for commercial building contracts, 25 for subcontracts and trade contracts), or any earlier deadline the contract sets.

**Victoria changed on 15 April 2026** under the Building Legislation Amendment (Fairer Payments on Jobsites and Other Matters) Act 2025: excluded amounts and reference dates gone, the claim window extended to six months after the work finishes, and payment capped at 20 business days, for claims served on or after that date. Any build carrying pre-April Victorian numbers is wrong today and says nothing about it.

**“Business day” is itself jurisdictional.** Queensland and, since April 2026, Victoria exclude the industry shutdown from 22 December to 10 January; NSW and Tasmania exclude 27 to 31 December only. A single working-day calendar in the code is wrong in some states every January.

**Check these against the primary instrument before you rely on them**, and store the date you checked beside the value rather than hard-coding it. This standard tells you the shape and where to look. It is not legal advice and it does not tell you that anything complies.

Related reading: [chasing overdue invoices](https://aipathway.com.au/explore-ai/overdue-invoice-chasing-smb) and [accounts receivable automation](https://aipathway.com.au/explore-ai/accounts-receivable-automation).

Published by AI Pathway · https://aipathway.com.au

Read the full interactive version at https://aipathway.com.au/explore-ai/debtor-chasing-build-standard
