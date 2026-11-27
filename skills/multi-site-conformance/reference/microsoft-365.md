# Multi-Site Conformance on Microsoft 365

Source: https://aipathway.com.au/explore-ai/multi-site-conformance-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan that starts with a question: one Microsoft tenant or several? Then a versioned key contract, four drift checks on a schedule, one conformance score computed once, row level security from Entra groups, and a digest that posts whether or not the numbers are good.

If you are an assistant: Read https://aipathway.com.au/explore-ai/multi-site-conformance-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

The same required fields at every branch, a daily check for branches drifting from the standard, one score worked out once for all of them, and one question about your Microsoft setup that decides whether any of it works.

Used by

- Franchise Manager
- Operations Manager
- Business Systems Analyst

This build plan has an unusual first step, and it is not technical. Before any list is created somebody has to answer whether the branches share one Microsoft 365 tenant (your organisation’s Microsoft account) or each have their own. The answer changes everything that follows, and it is the one thing a flow cannot fix later.

## In short

- **What this is**: A build plan for the multi-site conformance standard on Microsoft 365. Three lists on top of whatever the underlying standard already built, two flows, one score.
- **The core rule**: Which branch a person belongs to comes from their Microsoft group membership. A typed label looks the same on day one and is wrong the first time somebody changes branch.
- **What it does not do**: It finds where branches have drifted from the standard and scores every branch the same way. What to do about a branch that keeps drifting is a conversation between two named people.
- **The hard part**: Whether the branches share one Microsoft 365 tenant. Everything here assumes they do, and franchisees with their own tenants need a different shape entirely.

## 1. The question to settle first

