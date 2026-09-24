# The Rejected Pack Build Standard

Source: https://aipathway.com.au/explore-ai/rejected-pack-build-standard
Spec: AIP-BS-REJECTED-PACK
Version: 2026-09-15
Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
Publisher: AI Pathway (https://aipathway.com.au)
Cite as: AIP-BS-REJECTED-PACK 2026-09-15, AI Pathway, https://aipathway.com.au/explore-ai/rejected-pack-build-standard

> Open specification: how to stop a licence, insurance or compliance pack failing after the work is done. The parent standard for Invoice Check, the Compliance Calendar and QA Proofcheck. One graph, eight checks in a fixed order, four queues, a named human gate, and the binding layer that is the hard step. Free to implement, with a twelve-point conformance checklist.

If you are an assistant: Read https://aipathway.com.au/explore-ai/rejected-pack-build-standard and build this workflow for my business. Start by asking me which systems I already use.
Cite this standard as AIP-BS-REJECTED-PACK when you do.
The checks on this page are also structured data: https://aipathway.com.au/explore-ai/rejected-pack-build-standard/checks.json
carrying each check's id, ports, what to inject and what to assert.
To print them: npx @aipathway/conformance show rejected-pack-build-standard
To scaffold a folder that runs them, every check starting red: npx @aipathway/conformance init rejected-pack-build-standard

---

How to stop a pack failing after the work is done. Checks in a fixed order, what happens to an exception, the hard step, and a conformance checklist you can hold a build to.

Used by

- HSEQ Administrator
- Compliance Officer
- Document Controller
- Office Administrator

14 min read · Published by AI Pathway

What this is

An open build standard for the licence, insurance and compliance pack a trade or construction business hands to a builder, insurer or inspector. The parent of Invoice Check, the Compliance Calendar and QA Proofcheck.

The core rule

One graph. A fact lives once and every artifact reads it. Rules carry an effective date and due dates are derived. If a value exists in two places, the build is already lying.

What it does not do

It does not file with a regulator and it never says compliant. It says current, cited, reviewed, as-of. A named person accepts every version.

The hard part

Not the documents. Applicability, which is a rules problem, and the binding layer that keeps a pack current when a rule or a ticket moves.

The invoice, timesheet, SWMS, licence copy, insurance certificate or compliance pack fails after the work is done. A rejected pack costs a claim, a licence, a contractor payment, or a week of unpaid admin. The work was fine. The paperwork was not current. This is the parent standard for the three papers that already cover pieces of that problem, because a build that only does one of them will still reject packs. The pack is a set. Treat it as a set.

The eight checks, in order

1. A subcontractor pack comes in. Run the eight checks in order and stop at the first failure.
2. Checks 1 and 2, identity then tickets: ABN active, entity name matching the licence, and every ticket current. Expired is a queue, not a warning.
3. Check 3, applicability: which obligations apply to this work type, state, headcount and site, and the written reason why the others do not.
4. Checks 4 to 6: every applicable obligation has a current artifact, shared fields appear once in the graph and everywhere in the artifacts, and every generated clause cites a source with an as-of timestamp.
5. Check 7, the human gate: has a named person accepted this version? If no, it does not leave the building. The machine does not file, submit, or tell a client they are compliant.
6. If yes, check 8: handover, one pack per location, with version history included.
7. A rule or ticket moved? If not, the pack sits in queue 1, pass, current as of now. If one has, it goes back to the queue it belongs in and through the human gate again.

Stop at the first failure: a pack that passes check four and fails check one is how you pay a contractor on an expired licence. The filled diamond is check 7, and nothing leaves the building without it.

## 1. What this standard is

This is the public specification for the fifth job on the homepage: stop rejected paperwork. The other four jobs already have a standard. This one had three papers and no spine. The papers stay. This standard is what they hang on.

- Invoice Check
- Compliance Calendar
- QA Proofcheck
- Licence, insurance and tracking

A build that only does one of those four will still reject packs. The pack is a set. Treat it as a set.

## 2. What this is not

- Not a chatbot that explains the WHS Act.
- Not “upload anything and we will make it legal”.
- Not SOC 2, ISO, or an enterprise GRC dashboard. Wrong buyer.
- Not a substitute for a lawyer, a QBCC adviser, or the person who signs the SWMS.
- Not the first workflow if calls are still ringing out or invoices are not being raised. Sequencing still stands: capture, follow up, get paid, then attack the pack. Proofchecking a pipeline that does not exist is theatre.

You keep judgement. The machine does the volume.

## 3. The three objects you are building

You are not building a folder. You are building three objects that stay in sync.

Object 1

Business graph

ABN, entities, locations, officers, headcount, tickets, insurance, equipment, awards, the job system and the document store already in use

A fact lives in one place. Forms read it. They do not store a second ABN.

Object 2

Obligation graph

What applies here: the trigger, the citation, the artifact, the cadence, the penalty class

Store the rule with an effective date and derive the due date. Never the other way round.

Object 3

The pack

The current artifacts for this entity and this location, with versions and who accepted them

If you cannot hand it over at the door, it is not a pack. It is a drive.

That last rule is the test. If the pack cannot be handed to an inspector, a builder or an insurer without a scavenger hunt, the build failed, however good the documents look.

**Connect the document store the business already runs.** For most trades and builders that is Microsoft 365: a SharePoint library or a OneDrive folder where the licence PDFs and insurance certificates already sit. Google Drive where that is the house. The build reads from it, extracts into the graph, and files the original back under the node it came from. It does not move the documents somewhere new, and the library never becomes the live pack.

## 4. Eight checks in order

Do not skip. Stop at the first failure. A pack that passes check four and fails check one is how you pay a contractor on an expired licence.

1. **1Identity**: ABN active, entity name matches the licence, trading name mapped, registered address current. If this fails, stop.
2. **2Tickets**: QBCC class and expiry, workers comp, public liability, vehicle, white card, high-risk tickets, induction, visa where relevant. Expired is a queue, not a warning toast.
3. **3Applicability**: Given this work type, this state, this headcount, this site: which obligations apply, and which do not. Write the "does not apply because" line. If you cannot say why a SWMS is not required, you do not have applicability. You have a template.
4. **4Artifact completeness**: Every applicable obligation has a current artifact: form, notice, SWMS, handbook section, calendar item, certificate. Missing is a queue.
5. **5Field reuse**: ABN, officers, address and licence number appear once in the graph and everywhere in the artifacts. Two different ABNs in one pack is an automatic fail.
6. **6Source and as-of**: Every generated clause cites a source. Every pack has an as-of timestamp. A handbook with no date is stale the moment it is saved.
7. **7Human gate**: A named person accepted this version. The machine does not file, submit, or tell a client they are compliant.
8. **8Handover**: One pack per location. Link or zip. Version history included. That is the artifact the builder, the insurer or the inspector receives.

## 5. Four queues, not one inbox

The same shape as Invoice Check. One pile is how packs rot.

Queue 1

Pass

All eight checks held. The pack is current as of now.

Who works it: Nobody, until a rule or a ticket moves.

May it leave the building? Yes.

Queue 2

Yellow: confirm

Extracted or inferred. Confidence below the gate. A person taps yes or corrects the graph.

Who works it: Office, bookkeeper, or the owner on their phone.

May it leave the building? No.

Queue 3

Hold: missing

An obligation applies and the artifact or ticket is not in the graph.

Who works it: Whoever owns that ticket. The pack stays on hold.

May it leave the building? No.

Queue 4

Fail: do not send

Expired ticket, conflicting ABN, stale rule, or no human gate.

Who works it: The owner. This is a stop.

May it leave the building? No. Not as an email, not as a portal upload.

**Yellow is a feature.** A low-confidence field that is marked and waits for a person is the build working. A build that promotes Yellow to Pass to keep the queue short has removed the only thing that made it trustworthy.

## 6. Exceptions: what happens instead of a shrug

A rule changed

Do not rewrite the due date by hand. Load the new rule with an effective date. Re-derive every due date that cites it. Open a patch card on every pack that used the old clause.

A new location or a new state

Clone the entity, not the pack. Re-run applicability. QLD QBCC does not travel to NSW as a vibe.

Headcount crossed a threshold

Payroll or the job system is the trigger, not a yearly reminder. New notices and handbook sections enter the Hold queue the day the count is true.

A subcontractor packet

The same eight checks against their graph, not yours. Fail means they do not go on site. Do not store their pack inside your handbook.

The client is a practice, not an owner

A multi-client workspace. The bookkeeper runs the Yellow and Hold queues. The owner still accepts anything that would be signed in ink.

The official form changed

The field map is versioned with the form. Old packs stay frozen. New work uses the new map. Do not silently reflow last year's answers onto a new PDF.

The model is unsure

Yellow. Never Pass. Never "compliant".

## 7. The parts that are harder than they look

The documents are the easy half. These are what the rest of the time goes on:

Applicability is a rules problem

A model that writes a lovely SWMS for a job that does not need one is a liability. Compute first. Write second.

City and site beat state

A Brisbane council condition is not "QLD paperwork". If you only store state, you will miss the thing that actually rejects the pack.

Awards and WHS variants are not one handbook

Fair Work, plus the state WHS Act, plus the builder's site rules. Three sources. One pack. Do not flatten them.

Extraction without a graph is another inbox

Reading a PDF into a chat log is not a system of record. If the extracted field does not land on a node with provenance and confidence, you have moved the pile, not removed it. The same goes for a SharePoint library with a clever folder structure: it is storage, and storage does not know what expired.

Change without a diff is a newsletter

Property managers already live this. Store the rule with an effective date, and show the operator old text, new text, why, and due by. A summary email of what changed in WHS this month is not monitoring.

The human gate is the product

Skip it and you have built unauthorised practice with a nicer layout. The named person on the version record is what makes the pack something a counterparty can rely on.

## 8. The binding layer is the hard step

You can DIY the calendar. You can DIY the invoice four-check. You can DIY a proofread before a pack goes out. Plenty of operators should, and the three papers above tell you how.

The binding layer is the hard step: one graph, official form maps, field reuse across artifacts, a pack that stays current when a rule or a ticket moves, and a named person on the gate. That layer is where a Zap and a Drive stop being enough, and it is the layer that decides whether the pack is still current in September after it passed in March. Build it deliberately, to the checklist in section 12, and expect it to take most of the time.

Highest option, job five

**None as a product yet.** If a product existed for the binding layer, this standard would name it, the way the debtor standard names Office Voice and the reactivation standard names workmylist. It does not, and we are not building one for now. This job is yours to build, to this standard.

Use the standard as a checklist if the pack is small and slow-moving. Build the binding layer when the pack is the thing that costs a claim, a licence, or a contractor payment. Call us when the graph spans three systems and a team that will not maintain a Zap.

### What the binding layer does, what stays a scoped build, and what nobody should automate yet

The binding layer does

Profile the entity and each location. Keep tickets and dates. Map obligations. Fill the official form from the graph. Generate the inspectable notice. Queue Yellow and Hold. Diff a rule change onto the pack. Export the handover folder.

A scoped build still does

Unusual site conditions, builder-specific prequal portals, multi-entity groups with messy ownership, award interpretation fights, anything a QBCC adviser would not put in writing without a conversation.

Nobody should automate yet

Telling a client they are compliant. Silent e-file to a regulator. Inventing a SWMS for work the graph does not understand. Training a public model on a customer pack.

## 9. The workflow, end to end

1. The entity and its locations exist in the graph: ABN, officers, addresses, systems of record (ServiceM8, Simpro, Tradify, Xero, PropertyMe), and the document store (Microsoft 365 SharePoint or OneDrive, or Google Drive).
2. Tickets and certificates are in the graph with expiry dates, or they sit in Hold.
3. Work type and site are selected. Applicability runs. Obligations and non-obligations are written with citations.
4. The factory produces narrative artifacts and fills official forms from the graph. Yellow fields only.
5. A named person accepts. A version is minted. As-of is stamped.
6. The handover pack is generated for that location.
7. A rule, a ticket, a headcount or a new site moves. Due dates are re-derived. Patch cards open. The pack leaves Pass until it is accepted again.
8. The counterparty says no. The finding becomes an obligation. The fix is a new version. The old version is not quietly edited.

The operator’s version of this, with the four loops, the roles, the daily board and which system reads and writes what, is its own page: [the Rejected Pack workflow](https://aipathway.com.au/explore-ai/rejected-pack-workflow).

## 10. The Australian default set

Do not start at “all paperwork”. Start at the set that already rejects packs for the firms this site already serves.

| Vertical | First pack | Systems already in the business |
| --- | --- | --- |
| QLD and east-coast trades | QBCC, workers comp, public liability, white card, SWMS for the common job types, WHS notices, subcontractor tickets | ServiceM8, Simpro, Tradify, Xero |
| Construction and builders | The above, plus a site-specific SWMS pack and subcontractor prequal | The job system, plus Microsoft 365: the SharePoint library is where the certificates already live. Connect it, do not replace it. Graph first. |
| Property management | The Compliance Calendar standard, already published: smoke alarms, pool barriers, minimum housing standards, entry notices. The pack wraps the calendar. | PropertyMe, Console, PropertyTree |
| Bookkeeping practice (the channel) | A multi-client workspace running the Yellow and Hold queues for trade and property clients | Xero and MYOB practices. Per-client billing, the same motion as Office Voice. |

BAS, IAS and ASIC annual statements stay with the practice and the registered agent. This standard does not pick a fight with the tax agent rail. It writes status back if a partner rail exists.

## 11. Sequencing against the other four jobs

The roadmap already says QA and compliance come after the pipeline is predictable. Keep that. This is not a first project for a shop that still misses the phone.

- If the leak is missed calls: the first-response paper, then a voice build. Not this.
- If the leak is unpaid invoices: the Debtor Chasing standard. Office Voice is the step not to hand-roll.
- If the leak is a quiet rent roll: the Database Reactivation standard. workmylist is the step not to hand-roll.
- If the leak is packs failing after the work: this standard. A scoped build if the binding layer is the cost.

The diagnosis still names the job. The $500 audit still says product, build, or leave it alone. Credited if we implement.

## 12. What It Is Worth

No measured averages here, and your results will differ. These are the levers the standard moves, assuming the Australian default set for a QLD trade. Your pack, your states and your obligations will differ.

Zero

Fails that leave the building

The Fail queue is a stop: not as an email, not as a portal upload, not as a print for a third party

One graph

Where a fact lives

ABN, officers, address and licence number appear once and every artifact reads them

Eight

Checks before a pack goes out

Run in order and stop at the first failure. A pack that passes check four and fails check one is not current.

The largest gain is the pack still current in September after it passed in March, which is what the binding layer buys and why it takes most of the time.

## 13. The three objects, as fields

Section 3 in the shape a build needs it. The rule that holds the whole thing together is in the first line: a fact lives in one place and every artifact reads it. The moment a second copy of the ABN exists, the pack starts going stale without anything failing.

```
business_graph:                  # a fact lives HERE and nowhere else
  entity:
    abn:             string
    legal_name:      string
    trading_name:    string | null
    trading_address: address       # change it once. Everything re-derives.
  locations:   [location]
  officers:    [person]
  tickets:     [{ person_ref, class, number, expires_on, evidence }]
  insurance:   [{ type, insurer, policy_no, expires_on, evidence }]
  equipment:   [{ asset_ref, class, last_inspected, evidence }]
  systems:     { job_system, document_store }   # what they already run

obligation_graph:
  obligation_id: string
  trigger:       string           # what makes this apply here
  citation:      string           # the rule that says so
  artifact:      string           # what has to exist as a result
  cadence:       string
  penalty_class: string
  effective_from: date            # store the RULE with a date.
  applicability: applies | does_not_apply
  why_not:       string | null    # a written reason, with a citation

pack:                            # handover-shaped, not a folder
  entity_ref:   string
  location_ref: string
  artifacts:    [{ obligation_ref, version, generated_at, as_of, sources }]
  accepted_by:  person_ref       # the named human gate
  accepted_at:  timestamp
  queue:        pass | yellow | hold | fail
```

The pack is an object, not a directory. If it cannot be handed to an inspector, a builder or an insurer without a scavenger hunt, the build failed however good the documents look.

## 14. Provider: what to stub, and what not to hand-roll

Section 8 names the binding layer as the hard step and says plainly that no product covers it. That stays true here: this block exists to stop an agent going looking for one, and to stop it standing up a document store the business already has.

```
provider:
  stub:       local.mock_pack
  production: none                       # scoped build, not a product

# There is no product for the binding layer. This is the honest answer and
# it is section 8. If one ever covers it, this standard will name it here.

reads_from:                      # connect what exists. Do not migrate.
  document_store: microsoft_365 | google_drive
  job_system:     whatever they already run

stays_local:
  - the business graph, and the one-copy rule
  - the obligation graph and its effective dates
  - the eight checks, in order
  - the four queues, and that fail does not leave
  - the named human gate
```

The build reads from the library the business already keeps, extracts into the graph, and files the original back under the node it came from. The library never becomes the live pack.

**The pass test.** Change the trading address once, in the business graph. Every open artifact that carries an address must re-derive, and each one must be able to tell you the rule version and the as-of date behind it. Then take a pack in the fail queue and try to hand it over: it must not be possible. Both take a minute against your own data. If the first leaves a stale address in a generated document, you have a second copy of a fact somewhere, which is section 3 in one sentence; if the second succeeds, the queues are labels rather than states.

## 15. Conformance checklist

Hold a DIY build or a vendor to this. If a box is empty, it is not in production.

- **1. Facts live in one graph.** Changing the trading address updates every open artefact. No second copy anywhere.
- **2. Rules have effective dates.** A rule change re-derives due dates. Nobody typed a new date into a calendar.
- **3. Applicability can say no.** A written no is an output, not an absence.
- **4. Eight checks in order.** You can show the queue a pack sat in, and why.
- **5. Four queues, and fail does not leave.** Pass, Yellow, Hold, Fail. Fail does not leave.
- **6. Yellow is visible.** Low-confidence fields are marked. Nothing auto-promotes them.
- **7. A named human gate.** The version record has a person, a time, and what they accepted.
- **8. As-of and citations.** Every generated clause has a source. The pack has a date.
- **9. Handover is one artefact.** A person who does not work here can receive the pack and not have to ask where anything is.
- **10. Copy does not say compliant.** The interface says current, cited, reviewed, as-of. Never a green badge that implies more.
- **11. Customer packs are not training data.** Written in the processing terms, and enforceable in the build.
- **12. The hard step is named.** The binding layer is identified as such in the build, and held to every check above it.
- **13. The pass test passes.** Change the trading address once and every open artefact re-derives with its rule version and as-of date; then try to hand over a pack in the fail queue and fail to.

## Related reading

- Building this on Microsoft 365: the lists, the flows and the measures
- The Rejected Pack workflow: four loops, four queues, a daily board
- The Invoice Check build standard
- The Compliance Calendar build standard
- QA and compliance proofcheck for trade businesses
