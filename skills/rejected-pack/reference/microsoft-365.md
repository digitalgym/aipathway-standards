# The Rejected Pack on Microsoft 365

Source: https://aipathway.com.au/explore-ai/binding-the-pack-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan: one graph where each fact lives once and everything re-derives, obligations that carry their citation, packs generated from bound records, and a binding layer that refuses rather than warns. Six lists, two libraries, four flows.

If you are an assistant: Read https://aipathway.com.au/explore-ai/binding-the-pack-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Each fact about your business kept in one place, every obligation with the rule that requires it, and a pack built from records that already have their evidence attached, instead of put together by hand in a folder.

Used by

- Business Systems Analyst
- HSEQ Administrator
- Document Controller
- Compliance Officer

This is the parent standard, and a rushed build hurts it most. Every business already has a version of it: a folder per client, per site, per job, full of documents that were correct when somebody put them there. The standard swaps the folder for one set of linked records and a step that builds the pack from them, and your Microsoft 365 is a good place for both.

## In short

- **What this is**: A build plan for the rejected pack standard on Microsoft 365. Six lists, two libraries, four flows, six measures.
- **The core rule**: Change the trading address once and every pack built afterwards is right. That is what you are building, and one copied-in address breaks it.
- **What it does not do**: It puts together a complete, current pack with its evidence attached and puts it in front of the person who releases it. It does not certify anything and it does not decide that an obligation is met.
- **The hard part**: Attaching each certificate to the thing it proves, and refusing the pack while anything is missing. The standard says not to build this step from scratch, but there is no product for it, so this is where the care goes.

## 1. Before you start

