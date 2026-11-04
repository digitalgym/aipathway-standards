# The Just-Sold Pack on Microsoft 365

Source: https://aipathway.com.au/explore-ai/sold-nearby-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the just-sold pack: a Sales list holding the source's figures beside the agency's, a Pack list unique per contact and sale, an Approval column no flow writes, a closed list of exceptions, and a send flow that refuses anything unapproved.

If you are an assistant: Read https://aipathway.com.au/explore-ai/sold-nearby-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

A sale held when its figures disagree, one draft per neighbour, and nothing sent without a person’s name on it.

Used by

- AI Officer
- Business Systems Analyst
- Marketing Manager

A property sells and the agency wants the neighbours to hear it from them. In a Microsoft 365 office that usually means a mail merge from a spreadsheet somebody exported, sent the same afternoon. This plan keeps the spreadsheet’s speed and adds the three things it lacks: a sale that can say no, one message per neighbour, and a person’s yes on each.

## In short

- **What this is**: A build plan for the Just-Sold Pack standard on Microsoft 365. Four lists, two flows, and an approval column no flow can write.
- **The core rule**: The pack flow drafts and stops. The send flow sends only rows a person approved, once each.
- **What it does not do**: It never says what the reader's own home is worth, and it places no calls. The call list is for the agent.
- **The hard part**: Holding a sale whose figures disagree, rather than quietly using one of them.

## 1. Before you start

