# Open-Home Feedback on Microsoft 365

Source: https://aipathway.com.au/explore-ai/inspection-feedback-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan: open-home follow-up and the vendor report on Microsoft 365. The sign-in register as a SharePoint list, follow-ups drafted for an approval in Teams before they send, an opt-out list no new register can clear, replies filed by class, and a weekly vendor report the agent approves.

If you are an assistant: Read https://aipathway.com.au/explore-ai/inspection-feedback-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

The same standard, for an agency that lives in Microsoft 365: the sign-in register as a list, every follow-up approved in Teams before Outlook sends it, and a vendor report that waits for the agent's yes.

Used by

- AI Officer
- Business Systems Analyst
- Sales Administrator

Power Automate already has the one thing this standard leans on hardest: an approval that waits for a person. So the build is mostly lists and three flows. What takes thought is the same as on any stack: consent is read from the register and never assumed, an opt-out is kept somewhere no new register can reach, and the vendor report holds counts and buyers’ words and nothing else.

## In short

- **What this is**: A build plan for the Open-Home Feedback standard on Microsoft 365. Five lists, three flows, and two approvals that a person gives in Teams.
- **The core rule**: Flow 1 drafts and starts an approval. Outlook sends only when the approval comes back approved, and the approver is written onto the row.
- **What it does not do**: No flow replies to an offer or a complaint, and no list has a sentiment column. The report is counts, verbatim price comments and themes a person tagged.
- **The hard part**: Keeping OptOuts keyed on the person rather than the row, so next Saturday's register cannot undo it, and keeping Replies append only, so the record still answers a vendor in two months.

## 1. Before you start

