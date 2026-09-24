# Multi-Site Conformance on Microsoft 365

Source: https://aipathway.com.au/explore-ai/multi-site-conformance-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan that starts with a question: one Microsoft tenant or several? Then a versioned key contract, four drift checks on a schedule, one conformance score computed once, row level security from Entra groups, and a digest that posts whether or not the numbers are good.

If you are an assistant: Read https://aipathway.com.au/explore-ai/multi-site-conformance-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Shared keys, drift detection on a clock, one score computed once, and one question about tenancy that decides whether any of it is possible.

Used by

- Franchise Manager
- Operations Manager
- Business Systems Analyst

This build plan has an unusual first step, and it is not technical. Before any list is created somebody has to answer whether the branches live in one Microsoft tenant or several, because the answer changes everything that follows and it is the one thing that cannot be fixed later with a flow.

## In short

- **What this is**: A build plan for the multi-site conformance standard on Microsoft 365. Three lists on top of whatever the underlying standard already built, two flows, one score.
- **The core rule**: Segment resolves through an Entra group. A typed label looks identical on day one and is wrong by the first time somebody changes branch.
- **What it does not do**: It surfaces drift and scores it the same way everywhere. What to do about a branch that keeps drifting is a conversation between two named people.
- **The hard part**: The tenancy question. Everything here assumes one directory, and separate franchisee tenants need a different shape entirely.

## 1. The question to settle first

Read [the multi-site conformance build standard](https://aipathway.com.au/explore-ai/multi-site-conformance-build-standard) first, and note that it sits above the others: you implement a calendar or a pack, and this is how that survives being deployed to fourteen places. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Then answer this. **One tenant, or several?** Branches of one company are usually one tenant and everything below applies directly. Franchise networks frequently are not: each franchisee owns their own directory, and then shared lists, cross-segment queries and a single semantic model are all unavailable.

If it is several, you have two workable shapes. Guest access to one shared site owned by the centre, which keeps this plan intact and costs you an onboarding conversation per segment. Or each segment publishes an agreed extract on a schedule and the centre holds only that, which keeps everyone independent and means drift detection sees what the extract carries and nothing else. Pick deliberately. Both are defensible; drifting into the second by accident is not.

## 2. The lists, with their columns

Three lists on top of whatever the underlying standard already built. They are deliberately thin: this standard governs other lists rather than holding work of its own.

```
Site: Conformance   (a hub site, with the segment sites associated)

LIST  Segments
  SegmentId       Text            indexed
  Name            Text
  Kind            Choice          branch | franchise | region | entity
  EntraGroup      Text            the group object id. THE source of truth.
  Owner           Person          required
  Coach           Person          required
  OnboardedOn     Date
  Thresholds      Text            when this segment routes to its coach

LIST  KeyContract                 (versioned; supersede, never edit)
  Version         Text            required
  EffectiveFrom   Date            required
  RequiredKeys    Multi-line      the identifiers every record carries
  RequiredFields  Multi-line      per record type
  ClosedLists     Multi-line      field -> permitted values
  ExtensionRule   Text            "add freely, never rename or fork"

LIST  DriftFindings
  Segment         Lookup -> Segments
  DetectedOn      Date            indexed
  Kind            Choice          schema | gate_bypass
                                  | shadow_register | silence
  RecordRef       Text            enough to find the row
  Detail          Multi-line
  Status          Choice          open | accepted | resolved
  Owner           Person
  ResolvedOn      Date

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
| Segment comes from group membership | Segments list | The Segment column resolves through an Entra group, never a label somebody types. Ownership cannot then drift away from access. |
| Drift is detected on a schedule, all four kinds | Drift flow | One scheduled flow writing DriftFindings. Schema and gate-bypass are queries; shadow register and silence are patterns over time. |
| One definition of every measure | One model | A single semantic model. No segment can publish its own version of the same number, which is the argument that otherwise consumes every review. |
| The digest posts on a fixed schedule regardless | Digest flow | Unconditional. A report that appears when the numbers are good teaches everybody to read its absence. |
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
--   SELECTCOUNT of the segments whose EntraGroup contains
--   USERPRINCIPALNAME(), resolved from a bridge table the
--   drift flow maintains.
-- The centre's role has no filter.
```

Weight the score however suits the business, but compute it in one model. The moment two segments can produce their own version of the same number, the weekly conversation stops being about the work and becomes about whose number is right, and that argument never ends.

## 6. The order to build it in

1. Answer the tenancy question. Write the answer down.
2. Create the hub site and associate the segment sites to it.
3. Create Segments with real Entra group ids, a real owner and a real coach for each. A segment with no named coach cannot be routed to and the threshold is decoration.
4. Write KeyContract version 1. This is a conversation, not a data entry task, and it is the deliverable people will argue about.
5. Apply the required-key validation to the underlying lists and confirm a row missing one cannot be saved.
6. Build Flow 1 with the schema checks only. Run it, and expect the first result to be worse than anybody predicted.
7. Add gate bypass, then the two pattern detections.
8. Build the model, the score and row level security. Verify a segment user sees only their own.
9. Build Flow 2 and let it post once while the numbers are still bad. That first ugly digest is the whole culture of this standard.

## 7. Four traps specific to this build

### Franchisees on their own tenants

Settle this before anything else. If each franchisee owns a separate Microsoft tenant, none of this works as written: cross-tenant querying, shared lists and one semantic model all assume one directory. The realistic options are a shared site the segments are guests in, or each segment publishing an agreed extract to the centre. Both are workable. Discovering the question three weeks into a build is not.

### A site per branch with no hub

Separate sites inside one tenant are fine, but the drift flow then has to enumerate them rather than query one list. Associate them to a hub site from day one, or accept that adding a branch means editing a flow, which is exactly the maintenance nobody does.

### Segment as a typed choice column

It looks identical and it decays immediately. Somebody is moved between branches, the group membership changes and the column does not, and every number about that person is now filed under the wrong segment with nothing to detect it.

### Scoring honesty out of the system

A branch that records its problems scores worse than one that hides them. If the score is used punitively you will have clean numbers within two months and no instrument. Read a low score as a question, and watch for a segment whose numbers improve without anything changing.

## 8. Where the automation stops

- Accepting a local variation as legitimate, and recording why.
- Changing the key contract, which is a version and a conversation, not an edit.
- Every conversation with a segment that has crossed a threshold.
- Judging whether a low score is a compliance problem or an honest branch recording what a quieter one is hiding.
- Deciding a new segment is ready to take real records.

**The pass test.** In a non-production copy, break the contract two ways in one segment. Put a value in a closed-list field that is not on the list, and do something a gate should prevent, such as typing a date the system derives. Then wait for the next scheduled run without touching anything. Both must appear as DriftFindings against that segment, with enough detail to find the record, and both must appear in the copy that segment receives rather than only in the centre’s. If either is missing you have a report rather than a control. If they reach only the centre, you have built surveillance, and it will be treated as such.

## Related reading

- The multi-site conformance build standard
- Building the standards on Microsoft 365
- The rejected pack on Microsoft 365
