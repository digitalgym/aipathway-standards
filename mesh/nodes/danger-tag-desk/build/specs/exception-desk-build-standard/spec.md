# AIP-BS-EXCEPTION-DESK: exception-desk-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/exception-desk-build-standard (edition 2026-11-01)
**Markdown:** https://aipathway.com.au/explore-ai/exception-desk-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/exception-desk-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Eight of these nine checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs with us.

## Requirements, as the checks the build is held to

- **names-its-record** Every item names its record by id, read from the system that holds it. An item points at the job, quote or invoice it is about by the id the system of record issued, and the desk reads that record before it writes the item. A raise with no record id, or with an id the system does not hold, is sent back to the standard that raised it, and nothing is written.
- **type-from-the-closed-list** The type comes from the closed list. Every item carries one type from the standard's closed list. A raise with any other label is stored as other, with the label it arrived with kept in the reason, and never as a new type. The daily summary lists the labels that arrived as other, so one that keeps recurring becomes a type by a person's decision.
- **owner-and-clock-from-routing** The owner and the clock come from the routing table, never from the agent that raised it. The business writes a routing table: for each type, the person who owns it, how many hours they have, and who it goes to if it is late. The desk reads the table before it writes an item and takes the owner and due time from it. An owner or due time the raising agent suggests is ignored.
- **one-item-per-record-and-type** One item per record and type: a second raise updates the open item. The desk reads the open items before it writes. A second raise of the same type on the same record updates the open item's reason and raise count and adds no row, and it does not restart the clock. A different type on the same record is a separate item. Once a person has closed an item, a new raise opens a new one.
- **nothing-auto-closes** Nothing closes itself: a person closes every item, with an outcome. The desk never closes an item on its own judgement. A raising standard may mark an item resolved upstream (the invoice was paid, the part turned up), and the item stays open with that mark until a person closes it with an outcome. A close is recorded with who closed it, when, and the outcome they wrote. The one exception is a type the owner has switched to close itself in the routing table (auto_close): off for every type by default, never allowed for dispute or hardship, never applied to an item a call raised, and turned on only by the owner, never by an agent. An item of such a type closes when it is marked resolved upstream, with that as its outcome and the switch recorded as the reason.
- **disputes-stay-with-a-person** A dispute or a hardship claim is never worked by an agent. A dispute or hardship item goes to the person the routing table names for it, and carries a stop that every chase standard reads before it acts on that record (Debtor Chasing, Follow-Up, Cash Seam). The desk sends nothing about it to anyone but that person, whatever the raising agent suggested doing next.
- **overdue-escalates-once** An overdue item escalates once. When an open item passes its due time, the desk escalates it once, to the person the routing table names for that type. It does not escalate early, does not escalate again on the next run, and never escalates a closed item.
- **daily-summary-even-when-empty** The daily summary goes out by the set time, including when there is nothing in it. Once a day, by the time the business set, the desk publishes a summary: open items counted by type and by owner, the overdue items listed, and the labels that arrived as other. When nothing is open it still publishes, and says none.

## Out of scope for the build, by design

- **pass-test** The pass test passes: runs on the production provider, reports `with_us`.

When a check is `with_us`: Office Voice holds the one queue: a sheet, a bot or a flow raises items with raise_exception and reads them with list_exceptions, beside the items its own calls hand off. The owner and due time come from the business's routing table, raising the same record and type again updates the open item, and only a person closes an item, with an outcome, on the Exceptions page, unless the owner switched that type to close itself. Office Voice shows which items are overdue but does not yet escalate them, so the escalation stays with the business. Call it on the Office Voice MCP (office_voice.raise_exception): the owner mints a key at office-voice.com/app/keys with the scope the tool names, on any Office Voice account. There is no production run of these checks yet, so the stub run is the finished build; AIPATHWAY_PROVIDER=office_voice.raise_exception needs a live port map that is not published. Do not hand-roll the write.
