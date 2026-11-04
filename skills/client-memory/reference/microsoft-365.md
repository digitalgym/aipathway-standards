# Approved Memory on Microsoft 365

Source: https://aipathway.com.au/explore-ai/approved-memory-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for client memory: a MemoryItems list keyed to the client id with the type, source, status, version and the item each one supersedes; an Approvers list; a Decisions list a person writes to and the flows only read; a DecisionOutcomes list only the flows write, so each decision is applied once; a commit flow that applies a decision only from someone on Approvers; and a monthly review flow that writes a MemoryReviews row and changes nothing.

If you are an assistant: Read https://aipathway.com.au/explore-ai/approved-memory-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Five lists and three flows that turn what your AI hears about a customer into something you have agreed to, and that every other flow reads by the customer's id.

Used by

- Office Manager
- Business Systems Analyst
- AI Officer

Most businesses already have client memory: a note in the job system, a line in someone’s head, an instruction the AI picked up on a call. This plan puts it in one list, keyed to the client id your job system issued, and adds the one thing those places lack: a row only a named person can add that says yes.

## In short

- **What this is**: A build plan for the client memory standard on Microsoft 365. Five lists, a commit flow, a review flow, and one filter added to each flow that already acts for a client.
- **The core rule**: Proposals land in MemoryItems as proposed. A person adds a Decisions row. The commit flow applies it only if that person is on Approvers, and every other flow filters Status = approved.
- **What it does not do**: No flow edits an approved row. A change is a new row with Supersedes set, and the old row is only marked superseded when the change is approved.
- **The hard part**: Permissions on Decisions so the flow's own account cannot add a row, and every money flow reading MemoryItems on each run rather than once at the top.

## 1. Before you start

