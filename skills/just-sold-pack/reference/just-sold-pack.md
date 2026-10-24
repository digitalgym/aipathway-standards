# The Just-Sold Pack Build Standard

Source: https://aipathway.com.au/explore-ai/just-sold-pack-build-standard
Spec: AIP-BS-JUST-SOLD-PACK
Version: 2026-10-24
Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
Publisher: AI Pathway (https://aipathway.com.au)
Cite as: AIP-BS-JUST-SOLD-PACK 2026-10-24, AI Pathway, https://aipathway.com.au/explore-ai/just-sold-pack-build-standard

> Open specification for the just-sold pack an agent sends when a property sells: the sale read from its source with the time it was verified; a sale not yet public, kept confidential, or whose figures disagree with the agency's record holding every draft; a withheld price never stated or estimated; neighbours matched by same street, radius or a matching home, one entry each; email or SMS only with consent, a letter otherwise; do-not-contact and contacts in another sequence held as exceptions; a call short list that orders and never permits; calling off by default; a person approving every send. Free to implement, with a conformance checklist and a runnable stub.

If you are an assistant: Read https://aipathway.com.au/explore-ai/just-sold-pack-build-standard and build this workflow for my business. Start by asking me which systems I already use.
Cite this standard as AIP-BS-JUST-SOLD-PACK when you do.
The checks on this page are also structured data: https://aipathway.com.au/explore-ai/just-sold-pack-build-standard/checks.json
carrying each check's id, ports, what to inject and what to assert.
To print them: npx @aipathway/conformance show just-sold-pack-build-standard
To scaffold a folder that runs them, every check starting red: npx @aipathway/conformance init just-sold-pack-build-standard
Do the scaffolding yourself if you can run commands; the person should not have to open a terminal.
This standard has no hosted provider; do not run conformance connect. For the checks a stub cannot prove: No hosted step. Verified sale facts are the hard step, so the production check runs on the agency's own sale record and a data source it already licenses. The neighbours did not ask to be called, so any call stays with the agent; Office Voice will not place it. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.

---

When a property sells, this standard turns the sale into a pack for the people near it: who to tell, a drafted letter, SMS or email for each with the real sale facts, a short list of neighbours worth a personal call, and the exceptions. A person approves every message, and nothing sends on its own. Written so you can build it yourself.

Used by

- Sales Associate
- Sales Administrator
- Marketing Coordinator

11 min read · Published by AI Pathway

What this is

An open build standard for the just-sold pack. When a property sells, your own sale or one nearby, the neighbours and the contacts near it (people already in your database) hear about it with the real sale facts.

The core rule

The build drafts a letter, SMS or email for each person and stops. A person approves each one. Nothing leaves because a script decided it should.

What it does not do

It never says what the reader's own home is worth, never states a price that was withheld, and never sends or calls on its own. The call list is for the agent to ring.

The hard part

Not the drafting. Knowing the price, the date and the address are the verified ones on the day the letter goes, and knowing when a sale is not yet public. The calls stay with the agent.

A place on the street sells on Saturday. By Tuesday the neighbours have heard the price from somebody else, the agent meant to drop a note in every letterbox and did not, and the one neighbour who asked for an appraisal last spring never got a call. The sale was the best reason to be in touch all year, and it went by. Or worse: the letter went out before the sale was public, or quoted a price the vendor asked to keep quiet.

One sale, to the people near it

1. A property sells: the agency's own sale or one nearby.
2. Read the sale from its source, with the time the facts were verified.
3. Compare the figures with the agency's own record of the sale.
4. The gate: is the sale clear to tell? If it is not yet public, was asked to be kept confidential, or its figures disagree with the agency's record, nothing is drafted and the exception says why.
5. If it is clear, work out who to tell (same street, inside the radius, or owners of a matching home), draft one letter, SMS or email each, and rank a short list of neighbours worth a personal call.
6. A person approves each one. If yes, it is sent once and logged. If no, it stays a draft and nothing goes.

The filled diamond is the sale itself: clear to tell, or held with a reason. Its facts are the hard step, because only a live source can say they are true today. Everything after it a builder proves on the stub, and the second diamond is a person’s yes on each draft.

## 1. What this standard covers

One sale, and the people near it. The sale is the trigger: the agency’s own sale or one nearby that it wants its contacts to know about. The output is a pack. Each contact who should hear about it gets one draft, on a channel they agreed to, saying what sold, where and when, and the price if it may be stated. A ranked short list says which neighbours are worth a personal call. Anyone who cannot be contacted is listed as an exception, with the reason.

What is out of scope. Working the whole database. Ranking every contact into plays, on a schedule, with no particular event behind it, is the [Database Reactivation standard](https://aipathway.com.au/explore-ai/database-reactivation-build-standard). A just-sold pack can be one reason somebody in that database hears from the agency this week, and the two meet at one rule: a contact already in another sequence is held here, not sent a second message. Appraisals, price guides and anything that says what a particular home is worth are out of scope too. This standard reports a sale that happened. It never prices the reader’s own home.

What cannot meet it, and what can. The pack sits beside the CRM, it does not replace it. Any CRM that can export or read out contacts with an address can feed it. What a build cannot do is invent the sale facts or the consent: a contact list with no record of who agreed to email or SMS sends letters only, and a build with no source for the sale beyond what somebody typed cannot pass check 1 live.

Is there a ready-made version? Not yet. No product takes one sale and builds this pack: a draft per neighbour, the approval step and the exception list. So this standard is a Draft, and the build is yours.

## 2. The sale, and what holds it

Everything a draft says about the sale comes from one read of it, with the time the facts were verified. Not from the agent’s memory, not from a note typed into the CRM on the day of the auction. Four things about the sale itself come before anybody is matched, and three of them stop the whole pack:

| The sale is | What happens |
| --- | --- |
| Not public yet | Exchange is not public. Nothing is drafted and nobody is short-listed until it is. |
| Asked to be kept quiet | The vendor or the buyer asked for confidentiality. Nothing is drafted, whatever the sale is worth to the agency. |
| Figures that disagree | The source and the agency's own record differ on the price, the date or the address. Nothing is drafted, the field is named, and a person fixes one. Neither figure is used in the meantime. |
| Price withheld | The pack still goes, about the sale, with no price, no range and no rounded figure. A person is told, so nobody fills it in by hand later. |

Figures that disagree are the one most builds get wrong, because the easy fix is to pick one. The agency’s record says $1,250,000 and the source says $1,205,000: one of them is a typo, and a letter to forty neighbours is the worst place to find out which. So the build holds the sale, names the field, and waits for a person.

## 3. Who to tell

Three reasons, strongest first. A contact who matches none of them is left out, with no message and no exception, because there was never a reason to tell them.

| Reason | Who | Why it earns a message |
| --- | --- | --- |
| same_street | Contacts on the same street as the sale | The strongest reason there is. They walk past it every day. |
| radius | Contacts within the radius the agency sets, in metres | Close enough that the sale is local news. The number is the agency's, not the standard's. |
| owner_match | Owners of a similar home in the same suburb, further out | Same type of home, same suburb: the sale is the nearest thing they have to a reference point. |

One entry per contact per sale. Someone on the same street who also owns a similar home gets one message, under the strongest reason, and running the pack a second time for the same sale makes nothing new. Then the gate, before any draft: do not contact means absent from every list; a contact already in another sequence is held; and the channel follows consent. Email only to someone who agreed to email, SMS only to someone who agreed to SMS, a letter to anyone with a postal address and neither, and an exception for anyone with no way to reach them lawfully.

## 4. The records it keeps, in the shape your developer needs

Five objects. The Exception is the one most builds leave out, because a neighbour who silently did not get a letter looks the same as a bug.

```
Sale                              # one per sale event
  - id, address, street, suburb
  - sold_on, price (nullable), price_disclosed
  - is_public, confidential (none | vendor | buyer)
  - source, verified_at             # where the facts came from, and when
  - agency_record                   # the agency's own figures, compared,
                                    # never used in place of the source

Contact                           # read from the CRM, never copied into a second list
  - id, name, address -> street, suburb, metres_from_sale
  - postal, email, mobile
  - consent_email, consent_sms      # what they agreed to, from the record
  - owner, owns_similar
  - engagement (appraisal_requested | callback | none), last_spoke_on
  - do_not_contact, active_sequence

PackEntry                         # unique on (sale_id, contact_id)
  - sale_id, contact_id
  - reason (same_street | radius | owner_match)
  - channel (email | sms | letter)
  - draft, facts {street, sold_on, price}
  - status (draft | approved | sent)
  - approved_by, approved_at        # set by a person, never by the build
  - sent_at

CallListEntry                     # orders, never permits
  - sale_id, rank, contact_id, reason, why

Exception
  - sale_id, contact_id (nullable when the sale itself is held)
  - kind (sale_not_public | confidential | figures_mismatch |
          price_withheld | do_not_contact | no_consent |
          active_sequence)
  - detail, raised_at, cleared_by
```

A PackEntry with status sent and no approved_by is the defect this standard exists to make unrepresentable. A draft whose facts differ from its Sale is the other.

## 5. The checks, in order

The order is the claim. The sale is read and judged before anybody is matched, because a sale that should not be told holds every draft at once. The gate sits under the matching, the drafts sit under the gate, and the send sits behind a person.

1. The sale is read from its source before anyone is matched. One sale, read with the time it was verified, is the trigger. Every fact a draft states comes from that read, never from memory or a typed note.
2. A sale that is not public, or asked to be kept quiet, holds the whole pack. Before exchange is public, or when the vendor or the buyer asked for confidentiality, nothing is drafted and nobody is short-listed. One exception says which.
3. Figures that disagree hold the sale. When the source and the agency's own record disagree on the price, the date or the address, the sale is held with the field named. Neither figure is used.
4. A withheld price is never stated, estimated or hinted. The pack still goes, about the sale, with no price, no range and no rounded figure. A person is told the price was withheld.
5. Who to tell: same street, within the radius, or an owner who matches. A contact is in the pack for a reason that is true about where they live or what they own. Everybody else is left out, without a message.
6. One entry per contact per sale. A contact who matches two reasons gets one message, under the strongest reason. Running the pack twice does not make a second.
7. Do not contact means absent from every list. Not drafted, not short-listed for a call, and recorded as an exception so a person can see why a neighbour is missing.
8. Email or SMS only with consent for that channel. A contact with no consent for electronic messages gets a letter if there is a postal address, and is held as an exception if there is not.
9. A contact already in another sequence is held. Someone mid-way through another run of messages is not sent a second one about a sale. They are held, and a person decides.
10. A draft states the sale and nothing about the neighbour's own home. The street, the date and, if disclosed, the price, as recorded. Never a value, a range or a guess for the reader's own property.
11. The call short list orders, it never permits. Ranked by the stated rules, in order: prior engagement, then reason, then longest since last spoken to. Anyone held is not on it, whatever their rank would have been.
12. A person approves every send. Nothing leaves on its own. A draft is sent only after a named person approved that entry, and an unapproved draft stays a draft.
13. Calling is off until the agency turns it on, and then goes through a gate. The short list is for the agent to ring personally. No call is opened by the build unless calling was turned on, and then every call asks the gate first.
14. Every exception has a kind and a reason. Each one names its kind from the closed list, the sale, the contact where there is one, and why. A count without reasons is not a log.
15. It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.
16. The pass test passes. On a real sale from a live source, a figure that disagrees with the agency's record holds the sale, and a do-not-contact neighbour is absent from every list.

The exceptions, a closed list:

| sale_not_public | The sale is not public yet |
| --- | --- |
| confidential | The vendor or the buyer asked for it to be kept quiet |
| figures_mismatch | The source and the agency's record disagree; the field is named |
| price_withheld | The pack goes without a price |
| do_not_contact | The contact asked not to be contacted |
| no_consent | No consent for email or SMS, and no postal address for a letter |
| active_sequence | The contact is already in another run of messages |

## 6. The drafts and the call list

A draft says what sold, where, when, and the price if it may be stated, exactly as the sale record holds them. “A 4-bedroom house on Banksia Street sold on 17 October for $1,250,000. If you would like the details of the sale, reply and I will send them.” It identifies who it is from, and an email or SMS carries a way to opt out. It never says what the reader’s own home is worth, what it could sell for, or that now is the time. That is a conversation, and section 7 keeps it with the agent.

The call list is a short list, sized to how many calls the agent can actually make this week. Three rules, in order:

1. **Prior engagement first.** Someone who asked for an appraisal or a callback outranks everyone who did not.
2. **Then the reason.** Same street, then the radius, then a matching owner.
3. **Then the longest since you last spoke.** Ties only. It never leapfrogs a stronger reason.

The list orders, it never permits. Nobody the gate held is on it, whatever their rank would have been, and the build never rings anyone on it. Calling is off by default, and no hosted product will place these calls: Office Voice rings only people with a lawful basis, such as someone who asked for a call, and a neighbour of a sale has not. So the calls on the list are the agent’s own. If an agency turns calling on in its own build anyway, every call still goes through a gate first: the do-not-call register, calling hours in the contact’s own time, and the AI disclosure at the start.

## 7. What stays with a person

- The yes on every message. A name on the draft, before it goes. The machine has no port that approves.
- The calls on the short list. The build ranks them; the agent rings them.
- Anything about the reader's own home: its value, a range, a price guide, whether to sell.
- Clearing an exception, including a figure that does not match. The build names it; a person fixes the record.
- Whether a sale the vendor wanted kept quiet can be told later, and when.
- Turning calling on. Off is the default, and the switch belongs to the agency, not the build.

## 8. Run it on what you already use

The workflow lives wherever the agency already works. Three ways, all held to the same checks:

- **Existing tools only.** The CRM export and a shared Google Sheet, or Microsoft 365 lists. Drafts sit in the sheet or in the email drafts folder, and a person approves each one there. The [Microsoft 365 plan](https://aipathway.com.au/explore-ai/sold-nearby-on-microsoft-365) lays out the lists and flows.
- **A personal dashboard.** Hand this page to a coding agent and it builds a small page with the sale, the pack, the approve buttons and the call list, against the stub until the sale facts have to be real.
- **A long-lived bot.** A routine that wakes when a sale is entered, builds the pack and posts it to the agent for approval, in Slack or by email, and sends only what comes back approved.

How to run any standard each of these ways is in [run a standard anywhere](https://aipathway.com.au/explore-ai/run-a-standard-anywhere).

## 9. What your developer builds, and the step that needs care

One step not to hand-roll: sale facts that are verified and current on the day the pack goes, from a source that can say a sale is not public or a price is withheld. The calls stay with the agent. Everything else a coding agent builds against the stub in an afternoon.

```
provider:
  stub:       local.mock_sale_feed
  production: none                       # no hosted step; runs on your own systems

the stub                             # local.mock_sale_feed
  - one sale, with the source's figures and the agency's own
  - a contact list near it, with consent and do-not-contact
  - a send that refuses anything a person did not approve
  - calling off, and a gate when it is turned on

the hard step: sale facts
  - no hosted property-data service is offered to other builds.
    Read the sale from the agency's own record and a data source
    the agency already licenses, and run the pass test by hand
    against them

the calls: the agent's own
  - off by default. No hosted step places them: Office Voice
    needs a lawful basis for a call, and a neighbour who never
    asked to be called has none
  - if an agency turns calling on in its own build: a register
    check, calling hours in the contact's own time, the AI
    disclosure first, and a record of each call

stays local                          # yours, and the standard
  - matching, drafting, ranking, the exceptions and the log
  - the approval, which is a person's, always

cannot meet the standard
  - a contact list with no record of consent sends letters only
  - a sale typed in by hand, with no source and no verified time,
    cannot pass check 1 live
```

A vendor selling just-sold automation is usually selling the letterbox drop. Ask them three things: what happens when the vendor asks to keep the sale quiet after the letters are printed, what the letter says when the price is withheld, and who approved each message that went.

**The pass test.** On a real recent sale, read from a live source, against the agency’s real contact list. First change one figure in the agency’s own record of the sale, the price or the date, and run it: nothing may be drafted, and the exception must name the field. Correct the record and run it again: every draft must state the street, the date and the price exactly as the live source verified them that day, and a neighbour flagged do not contact must be absent from the pack and the call list. Approve one message and run the send: exactly that one goes, once, and nothing else. Both runs take a few minutes to stage. If anything was drafted on the first run, the build picks a figure, which is the failure this standard exists to prevent.

## 10. A checklist to hold any build or supplier to

Hold a DIY build or a vendor to this. If a box is empty, it is not in production.

- **1. The sale is read from its source before anyone is matched.** One sale, read with the time it was verified, is the trigger. Every fact a draft states comes from that read, never from memory or a typed note.
- **2. A sale that is not public, or asked to be kept quiet, holds the whole pack.** Before exchange is public, or when the vendor or the buyer asked for confidentiality, nothing is drafted and nobody is short-listed. One exception says which.
- **3. Figures that disagree hold the sale.** When the source and the agency's own record disagree on the price, the date or the address, the sale is held with the field named. Neither figure is used.
- **4. A withheld price is never stated, estimated or hinted.** The pack still goes, about the sale, with no price, no range and no rounded figure. A person is told the price was withheld.
- **5. Who to tell: same street, within the radius, or an owner who matches.** A contact is in the pack for a reason that is true about where they live or what they own. Everybody else is left out, without a message.
- **6. One entry per contact per sale.** A contact who matches two reasons gets one message, under the strongest reason. Running the pack twice does not make a second.
- **7. Do not contact means absent from every list.** Not drafted, not short-listed for a call, and recorded as an exception so a person can see why a neighbour is missing.
- **8. Email or SMS only with consent for that channel.** A contact with no consent for electronic messages gets a letter if there is a postal address, and is held as an exception if there is not.
- **9. A contact already in another sequence is held.** Someone mid-way through another run of messages is not sent a second one about a sale. They are held, and a person decides.
- **10. A draft states the sale and nothing about the neighbour's own home.** The street, the date and, if disclosed, the price, as recorded. Never a value, a range or a guess for the reader's own property.
- **11. The call short list orders, it never permits.** Ranked by the stated rules, in order: prior engagement, then reason, then longest since last spoken to. Anyone held is not on it, whatever their rank would have been.
- **12. A person approves every send.** Nothing leaves on its own. A draft is sent only after a named person approved that entry, and an unapproved draft stays a draft.
- **13. Calling is off until the agency turns it on, and then goes through a gate.** The short list is for the agent to ring personally. No call is opened by the build unless calling was turned on, and then every call asks the gate first.
- **14. Every exception has a kind and a reason.** Each one names its kind from the closed list, the sale, the contact where there is one, and why. A count without reasons is not a log.
- **15. It survives the builder.** Someone other than the builder can explain what it does, and it runs on an account the business owns.
- **16. The pass test passes.** On a real sale from a live source, a figure that disagrees with the agency's record holds the sale, and a do-not-contact neighbour is absent from every list.

Building this on Microsoft 365: [the lists, the flows and the approval column](https://aipathway.com.au/explore-ai/sold-nearby-on-microsoft-365).

## Facts that can change, and when we checked them

Checked as at 24 October 2026

**Spam Act 2003 (Cth), administered by ACMA.** A commercial email or SMS needs the recipient’s consent (express, or inferred from an existing relationship), must identify the sender accurately, and must carry a working unsubscribe that is honoured within five working days. A letter is not an electronic message and sits outside the Act, which is why the pack falls back to one. Keep the evidence of consent: ACMA can ask for it. See [ACMA: avoid sending spam](https://www.acma.gov.au/avoid-sending-spam).

**Do Not Call Register Act 2006 and the telemarketing industry standard, administered by ACMA.** They apply to calls, not to letters, emails or texts, so they matter only if an agency turns calling on. The Telecommunications (Telemarketing and Research Calls) Industry Standard 2017 limits telemarketing calls to 9am to 8pm on weekdays and 9am to 5pm on Saturdays, with none on Sundays or national public holidays, in the time where the person usually lives.

**Price statements in real estate.** Victoria (Consumer Affairs Victoria, under the Estate Agents Act 1980), New South Wales (NSW Fair Trading) and Queensland each regulate how an agent states the price of a property it is selling, and the Australian Consumer Law applies to misleading price statements everywhere. A just-sold pack reports a completed sale; it never states or implies a price for the reader’s own home, which keeps it away from that ground. Check your own state’s rules before anything in the pack mentions price beyond the sale itself.

**Privacy Act 1988 (Cth), administered by the OAIC.** Australian Privacy Principle 7 limits direct marketing by organisations the Act covers, and requires an easy way to opt out. Not every small agency is covered; check whether yours is before relying on that.

**Check these against the primary instrument before you rely on them**, and store the date you checked beside the value rather than hard-coding it. This standard tells you the shape and where to look. It is not legal advice and it does not tell you that anything complies.

## Related reading

- The Database Reactivation Build Standard: the whole list, in four plays
- The paper: working an agency’s own database
- The real estate agent tech stack in Australia
- The Follow-Up Build Standard: the same approval gate, on a different job
