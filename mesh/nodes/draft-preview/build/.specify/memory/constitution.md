# Constitution

Loaded before any work. These are not conservative defaults: they are the
points where an Australian business carries an obligation a machine cannot hold.

## Never

- write a document into the ledger without a preview a named person released
- correct a total silently: a draft a cent out is parked with both figures
- write the same document twice, or retry a write without reading the ledger for its key first
- post a journal whose debits and credits do not balance
- guess a tax rate the ledger does not hold

## Stays with a person

- releasing each preview, by name
- every draft parked: totals that differ, an unknown tax type, a journal that does not balance
- a document whose stored totals differ from the preview after it is written
- fixing the draft or the build upstream that produced a wrong total

## Always

- Every port call is awaited and goes through the ports handed to the build.
- Assert on the recorded trace, never on stub memory.
- Do not mark the build finished; the pass test does that.
- If the standard's edition moves, rebuild from it.