Read [the Open-Home Feedback build standard](https://aipathway.com.au/explore-ai/open-home-feedback-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Decide whose mailbox the follow-ups come from. The Outlook action sends as the connection’s owner, and replies land there. Make it the agent’s own mailbox or a shared one the agent reads, on a business account, not whoever builds the flow.

Then decide how the register gets in. A CRM sign-in export pasted or imported into the Register list is fine; so is the paper sheet typed up. What matters is that consent arrives as the attendee gave it, as yes, no or blank, and that nobody fills a blank in later.

## 2. The lists, with their columns

```
Site: OpenHomes

LIST  Register              (one row per sign-in, as written)
  OpenId          Text            indexed, REQUIRED
  ListingId       Text            indexed, REQUIRED
  AttendeeName    Text
  Mobile          Text            indexed
  Email           Text            indexed
  Consent         Choice          yes | no | blank
                                  as given at sign-in, never inferred
  CallOk          Boolean         ticked: happy to take a call
  PersonKey       Text            indexed. mobile digits, else email, set by Flow 1
  Exception       Choice          none | incomplete_row | no_consent
                                  | duplicate_attendee

LIST  FollowUps
  RegisterRow     Text            lookup to Register
  ListingId       Text            indexed
  PersonKey       Text            indexed
  DraftKey        Text            indexed, UNIQUE. ListingId + PersonKey: one per person per listing
  Question        Choice          interest | price | contract
  Body            Note
  Approver        Person          blank means not sent
  ApprovedAt      DateTime
  SentAt          DateTime

LIST  OptOuts               (no flow clears a row)
  PersonKey       Text            indexed, UNIQUE
  Said            Note            their words, exactly
  ReceivedAt      DateTime

LIST  Replies               (append only)
  FollowUp        Text            lookup to FollowUps
  ListingId       Text            indexed
  ReplyText       Note            REQUIRED. exactly as received
  ReceivedAt      DateTime
  Classes         Choice          hot_buyer | price_feedback | not_interested
                                  | appraisal_lead
  Route           Choice          none | stop | offer | complaint | unclear
                                  anything but none goes to the agent
  Theme           Text            typed or accepted by a person

LIST  VendorReports
  ListingId       Text            indexed
  Week            Text            indexed
  Version         Number
  ReportJson      Note            counts, price comments, themes: nothing else
  Approver        Person
  SentToVendorAt  DateTime

There is no sentiment column anywhere, on purpose. The report carries counts and the replies' own words.

An OptOuts row has no ClearedAt. If the person themselves asks to hear from you again, a person removes the row and records why.
```

Unique values on FollowUps.DraftKey is the line that holds check 3: two sign-ins by the same person for the same listing cannot both get a row. Unique PersonKey on OptOuts keeps one opt-out per person, whichever open they came to.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| No consent recorded, no follow-up | Flow 1, Register.Consent | Flow 1 only drafts for rows whose Consent is yes. Blank and no set Exception to no_consent and post to the agent in Teams. |
| The same person at two opens is one attendee | FollowUps.DraftKey, unique | Flow 1 writes ListingId plus PersonKey as the DraftKey. A second sign-in fails at SharePoint and is marked duplicate_attendee instead. |
| A person approves every follow-up before it sends | Flow 1, Start and wait for an approval | Outlook's send action sits inside the Approve branch only, and writes Approver and ApprovedAt before SentAt. |
| An opt-out is honoured across every listing | OptOuts, keyed on PersonKey | Flow 1 checks OptOuts before drafting and again before sending. No flow deletes from it. |
| Offers and complaints go to the agent, unanswered | Flow 2, Replies.Route | Flow 2 sets Route to offer, complaint or unclear and posts the reply text to the agent. It has no send action at all. |
| The vendor report counts and quotes, and is approved first | Flow 3, VendorReports | Flow 3 builds the counts from Replies and FollowUps, copies price comments verbatim, writes a new version, and sends to the vendor only on an approval. |

## 4. The three flows

```
FLOW 1  Register to sent follow-up
  trigger  a Register row is created or changed
  logic    no name, or no Mobile and no Email -> incomplete_row
           Consent not yes -> no_consent, post to the agent
           PersonKey in OptOuts -> stop
           create FollowUps row (DraftKey unique); a duplicate
             fails here -> duplicate_attendee
           Start and wait for an approval: the draft, to the agent
           approved -> check OptOuts again -> Outlook send
             -> write Approver, ApprovedAt, SentAt
  never    send from the Reject branch, or before the approval.

FLOW 2  A reply arrives
  trigger  a new email in the follow-up mailbox, subject [OH-n]
  logic    append to Replies with the text exactly as received
           STOP or unsubscribe -> OptOuts row, Route stop
           an offer or a complaint -> Route, post to the agent
           otherwise set Classes; none fits -> Route unclear
  never    reply to the sender.

FLOW 3  The weekly vendor report
  trigger  Monday, 8am, and on demand
  logic    per listing: counts from Register, FollowUps, Replies
           price comments: Replies with price_feedback and Route
             none, text verbatim, no names
           themes: the Theme column, counted
           write a new VendorReports version
           Start and wait for an approval -> Outlook to the vendor
  never    add a field the standard does not name.
```

Flow 2 is the only flow that reads the mailbox, and it has no send action. An agent who wants to answer a reply answers it from Outlook, as themselves.

## 5. The order to build it in

1. Create the five lists from the schema, with DraftKey and OptOuts.PersonKey unique.
2. Build Flow 1 up to the approval, and prove a blank consent row gets no FollowUps row.
3. Add the Outlook send inside the Approve branch, and prove a rejected draft never sends.
4. Build Flow 2 against a test mailbox, and prove STOP writes OptOuts and an offer reaches the agent.
5. Build Flow 3, and compare its first report against the Replies list by hand before approving it.

## 6. Four traps specific to this build

### Treating a filled-in mobile as consent

A number on a sign-in sheet is how to reach someone, not permission to market to them. Read the Consent column as given, and leave blank as blank.

### Keeping the opt-out on the Register row

Next Saturday's register is a new row with consent ticked. If the opt-out lived on last week's row, Flow 1 would happily draft to them again.

### Asking Copilot to summarise the replies for the vendor

A summary is a sentence nobody said. The report quotes and counts; a person may tag themes, and every theme points at its replies.

### Letting the approval default to approved on timeout

An approval that times out must leave the draft unsent. A timeout that sends is a send nobody approved.

## 7. Where the automation stops

- Approving each follow-up, and approving each vendor report version.
- Passing every offer to the vendor, and handling every complaint.
- Any reply Flow 2 could not classify, and any row with no consent.
- Taking someone off OptOuts, which happens only if they ask.

**The pass test.** Put a register through Flow 1 with one row whose consent is blank: no FollowUps row. Approve the rest, reply STOP from one test mailbox, then add that person to a different listing’s register with consent ticked: no draft, and OptOuts shows why. Reply to another with a price comment and to a third with an offer: the price comment is in Flow 3’s report word for word, the offer is with the agent and nowhere in the report, and nothing reaches the vendor until the report is approved. Half an hour on your own tenant.

## Related reading

- the Open-Home Feedback build standard
- The standards on Microsoft 365: the hub
- Database Reactivation on Microsoft 365: where an appraisal lead goes next
- Building the standards on Microsoft 365
