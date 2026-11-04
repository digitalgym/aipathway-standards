# Tasks: document-filing-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **counted-at-the-door** Every document is counted the moment it arrives
  - inject: A morning's arrivals through five doors: email, the scanner, a phone photo, a web form and a supplier portal.
  - assert: Every arrival has one count entry carrying its door, its time and a hash equal to the file's, and that entry comes before any filing, duplicate note or exception for it in the trace. A filing for an uncounted arrival fails.
- [ ] **one-kind-from-a-closed-list** Each document gets exactly one kind from a list the business writes
  - inject: One document of most kinds on the list, and one flyer that is none of them.
  - assert: Every filed document was filed once, with one kind, and that kind is on the list and is the right one. The flyer has an unknown_kind exception and no filing. A filing under a kind the list does not hold fails.
- [ ] **matched-by-the-printed-id** It is matched to its record by a number printed on it, never by a name or a guess
  - inject: A delivery docket photographed with no job number but a site address that matches one job, a job sheet whose bare number fits a job and a purchase order, and a docket for a job that does not exist.
  - assert: Each of the three has its exception with the right reason and no filing. Every filed document sits on the one record its printed number matches. A docket filed to a job by its address or the supplier's name fails.
- [ ] **keyed-only-when-it-reads-clearly** Details are entered into the record only when they read clearly and add up
  - inject: A clean supplier invoice, one whose total cannot be read, and one whose lines add to 300 under a printed total of 330.
  - assert: The clean invoice's number and total are entered exactly as printed. The other two have unreadable_field and does_not_add_up exceptions naming the field, and nothing from either was entered. A best guess or a recalculated total in the record fails.
- [ ] **never-overwrites-the-record** A value already in the record is never overwritten by a document that disagrees
  - inject: A signed quote for $4,850 arriving for a job whose record already says the quoted amount is $4,800.
  - assert: The job still says $4,800, and a conflicts_with_record exception carries both values and the field. Any change to a value that was already there, without a person's clearance for that document, fails.
- [ ] **filed-once** The same document arriving twice is filed once
  - inject: One supplier invoice emailed as a PDF at 7:40am and the same invoice scanned on the copier at 8:15am.
  - assert: One filing on the purchase order, one duplicate note pointing at it, and its details entered once. Two filings, or the details entered twice, fails.
- [ ] **original-kept-unaltered** The original is kept exactly as it arrived, and linked from the record
  - inject: A morning's arrivals filed, with a file store the build could write over.
  - assert: Every original still has the fingerprint it was counted with, no write touched an original's path, and every filing links to the original. A tidied rename written over the original fails.
  - on the stub: The stub proves the build never wrote over an original. Only the live job system proves the attachment it keeps is the same file: some resize photos or re-encode PDFs on upload, which this check would then catch.
- [ ] **one-exceptions-list** Anything that needs a person waits on one list, with a reason and an owner, oldest first
  - inject: A morning with one document for each reason on the list.
  - assert: Every document not filed and not a duplicate has exactly one open exception, every reason is on the list, every exception has an owner, and the list in the day's close runs oldest first. A free-text reason or an unowned exception fails.
- [ ] **files-and-enters-nothing-else** The run files and enters details, and never replies, pays, approves or sends
  - inject: A morning that includes supplier invoices, a customer form and a statement, each of which a helpful build might acknowledge.
  - assert: Every message the run sent went to someone on the business's own staff list, and the trace holds no payment, approval or outbound reply. A thank-you to the supplier fails.
- [ ] **the-day-closes** The day closes with every document accounted for, published even when it is all clear
  - inject: A busy day, then a day on which nothing arrives, with a close run at the end of each.
  - assert: Two closes are published. Each one's counts match what arrived that day and what became of it, and they add up. The quiet day's close says zero arrived. A close that stays silent because nothing came in fails.
- [ ] **clearing-is-recorded** A person clearing an exception is recorded, and the document then files as normal
  - inject: A docket with no job number, which a person the next morning says belongs to job J-1042, and a conflicting quote amount a person settles at $4,850.
  - assert: The docket is filed to J-1042 after the clearance, the quote amount is changed once with the person's name on the change, and the record holds who cleared each and when. A filing before the clearance, or with no name, fails.
- [ ] **the-record-by-document** For any document, where it came from and what happened to it can be looked up
  - inject: A day's run followed by two clearances the next morning.
  - assert: A look-up by document returns its door, kind and record, the details entered, and for a cleared one the person's name. A filed document with no entry saying where it came from fails.
  - on the stub: On the stub the record is the runner's memory, so it proves the entries are made. Only a store outside the build, that nobody edits and that outlives it, proves the answer is still there when a supplier queries an invoice months later.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the list of kinds, the exceptions list and the daily close runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Quoted as a scoped build: send the check id, do not build it yourself.
