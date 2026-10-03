# The Knowledge Graph on Microsoft 365

Source: https://aipathway.com.au/explore-ai/knowledge-graph-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan: nodes and edges as lists, provenance as a join so the change list is computed, and the one gate SharePoint cannot hold shut.

If you are an assistant: Read https://aipathway.com.au/explore-ai/knowledge-graph-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Nodes and edges are two lists. The thing that makes it a graph rather than a pile is a third list nobody thinks to build, and a gate this platform can only half hold.

Used by

- AI Officer
- Business Systems Analyst
- Operations Manager

You do not need a graph database for this, and on a tenant you already pay for you are not getting one. What you are getting is a set of lists whose shape makes two questions answerable: which nodes came from this source, and who said this one could go live. Those are the two the standard is built around, and both are lost the moment provenance becomes a comma-separated column.

## In short

- **What this is**: A build plan for the knowledge graph standard on Microsoft 365. Nine lists, four flows, a Power BI page, and the knowledge base register feeding the top of it.
- **The core rule**: A node reaches live through an approval that writes a name and a date. Every part of this build that looks like a status column is the part to be suspicious of.
- **What it does not do**: It holds facts and says what breaks when a source moves. Answering from them is the cited answer build, and it reads these lists rather than the index.
- **The hard part**: SharePoint cannot make one column read-only to somebody who can edit the item. The acceptance gate is therefore a write path plus a detector, and you should know that before you claim it.

## 1. Before you start

