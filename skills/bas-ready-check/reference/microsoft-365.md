# GST Exceptions on Microsoft 365

Source: https://aipathway.com.au/explore-ai/gst-exceptions-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the BAS Ready Check: the period's transactions, tax codes and the business's settings as SharePoint lists, a flow that reads the ledger each quarter and writes one exceptions list for the bookkeeper or BAS agent, and nothing written back to the ledger.

If you are an assistant: Read https://aipathway.com.au/explore-ai/gst-exceptions-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Five lists and two flows that give your bookkeeper one list of things to look at before the BAS goes in, every line pointing at the transaction it came from.

Used by

- Bookkeeper
- Business Systems Analyst
- Accounts Officer

Every quarter somebody scrolls the period looking for the bill with no invoice attached, the supplier coded differently this time, the bank fee with GST on it. This plan copies the period from your ledger into SharePoint and writes those finds into one list for the bookkeeper or BAS agent. It reads your ledger and never writes to it.

## In short

- **What this is**: A build plan for the BAS Ready Check standard on Microsoft 365. Five lists, a flow that copies one period from the ledger, and a flow that writes the exceptions list.
- **The core rule**: Every flag on a line carries the ledger's own transaction id. A flag about the whole period names the period and both figures.
- **What it does not do**: No flow writes to the ledger and none lodges anything. A flag says what was found and why; the person decides.
- **The hard part**: The ledger connection has to still work three months later, and the usual-code check needs the history copied too, not just this quarter.

## 1. Before you start

