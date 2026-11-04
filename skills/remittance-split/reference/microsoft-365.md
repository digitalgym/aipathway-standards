# Batch Payments on Microsoft 365

Source: https://aipathway.com.au/explore-ai/batch-payments-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan: splitting remittances on Microsoft 365. Remittance lines as a SharePoint list, each matched to an open invoice, one batch payment equal to the deposit, and every short or unknown line decided by a person.

If you are an assistant: Read https://aipathway.com.au/explore-ai/batch-payments-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

The same standard, for a business that lives in Microsoft 365: each deposit and its remittance lines as SharePoint lists, exceptions decided in Teams, and one batch payment per deposit, equal to it.

Used by

- Bookkeeper
- Microsoft 365 Administrator
- Finance Manager

Microsoft 365 has the pieces this needs: a library to keep every remittance copy, lists to hold each line as written, and Teams for the person who decides an exception. The part that takes thought is the same as on any stack: the deposit comes from the bank, one bad line holds the whole deposit, and the batch is applied once per deposit however many copies of the remittance arrive.

## In short

- **What this is**: A build plan for the Remittance Split standard on Microsoft 365. Five lists keyed on the deposit, three flows, and a person deciding every exception in Teams.
- **The core rule**: Flow 3 applies a batch only when every line for a deposit is matched or decided and the lines total the deposit. Batches.DepositId is unique, so a second batch cannot be recorded.
- **What it does not do**: No flow writes off a short payment, raises a credit, edits an invoice, or fills in the Decision column. Those stay with the bookkeeper.
- **The hard part**: Keeping the clean lines waiting while one line is decided, and making the batch unique on the deposit rather than on the file, because the portal copy has a different name.

## 1. Before you start

