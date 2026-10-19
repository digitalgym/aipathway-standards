# The Simpro Connector on Microsoft 365

Source: https://aipathway.com.au/explore-ai/simpro-connector-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan: Simpro reached from Microsoft 365 through a Power Platform custom connector on the business's own API key, a Copilot Studio agent with read actions only, a SharePoint list as the log, and no action that sends or moves a stage.

If you are an assistant: Read https://aipathway.com.au/explore-ai/simpro-connector-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

The same standard, for a business that lives in Microsoft 365: Simpro reached through a custom connector on your own key, an agent that reads and never sends, and a SharePoint list that remembers every request.

Used by

- AI Officer
- Business Systems Analyst
- Operations Manager

A Copilot Studio agent can call any API a custom connector describes, and Simpro has an API. So the connection itself is an afternoon. What takes thought is the same as on any stack: the key is yours, the answers are live, the lists are asked for the fields that matter, and nothing the agent does reaches a customer.

## In short

- **What this is**: A build plan for the Simpro Claude connector standard on Microsoft 365. One custom connector, one agent, three flows, two lists.
- **The core rule**: The agent's actions are reads, each through a flow that writes a ConnectorLog row. The one write, a booking, checks a unique reference first and never sets a stage.
- **What it does not do**: No action emails, texts or changes a stage, and no list holds a copy of Simpro's records, which would be the cache the standard forbids.
- **The hard part**: Keeping the key inside the connector's connection where only an owner sees it, and making a retried booking hit SharePoint's unique index before it reaches Simpro.

## 1. Before you start