Read [the Just-Sold Pack build standard](https://aipathway.com.au/explore-ai/just-sold-pack-build-standard) first. It owns the holds, the three reasons, the ranking and the exceptions. Where it and this page disagree, it wins. The shared conventions for this stack are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Contacts stay in the CRM. The flows read them when the pack runs, so a do-not-contact flag set this morning holds this afternoon.

## 2. The lists, with their columns

Four lists. The agency's own figures sit beside the source's on the Sales row, because a flow can only compare what is stored, and PackKey is unique so a neighbour cannot be drafted twice.

```
Site: SoldNearby

LIST  Sales
  SaleRef         Text            indexed, UNIQUE, REQUIRED. the source's id for the sale
  Address         Text            REQUIRED
  Street          Text            indexed
  Suburb          Text            indexed
  SoldOn          DateTime
  Price           Currency        blank when withheld at the source
  PriceDisclosed  Boolean
  IsPublic        Boolean         false until exchange is public
  Confidential    Choice          none | vendor | buyer
                                  set when either party asked for it to be kept quiet
  AgencyPrice     Currency        the agency's own record, compared, never used instead
  AgencySoldOn    DateTime
  VerifiedAt      DateTime        when the source last verified the figures
  Status          Choice          new | held | drafted | done

LIST  Pack                  (one row per contact per sale)
  PackKey         Text            indexed, UNIQUE, REQUIRED. SaleRef and ContactRef joined
  SaleRef         Text            indexed
  ContactRef      Text            indexed
  Reason          Choice          same_street | radius | owner_match
                                  the strongest one, when a contact matches two
  Channel         Choice          email | sms | letter
  Draft           Note            the message, with the recorded figures only
  ShortListRank   Number          blank if not on the call list
  ShortListWhy    Text
  Approval        Person          SET BY A PERSON. No flow writes this column
  ApprovedAt      DateTime
  SentAt          DateTime        written by the send flow, once

LIST  Exceptions
  SaleRef         Text            indexed
  ContactRef      Text            indexed. blank when the sale itself is held
  Kind            Choice          REQUIRED. sale_not_public | confidential
                                  | figures_mismatch | price_withheld | do_not_contact | no_consent | active_sequence
  Detail          Text            REQUIRED. why, in words
  RaisedAt        DateTime
  ClearedBy       Person          a person clears an exception; a flow never does

LIST  Log                   (append only)
  SaleRef         Text            indexed
  Event           Text
  Detail          Text
  At              DateTime

Contacts stay in the CRM. The flows read them; this site never becomes a second contact list.

Approval is set by a person in the list view. SharePoint has no per-column permissions, so the send flow also refuses a row whose Approval was last edited by the service account.
```

There is no column for the reader's own home value. A list that could hold one would eventually print one.

## 3. Every check, and what enforces it

| The check | Enforced by | How |
| --- | --- | --- |
| A sale that is not public, or kept quiet, holds the pack | Pack flow | The first step reads IsPublic and Confidential on the Sales row and stops with an Exceptions row before any contact is read. |
| Figures that disagree hold the sale | Pack flow | Price, SoldOn and Address are compared with the Agency columns. A difference writes figures_mismatch naming the field, and the flow stops. It never picks one. |
| A withheld price is never stated | Template binding | The draft template has a branch with no price at all when PriceDisclosed is false. It never reads AgencyPrice. |
| One entry per contact per sale | PackKey, unique | SaleRef and ContactRef joined, with unique values enforced on the list. A second run fails the add rather than drafting twice. |
| Do not contact, consent and active sequences | Pack flow | Checked per contact before the draft, read from the CRM at run time. Each refusal is an Exceptions row with its kind. |
| A person approves every send | Send flow | Reads Approval and refuses a row without it. SharePoint cannot lock a single column, so the guard also refuses a row last edited by the service account: the name has to come from a person's own edit. SentAt is written once. |

## 4. The two flows

```
FLOW 1  Build the pack
  trigger  a Sales row added, or Status cleared
  hold     IsPublic false          -> Exceptions sale_not_public, stop
           Confidential set        -> Exceptions confidential, stop
           Price, SoldOn or Address differ from the Agency columns
                                   -> Exceptions figures_mismatch,
                                      naming the field, stop
  logic    PriceDisclosed false    -> Exceptions price_withheld,
                                      and the template's no-price branch
           read contacts from the CRM
           for each: same street, inside the radius, or owns similar
             do not contact        -> Exceptions, next
             in another sequence   -> Exceptions, next
             channel: email if consented, SMS if consented,
             letter if a postal address, else Exceptions no_consent
             add a Pack row (PackKey unique; a duplicate is skipped)
           rank the cleared rows, write ShortListRank and ShortListWhy
  never    send, or write Approval

FLOW 2  Send the approved
  trigger  Approval set on a Pack row
  guard    Approval is a person, the row was last edited by a person
           and not the service account, SentAt is blank, and the contact's
           consent and do-not-contact are re-read from the CRM
  logic    email from the shared mailbox; an SMS or letter is
           marked for the agent to send by hand
           write SentAt, append Log
  never    send a row without Approval, or send it twice
```

Flow 2 is triggered by the approval itself, not by a schedule, so the gap between a yes and the send is seconds and the guard reads the CRM at that moment.

## 5. What the flows can reach in your Microsoft 365 and your CRM, and what they never touch

The flows address the envelopes; a person drops each one in the post box. Flow 1 reads the sale and the contacts and writes draft rows in the site. Flow 2 sends one email from the shared mailbox, and only for a row a person approved. Neither flow edits or deletes a contact in the CRM, changes a consent or do-not-contact flag, places a call, or sends from anybody’s own mailbox. Office Voice is not connected here: the standard keeps the calls with the agent.

What each connection is for.

- **SharePoint, the one site.** Sales, Pack, Exceptions and Log. Both flows read and write rows there.
- **The CRM, read only.** Contacts, consent, do-not-contact and active sequences, read when Flow 1 runs and again in Flow 2’s guard. Through a custom connector or the HTTP action (both premium), with a key that can read and nothing more. If the CRM offers no way in, the re-read at send time is not possible, and the agent checks the flag by hand before approving.
- **The sale source, read only.** The data source the agency already licenses, read beside the agency’s own record so Flow 1 can compare them.
- **Outlook, one shared mailbox, send only, Flow 2 only.** Flow 1 holds no mail connection at all, so it cannot send even by mistake.

Least privilege, in practice. Both flows are owned by the automation service account, not by an agent, and sit in one solution with connection references. That account is a member of this one site only and has Send As on the one shared mailbox. If anything uses an app registration instead, give it Sites.Selected on this site and scope its mail permission to that mailbox. The details are in [the shared conventions](https://aipathway.com.au/explore-ai/standards-on-microsoft-365#access).

How to cut it off. Turn off Flow 2 and nothing more can be sent. Remove the CRM connection, or revoke its key in the CRM, and nothing more is read. The Pack rows and the Log stay, so you can still see what went and who approved it.

Why not the CRM’s own campaign tool? If your CRM can already send to contacts near a sale, it is quicker to set up, and you may only need this build for the holds. Test it on the two things this plan exists for: will it hold a sale when the source’s figures and yours disagree, and will it refuse a message nobody approved, one by one rather than for the whole campaign? If it does both, use it.

## 6. The order to build it in

1. Create the four lists. Make PackKey unique before anything writes to it.
2. Build Flow 2 first, with its guard, and prove it refuses a row with no Approval.
3. Build Flow 1’s three holds and run the pass test below before any contact is read.
4. Add the matching and the drafts, then the ranking.

## 7. Four traps specific to this build

### Approval as a Yes/No column a flow can set

The first time somebody builds an approve-all button, every message is approved by a flow. A Person column the agent sets in the list view carries a name, and the send flow refuses a row whose last edit was made by the service account rather than a person.

### Copying the contacts into the site

A copy of the CRM in SharePoint drifts by the end of the week, and the do-not-contact flag set in the CRM on Monday is not in the copy on Tuesday. Read contacts from the CRM when the pack runs.

### Filling a withheld price from the agency's own figure

It looks helpful and it is the failure the standard names. The agency's figure is there to be compared, not used.

### Sending from a personal mailbox connection

A flow on one agent's account stops the day they leave, and what it sent is in their sent items rather than the Log. Use a shared mailbox and write the Log regardless.

## 8. Where the automation stops

- The yes on every message. A person sets Approval; a row a flow approved is refused.
- Clearing an exception, including fixing whichever figure was wrong.
- The calls on the short list. The flows rank them and place none.
- Anything about the reader's own home: its value, a range, whether to sell.

**The pass test.** Two staged checks, neither needing a real neighbour. First, add a Sales row whose AgencyPrice differs from Price by one digit: Flow 1 must write a figures_mismatch exception naming the price and add no Pack rows. Second, correct it, let Flow 1 draft, then try to send a Pack row with Approval blank: Flow 2 must refuse it and the Log must say so. If the first drafts, the flow picked a figure. If the second sends, the approval is decoration.

## Related reading

- The Just-Sold Pack build standard
- Database Reactivation on Microsoft 365
- Building the standards on Microsoft 365