Read [the knowledge graph build standard](https://aipathway.com.au/explore-ai/knowledge-graph-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Write the key contract and give it a version before the first extract, and write it as Choice columns rather than as a diagram. Node types and edge types are closed lists at each version, which on this platform means a Choice column with custom values turned off. That one setting is the difference between a contract and a convention, and it is easier to set on an empty list than on one that has already grown a RELATED_TO.

Second, decide where sources come from. The standard says the graph takes its sources from the register, never from a fresh upload, so if you have not built the knowledge base yet, that is the prior job and this build will be waiting on it. The RegisterId column below is not decoration: a source row with a blank one has skipped a standard.

## 2. The lists, with their columns

```
Site: Graph

LIST  KeyContract           (one row per version. Nothing is deleted.)
  Version         Number          indexed
  EffectiveFrom   DateTime
  NodeTypes       Note            the closed list at this version
  EdgeTypes       Note
  RequiredFields  Note

LIST  Sources
  SourceId        Text            indexed
  RegisterId      Text            indexed. Blank means it skipped the register.
  Title           Text
  Issuer          Text
  Jurisdiction    Choice          the states you operate in
                                  the states you operate in, cut to yours
  Edition         Text
  EffectiveFrom   DateTime
  EffectiveTo     DateTime        blank means live
  Checksum        Text            required before acceptance
  Queue           Choice          proposed | accepted | retired | rejected
  AcceptedBy      Person
  AcceptedByUpn   Text            written by the flow. See the traps.
  AcceptedOn      DateTime
  PreviousSourceId Text

LIST  Passages
  PassageId       Text            indexed
  SourceId        Text            indexed
  Locator         Text            page and section, offsets, or seconds
  Text            Note
  Hash            Text

LIST  Nodes                 (Clause, Concept, Entity and Fact live here)
  NodeId          Text            indexed
  Type            Choice          Source | Passage | Clause | Concept | Entity
                                  | Fact | Change
                                  fill-in OFF. This IS the contract.
  Key             Text            indexed. For Entity, the system-of-record id.
  Body            Note
  Jurisdiction    Choice          the states you operate in
                                  the states you operate in
  ValidFrom       DateTime
  ValidTo         DateTime        blank while live
  Queue           Choice          proposed | live | conflict | change_pending
                                  | retired
  ProposedOn      DateTime
  AcceptedBy      Person
  AcceptedByUpn   Text            list validation reads THIS, not the Person
  AcceptedOn      DateTime
  ExtractRunId    Text            indexed
  ContractVersion Number

LIST  Provenance            (one row per node-to-passage link)
  NodeId          Text            indexed
  PassageId       Text            indexed
  SourceId        Text            indexed. This column is the whole point.

LIST  Edges
  EdgeId          Text            indexed
  Type            Choice          CONTAINS | EXTRACTS | SUPERSEDES | DEFINES
                                  | APPLIES_TO | SAME_AS | CONFLICTS | DERIVES
                                  fill-in OFF
  FromNodeId      Text            indexed
  ToNodeId        Text            indexed
  ValidFrom       DateTime
  ValidTo         DateTime
  AcceptedBy      Person          required on SAME_AS and SUPERSEDES

LIST  ExtractRuns
  RunId           Text            indexed
  SourceId        Text            indexed
  StartedAt       DateTime
  FinishedAt      DateTime
  Method          Choice          rules | model | person
  ModelId         Text
  PromptHash      Text
  ProposedCount   Number
  RejectedCount   Number          rejected proposals STAY here

LIST  Conflicts
  ConflictId      Text            indexed
  NodeIds         Note
  DetectedOn      DateTime
  Reason          Note
  Status          Choice          open | accepted_as_scoped | resolved
  DecidedBy       Person
  DecidedOn       DateTime

LIST  QueryRecords          (written when something READS the graph)
  AskedOn         DateTime        indexed
  AskedAboutDate  DateTime
  Jurisdiction    Choice          the states you operate in
                                  the states you operate in
  HitNodeIds      Note
  Missed          Boolean
  Consumer        Choice          cited_answer | advice_file | pack | other

LIST  ChangeDeltas
  SourceId        Text            indexed
  OldChecksum     Text
  NewChecksum     Text
  DetectedOn      DateTime
  AffectedNodeCount Number          computed. Blank means never computed.
  AffectedNodeIds Note            computed from Provenance, never typed
  Status          Choice          pending | accepted | rejected
  DecidedBy       Person
  DecidedOn       DateTime

List validation on Nodes:
  =IF([Queue]="live", LEN([AcceptedByUpn])>0, TRUE)
```

Provenance is its own list rather than a column of source ids on the node, and that is the single decision this plan turns on. The standard asks for the affected-node list to be computed rather than guessed. A delimited text column cannot be filtered, so the day the source moves you would be reading a cell by eye. A join row per link makes it one query, and it is worth the extra list on its own.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| The key contract is written and versioned before the first extract | Choice columns | Node types and edge types are Choice columns with custom values turned off, cut from the KeyContract row. An extract that invents a type cannot save, which is the refusal the standard asks for. |
| Every source is registered as an instrument, not a file path | Accept-source flow | The flow refuses to move a source to accepted while RegisterId, Edition, Jurisdiction, effective dates or Checksum are blank, and writes the refusal. A drive link with no edition stays at proposed. |
| No node is live without a named acceptance and a replayable locator | Flow + list validation | The acceptance flow writes AcceptedBy, AcceptedByUpn and AcceptedOn together and refuses a node with no Provenance row carrying a locator. The validation formula on AcceptedByUpn catches the hand edit, after the fact. |
| Entity identity comes from a system of record, or SAME_AS is an accepted edge | Key column | An Entity node's Key is the id the CRM, the panel or the register already uses. Two labels stay two nodes until somebody approves a SAME_AS, and that edge carries their name. |
| Supersession and conflict are written edges, and the model never picks a winner | Edges + Conflicts | SUPERSEDES moves the old node out of live in the same run that writes the edge. CONFLICTS raises a Conflicts row and neither node is cited until DecidedBy is filled. |
| Replacing a source produces a delta with a computed list of affected nodes | Provenance list | The change flow filters Provenance by SourceId and writes exactly those node ids onto the delta. AffectedNodeCount is a Number the flow writes, so a blank means it was never computed and zero means computed and empty. |
| Proposed, live, conflict, change_pending and retired are states, not labels | QueryRecords | A retired node leaves live but keeps its row, and the query records store the node ids they hit. That is what lets you answer which earlier answers relied on it once it is gone. |
| Customer files and interviews are not sources unless a person promotes a claim | RegisterId | The register already carries a kind, and the accept-source flow refuses a register entry of kind customer_material. A promoted claim is a Fact created by a person, and it still needs a Provenance row. |

## 4. The four flows

```
FLOW 1  Accept a source
  trigger  a Sources item is created, usually from a register handover
  logic    refuse and record if any of RegisterId, Edition, Jurisdiction,
             EffectiveFrom or Checksum is blank
           start an approval to the library group
           on approve: Queue = accepted, write AcceptedBy,
             AcceptedByUpn and AcceptedOn
  never    auto-accept on a confidence score. The standard's words:
           accepted_by is a person, always.

FLOW 2  Extract, which proposes only
  trigger  a Sources item moves to accepted
  logic    read the current KeyContract row FIRST and stamp its Version
             onto everything this run writes
           open an ExtractRuns row: Method, ModelId, PromptHash
           write Passages with a locator
           write Nodes with Queue = proposed and ProposedOn
           write one Provenance row per node-to-passage link
           write proposed Edges, including APPLIES_TO for scope
           count and keep the rejected proposals on the run
  never    write Queue = live, and never write a Type the Choice column
           does not offer. Declining to extract is a success.

FLOW 3  Accept a node or an edge
  trigger  a person requests acceptance on a proposed item
  logic    refuse if no Provenance row exists, or the linked Passage
             has a blank Locator
           refuse if ContractVersion is not the current version
           approval -> Queue = live, AcceptedBy, AcceptedByUpn, AcceptedOn
           SUPERSEDES accepted -> the old node goes to retired in the
             same run, and keeps its row
  never    accept a batch on a schedule because the extractor was
           confident. That is how a wrong edition becomes policy.

FLOW 4  The change
  trigger  scheduled. Compare each accepted Source's Checksum to the
           register entry it came from.
  logic    moved -> create a ChangeDeltas row with Old and New checksum
           filter Provenance by SourceId, write those NodeIds and the
             count onto the delta
           set every one of those nodes to change_pending
           route the delta to a person
           on accept: the new extract is proposed, SUPERSEDES edges are
             written, the old nodes go to retired
  never    type the affected list, and never let the delta close itself.
           A delta with a blank AffectedNodeCount never ran.
```

Flow 2 reads the contract before it writes anything and stamps the version onto every row, so a node built under an old contract is findable later without archaeology. Flow 4 is the one the whole standard is arguing for, and it is four actions long only because Provenance exists.

## 5. The Power BI model and its measures

```
Live Nodes =
CALCULATE ( COUNTROWS ( Nodes ), Nodes[Queue] = "live" )

Live Without Acceptance =            -- must be zero
CALCULATE (
    COUNTROWS ( Nodes ),
    Nodes[Queue] = "live",
    ISBLANK ( Nodes[AcceptedByUpn] )
)

Live Without Provenance =            -- must be zero
COUNTROWS (
    FILTER (
        Nodes,
        Nodes[Queue] = "live"
            && ISBLANK ( CALCULATE ( COUNTROWS ( Provenance ) ) )
    )
)

Off Contract Nodes =                 -- built under a superseded version
VAR CurrentVersion = MAX ( KeyContract[Version] )
RETURN
CALCULATE ( COUNTROWS ( Nodes ), Nodes[ContractVersion] < CurrentVersion )

Acceptance Days =
AVERAGEX (
    FILTER ( Nodes, NOT ISBLANK ( Nodes[AcceptedOn] ) ),
    DATEDIFF ( Nodes[ProposedOn], Nodes[AcceptedOn], DAY )
)

Change Pending Nodes =
CALCULATE ( COUNTROWS ( Nodes ), Nodes[Queue] = "change_pending" )

Open Conflicts =
CALCULATE ( COUNTROWS ( Conflicts ), Conflicts[Status] = "open" )

Uncomputed Deltas =                  -- must be zero
CALCULATE (
    COUNTROWS ( ChangeDeltas ),
    ISBLANK ( ChangeDeltas[AffectedNodeCount] )
)

Missed Query Rate =
DIVIDE (
    CALCULATE ( COUNTROWS ( QueryRecords ), QueryRecords[Missed] = TRUE () ),
    COUNTROWS ( QueryRecords )
)
```

Uncomputed Deltas is the measure that separates this from an index, and it works only because blank and zero mean different things: blank is a delta whose affected list was never worked out, zero is one that was and found nothing. Read Acceptance Days next to Change Pending Nodes, because a graph where acceptance takes three weeks is a graph that spends most of its life unable to answer.

## 6. The order to build it in

1. Write the KeyContract row: version one, the node types and the edge types. Nothing below starts until that row exists.
2. Create Nodes and Edges with Type as Choice columns, custom values off. Index NodeId, Key, FromNodeId and ToNodeId.
3. Create Provenance. Build it now even though nothing needs it yet, because it is the list people leave out and retrofit badly.
4. Load one real source by hand and accept it with a real person. One source is enough to prove the shape and small enough to check by eye.
5. Build Flow 2 and let it propose. Confirm nothing is live, and confirm a Type the contract does not name cannot be saved.
6. Build Flow 3. Accept two nodes and try to accept a third with no Provenance row, which must be refused and recorded.
7. Build Flow 4 and run the pass test on a replaced edition. This is the step the rest of the build exists for.
8. Connect Power BI. Live Without Provenance and Uncomputed Deltas go on the front page, both at zero, and Conflicts gets its own list view for the person who owns them.

## 7. Four traps specific to this build

### Claiming a gate SharePoint cannot hold shut

There is no column-level permission in SharePoint: anybody who can edit a Nodes item can set Queue to live. So the gate is three things rather than one. Restrict write on the list to the flows and a small group, have the acceptance flow write AcceptedByUpn alongside the Person column, and put a list validation formula on the item that refuses a live row with an empty AcceptedByUpn. The validation catches the hand edit, the flow does the accepting, and the reason AcceptedByUpn exists at all is that validation formulas do not see Person columns. Build it that way and say plainly that the last line is a detector.

### Provenance as a comma-separated column

Source ids in one multi-line column look fine until the morning a source is replaced and the standard asks for the list of every node built from it. You cannot filter a delimited cell, so the answer becomes somebody reading rows. One join row per node-to-passage link turns that into a filter on Provenance, and it is the difference between a graph and an index with better labels.

### Expecting to walk the graph

Lists and DAX will do a hop: node to edge to node, which covers scope, supersession and conflict, and those are the questions the standard actually asks. A DERIVES chain three deep is not a query you will write here, and building the contract as if it will be is how a tidy model becomes unusable. Keep chains shallow, and if the business genuinely needs traversal, that is a reason to move the store rather than a reason to write worse flows.

### Leaving fill-in on the Choice column

SharePoint lets a Choice column accept a value the list does not offer, and it is on by default in some list templates. Leave it on and the first extract that meets something awkward invents a type, the contract silently forks, and the standard's first check is gone with no error anywhere. Turn it off on Type, Queue, Jurisdiction and Method, and check it again after anyone edits the list.

## 8. Where the automation stops

- Accepting a source into the library, which is the approval Flow 1 exists to record rather than to make.
- Accepting a proposed node or edge as live. A confident extractor is still a proposal.
- Resolving a conflict between two live nodes. DecidedBy is a person, and neither node answers until it is filled.
- Accepting a change delta, which is what lets the affected nodes answer again.
- Declaring two entities the same thing when the systems disagree, and any statement that the graph is complete, compliant or approved for client use.

**The pass test.** Accept one real source with a named person, let Flow 2 propose two clauses from it, and accept one of them. Then replace that source with an edition that drops the accepted clause, update the checksum on the register entry, and let Flow 4 run. You must get a ChangeDeltas row whose AffectedNodeIds came out of a filter on Provenance and names that node, an AffectedNodeCount that is a number rather than blank, the node sitting in change_pending rather than live, and the QueryRecords rows that hit it still returning it when you ask what an earlier answer relied on. Then open the Nodes list and set the unaccepted clause to live by hand: the validation must refuse it. An hour, on one source you control. If the affected list was typed, you have an index with a person doing the graph part. If the node is still live, retiring a source does not retire its answers and last year’s rule is still answering. If the hand edit saved, the acceptance gate is a convention.

## Related reading

- the knowledge graph build standard
- The knowledge base on Microsoft 365, which feeds this
- The cited answer on Microsoft 365, which reads these lists
- Multi-site conformance on Microsoft 365, for the key contract shape
- Building the standards on Microsoft 365