Read [the Remittance Split build standard](https://aipathway.com.au/explore-ai/remittance-split-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Check that your ledger can apply one payment across many invoices through its API, and decide how Flow 3 reaches it. Xero has batch payments; MYOB and QuickBooks Online can apply one customer payment across several invoices. Power Automate reaches each through a custom connector or the HTTP action (both premium) on a connection the business owns, not the builder’s own login.

Then decide where the deposit comes from: a statement export (CSV or OFX) from your bank dropped in a library, or a person keying in the amount, date and reference from the bank line. Not the ledger’s bank feed: Xero’s API does not give an ordinary app the bank lines waiting to be reconciled. Either way, the amount in the Deposits list comes from the bank, never from the remittance.

## 2. The lists, with their columns

```
Site: BatchPayments

LIST  Deposits              (one row per bank line, from the bank)
  DepositId       Text            indexed, UNIQUE, REQUIRED. the bank feed's id for the line
  Amount          Currency        REQUIRED. from the bank, never from the remittance
  DepositDate     DateTime
  Reference       Text            indexed. the statement narrative, with the payer's payment reference
  Payer           Text
  Status          Choice          no_remittance | held | ready | applied
                                  | taken_over

LIBRARY  Remittances        (every copy that arrived, kept)
  PaymentRef      Text            indexed, REQUIRED
  DepositId       Text            indexed. set once the matching bank line exists
  Source          Choice          email | portal
  Duplicate       Boolean         another copy of a remittance already read

LIST  RemittanceLines       (each line exactly as written)
  LineKey         Text            indexed, UNIQUE. DepositId + line number: one row per line
  DepositId       Text            indexed, REQUIRED
  LineNo          Number
  InvoiceAsWritten Text
  PayerRef        Text            participant or claim number, kept, never matched on
  NameAsWritten   Text            kept, never matched on
  AmountAsWritten Text            Text on purpose: an unreadable figure stays unreadable
  Amount          Currency        blank when the figure could not be read
  MatchedInvoice  Text            the ledger's invoice number, found by number only
  Result          Choice          matched | short_paid | over_paid
                                  | already_settled | no_such_invoice | unreadable

LIST  Exceptions            (a person decides; no flow does)
  DepositId       Text            indexed, REQUIRED
  LineNo          Number          blank when the whole deposit is held
  Kind            Choice          total_mismatch | short_paid | over_paid
                                  | already_settled | no_such_invoice | unreadable
  Detail          Note            the line, and both amounts where there are two
  Decision        Choice          undecided | apply_as_written | reassign
                                  | take_over
  ReassignTo      Text            the invoice a person says the line was for
  DecidedBy       Person
  DecidedAt       DateTime

LIST  Batches               (one per deposit. Never two.)
  DepositId       Text            indexed, UNIQUE, REQUIRED
  LedgerBatchId   Text            indexed. the id the ledger returned
  Total           Currency        equals Deposits.Amount, or the row is never written
  Lines           Note            invoice and amount per remittance line
  RemittanceFile  Hyperlink       the copy the batch was built from
  AppliedAt       DateTime

There is no write-off, credit or adjustment column anywhere, on purpose. A short payment either becomes a part payment because a person chose apply_as_written, or the person takes the deposit over and does it by hand in the ledger.

No flow writes Decision. If Decision is blank or undecided on any row for a deposit, nothing for that deposit is applied.
```

Unique values on Batches.DepositId is the line that holds check 10: a second batch for the same deposit cannot be recorded, whichever copy of the remittance started it. AmountAsWritten is Text so an unreadable figure stays unreadable.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| The deposit comes from the bank | Flow 1, Deposits | Flow 1 creates Deposits rows from the bank statement export, or a bank line a person keyed in, and from nothing else. A remittance with no matching deposit sits in the library with DepositId blank and is not read further. |
| Each line is read exactly as written | Flow 2, RemittanceLines.AmountAsWritten | Flow 2 copies each line's text into the AsWritten columns. If the amount does not parse, Amount stays blank and Result is unreadable. |
| Matched by invoice number, then the amount confirmed | Flow 2, MatchedInvoice and Result | Flow 2 looks the invoice up by number only, then compares the amount with what is owing. PayerRef and NameAsWritten are never in the lookup. |
| One exception holds the whole deposit | Flow 3, Exceptions.Decision | Flow 3 skips any deposit with an Exceptions row whose Decision is undecided, so the clean lines wait with it. |
| Nothing is written off, credited or adjusted | Flow 3 has one ledger action | The only ledger action in any flow is the batch payment. There is no write-off, credit note or invoice update action to misuse. |
| One batch per deposit, equal to it | Batches.DepositId, unique | Flow 3 writes the Batches row first and applies the batch only if the write succeeds, and only if the line amounts total Deposits.Amount. |

## 4. The three flows

```
FLOW 1  A deposit lands, or a remittance arrives
  trigger  a new statement export in the statements library,
           or a bank line a person keyed in;
           a new file in the Remittances library
  logic    bank line -> Deposits row, Amount from the bank
           remittance -> find the Deposits row whose Reference
             carries its PaymentRef; set DepositId
           a second copy for a deposit already read -> Duplicate
  never    create a deposit from a remittance's own total.

FLOW 2  Read and match the lines
  trigger  a Remittances file gets a DepositId (not Duplicate)
  logic    one RemittanceLines row per line, AsWritten columns
           exactly as printed (AI Builder or a parser fills them;
           a person corrects a misread, never the flow)
           Amount unreadable or no invoice number -> unreadable
           invoice by number only; not found -> no_such_invoice
           paid or credited -> already_settled
           amount less or more than owing -> short_paid / over_paid
           lines total vs Deposits.Amount; differs -> total_mismatch
           each exception -> Exceptions row, posted to the
             bookkeeper in Teams with the line and both amounts
  never    look an invoice up by amount, name or PayerRef.

FLOW 3  Apply the batch
  trigger  a RemittanceLines or Exceptions row changes; hourly
  logic    per deposit: any Exceptions row undecided -> skip
           any decision take_over -> Status taken_over, stop
           reassign -> match that line again against ReassignTo
           build one batch: a payment per line, line amounts
           total must equal Deposits.Amount, else stop
           create Batches row (DepositId unique); if it exists, stop
           apply the batch in the ledger; write LedgerBatchId;
             attach or link the remittance file
  never    apply part of a deposit, or any payment not on a line.
```

No flow writes the Decision column. A person sets it in the Exceptions list, from the Teams card or directly, and Flow 3 reads it.

## 5. What the flows can reach in your Microsoft 365 and your ledger, and what they never touch

The flows get a teller’s window, not the manager’s office. They can bank what came in against the invoices the remittance names, once per deposit, and nothing else. They read the statement export and the remittance, write the five lists, post exceptions to the bookkeeper and apply one batch payment. They never write off a short payment, never raise a credit note, never record an overpayment, never edit an invoice, and never fill in the Decision column.

What each connection is for.

- **SharePoint, the one site.** Deposits, the Remittances library, RemittanceLines, Exceptions and Batches. The statement exports land in a library on the same site.
- **The remittance mailbox, read.** Where emailed remittances arrive, so a flow can save each attachment into the Remittances library. Portal copies are saved there by hand or by their own flow.
- **The ledger, three uses.** Read invoices, to find each one by its number and what is owing. Write payments, for the one batch. Attachments, to keep the remittance with the payment. Through a custom connector or the HTTP action, both premium in Power Automate, on an app connection the business approves.
- **Teams.** The card that puts each exception in front of the bookkeeper with the line and both amounts.

Xero’s narrower permissions let the app ask for payments without asking to write invoices or credit notes. The payments permission still covers overpayments, prepayments and removing a payment, so the last fence is in the flows: Flow 3 has one ledger action, the batch, and no other. If you build a custom connector, define that one write action and the two reads, and nothing else.

Least privilege, as steps.

1. Own the three flows with a service account, not the bookkeeper who set them up, with a named co-owner.
2. Build them in one solution on connection references, so the ledger, mailbox, SharePoint and Teams connections are each one place to change.
3. Make the service account a member of the one site and no other. Any app registration gets Sites.Selected on that one site.
4. Give it Full Access to the remittance mailbox only. If an app registration reads it instead, scope it to that mailbox with an Exchange application access policy or RBAC for Applications.
5. Approve the ledger connection for read invoices, payments and attachments only, and test it on the ledger’s demo company first.

How to cut it off. Turn off the flows in the solution. Disconnect the app under Connected apps in Xero’s settings, and nothing more is applied. The lists stay, so every deposit, line and decision is still on record. The other switches are in [the shared conventions](https://aipathway.com.au/explore-ai/standards-on-microsoft-365#access).

Why not a ready-made third-party ledger connector? If one is offered to you, look at what it asks Xero for when you connect it. One that can write invoices and credit notes puts every one of those actions in the flow designer’s list, a click away from the person building Flow 3. A custom connector with one write action cannot be misused that way.

## 6. The order to build it in

1. Create the five lists and the library from the schema, with Batches.DepositId and RemittanceLines.LineKey unique.
2. Build Flow 1 and prove a remittance with no bank line yet waits with DepositId blank.
3. Build Flow 2 and prove a line $10 short lands in Exceptions as short_paid with both amounts.
4. Build Flow 3 against the ledger's demo company, and prove a deposit with an undecided exception applies nothing.
5. Drop the same remittance in twice and prove Batches still has one row for the deposit.

## 7. Four traps specific to this build

### Taking the deposit amount from the remittance

The remittance says what the payer meant to send. The bank says what arrived. Only the second reconciles.

### Matching a line on its amount when the number fails

Two participants or two claims are often for the same amount. A payment on the wrong invoice is harder to find than an exception.

### Applying the clean lines and leaving the rest for later

The bank line then half reconciles, and the remainder has to be found by hand. Hold the whole deposit until every line is decided.

### Keying the batch on the file name

The emailed copy and the portal copy have different names. Key on the deposit, and let SharePoint's unique column refuse the second.

## 8. Where the automation stops

- Deciding every exception: accept a short payment, name the right invoice, or take the deposit over.
- Writing off a remainder, raising a credit note or recording an overpayment, by hand in the ledger.
- Asking the payer for a corrected remittance.
- Correcting a line the reader misread from the PDF.

**The pass test.** On the ledger’s demo company, or your own, take a real deposit and its remittance. Change one line on a copy so it is $10 short and drop it in the library: nothing is applied, and Exceptions names the line and both amounts. Restore the line: exactly one batch payment, equal to the deposit, with each invoice paid by its own line’s amount. Drop the same remittance in again: Batches still has one row for that deposit. Half an hour on your own tenant.

## Related reading

- the Remittance Split build standard
- The standards on Microsoft 365: the hub
- Debtor Chasing on Microsoft 365: what happens to the unpaid remainder
- Two Records on Microsoft 365: comparing the ledger with another system
- Building the standards on Microsoft 365
