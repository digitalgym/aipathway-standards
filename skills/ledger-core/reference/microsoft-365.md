# Books That Balance on Microsoft 365

Source: https://aipathway.com.au/explore-ai/books-that-balance-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the Ledger Core standard on Microsoft 365: an append-only Journals list with a hash per row, a lock date, posting flows for each document type that refuse anything that does not balance, and reports rebuilt from the journals, checked against the golden test suite.

If you are an assistant: Read https://aipathway.com.au/explore-ai/books-that-balance-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Six lists and three flows that keep a set of books in SharePoint: every entry balanced to the cent, nothing past ever changed, and reports worked out from the entries each time.

Used by

- Business Systems Analyst
- Financial Controller
- Bookkeeper

Plenty of businesses already keep job costs or a client’s figures in SharePoint. This plan turns that into proper books. A flow adds each entry, checks it balances, and chains it to the one before, so a changed row shows up. Nobody can edit or delete an entry, and every report is worked out fresh from the list.

## In short

- **What this is**: A build plan for the Ledger Core standard on Microsoft 365. Six SharePoint lists and three Power Automate flows that keep double-entry books and pass the standard's golden tests.
- **The core rule**: The posting flow is the only thing that adds to Journals, and nobody, the flow included, can edit or delete a row there. A mistake is fixed with an entry that cancels it.
- **What it does not do**: It never stores money in a Currency column, never posts into a locked month, and never opens from a trial balance your accountant has not signed off.
- **The hard part**: SharePoint's Currency column is a decimal number, and a site owner can edit any row. The plan stores whole cents as numbers and checks every row's hash.

## 1. Before you start