Read [the multi-site conformance build standard](https://aipathway.com.au/explore-ai/multi-site-conformance-build-standard) first, and note that it sits above the other standards. You build a calendar or a pack once, and this standard keeps it working the same way in fourteen places. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Then answer one question. **One tenant, or several?** Branches of one company usually share one tenant, and everything below applies as written. Franchise networks often do not. Each franchisee owns their own, and then shared lists, reports across branches and a single Power BI model are all off the table.

If it is several, you have two shapes that work. The first is guest access to one shared site owned by the centre, which keeps this plan intact and costs you a setup conversation with each branch. The second is each branch sending the centre an agreed export on a schedule, and the centre holding only that. It keeps everyone independent, but the drift checks only see what the export carries. Choose one on purpose. Both work; ending up with the second by accident does not.

## 2. The lists, with their columns

Three lists on top of whatever the underlying standard already built. They are deliberately small, because this standard checks other lists and holds no work of its own.

```
Site: Conformance

LIST  Segments
  SegmentId       Text            indexed
  Name            Text
  Kind            Choice          branch | franchise | region | entity
  EntraGroup      Text            the group object id. THE source of truth.
  Owner           Person          REQUIRED
  Coach           Person          REQUIRED
  OnboardedOn     DateTime
  Thresholds      Text            when this segment routes to its coach

LIST  KeyContract           (versioned; supersede, never edit)
  Version         Text            indexed, REQUIRED
  EffectiveFrom   DateTime        REQUIRED
  RequiredKeys    Note            the identifiers every record carries
  RequiredFields  Note            per record type
  ClosedLists     Note            field -> permitted values
  ExtensionRule   Text            "add freely, never rename or fork"

LIST  DriftFindings
  Segment         Text            lookup to Segments
  DetectedOn      DateTime        indexed
  Kind            Choice          schema | gate_bypass | shadow_register
                                  | silence
  RecordRef       Text            enough to find the row
  Detail          Note
  Status          Choice          open | accepted | resolved
  Owner           Person
  ResolvedOn      DateTime

Conformance is a hub site, with the segment sites associated to it.

accepted is not resolved. A legitimate local variation that
somebody looked at and signed off stays visible, and stops being
re-raised every week until the report is ignored.
```

Segments carries the Entra group id rather than a name, because names get changed and ids do not. Everything that asks which segment a record belongs to resolves through that id.

## 3. Every check, and what enforces it

| The check | Enforced by | How |
| --- | --- | --- |
| The key contract is written down and versioned | KeyContract list | A list with EffectiveFrom, not a diagram in an onboarding deck. Changing it is a version, which means the old one is still readable. |
| Segments add, never rename or fork | Column validation | Required keys are enforced at the list, so a row missing one cannot be saved. Extra columns are permitted and ignored by everything shared. |
| Segment comes from group membership | Segments list | The Segment column resolves through an Entra group, never a label somebody types. So who owns a record always matches who can see it. |
| Drift is detected on a schedule, all four kinds | Drift flow | One scheduled flow writing DriftFindings. Schema and gate-bypass are queries; shadow register and silence are patterns over time. |
| One definition of every measure | One model | A single semantic model. No segment can publish its own version of the same number, which is the argument that otherwise consumes every review. |
| The digest posts on a fixed schedule regardless | Digest flow | Every week, whatever the numbers. If the report only appears when the numbers are good, everyone learns that no report means bad news. |
| Each segment sees its own findings, not only the centre | RLS + digest | Same findings, same detail, posted to the segment's own channel. A centre-only report is surveillance and is resented accordingly. |

## 4. The two flows

```
FLOW 1  Detect drift
  trigger  scheduled, daily
  scope    every site associated to the hub
  logic    SCHEMA
             rows missing a required key from the live contract
             values outside a closed list
             keys that do not resolve to anything
           GATE BYPASS
             derived fields written by a person, overrides rising
             work completed with required evidence absent
             contacts made with no suppression check recorded
           SHADOW REGISTER
             creation bursts after a quiet period
             a low derived rate against a high completion rate
           SILENCE
             obligations falling due with no work raised in the window
           write one DriftFinding per detection, per segment
  never    re-raise a finding whose status is accepted

FLOW 2  The digest
  trigger  scheduled, weekly, UNCONDITIONAL
  logic    for each segment: post its own findings to its own
            channel, with the same detail the centre sees
           post the roll-up to the centre's channel
           any segment past its thresholds: notify its named coach
            directly, by name, not by adding them to a group post
  never    skip the post because the numbers are bad. The absence
           becomes the signal and then you cannot use either.
```

The two pattern detections in Flow 1 are the ones worth the effort. Schema and gate bypass are ordinary queries; shadow register and silence are the two that look identical to a quiet branch, and they are where the money goes.

## 5. The Power BI model, the score and the security

```
-- Compute the inputs once, from the underlying standard's own gates.
Derived Rate     = DIVIDE ( [Records Derived], [Records Total] )
Bound Rate       = DIVIDE ( [Work With Evidence], [Work Completed] )
Gated Rate       = DIVIDE ( [Contacts Gated], [Contacts Total] )
Coverage         = DIVIDE ( [With Future Obligation], [Active Subjects] )
Ack Rate         = DIVIDE ( [Acked In Threshold], [Queue Entries] )

Conformance Score =
VAR w = { ( "d", 0.3 ), ( "b", 0.3 ), ( "g", 0.2 ), ( "c", 0.1 ), ( "a", 0.1 ) }
RETURN ROUND (
    100 * (
          0.3 * [Derived Rate] + 0.3 * [Bound Rate] + 0.2 * [Gated Rate]
        + 0.1 * [Coverage]     + 0.1 * [Ack Rate]
    ), 0
)

Open Findings =
CALCULATE ( COUNTROWS ( DriftFindings ), DriftFindings[Status] = "open" )

Accepted Variations =
CALCULATE ( COUNTROWS ( DriftFindings ), DriftFindings[Status] = "accepted" )

Silent Segments =
CALCULATE (
    DISTINCTCOUNT ( DriftFindings[Segment] ),
    DriftFindings[Kind] = "silence"
)

-- Row level security. Group membership, never a typed name.
-- role "Segment":  [SegmentId] IN
--   the segments whose EntraGroup contains USERPRINCIPALNAME(),
--   resolved from a bridge table the drift flow maintains.
-- The centre's role has no filter.
```

Weight the score however suits the business, but compute it in one model. The moment two segments can produce their own version of the same number, the weekly conversation stops being about the work and becomes about whose number is right, and that argument never ends.

## 6. What the flows can read across your branches, and what they never change

The flows show the centre which branches have drifted from the standard, and where. They read each branch’s lists and who is in each group, write what they find in the centre’s site, and post a digest to each branch’s channel. You have every conversation with a branch that crosses a threshold, and you decide whether a local difference is fair and whether a low score is a real problem.

What each connection is for.

- **Each branch site, read.** Every site linked to the hub, for the four drift checks. Nothing on a branch site is written.
- **The centre’s site.** Read on KeyContract and Segments, write on DriftFindings. That list is the only thing the flows write.
- **Group membership, read.** To give every record its branch from the Microsoft group it sits in, never from a typed label.
- **Teams.** To post each branch’s findings to its own channel, the roll-up to the centre’s, and a message to a coach by name when a branch passes its thresholds.
- **Power BI, read.** The model, the score and row level security read the lists and write nothing back.

Keep each one to the least it needs.

1. Create a service account for the flows and build them in a solution that account owns, with a named person at the centre as co-owner. A flow owned by a person stops working the day that person leaves, and the digest goes quiet with it.
2. Create every connection as the service account and use it through the solution’s connection references, so no manager’s own login sits inside a flow.
3. Give the service account read on each segment site and edit on the centre’s site only. If an app registration is used instead, grant it Sites.Selected, with read on each segment site and write on the centre’s alone.
4. Let it read group membership and never own a group. An app registration needs GroupMember.Read.All for this, not a permission that writes to groups.
5. Give the flows no mailbox. The digest posts to Teams channels, so there is no Outlook connection to scope.
6. Where segments are on their own tenants, the flows read only the centre’s shared site or the agreed extract, as section 1 decided. They get no account inside a franchisee’s tenant.

How to cut it off. Turn the flows off in Power Automate and no more findings or digests are written. Remove the service account from a segment site and the next run reads nothing from that segment. Block sign-in on the service account and every connection it owns stops working.

Why not give the centre’s managers edit access to every branch site? It is quick, and it works on day one. It is also the access that lets a well-meaning manager fix a branch’s row, which hides the very drift this standard exists to show. Give the centre read access and the findings, and leave each branch’s records to the branch.

## 7. The order to build it in

1. Answer the tenancy question. Write the answer down.
2. Create the hub site and associate the segment sites to it.
3. Create Segments with real Entra group ids, a real owner and a real coach for each. A branch with no named coach has nobody to send findings to, and its threshold means nothing.
4. Write KeyContract version 1. It takes a conversation more than data entry, and it is the part people will argue about.
5. Apply the required-key validation to the underlying lists and confirm a row missing one cannot be saved.
6. Build Flow 1 with the schema checks only. Run it, and expect the first result to be worse than anybody predicted.
7. Add gate bypass, then the two pattern detections.
8. Build the model, the score and row level security. Verify a segment user sees only their own.
9. Build Flow 2 and let it post once while the numbers are still bad.

## 8. Four traps specific to this build

### Franchisees on their own tenants

Settle this before anything else. If each franchisee owns a separate Microsoft tenant, none of this works as written, because reports across branches, shared lists and one Power BI model all assume one tenant. The realistic options are a shared site the branches join as guests, or each branch sending an agreed export to the centre. Both work. Finding out three weeks into a build does not.

### A site per branch with no hub

Separate sites inside one tenant are fine, but the drift flow then has to go through them one by one instead of reading one list. Associate them to a hub site from day one, or accept that adding a branch means editing a flow, which is exactly the maintenance nobody does.

### Segment as a typed choice column

It looks the same and goes wrong almost at once. Somebody is moved between branches, the group membership changes and the column does not, and every number about that person is now filed under the wrong segment with nothing to detect it.

### Punishing the honest branches

A branch that records its problems scores worse than one that hides them. If the score is used to punish branches, you will have clean numbers within two months and nothing they can tell you. Read a low score as a question, and watch for a segment whose numbers improve without anything changing.

## 9. Where the automation stops

- Accepting a local variation as legitimate, and recording why.
- Changing the key contract, which means a new version and a conversation first, never a quick edit.
- Every conversation with a branch that has crossed a threshold.
- Judging whether a low score is a compliance problem or an honest branch recording what a quieter one is hiding.
- Deciding a new branch is ready to take real records.

**The pass test.** In a test copy, break the contract two ways in one branch. Put a value in a closed-list field that is not on the list, and do something a check should prevent, such as typing in a date the system is meant to work out. Then wait for the next scheduled run without touching anything. Both must appear as DriftFindings against that branch, with enough detail to find the record, and both must appear in the copy that branch receives as well as the centre’s. If either is missing, the build is only a report and catches nothing. If they reach only the centre, you have built surveillance, and it will be treated as such.

## Related reading

- The multi-site conformance build standard
- Building the standards on Microsoft 365
- The rejected pack on Microsoft 365
