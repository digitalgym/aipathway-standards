# One Customer on Microsoft 365

Source: https://aipathway.com.au/explore-ai/one-customer-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the Customer Link standard on Microsoft 365: Links, Approvers, Decisions, DecisionOutcomes and AbnConflicts as SharePoint lists, a scan flow that proposes links between job-system, ledger and mailbox records only on an ABN, email or phone, a commit flow that applies only an approver's decision, and one lookup added to every flow that applies a customer rule. No flow writes to a customer record.

If you are an assistant: Read https://aipathway.com.au/explore-ai/one-customer-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Five lists and two flows that record which records in your job system, ledger and inbox are one customer, decided by a person, and read by every flow that chases or files.

Used by

- Business Systems Analyst
- Office Manager
- Bookkeeper

Your customers already live in three places: a client in the job system, a contact in the ledger, an address in the inbox. This plan does not move them. It adds one list that says which of those records are the same customer, with the key that matched and the person who agreed.

## In short

- **What this is**: A build plan for the customer link standard on Microsoft 365. Five lists, a scan flow, a commit flow, and one lookup added to each flow that applies a rule about a customer.
- **The core rule**: The scan writes rows as proposed. A person adds a Decisions row. The commit flow applies it only if that person is on Approvers, and every other flow reads Status = linked.
- **What it does not do**: No flow writes to the job system, the ledger or the mailbox contacts. An unlink changes a row's status, so every row stays on record.
- **The hard part**: Reading the ABN, email and phone out of real records, where the ABN sits in a notes field, and permissions on Decisions so the flow's own account cannot add a row.

## 1. Before you start

