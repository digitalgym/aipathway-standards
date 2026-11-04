# AIP-BS-PARTS-READY: parts-ready-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/parts-ready-build-standard (edition 2026-11-01)
**Markdown:** https://aipathway.com.au/explore-ai/parts-ready-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/parts-ready-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Nine of these ten checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs against your own live systems.

## Requirements, as the checks the build is held to

- **jobs-come-from-the-board** Tomorrow's jobs come from the dispatched board, by job id, and a job added later re-runs for that job only. The run reads tomorrow's board and works from each slot's job id and assigned tech, never from an address or a customer name. A job added to the board after the first run is checked on the next run on its own: the jobs already checked are not re-ordered, re-reserved or re-sent.
- **needs-come-from-the-record** What a job needs comes from the record, and a job with no needs list is flagged, never guessed. A job's needs are the accepted quote's lines, the job's own materials, or a written template for its job type, in that order. A job with none of these is flagged needs_list_unknown to a person with an owner. The build never works out from the job's description, or from what is usual, what a job needs.
- **stock-is-read-with-an-as-of** Van stock is read with the time it was counted, and a count older than the limit is flagged, not trusted. Van and shelf stock are read on every run, each with an as-of time. Van stock counted longer ago than the business's limit (24 hours unless it sets another) is stock_unknown: no line is reported as on the van from it, and each of that job's lines is flagged to a person.
- **reserve-before-order** Shelf stock is reserved to the job before anything is ordered. Before any order is requested, the shelf is read. A line the shelf covers is reserved against that job, the same reserve as Material Order's check 2, and is not ordered. The tech is told where to pick it up.
- **order-only-through-material-order** A shortfall is ordered only through Material Order, one request per supplier per run, and a second run orders nothing again. Parts Ready never writes a purchase order. A part held nowhere is handed to Material Order's path, grouped into one request per supplier per run, so that standard's threshold and approved-supplier rules decide the release. A second run on the same board with nothing changed requests nothing.
- **lead-time-decides** A part that cannot arrive before the job is flagged with the reason, not ordered and hoped for. Each supplier's lead time is read as data. A part whose arrival would land after the job's slot is flagged lead_time_after_job, naming the job, so a person can move the job or source the part. It is not ordered.
- **no-silent-substitution** An equivalent part is a suggestion on the flag, never a change to the order, the reservation or the tech's list. When a part cannot be supplied in time and another part in stock would do the same job, the build may say so on the flag. It never reserves, orders or lists the other part for the tech, and never changes the job's parts list. A person decides.
- **tech-told-once** Each tech is told once per job, with the job id: what is on the van, what to pick up and where. Each tech with a job tomorrow gets one message for that job, carrying the job id: the parts on the van, the parts to pick up and the shelf location, and anything flagged. A second run with nothing changed sends nothing.
- **publishes-by-the-cutoff** The run publishes by the cut-off whether or not it found anything, and every flag goes to the exceptions queue with an owner. Every run publishes a result for tomorrow's date by the business's cut-off (15:00 unless it sets another), including when every part is already on a van. A quiet afternoon is a result, not silence. Every flag is written to the business's one exceptions queue with an owner.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; proved on your own systems, with the evidence attached.

When a check is `with_us`: No hosted step. The check runs on the business's own board, van counts and shelf, and a shortfall is ordered through Material Order's path, whose order write is the builder's until Office Voice's purchase order tools ship. The pass test runs on the business's own systems. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.
