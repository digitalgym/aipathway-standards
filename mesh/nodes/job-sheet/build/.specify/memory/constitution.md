# Constitution

Loaded before any work. These are not conservative defaults: they are the
points where an Australian business carries an obligation a machine cannot hold.

## Never

- create a job; a close starts from the job id the job system issued
- invent a part, or a price the business's own price book does not hold
- price a variation the quote did not cover
- write a card the assigned tech has not confirmed
- mark a job complete before the write returns the job system's ids
- write a second card for one capture, or mint a new intent id on a retry
- send an invoice

## Stays with a person

- confirming the draft: the assigned tech, from their own phone
- pricing every part parked as not in the book or ambiguous
- pricing every variation, and getting the customer's signature for it
- chasing a tech who has not confirmed, as their supervisor
- fixing a write that failed

## Always

- Every port call is awaited and goes through the ports handed to the build.
- Assert on the recorded trace, never on stub memory.
- Do not mark the build finished; the pass test does that.
- If the standard's edition moves, rebuild from it.