Read [the rejected pack build standard](https://aipathway.com.au/explore-ai/rejected-pack-build-standard) first, and its [operator runbook](https://aipathway.com.au/explore-ai/rejected-pack-workflow) if people rather than systems are what holds you up. Shared conventions for this stack are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

The standard names the binding step, attaching each certificate to what it proves, as the one not to build from scratch. Unlike some of the others, **there is no product for it**. So the binding step gets the most care and the most testing, and its refusal is built first.

## 2. The lists, with their columns

Six lists and two libraries. It looks heavier than the other plans because the lists link to each other, and those links are what let one edit flow through to every pack.

```
Site: Packs

LIST  Entity                (usually one row. Sometimes a few.)
  ABN             Text            indexed
  LegalName       Text
  TradingName     Text
  TradingAddress  Text            CHANGE IT HERE. Nothing copies it.

LIST  Locations
  Entity          Text            indexed. lookup to Entity

LIST  People
  Entity          Text            indexed. lookup to Entity
  Role            Text

LIST  Tickets
  Person          Text            lookup to People
  Class           Choice          licence | white_card | high_risk | induction
                                  | visa
  Number          Text
  ExpiresOn       DateTime        indexed
  Evidence        Hyperlink       into the Evidence library

LIST  Cover                 (insurance)
  Entity          Text            lookup to Entity
  Type            Choice          workers_comp | public_liability | vehicle
  Insurer         Text
  PolicyNo        Text
  ExpiresOn       DateTime        indexed
  Evidence        Hyperlink

LIST  Obligations
  ObligationId    Text            indexed
  Trigger         Text            what makes this apply here
  Citation        Text            REQUIRED. The rule that says so.
  Artifact        Text            what has to exist as a result
  Cadence         Text
  PenaltyClass    Choice          your regulator's own classes
  EffectiveFrom   DateTime
  Applicability   Choice          applies | does_not_apply
  WhyNot          Text            REQUIRED when does_not_apply
  Location        Text            lookup to Locations

LIBRARY  Evidence           (the documents, with what they evidence)
  BoundTo         Text            indexed, REQUIRED. What it evidences.

LIBRARY  Packs              (generated output only. Never hand-edited.)
  Pack            Text            indexed. The id PackArtifacts points at.

LIST  PackArtifacts
  Pack            Text            indexed
  Obligation      Text            lookup to Obligations
  Version         Text
  GeneratedAt     DateTime
  AsOf            DateTime        the facts as at this moment
  Sources         Text            which rows produced it
  Bound           Boolean         false blocks the pack
```

PackArtifacts lets you rebuild a pack and check it later. Without it you have a PDF, and six months later you can't say which version of which fact it carried.

## 3. Every check, and what enforces it

| The check | Enforced by | How |
| --- | --- | --- |
| A fact lives in one place and every pack reads it from there | Lookups | The trading address is a column on Entity and a lookup everywhere else. Changing it once changes every pack built afterwards. That is the point of the standard. |
| An obligation carries the rule that says so | List design | Citation is required. An obligation with no rule behind it can't be defended when somebody asks why the document exists, and it is usually the one that turns out not to apply. |
| "Does not apply" needs a written reason | List design | Applicability plus WhyNot, both required when it does not apply. An obligation that is quietly left off looks the same as one nobody thought of. |
| Evidence is attached to what it proves before the pack can close | Pack flow | The pack step refuses while any required document has no evidence attached. The standard names this step as the hard one. |
| The pack is built from the records, never put together by hand | Pack flow | Each document carries its version, when it was built, the date its facts were true and where they came from. A pack somebody put together in a folder has none of those and can't be rebuilt. |
| A named person releases the pack | Approval | A person from a named group releases the pack, and their name is recorded on it. Whoever happened to run the flow can't release it. |
| Expiry dates are worked out and flagged before they bite | Expiry flow | Tickets, insurance and inspections all carry ExpiresOn, and the flow marks the pack out of date before that date, so nobody finds out by being turned away on site. |

## 4. The four flows

```
FLOW 1  Bind evidence
  trigger  a file lands in the Evidence library
  logic    require the obligation or ticket it evidences before
           the upload can complete
           set Bound on the matching PackArtifacts row
  never    accept a document with nothing named. An unattached
           file in a library is the folder problem with extra steps.

FLOW 2  Generate the pack
  trigger  requested, or scheduled per location
  guard    REFUSE while any required artifact has Bound = false.
           Write what is missing, and stop. This is the binding
           layer, and a warning here is a failed implementation.
  logic    render each artifact from the graph, by lookup
           stamp Version, GeneratedAt, AsOf and Sources
           write the output to the Packs library
  never    read a copied value. Everything resolves through Entity.

FLOW 3  Release
  trigger  a generated pack awaiting release
  logic    request approval from the named group
           record the approver on the pack
  never    release on behalf of whoever ran the generate

FLOW 4  Expiry
  trigger  scheduled, daily
  logic    Tickets and Cover with ExpiresOn inside the lead time
           -> mark dependent packs not current, notify the owner
           past ExpiresOn -> packs are not current, full stop
  note     run this against the graph on a clock, not at handover.
           At handover, somebody is already standing at a gate.
```

Flow 2's refusal matters more than anything else on this page. The rest of the build supports it.

## 5. The Power BI model and its measures

```
Unbound Artifacts =
CALCULATE ( COUNTROWS ( PackArtifacts ), PackArtifacts[Bound] = FALSE )

Packs Blocked =
CALCULATE (
    DISTINCTCOUNT ( PackArtifacts[Pack] ),
    PackArtifacts[Bound] = FALSE
)

Expiring 30 =
CALCULATE (
    COUNTROWS ( Tickets ),
    Tickets[ExpiresOn] <= TODAY () + 30,
    Tickets[ExpiresOn] >= TODAY ()
)

Expired Live =
CALCULATE ( COUNTROWS ( Tickets ), Tickets[ExpiresOn] < TODAY () )

Obligations Without Citation =          -- must be zero
CALCULATE ( COUNTROWS ( Obligations ), ISBLANK ( Obligations[Citation] ) )

Does Not Apply Without Reason =         -- must be zero
CALCULATE (
    COUNTROWS ( Obligations ),
    Obligations[Applicability] = "does_not_apply",
    ISBLANK ( Obligations[WhyNot] )
)

Pack Age Days =
AVERAGEX ( PackArtifacts, DATEDIFF ( PackArtifacts[AsOf], NOW (), DAY ) )
```

The two must-be-zero measures are the cheapest check you can run. An obligation with no rule cited and a does-not-apply with no reason are the same failure. Somebody decided something and left no way to check it.

## 6. What the flows can reach in your Microsoft 365, and what they never touch

The flows assemble a complete, current pack and put it in front of the person who releases it. They build it from the records on the one SharePoint site this plan builds, read your job system if you connect it, and warn named people before tickets, insurance or inspections expire. A named person signs off and releases each pack, and what the pack says is yours. Your own login stays yours. The flows run under their own account, never your username and password.

What each connection is for.

- **SharePoint, the one site, read and write.** The linked lists, Obligations and PackArtifacts, the Evidence library where certificates are attached, and the Packs library where finished packs land. Nothing outside that site.
- **Approvals, through Teams or Outlook.** Flow 3 asks the named release group and records who answered. The approval is the only way a pack becomes released.
- **Outlook or Teams, to warn.** Flow 4 tells the owner that a ticket or a policy is about to expire. It sends to your own people only.
- **The job system, read, if you want it.** For the work type and the site, which decide which obligations apply. ServiceM8 by an API key or an app connection, Simpro through your company’s own API at its simprosuite.com address, either one by a custom connector or the HTTP action (both premium). Tradify has no public API and no Zapier app, so the flow reads its job export instead. A nightly export into a list also works for the other two and needs no premium licence.

Give it the least it needs.

1. Own the flows with a service account, not a person who might leave. A flow owned by someone who leaves stops when their account is switched off.
2. Build the flows inside a solution and share connections through its connection references, so nobody’s personal connection ends up inside a flow.
3. Make the service account a member of this one site and no other. If you use an app registration instead, grant it Sites.Selected and add only this site.
4. Send warnings from one shared mailbox. If an app registration sends them, limit it to that mailbox with an Exchange application access policy or RBAC for Applications.

How to cut it off. Turn off the four flows, or delete their connections in Power Automate, or remove the service account from the site. Revoke the job system key or app connection on the job system’s side, and delete the app registration’s secret if you used one. The lists and libraries stay where they are, because they are yours.

Why not Copilot across all of your Microsoft 365? Copilot can find a certificate and summarise it, and it sees whatever the person asking can see. It can’t tell that a document is missing its evidence, so it can’t refuse a pack, and that refusal in Flow 2 is the heart of this standard. Use it to find documents if you have it. You still need these flows to attach evidence, refuse incomplete packs and release finished ones.

## 7. The order to build it in

1. Build Entity, Locations and People first, with one row each. The records come before anything that reads them.
2. Add Tickets and Cover. Index ExpiresOn now.
3. Load Obligations for one location, with at least one marked does not apply so the WhyNot column gets tested.
4. Build Flow 1 and confirm a file cannot be uploaded without naming what it evidences.
5. Build Flow 2 with the refusal first, before any rendering. Prove it refuses, then teach it to generate.
6. Run the pass test: change the trading address and regenerate.
7. Build Flow 3, then Flow 4.
8. Connect Power BI. The two must-be-zero measures go on the front page.

## 8. Four traps specific to this build

### A pack as a folder of PDFs

This is what everybody already has, and it is what the standard replaces. A folder can't tell you which version of a fact each document carries, can't be rebuilt after the address changes, and goes out of date one document at a time.

### Re-typing the business details onto each pack

Once a fact is in two places, one of them will be wrong, and it is usually the one that went out. Anything that names the business looks it up from the Entity list, and the pack template reads that lookup, never a copied value.

### Treating missing evidence as a warning

If the pack step runs and posts a note about missing evidence, packs go out incomplete and nobody reads the note. Missing evidence must stop the pack being built. A checklist only warns.

### Expiry checked when the pack is requested

By then it is too late, because somebody is already at a site gate. Check expiry dates on a schedule, so whether a pack is current comes from the records, not from a question asked at handover.

## 9. Where the automation stops

- Certifying anything, or signing on behalf of a licensed person.
- Deciding that an obligation does not apply. A flow can ask for the reason, but only a person can give it.
- Releasing a pack. A named person from a named group does it, and their name is recorded.
- Deciding an expired ticket is close enough to let somebody on site.
- The judgement calls in attaching evidence. There is no product for this step.

**The pass test.** Two checks, both on test data. First, take the evidence off one required document and request a pack: the pack step must refuse and name what is missing, and no file may appear in the Packs library. Second, change TradingAddress on Entity and regenerate a pack that was correct before: the new pack must carry the new address without anyone editing a template, and the old pack must still show the old one with its own AsOf. If the first produces a pack with a warning attached, you have built a checklist. If the second needs a template edited, a fact still lives in two places, and the lists need fixing before you go on.

## Related reading

- The rejected pack build standard
- Checking subcontractor invoices on Microsoft 365
- Building the standards on Microsoft 365