Read [the client memory build standard](https://aipathway.com.au/explore-ai/client-memory-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Run the cash path first, from its own plan. This plan keys every row to the client id the cash path already reads off the job, and it has nothing to key on without it.

Then fill Approvers. Two people is usual: the owner and whoever runs the office. A flow’s service account is never on it.

One thing to check before you build: **who can add a row to Decisions?**Break permission inheritance on that list so only the people on Approvers can add items, and the flows’ connection can read it but not write to it. That one setting is what makes an approval something the AI cannot give itself.

## 2. The lists, with their columns

```
Site: ClientMemory

LIST  MemoryItems           (one row per item, in every status. Never edited once approved.)
  ClientId        Text            indexed, REQUIRED. the job system's client id, never a name
  JobId           Text            the job it was heard on, if any
  ItemType        Choice          REQUIRED. fact | preference
                                  | standing_instruction
  ItemKey         Text            indexed, REQUIRED. send_to, contact.prefer, site.access
  ItemValue       Text            REQUIRED
  Content         Note            REQUIRED. in words, as the approver reads it
  Critical        Boolean
  SourceKind      Choice          REQUIRED. stated | inferred | human | import
  SourceRef       Text            REQUIRED. the call, message or import it came from
  InferredBy      Text            the model or system, for an inference
  ProposedAt      DateTime        REQUIRED
  Status          Choice          indexed, REQUIRED. proposed | approved
                                  | rejected | superseded
  DecidedAt       DateTime        copied from the decision
  DecidedBy       Person          copied from the decision
  Version         Number          REQUIRED
  Supersedes      Text            the item this one would replace
  SupersededBy    Text

LIST  Approvers             (one row per person allowed to approve. A person fills this.)
  Approver        Person          UNIQUE, REQUIRED

LIST  Decisions             (a person adds a row. The flows read it and never write to it.)
  ItemId          Text            indexed, REQUIRED
  Decision        Choice          REQUIRED. approve | reject
  DecidedBy       Person          REQUIRED

LIST  DecisionOutcomes      (one row per decision, written by Flow 2 only. People read it.)
  DecisionId      Text            indexed, UNIQUE, REQUIRED. the Decisions row it answers, so a decision is applied once
  ItemId          Text            indexed, REQUIRED
  Outcome         Choice          REQUIRED. applied | refused
  Reason          Choice          not_an_approver | not_proposed
                                  for a refusal
  At              DateTime        REQUIRED

LIST  MemoryReviews         (one per review, scheduled or on demand)
  ReviewedAt      DateTime        indexed, UNIQUE
  Lines           Note            item id, version, last followed, flag and evidence for every approved standing instruction
  Flagged         Number

Nothing in this site holds a job, a call or an invoice. It holds what the business has agreed it knows about each client, and who agreed.
```

MemoryItems.ClientId is indexed because every money flow filters on it with Status = approved. Decisions is written by people and only read by flows; DecisionOutcomes is the reverse, and its DecisionId is unique, so a decision is applied once. MemoryReviews.ReviewedAt is unique, so one review run writes one row.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| An agent only proposes | MemoryItems.Status and the call flow | The call flow creates rows with Status = proposed and SourceKind and SourceRef filled. It has no step that sets any other status. |
| Another model's inference is labelled as one | MemoryItems.SourceKind and InferredBy | A line from the call summary is written as inferred with the model named, never as stated. Only the customer's own words are stated. |
| Only an approver's decision changes a proposal | Decisions permissions and Flow 2 | Flow 2 triggers on a new Decisions row, checks DecidedBy against Approvers, and copies DecidedBy and the row's created time onto the item. Anyone else gets a refused row in DecisionOutcomes and the owner is told. Flow 2 never writes to Decisions. |
| An approved item is never overwritten | MemoryItems.Supersedes, SupersededBy and Version | A change is a new row with Supersedes set and Version one higher. Flow 2 marks the old row superseded only when the new one is approved. No flow updates ItemValue or Content on an approved row. |
| Every other flow reads by client id, approved only | MemoryItems.ClientId and Status | The quote, invoice and chase flows each add one Get items step filtered on the job's ClientId and Status = approved, inside the loop, before they draft. |
| A review flags drift and changes nothing | Flow 3 and MemoryReviews | Flow 3 reads approved standing instructions and the drafts since each was approved, and writes one MemoryReviews row. It has no update step on MemoryItems. |

## 4. The flows

```
FLOW 1  Propose                     (after each call or message)
  input    what the call heard, with the call id
  logic    read approved MemoryItems for the job's ClientId
           same key, same value -> nothing to do
           otherwise create a row: Status = proposed,
             SourceKind stated | inferred, SourceRef = call id,
             Supersedes = the approved row with that key, if any
  never    any Status but proposed

FLOW 2  Commit                      (when a Decisions row is added)
  logic    DecisionOutcomes has this decision -> stop
           DecidedBy not on Approvers -> outcome refused,
             not_an_approver, tell the owner, stop
           item not proposed -> outcome refused, not_proposed,
             stop
           approve -> Status = approved, DecidedBy, DecidedAt
                      Supersedes set -> old row: Status =
                      superseded, SupersededBy = this id
           reject  -> Status = rejected, DecidedBy, DecidedAt
           outcome applied
  writes   the outcome as a DecisionOutcomes row
  never    a write to Decisions

FLOW 3  Review                      (monthly, and on a button)
  logic    for each approved standing_instruction:
             drafts since DecidedAt that did not follow it
               -> not_applied, with their ids
             another approved row, same client and key,
             different value -> contradicted, naming it
           write one MemoryReviews row, send it to the owner
  never    an update to MemoryItems

CHANGE  The quote, invoice and chase flows
  add      inside the loop, before the draft: Get items on
           MemoryItems, ClientId = the job's, Status = approved
           follow every standing_instruction it returns
```

Flow 2 is the only flow that writes a status other than proposed, and it only ever does so from a row a person added.

## 5. What the flows can reach in your Microsoft 365, and what they never touch

The flows are the junior with the client file: they read it before every job and leave sticky notes, and only the people on Approvers write in it. They read and write the five lists on one SharePoint site and send the owner email from one shared mailbox. Flow 1 only ever creates proposed rows. Flow 2 changes a status only from a Decisions row a person added. Flow 3 writes one review row and nothing else. No flow approves its own proposal, edits an approved row, deletes a row, or matches a client by name, and none of them opens anyone’s own inbox.

What each connection is for.

- **SharePoint, the ClientMemory site.** MemoryItems, Approvers, Decisions, DecisionOutcomes and MemoryReviews. The flows read Decisions and never write to it; what Flow 2 did with each decision goes to DecisionOutcomes. The quote, invoice and chase flows from the cash path read MemoryItems here, by client id and approved only. Nothing outside the site.
- **Outlook, one shared mailbox.** Tells the owner when a decision is refused and sends the monthly review.
- **Office Voice, over its MCP endpoint, if the calls feed Flow 1.** Called at https://office-voice.com/api/mcp with a bearer key from office-voice.com/app/keys, through the HTTP action or a custom connector (both premium in Power Automate). Read the book lets Flow 1 read what a call heard with get_memory. Leave Write drafts and notes off: it would let a flow record a fact as live, with no one approving it.

Keep it to the least it needs.

1. Make a service account for the build and create the flows as it, not as the owner. Flows owned by a person go with them when they leave. The service account is never on Approvers.
2. Put the three flows in a solution and use connection references, so each connection is made once, by the service account.
3. Make the service account a member of the ClientMemory site and no other, or, with an app registration, give it Sites.Selected on that site only.
4. Break inheritance on Decisions so only the people on Approvers can add items, and give the service account read on it and nothing more.
5. Give the service account Send As on the one shared mailbox. If an app registration sends instead, scope its mail permission to that mailbox with RBAC for Applications in Exchange Online, or an application access policy.
6. If calls feed Flow 1, create the Office Voice key with Read the book only.

How to cut it off. Turn the flows off and nothing proposes, commits or reviews; what is approved stays approved. Delete the Office Voice key at /app/keys and Flow 1 stops hearing the calls on its next run. Take the service account out of the site and every flow loses the memory at once.

## 6. The order to build it in

1. Run the cash path from its own plan until each flow reads the job's ClientId.
2. Create the five lists, fill Approvers, lock Decisions to the people on it, and give the service account read on Decisions only.
3. Build Flow 2 and test it with a Decisions row from someone not on Approvers: it must be refused.
4. Build Flow 1 on the call step. Make one call that states a preference and confirm a proposed row with the call id.
5. Add the Get items step to the quote, invoice and chase flows, then approve the preference and raise an invoice.
6. Build Flow 3 and run it on the button before you schedule it.

## 7. Three traps specific to this build

### Reading memory once at the top of a flow

A long-running chase flow that reads MemoryItems once will miss an approval made halfway through the run. The read goes inside the loop, per client.

### An Approve button that the flow's account can press

If the flow can add a Decisions row, so can anything that can trigger the flow. Permissions on the list are the control, not a condition in the flow.

### Editing the old row to the new value

It looks tidy and it erases what was in force last week. Every change is a new row, and the old one keeps its words.

## 8. Where the automation stops

- Approving or rejecting every proposed row.
- Who is on Approvers, and which instructions are critical.
- Choosing between two instructions that contradict each other.
- Acting on every line of the review.

**The pass test.** On your own phone line, tenant and ledger. On a real call, ask for invoices to go to a bookkeeper: MemoryItems must hold a proposed row naming the call, and the next invoice must not use it. Add a Decisions row as someone not on Approvers: it must be refused. Approve it as the owner, then raise an invoice: it must go to the bookkeeper. On another call change it, raise an invoice before approving the change and one after: the first goes to the old address and the second to the new, and the old row is superseded with its words unchanged. Run the review on the button: one MemoryReviews row listing both versions.

## Related reading

- the client memory build standard
- The cash path on Microsoft 365: the client id this plan keys on
- The daytime desk on Microsoft 365: the call step that proposes
- The knowledge graph on Microsoft 365: the business's own knowledge, accepted by a person
- Building the standards on Microsoft 365
