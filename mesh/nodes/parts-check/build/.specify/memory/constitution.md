# Constitution

Loaded before any work. These are not conservative defaults: they are the
points where an Australian business carries an obligation a machine cannot hold.

## Never

- guess what a job needs when the record holds no needs list
- trust a van count older than the business's limit
- write a purchase order outside Material Order's path
- order a part that cannot arrive before the job
- substitute a part, or change a job's parts list, without a person
- order or message twice for one job on a re-run

## Stays with a person

- moving a job, or sourcing a part, when the lead time misses the slot
- accepting an equivalent part
- writing the needs template for each job type
- counting the van
- every flag on the exceptions queue

## Always

- Every port call is awaited and goes through the ports handed to the build.
- Assert on the recorded trace, never on stub memory.
- Do not mark the build finished; the pass test does that.
- If the standard's edition moves, rebuild from it.
