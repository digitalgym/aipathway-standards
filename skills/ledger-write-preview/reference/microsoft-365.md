# Release Before Posting on Microsoft 365

Source: https://aipathway.com.au/explore-ai/release-before-posting-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the Ledger Write Preview standard on Microsoft 365: drafts, previews and releases as SharePoint lists, a flow that recomputes every line, tax and total and the journal before anything is written, and a second flow that writes only what a named person released, once, then reads it back.

If you are an assistant: Read https://aipathway.com.au/explore-ai/release-before-posting-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Four lists and two flows that check every invoice, bill and journal a bot wants to put into your accounts, wait for you to release it, then put it in once and check it arrived as released.

Used by

- Business Systems Analyst
- Bookkeeper
- Financial Controller

A bot that raises invoices or codes bills will one day send a total that is a cent out, or a tax rate your accounts do not have. This plan puts every draft through SharePoint first. A flow works the figures out again and shows you the journal entry it will make. You release it, and only then does a second flow put it into Xero, MYOB or QuickBooks and check what was stored.

## In short

- **What this is**: A build plan for the Ledger Write Preview standard on Microsoft 365. Four lists and two flows beside the accounts software you already run, Xero, MYOB Business or QuickBooks Online, connected through its own sign-in.
- **The core rule**: Flow 1 only reads the tax rates in your accounts and fills the Previews list. Flow 2 puts documents into your accounts, and it does nothing until a person's name is in ReleasedBy.
- **What it does not do**: It never corrects a total a cent out, never assumes 10% for a tax type your accounts do not hold, never puts in a journal that does not balance, and never edits a document already in your accounts to make it match.
- **The hard part**: Sending a document can time out after it has arrived. Before it ever tries again, Flow 2 looks in your accounts for the document's unique reference, its idempotency key.

## 1. Before you start