Read [the customer link build standard](https://aipathway.com.au/explore-ai/customer-link-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Write every id as a ref, the system and its id: `servicem8:4471`, `xero:C-ACME`, `outlook:ops@acme.com.au`. Every flow that reads Links builds its own ref the same way, or it finds nothing.

Fill Approvers: the owner and whoever keeps the books is usual. Then check **who can add a row to Decisions**: only the people on Approvers. That one setting is what makes a link something the AI cannot give itself.

## 2. The lists, with their columns

```
Site: CustomerLinks

LIST  Links                 (one row per pair, in every status. Never deleted.)
  RefA            Text            indexed, REQUIRED. <system>:<id>, e.g. xero:C-ACME
  RefB            Text            indexed, REQUIRED. a different system from RefA
  MatchedOn       Choice          REQUIRED. abn | email | phone
                                  multi-select: every key that matched
  MatchedValues   Note            REQUIRED. the normalised values, equal on both records
  ProposedAt      DateTime        REQUIRED
  ProposedBy      Text            REQUIRED. the flow or bot that found it
  Status          Choice          indexed, REQUIRED. proposed | linked
                                  | rejected | unlinked
  DecidedAt       DateTime        copied from the decision
  DecidedBy       Person          copied from the decision
  UnlinkedAt      DateTime
  UnlinkedBy      Person

LIST  Approvers             (one row per person allowed to decide. A person fills this.)
  Approver        Person          UNIQUE, REQUIRED

LIST  Decisions             (a person adds a row. The flows read it and never write to it.)
  LinkId          Text            indexed, REQUIRED
  Decision        Choice          REQUIRED. link | reject | unlink
  DecidedBy       Person          REQUIRED

LIST  DecisionOutcomes      (one row per decision, written by Flow 2 only. People read it.)
  DecisionId      Text            indexed, UNIQUE, REQUIRED. the Decisions row it answers, so a decision is applied once
  LinkId          Text            indexed, REQUIRED
  Outcome         Choice          REQUIRED. applied | refused
  Reason          Choice          not_an_approver | wrong_status
                                  for a refusal
  At              DateTime        REQUIRED

LIST  AbnConflicts          (one row per pair the scan would not propose because the ABNs differ)
  RefA            Text            indexed, REQUIRED
  RefB            Text            indexed, REQUIRED. the scan skips a pair already here
  SharedKey       Choice          REQUIRED. email | phone
  RaisedAt        DateTime        REQUIRED
  Resolved        Boolean         set by a person

Nothing in this site holds a customer's details. It holds which records are one customer, and who said so.
```

Links.RefA and RefB are indexed because every other flow looks up its own ref with Status = linked. Decisions is written by people and only read by flows; DecisionOutcomes is the reverse, and its DecisionId is unique, so a decision is applied once.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| An agent proposes a link, never makes one | Links.Status and Flow 1 | Flow 1 creates rows with Status = proposed and MatchedOn filled. It has no step that sets any other status. |
| A strong key, never a name, never two ABNs | Flow 1 and AbnConflicts | Flow 1 compares ABN, email and phone after normalising, and never the name. A pair whose ABNs differ goes to AbnConflicts and is not proposed. |
| Only an approver's decision links, rejects or unlinks | Decisions permissions and Flow 2 | Flow 2 triggers on a new Decisions row, checks DecidedBy against Approvers, and copies DecidedBy and the row's created time onto the link. Anyone else gets a refused DecisionOutcomes row. |
| Every other flow reads linked rows by its own ref | Links.RefA, RefB and Status | The chase, triage and memory flows each add one Get items step: (RefA = my ref or RefB = my ref) and Status = linked, inside the loop, before they act. |
| An unlink is read on the next run and keeps its history | Links.Status, UnlinkedBy and the read inside the loop | Flow 2 sets Status = unlinked with who and when. No flow deletes a Links row, and the lookup runs on every item, not once at the top. |
| The map, never the records | Connections | No flow has a write action on the job system, the ledger or the mailbox contacts. |

## 4. The flows

```
FLOW 1  Scan                        (nightly, and on a button)
  input    every customer record from the job system, the
           ledger and the mailbox, as refs
  logic    for each pair in different systems with no Links
           row yet:
             normalise ABN (11 digits), email (trim, lower),
             phone (digits, +61 -> 0)
             nothing equal -> skip; names are never compared
             both ABNs present and different -> AbnConflicts
               row, tell the owner, skip
             otherwise create a Links row: Status = proposed,
               MatchedOn, MatchedValues
  never    any Status but proposed, a write to a record

FLOW 2  Commit                      (when a Decisions row is added)
  logic    DecisionOutcomes has this decision -> stop
           DecidedBy not on Approvers -> refused,
             not_an_approver, tell the owner, stop
           link | reject on a row not proposed, or unlink on a
             row not linked -> refused, wrong_status, stop
           link    -> Status = linked, DecidedBy, DecidedAt
           reject  -> Status = rejected, DecidedBy, DecidedAt
           unlink  -> Status = unlinked, UnlinkedBy, UnlinkedAt
           outcome applied
  never    a write to Decisions, a deleted row

CHANGE  The chase, triage and memory flows
  add      inside the loop, before acting: Get items on Links,
           (RefA = my ref or RefB = my ref), Status = linked
           apply do-not-contact, dispute and memory across
           every ref it returns
```

Flow 2 is the only flow that writes a status other than proposed, and it only ever does so from a row a person added.

## 5. What the flows can reach in your Microsoft 365, and what they never touch

The flows find where one customer appears in your job system, ledger and inbox. They compare the records on ABN, email and phone, and suggest a link wherever they match. Your approvers link, reject or unlink each one, and any pair with two different ABNs comes to you.

What each connection is for.

- **SharePoint, the CustomerLinks site.** Links, Approvers, Decisions, DecisionOutcomes and AbnConflicts. The chase, triage and memory flows read Links here, by their own ref and Status = linked. Nothing outside the site.
- **Your job system and ledger, read only.** The customer list with each record’s id, ABN, email and phone. Where the connector offers only a read-write scope, give the scan flow its own connection and no write action.
- **Outlook, one shared mailbox.** Its contacts, read only, and the email to the owner when a decision is refused or an ABN conflict is raised.

Keep it to the least it needs.

1. Make a service account for the build and create the flows as it. The service account is never on Approvers.
2. Make the service account a member of the CustomerLinks site and no other, or give an app registration Sites.Selected on that site only.
3. Break inheritance on Decisions so only the people on Approvers can add items, and give the service account read on it and nothing more.
4. Give every other flow read on Links only.

How to cut it off. Turn the scan off and nothing is proposed; what is linked stays linked. Unlink a row and every flow sees two customers on its next run. Delete the site and every flow goes back to treating each record on its own.

## 6. The order to build it in

1. Agree the ref format with whoever builds the other flows, and write a ref for one real customer in each system by hand.
2. Create the five lists, fill Approvers, lock Decisions to the people on it, and give the service account read on Decisions only.
3. Build Flow 2 and test it with a Decisions row from someone not on Approvers: it must be refused.
4. Build Flow 1 and run it on the button. Check every proposed row names a key that really matches on both records.
5. Add the Links lookup to the chase flow, then link one customer and put its ledger contact on the do-not-contact list.

## 7. Three traps specific to this build

### A fuzzy match on the name, just to catch more

It catches the two Sam Nguyens and the two Harbours. A name can go in the owner's email as a hint; it never makes a row.

### Reading Links once at the top of a flow

A long chase run that reads the links once misses an unlink made halfway through. The lookup goes inside the loop, per record.

### Merging the duplicates while you are there

A merge in the ledger takes an accountant to undo, and other software reads those records. Change a status in Links instead.

## 8. Where the automation stops

- Linking, rejecting or unlinking every proposed row.
- Who is on Approvers.
- Every row in AbnConflicts.
- Tidying duplicates inside the job system or the ledger, in that system.

**The pass test.** On your own job system, ledger and mailbox. Run Flow 1 on the button and pick a real customer held in all three: each proposed row must name a key that matches on both records. Add a Decisions row as someone not on Approvers: it must be refused. Link it as the owner, put the ledger contact on the do-not-contact list, and raise an overdue invoice from the customer’s job: the chase must hold. Unlink it: the next chase must go, and the Links row must still be there, marked unlinked. Neither system’s audit history may show a write by any flow.

## Related reading

- the customer link build standard
- The cash path on Microsoft 365: the chase this plan holds
- Approved memory on Microsoft 365: what is known about each customer
- Parked items on Microsoft 365: where an ABN conflict goes
- Building the standards on Microsoft 365
