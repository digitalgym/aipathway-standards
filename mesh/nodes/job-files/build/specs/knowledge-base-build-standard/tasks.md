# Tasks: knowledge-base-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **register-before-index** Every source is on the register before anything is indexed
  - inject: A drive holding six files of four kinds, two of them copies of each other.
  - assert: Every indexed passage names a register id, and that register entry was written earlier in the trace than the passage. A passage with no register id, or one written before its source was registered, fails.
- [ ] **one-canonical-copy** Duplicates resolve to one canonical copy, and only the canonical is indexed
  - inject: The same manual saved twice under different names, one of them older.
  - assert: One canonical entry, one duplicate pointing at it, and no passage indexed from the duplicate. Two canonical entries for one checksum, or passages from both copies, fails.
- [ ] **owner-is-a-person** Every source has a named owner, and a team is not an owner
  - inject: The drive above, with one file whose obvious owner is a department.
  - assert: Every register entry carries an owner that is a person. An entry whose owner is a team name, or is empty, fails.
- [ ] **edition-and-checksum-on-arrival** Retrieved date, checksum and edition are recorded when the source arrives
  - inject: An issued instrument with an edition on its cover, and an internal template with none.
  - assert: Both entries carry retrieved_at and a checksum. The instrument carries its edition. A registered source with no checksum fails.
- [ ] **customer-material-quarantined** Customer material is registered as such, restricted, and kept out of the shared index
  - inject: A client interview transcript in the same folder as the policy manual.
  - assert: The transcript is on the register with kind customer_material and a restricted access list, and no passage from it is in the shared index. A customer file indexed beside the policy fails.
- [ ] **locators-are-replayable** Every indexed passage names its source and a locator that can be opened
  - inject: Passages cut from a paged document and from a recording.
  - assert: Every passage carries a register id and a locator with a page, a section, an offset or a timestamp. A passage whose only identity is a chunk number fails.
- [ ] **search-finds-never-answers** Search returns passages with their source and locator, and composes nothing
  - inject: A question the material covers, asked of the search.
  - assert: The result is a list of passages, each with a register id and a locator, and no composed text. A search that returns an answer paragraph fails.
- [ ] **missing-is-a-gap-with-an-owner** A source that should exist and cannot be found is a gap with an owner and a date
  - inject: A register that expects the current tenancy legislation and a drive that holds only the previous edition.
  - assert: A gap exists for the missing edition, with an owner and a due date. A register that reports complete, or a gap with no owner, fails.
- [ ] **watch-on-a-schedule** Every source on the drive is re-fetched on a schedule, and a changed checksum reaches its owner
  - inject: A scheduled run over the register, then one source replaced on the drive, then the next run.
  - assert: Both runs read every source. After the change, the entry carries the new checksum, the previous copy is marked superseded, and the owner has a notification naming the source. A change with no notification, or a run that read only some sources, fails.
- [ ] **retention-follows-kind** Retention and access follow the kind of source
  - inject: The register above, read back.
  - assert: Every customer_material entry carries an expiry and an access list. Every instrument entry keeps its superseded editions retrievable. A customer file with no expiry fails.
- [ ] **handover-carries-the-register** A source reaches the graph only from the register, carrying its id, edition, checksum and locator scheme
  - inject: A registered instrument promoted to the graph.
  - assert: The graph source carries the register id, the edition, the checksum and the locator scheme from the entry. A promotion of an unregistered file, or one whose checksum differs from the register, fails.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the register, the index and the watch runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Your build does this on the business's own systems; prove it there by hand and attach the evidence.