Read [the Simpro Claude connector build standard](https://aipathway.com.au/explore-ai/simpro-claude-connector-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Decide who owns the connection. A Power Platform custom connector stores the API key in a connection, and the person who creates that connection is the one who can see it, share it and delete it. Make it someone in the business, on a business account, not whoever happens to build the agent.

Then check the licences. Custom connectors are a premium Power Platform feature and Copilot Studio is licensed separately, so confirm what your tenant already has before you build anything. The key itself is made the same way as on any stack, in Simpro under System, Setup, API, Applications, with API Key as the grant type.

## 2. The lists, with their columns

```
Site: SimproConnector

LIST  ConnectorLog          (one row per request to Simpro. Written by the flow, never by hand.)
  At              DateTime        indexed
  Endpoint        Text            e.g. GET /quotes/
  Asked           Note            the question or the fields requested
  RecordIds       Note            quote:1041, job:2210 ... as returned or written
  Outcome         Choice          REQUIRED. ok | limited | refused | failed
  AskedBy         Person          who asked the agent

LIST  ConnectorWrites       (one row per booking. The only write the connector makes.)
  Reference       Text            indexed, UNIQUE, REQUIRED. the connector's own; a retry hits this and stops
  CallerPhoneDigits Text            national form, digits only
  SimproCustomerId Number
  SimproJobId     Number          blank means the write failed
  Status          Choice          REQUIRED. booked | failed
  BookedAt        DateTime

No list holds a copy of a Simpro record, and nothing here has a Stage column: the connector never moves one, so there is nothing to record about it.
```

Unique values on Reference is the line that holds check 9. A flow that looks for an existing booking first still has a gap between the look and the write; SharePoint refusing the second row closes it.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| It runs on a key the business created, and deleting it stops it | Custom connector connection | The key lives in the connection, owned by a person in the business. It is never typed into a topic, an instruction or a flow variable. Deleting the application in Simpro, or the connection, stops every action. |
| Every answer is read live | Agent actions, no lists of Simpro data | Each action calls Simpro when the question is asked. There is no list to answer from instead, so the agent has nowhere stale to look. |
| An answer is built only from fields Simpro returned | Connector operation definitions | Each operation passes columns= with the fields it needs and pageSize up to 250, and Flow 1 follows Result-Pages. The thin default list is never what the agent sees. |
| Acceptance is the customer-facing stage | The waiting-quotes operation | The operation filters on CustomerStage, and the internal Stage is not even in its response schema, so the agent cannot read the wrong one. |
| Every request is logged | ConnectorLog, Flow 1 | Every action goes through Flow 1, which writes the row whether the call worked, hit the limit or was refused. |
| One request makes one record | ConnectorWrites.Reference, unique | Flow 2 writes the reference row before it posts to Simpro. A retry fails at SharePoint and returns the first booking. |
| Nothing reaches a customer | No send action, no stage field | The connector defines no operation that sends, and the booking operation's body has no Stage property. |

## 4. The three flows

```
FLOW 1  Read, and log it
  trigger  an agent action (waiting quotes, a job, who to ring)
  logic    call the custom connector with the operation's columns
           on 429: wait, then call again; on 401: stop
           follow Result-Pages until the list is whole
           write a ConnectorLog row: endpoint, asked, ids, outcome
           return the records with their Simpro numbers
  never    keep what it read anywhere but the reply.

FLOW 2  Book a job (only if the business wants the write)
  trigger  the agent's booking action, with a reference
  logic    create the ConnectorWrites row first; a duplicate
             Reference fails here and returns the first booking
           list individual customers with Phone, CellPhone and
             DoNotCall, compare digits, use the match or create one
           POST /jobs/ with no Stage
           store SimproJobId; blank -> Status failed, tell a person
  never    report a booking that has no SimproJobId.

FLOW 3  When the key is refused
  trigger  Flow 1 or Flow 2 receives 401
  logic    write the ConnectorLog row as refused
           tell the connection's owner
           the agent says Simpro refused the connection
  never    answer from anything read before.
```

Flow 1 is the only door to Simpro. An agent action wired straight to the connector skips the log, and the log is what the business reads the day an answer looks wrong.

## 5. The order to build it in

1. Create the API application in Simpro as an administrator, with API Key as the grant type, and download the key file.
2. Build the custom connector from three or four GET operations, each with its columns and pageSize fixed in the definition, and API key authentication sending the Bearer header.
3. Create the connection as the business owner of the key, and confirm one GET works from the connector's test page.
4. Create ConnectorLog, then Flow 1, and prove a 401 writes a refused row by testing with a wrong key.
5. Build the Copilot Studio agent with actions that call Flow 1 only, and instructions that every answer names its Simpro record numbers.
6. Only if the business wants the write: ConnectorWrites with Reference unique, then Flow 2, and prove a retried booking makes one job.

## 6. Four traps specific to this build

### Putting the key in the agent

A key pasted into instructions, a topic or a flow variable is readable by everyone who can edit the agent, and it travels with every export. It belongs in the connector's connection, owned by a person in the business.

### Syncing Simpro into SharePoint to make the agent faster

A nightly copy of quotes into a list makes every answer as old as last night, and the standard's second check fails by design. If the live call is slow, ask for fewer fields, not an older copy.

### Taking page one for the whole list

Simpro returns 30 rows unless asked for more, up to 250. An answer about the oldest waiting quotes from page one of an unsorted list is confidently wrong. Follow Result-Pages, or sort and filter in the request.

### Letting a note steer the agent

Job notes are written by staff and customers and come back as text the agent reads. Instruct the agent that record text is data to quote, and give it no action that could carry out what a note says.

## 7. Where the automation stops

- Creating and deleting the key, and owning the connection that holds it.
- Moving any job or quote to another stage in Simpro.
- Anything a customer will see. The agent drafts nothing that sends itself.
- Deciding two customers are the same person when the phone digits do not say so.

**The pass test.** Ask the agent for the three oldest quotes still waiting on the customer and check them by number against Simpro, including one the office has approved but the customer has not answered. Book the same caller twice with one reference, their number written differently from how Simpro holds it: one ConnectorWrites row, one job, on the existing customer. Then delete the application in Simpro and ask again: the agent must say Simpro refused the connection, give no figures, and ConnectorLog must show a refused row. Fifteen minutes on your own build. If a figure comes back after the key is gone, something is answering from a copy.

## Related reading

- the Simpro Claude connector build standard
- Using Claude with Simpro: what connects today
- The standards on Microsoft 365: the hub
- After hours on Microsoft 365: the call that becomes a Simpro job
- Building the standards on Microsoft 365