Read [the BAS Ready Check build standard](https://aipathway.com.au/explore-ai/bas-ready-check-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Agree the settings with whoever lodges the BAS: the period, the comparable period (usually the same quarter last year), how far back to look for usual codes, whether the business reports capital purchases separately, the swing band, and which accounts carry no GST in these books. The flow never decides those.

Then check what your ledger lets a connected app read. Where it cannot say whether a document is attached or a bank line is reconciled, the list says so rather than guessing.

## 2. The lists, with their columns

```
Site: BasReadyCheck

LIST  Lines                 (copied from the ledger for the period and the history window; never edited here)
  TxnId           Text            indexed, REQUIRED. the ledger's own id
  LineId          Text            UNIQUE, REQUIRED
  Kind            Choice          REQUIRED. bill | spend | invoice | receive
                                  | journal
  TxnDate         DateTime        indexed, REQUIRED
  Contact         Text            indexed. the ledger's contact id
  Account         Text            indexed, REQUIRED
  TaxCode         Text            blank means the line has no tax code
  Amount          Currency        REQUIRED. GST inclusive
  Gst             Currency        REQUIRED
  TxnTotal        Currency        REQUIRED
  Attached        Choice          REQUIRED. yes | no | cannot say
  Reconciled      Choice          REQUIRED. yes | no | cannot say
                                  | not a bank line

LIST  TaxCodes              (copied from the ledger)
  Code            Text            UNIQUE, REQUIRED
  ClaimsCredit    Boolean         REQUIRED
  OnSales         Boolean         REQUIRED
  Capital         Boolean         REQUIRED

LIST  Accounts              (copied from the ledger; NoGst is set by the business or its BAS agent)
  Code            Text            UNIQUE, REQUIRED
  AccountType     Choice          REQUIRED. revenue | expense | fixed_asset
                                  | bank | gst_control | liability
  NoGst           Boolean         ticked by a person, never by the flow

LIST  Settings              (a person fills this once a quarter)
  Setting         Text            UNIQUE, REQUIRED. period_from, period_to, comparable_from, comparable_to, history_from, reporting, tax_invoice_threshold, swing_band, min_history, reviewer
  Value           Text            REQUIRED

LIST  Exceptions            (one row per flag. Written by the flow, never edited.)
  Period          Text            indexed, REQUIRED
  Kind            Choice          REQUIRED. tax_invoice | usual_code
                                  | no_gst_account | capital | uncoded | unreconciled | swing | control_account | not_checked
  TxnId           Text            required on every line flag
  Evidence        Note            REQUIRED. what was read, as read
  Why             Note            REQUIRED. the rule that flagged it, never advice
  Reviewed        Person          the bookkeeper or BAS agent who looked at it

Nothing in this site writes back to the ledger. It is a copy of one period, and the list a person works through before the BAS is lodged.
```

Attached and Reconciled are choices with a cannot say option, so a ledger that does not report them never reads as no. TxnId is indexed because every flag cites it.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| The period comes from the ledger | Lines.TxnDate and Settings | Flow 1 reads exactly the period in Settings, plus the history window and the comparable period, each tagged. Flow 2 flags only rows dated in the period. |
| Every flag cites its transaction | Exceptions.TxnId | Flow 2 writes TxnId on every line flag from the Lines row it came from. A period flag names the period and both figures. |
| Tax invoice held | Lines.Attached and Settings.tax_invoice_threshold | GST claimed, TxnTotal above the threshold, Attached = no: one flag. Attached = cannot say: a not_checked row instead. |
| Code differs from usual | Lines in the history window | Flow 2 counts each contact's codes in the history window, then the account's. A clear majority over min_history is the usual code; a different code is flagged with the usual one and its count. |
| GST on no-GST accounts, capital coded capital | Accounts.NoGst and AccountType, TaxCodes.Capital | A credit-claiming code on a NoGst account is flagged. With full reporting, a fixed asset account on a non-capital code, or an expense account on a capital code, is flagged. |
| Unreconciled, uncoded, swing, control account | Lines.Reconciled, TaxCode, and the totals | Reconciled = no and blank TaxCode are flagged. Totals are compared with the comparable period against swing_band. The GST account's movement is compared with GST on sales less GST on purchases. |
| Read only, one list, no advice | No ledger write step; Exceptions has no fix column | There is no action in either flow that writes to the ledger. Why holds the rule that flagged a row, never what to change. |

## 4. The flows

```
FLOW 1  Copy                        (manual, or the day after
                                     the period ends)
  logic    empty Lines, TaxCodes, Accounts
           read tax codes and accounts from the ledger
           read transactions for the period, the history
             window and the comparable period
           write each line with the ledger's own ids,
             Attached and Reconciled as yes / no / cannot say
  never    a write to the ledger

FLOW 2  Check                       (after Flow 1)
  logic    for each line in the period:
             tax invoice, usual code, no-GST account,
             capital (full reporting only), uncoded,
             unreconciled -> one Exceptions row with TxnId
           totals vs the comparable period -> swing rows
           GST account movement vs GST on sales less
             purchases -> control_account row
           anything it could not read -> not_checked row
           email the reviewer one link
  never    a code change, a journal, a lodgement,
           a sentence telling the reader what to do
```

Flow 2 has no AI step that writes its own words about a transaction. Evidence and Why are built from the row and the rule.

## 5. What the flows can reach in your Microsoft 365, and what they never touch

Think of the flows as a junior who reads the ledger with a highlighter and is not allowed a pen. Flow 1 reads the ledger and writes the Lines, TaxCodes and Accounts lists. Flow 2 reads those lists and writes one Exceptions row per finding, then emails the reviewer a link. Neither writes to the ledger.

What each connection is for.

- **The ledger, read only, connected directly.** Xero, MYOB Business or QuickBooks Online through its own sign-in, using the HTTP action or a custom connector (both premium in Power Automate). Ask for read scopes only: transactions, tax rates, accounts, attachments and reports.
- **SharePoint, the BasReadyCheck site.** The five lists and nothing else.
- **Outlook, one email.** The link to the period’s Exceptions view, sent to the reviewer named in Settings.

Keep it to the least it needs.

1. Make a service account for the build and create the flows as it, not as a person.
2. Connect the ledger with read scopes only. If the ledger’s sign-in cannot be limited to reading, say so to the owner before building, and rely on the flow having no write step.
3. Make the service account a member of the BasReadyCheck site and no other.

How to cut it off. Disconnect the app in the ledger’s connected apps screen and Flow 1 copies nothing on its next run.

## 6. The order to build it in

1. Create the five lists and fill Settings and the NoGst ticks with the bookkeeper or BAS agent.
2. Build Flow 1 for one month and check the rows carry the ledger's own transaction ids and dates.
3. Seed one bill above the threshold with GST and nothing attached, and build Flow 2 until it is caught by its id.
4. Check the not_checked rows on a ledger that cannot say whether a line is reconciled.
5. Run it for the whole period and send the reviewer the link.

## 7. Three traps specific to this build

### Treating a blank as no

A ledger that does not report attachments returns nothing, not no. Flagging every bill as missing its invoice buries the real ones. Write cannot say.

### Asking Copilot to explain each flag

A generated explanation drifts into advice about what to claim. Keep Why to the rule that fired.

### Copying only this quarter

The usual-code check needs history. Without it every flag would be a guess, so Flow 2 lists the check as not run.

## 8. Where the automation stops

- Every flag: whether it matters and what to do about it.
- Any change to a code, a journal or a correction in the ledger.
- Lodging the BAS, by the business or its registered agent.
- The settings and the list of accounts that carry no GST.

**The pass test.** In your own ledger. Pick a real period and seed one bill above the tax invoice threshold, with GST claimed and nothing attached. Run both flows. The bill must be on the list by its real transaction id, every id on the list must open the right transaction in the ledger, and the ledger’s own history must show nothing changed by the run.

## Related reading

- the BAS Ready Check build standard
- Checking invoices on Microsoft 365: supplier bills before they are paid
- Every standard on Microsoft 365
- Building the standards on Microsoft 365