Read [the ledger write preview build standard](https://aipathway.com.au/explore-ai/ledger-write-preview-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Fill Settings with your accounts software, its receivable, payable and GST accounts, and the people who may release. Leave DryRun on for the first week and compare the previews with what you would have entered by hand.

Before you build Flow 2, check how your accounts software recognises a retry, so a document is never entered twice. Xero takes an Idempotency-Key header and QuickBooks Online a request id. On MYOB Business the key goes in the memo, and Flow 2 reads for it before every retry.

## 2. The lists, with their columns

```
Site: LedgerWritePreview

LIST  Drafts                (one row per document another flow or bot wants written)
  DraftId         Text            indexed, UNIQUE, REQUIRED
  DocType         Choice          REQUIRED. invoice | bill | credit_note
                                  | spend_money | receive_money | manual_journal
  AmountType      Choice          REQUIRED. exclusive | inclusive | no_tax
  Contact         Text
  LinesJson       Note            REQUIRED. quantity, unit price, discount, account and tax type per line, as handed over
  StatedSubtotal  Currency        REQUIRED
  StatedTax       Currency        REQUIRED
  StatedTotal     Currency        REQUIRED
  Source          Text            the flow or bot that handed it over

LIST  Previews              (one row per draft that recomputed cleanly, written by Flow 1)
  DraftId         Text            indexed, REQUIRED
  IdempotencyKey  Text            indexed, UNIQUE, REQUIRED. preview:<tenant>:<draft>:<preview>; carried in the document's reference
  LinesJson       Note            REQUIRED. each line's amount and tax, recomputed
  Subtotal        Currency        REQUIRED
  TotalTax        Currency        REQUIRED
  Total           Currency        REQUIRED
  JournalJson     Note            REQUIRED. account, debit, credit per line; debits equal credits
  RatesReadAt     DateTime        REQUIRED
  ReleasedBy      Person          filled by the person who releases it, never by a flow
  ReleasedOn      DateTime
  LedgerDocumentId Text            written by Flow 2 only after the document reads back
  ReadBackMatches Boolean

LIST  Parked                (one row per draft or document a person has to look at)
  DraftId         Text            indexed, REQUIRED
  Kind            Choice          indexed, REQUIRED. totals_differ
                                  | unknown_tax_rate | unbalanced | readback_differs | write_failed
  Stated          Note            the draft's totals, or the ledger's stored totals after a write
  Recomputed      Note            the preview's totals
  Owner           Person          REQUIRED
  Detail          Note            REQUIRED

LIST  Settings              (one row. A person keeps it.)
  Ledger          Choice          indexed, REQUIRED. Xero | MYOB Business
                                  | QuickBooks Online
  DryRun          Boolean         REQUIRED. on: Flow 2 writes nothing
  ReceivableAccount Text            REQUIRED
  PayableAccount  Text            REQUIRED
  TaxAccount      Text            REQUIRED
  Releasers       Person          REQUIRED. the people who may release a preview

The ledger is not in this site. The flows read its tax rates and write documents through the ledger's own connector and sign-in, write only what a named person released here, and never edit a document to match the preview.
```

Previews.IdempotencyKey is unique, so a preview has one key and one document. ReleasedBy is a person column a flow never fills.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Every line and tax worked out again | Previews.LinesJson and RatesReadAt | Flow 1 multiplies quantity by unit price less discount and rounds to the cent, then takes the tax per line from the rate the ledger holds for that tax type: amount x rate before tax, amount x rate / (1 + rate) including it. |
| The journal balances | Previews.JournalJson | Flow 1 lists the control account, each line's account and the GST account, and sends the draft to Parked as unbalanced if debits and credits differ. |
| A cent is a difference | Parked, Kind totals_differ | Stated totals that differ from the recomputed ones go to Parked with both. No Previews row is made, so there is nothing to release. |
| No guessed tax rate | Parked, Kind unknown_tax_rate | A tax type your accounts do not return, or a failed read of the rates, sends the draft to Parked. The flow has no default rate. |
| Released by a named person, entered once | Previews.ReleasedBy and IdempotencyKey | Flow 2 runs when ReleasedBy changes, looks for the key in your accounts first, and puts the document in only if it is not there. |
| Read back and compared | Previews.LedgerDocumentId and ReadBackMatches | Once it is in, Flow 2 reads the document and compares its subtotal, tax and total with the preview to the cent. A difference goes to Parked as readback_differs. |

## 4. The flows

```
FLOW 1  Preview                           (when a Drafts row is added)
  read     the ledger's tax rates -> fails: park
           unknown_tax_rate, stop
  each     line: quantity x unit price x (1 - discount),
           rounded to the cent
           tax from the ledger's rate for its tax type
             none -> park unknown_tax_rate, stop
           exclusive: amount x rate
           inclusive: amount x rate / (1 + rate)
  sum      subtotal, total tax, total
  build    the journal: control, each line, GST
           debits <> credits -> park unbalanced, stop
  compare  with the draft's stated totals
           any cent apart -> park totals_differ with
           both, stop
  write    one Previews row, IdempotencyKey unique
  post     to the releasers: a preview is waiting
  never    a write into the ledger

FLOW 2  Write                             (when ReleasedBy is filled)
  first    Settings.DryRun on -> stop
  read     the ledger for IdempotencyKey
           found -> go to the read-back
  write    the document, key in the reference and in
           the ledger's idempotency header or request id
           no answer -> park write_failed; the next run
           reads for the key before it tries again
  read     the document back; compare subtotal, tax and
           total with the preview, to the cent
           equal  -> LedgerDocumentId, ReadBackMatches
           differ -> park readback_differs with both
  never    edit a written document to match
```

Flow 1 cannot put anything into your accounts. Flow 2 is the only flow that can, and it starts only when a person's name is filled in.

## 5. What the flows can reach in your Microsoft 365 and your accounts

The flows check every invoice, bill and journal before it goes into your accounts. They read the tax rates in your accounts, work out each draft’s lines, GST, totals and journal again, and put in only what was released, once. You release each preview by name before anything goes in, and anything that does not add up comes to you with both figures.

- **Your accounts software, through its own connector.** Read tax rates for Flow 1; create and read documents for Flow 2.
- **SharePoint, the LedgerWritePreview site.** Contribute on Previews and Parked; read on Drafts and Settings.
- **Teams, a chat with the releasers.** One message when previews are waiting, and one for each item parked.

How to cut it off. Turn DryRun on, or turn Flow 2 off, and nothing goes into your accounts. Revoke the connection on your accounts software’s own connected apps page and both flows stop.

## 6. The order to build it in

1. Create the LedgerWritePreview site, the four lists and the ledger connection as a service account.
2. Build Flow 1 and run it on last month's invoices: every preview should match what your accounts already hold.
3. Add a draft a cent out and a line on a tax type your accounts do not hold, and check both go to Parked.
4. Build Flow 2 with DryRun on and release a preview: nothing goes into your accounts.
5. Turn DryRun off, put in one test invoice, stop the run straight after, and run it again: still one invoice.
6. Read it back and check ReadBackMatches is ticked.

## 7. Three traps specific to this build

### Tax on the total

Working the GST out once on the subtotal gives a different cent from adding up the tax per line. Work it per line, the way the ledger does, and add up.

### A default rate

A Power Automate expression that falls back to 0.1 when the tax type is not found guesses a rate. A missing rate sends the draft to Parked. It never becomes a number.

### Retry policy on the write

Power Automate retries a failed action by default. A document that arrived but timed out is then entered twice. Turn the retry off on that step and look for the key instead.

## 8. Where the automation stops

- Releasing each preview, by name.
- Every draft sent to Parked: totals a cent out, an unknown tax type, a journal that does not balance.
- A document whose stored totals differ from the preview.
- Fixing the bot or flow upstream that produced a wrong total.

**The pass test.** On your own accounts. Hand Flow 1 an invoice, a bill and a draft whose tax is a cent out: the first two preview with a balanced journal, the third goes to Parked with both figures, and nothing goes into your accounts. Release the two. Flow 2 puts each in once, and both read back equal to the preview. Run it again and nothing new goes in.

## Related reading

- the ledger write preview build standard
- Signing Off the Month on Microsoft 365: journals posted once after a sign-off
- Coding Questions on Microsoft 365: the lines nobody can code, asked once
- Building the standards on Microsoft 365