Read [the ledger core build standard](https://aipathway.com.au/explore-ai/ledger-core-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Fill Accounts with your chart and TaxCodes with your GST codes. Set YearEnd to 06-30. On the Journals list, break permission inheritance: the posting flow’s service account may add items, and nobody, site owners included, may edit or delete them.

Run the golden tests against the flows’ logic before any real entry goes in. Your developer can call the flows’ Office Script from the conformance runner, or copy the cases into the Requests list and compare the reports by hand.

## 2. The lists, with their columns

```
Site: LedgerCore

LIST  Accounts              (the chart. A person keeps it.)
  Code            Text            indexed, UNIQUE, REQUIRED
  AccountName     Text            REQUIRED
  Class           Choice          REQUIRED. asset | liability | equity
                                  | revenue | expense
  Role            Choice          bank | receivable | payable | gst
                                  | retained_earnings
                                  one account per role, except bank

LIST  TaxCodes              (the business's GST codes)
  Code            Text            indexed, UNIQUE, REQUIRED
  RatePercent     Text            REQUIRED. as text: "10", never a number column
  BasClass        Choice          REQUIRED. taxable_sales | export_sales
                                  | gst_free_sales | capital_purchases | other_purchases | excluded

LIST  Requests              (one row per thing to post or report, from a person or another flow)
  RequestId       Text            indexed, UNIQUE, REQUIRED
  Kind            Choice          REQUIRED. post_journal | post_document
                                  | reverse | lock | open | report
  BodyJson        Note            REQUIRED. the journal, document or report request; money as text, "1,234.56"
  Outcome         Choice          indexed. posted | refused | reported
                                  | nothing to post
                                  written by the flow

LIST  Journals              (append only. The posting flow adds rows; nobody edits or deletes one.)
  JournalId       Text            indexed, UNIQUE, REQUIRED
  Seq             Number          indexed, UNIQUE, REQUIRED. 1, 2, 3 in the order added
  JournalDate     DateTime        indexed, REQUIRED
  SourceType      Choice          REQUIRED. journal | invoice | bill
                                  | credit_note | bank_transaction | payment | transfer | allocation | reversal | opening
  SourceRef       Text            indexed, REQUIRED
  Reverses        Text            indexed
  LinesJson       Note            REQUIRED. account, amount in whole cents (debit positive), tax code, tax, document, tracking
  PrevHash        Text            REQUIRED
  Hash            Text            indexed, UNIQUE, REQUIRED. sha256 of the canonical text, lower-case hex

LIST  Refusals              (one row per request the flow would not post)
  RequestId       Text            indexed, REQUIRED
  Code            Choice          indexed, REQUIRED. NOT_MONEY | NO_LINES
                                  | UNKNOWN_ACCOUNT | UNKNOWN_TAX_CODE | UNBALANCED | DUPLICATE_JOURNAL | DUPLICATE_DOCUMENT | UNKNOWN_DOCUMENT | PERIOD_LOCKED | LOCK_BACKWARDS | POSTED_IS_FROZEN | UNKNOWN_JOURNAL | ALREADY_REVERSED | OPENING_NOT_SIGNED_OFF
  Detail          Note            REQUIRED

LIST  Settings              (one row. A person keeps it.)
  YearEnd         Text            indexed, REQUIRED. MM-DD; 06-30 in Australia
  LockedThrough   DateTime        moved forward by a person at each period end, never back
  Cutover         DateTime
  OpeningSignedOffBy Person          the accountant who signed off the opening trial balance

Journals has no edit or delete for anyone, the flow's account included: a correction is a reversal row and a new row. Every report is rebuilt from Journals each time it is asked for.
```

Journals.Seq and Journals.Hash are unique. Amounts live inside LinesJson as whole cents. Settings.LockedThrough is a person's to move.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Money in whole cents, no floats | Requests.BodyJson, Journals.LinesJson | Money arrives as text and the flow's Office Script splits it at the decimal point into whole cents. No Currency column and no float() expression touches an amount. |
| Balanced, or refused | Refusals, Code UNBALANCED | The script adds the lines; anything but zero goes to Refusals and nothing is added to Journals. |
| Frozen, corrected by reversal | Journals item permissions, Reverses | Nobody can edit or delete a Journals row. A reverse request adds a row that negates every line and names the one it cancels. |
| The lock date | Settings.LockedThrough, Refusals PERIOD_LOCKED | The posting flow reads the lock before every entry and refuses anything dated on or before it. |
| The hash chain | Journals.PrevHash, Journals.Hash | The script builds the canonical text, hashes it with sha256 and stores it with the previous row's hash. The chain check recomputes every row. |
| Reports from journals only | The report flow | Every report reads Journals from the start, works out balances on the 1 July year and rolls earlier years' profit into Retained Profits. No running totals are stored. |

## 4. The flows

```
FLOW 1  Post                              (when a Requests row is added)
  read     Settings, Accounts, TaxCodes, and Journals
           (all rows, in Seq order)
  parse    every amount from text to whole cents
           not a number -> refuse NOT_MONEY
  build    the entry by the posting rules: document
           lines and GST per line, payments against
           their document, a transfer once
  refuse   unbalanced, unknown account or tax code,
           dated on or before LockedThrough, a
           repeated id or document
  hash     sha256 of the canonical text, with the last
           row's Hash as PrevHash
  add      one Journals row; Requests.Outcome posted
  never    update or delete a Journals row

FLOW 2  Report                            (when a report is requested)
  check    the chain from the first row; broken ->
           Teams message naming the first bad row, stop
  rebuild  the report from Journals: trial balance,
           profit and loss, balance sheet, GST labels,
           cash basis, by tracking, what is open
  write    the report to a file in the site's library

FLOW 3  Chain check                       (nightly)
  recompute every Hash from the row as stored now
  broken    -> Teams message to your bookkeeper with
               the first bad JournalId
```

Flow 1 is the only flow with add permission on Journals. No flow has edit or delete there, and neither does anybody else.

## 5. What the flows can reach in your Microsoft 365

The flows keep your books in SharePoint, balanced to the cent and impossible to change quietly. They read each request, work out the entry, add it to the Journals list with its hash, and work every report out from that list. Your accountant signs off the opening balances, and you move the lock date forward at each month end.

- **SharePoint, the LedgerCore site.** Add on Journals and Refusals; read on Accounts, TaxCodes and Settings; update the Outcome column on Requests.
- **Teams, a chat with your bookkeeper.** One message for each refusal, and one if the chain check fails.

## 6. The order to build it in

1. Create the LedgerCore site and the six lists, and set the Journals permissions before anything else.
2. Write the Office Script that parses money and builds an entry, and run the golden tests against it: every one must pass.
3. Build Flow 1 and post last month's documents from your current system into a test site.
4. Build Flow 2 and compare its trial balance with your current system's for the same month: every account to the cent.
5. Edit a Journals row as a site owner in the test site: the edit must be refused, and if you lift the permission to try, Flow 3 must name that row.
6. Load the opening trial balance your accountant signed off, lock through the cutover, and go live.

## 7. Three traps specific to this build

### A Currency column

SharePoint stores Currency as a decimal number, and Power Automate adds them as floats. 0.10 plus 0.20 then fails to equal 0.30. Keep whole cents as numbers inside the JSON.

### Site owners can edit anything

Item permissions stop most people, but a site collection admin can still change a row. The hash chain is what catches that, so run Flow 3 every night.

### Totals kept in a column

A Balance column updated by each entry drifts the first time a flow fails halfway. Work every report out from Journals.

## 8. Where the automation stops

- Your accountant signs off the opening trial balance, by name.
- Moving the lock date forward at each month end.
- Deciding what a correction should be.
- Following up a broken chain: who changed which row, and when.

**The pass test.** On your own books. Load the opening trial balance your accountant signed off, then post one real month. Flow 2’s trial balance agrees to the cent with an independent figure for the same documents, 1A less 1B equals the GST account’s movement, and Flow 3 finds the chain intact. Reverse one real entry: it nets to zero.

## Related reading

- the ledger core build standard
- Release Before Posting on Microsoft 365: checked before anything goes into your accounts
- Signing Off the Month on Microsoft 365: journals posted once after a sign-off
- Building the standards on Microsoft 365
