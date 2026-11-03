# Tasks: timesheet-check-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **entry-traces-to-person-day-job** Every entry traces to a person, a day and a job
  - inject: Eight entries across three people, one of them on a job the person was never allocated, with the roster and the allocations in the system.
  - assert: The contact list and the allocations are read before any anomaly is raised. Every line on the sheet names a person, a date and an allocated job. The unallocated entry is an anomaly of kind not_allocated and is not a line.
- [ ] **totals-computed-never-typed** Daily and weekly totals are computed from entries, never typed
  - inject: A period of clean entries for two people, with a daily and a weekly total expected for each.
  - assert: Every published total lists the entry ids it derives from and its hours equal the sum of those entries' hours after breaks. A total with no entry ids, or with hours that do not add up, fails.
- [ ] **anomalies-are-a-closed-list** An anomaly is one of a closed list of kinds, and it has an owner
  - inject: The eight seeded entries, which include one overlapping pair, one twelve-hour day and one unallocated job.
  - assert: The overlap, the over-hours day and the unallocated job are each raised as an anomaly with a kind from the list and an owner's name. No anomaly carries a kind outside the list or an empty owner.
- [ ] **award-rule-is-cited-with-an-edition** Any penalty, overtime or allowance applied cites the rule, its edition and its effective date
  - inject: One entry over eight hours on a weekday and one entry on a Saturday, with two rule editions in the store.
  - assert: The rule store is read before any card is written. Both entries carry a card with a rule id the store holds, an edition and an effective date. A line that applies a rule and has no card fails.
- [ ] **superseded-rule-cannot-apply** A retired rule edition cannot apply to the next period
  - inject: A period run under the first edition, then the first edition retired and a later period run with the second edition in force.
  - assert: Cards in the first period cite the first edition. Cards in the later period cite the second edition only. A card in the later period citing the retired edition fails.
- [ ] **no-interpretation** An entry the dated rule does not plainly cover is parked for a person
  - inject: One entry flagged as a disputed break, which no rule edition in the store plainly covers.
  - assert: The entry is an anomaly of kind rule_unclear with an owner, carries no card, and is not a line on the sheet. A card written for it, from any edition, fails.
- [ ] **anomaly-is-resolved-by-a-person-with-a-reason** An anomaly leaves the queue only with a person's name and a reason
  - inject: The seeded anomalies raised on a first run, then a named person decides each one in the queue, then a second run.
  - assert: Every anomaly is resolved with the name and reason the person gave, with the decision attached as evidence. An anomaly cleared with no person, or cleared before any person decided, fails.
- [ ] **nothing-reaches-payroll-without-a-release** Nothing reaches payroll without a release by a named person
  - inject: A first run with anomalies open and nobody having released, then the anomalies decided, a named person releasing, and a second run.
  - assert: No export exists after the first run. After the second, one export exists, its write comes after a release carrying the person's name, and no anomaly was open when it was written.
  - on the stub: The stub proves nothing leaves without a release event carrying a named person. Only the live path proves what left is what was released, rather than something regenerated after the approval.
- [ ] **one-export-per-period** One export per period, written once, updated on a second release
  - inject: The same released period run twice, an hour apart.
  - assert: Exactly one export exists for the period, it carries the payroll system's external id, and the second run produced an update or no write. A second export, or a null id treated as success, fails.
- [ ] **the-run-publishes-regardless** Every period publishes hours, anomalies found and resolved, and the release, including a clean one
  - inject: A period with only clean entries and nothing to raise.
  - assert: One report exists for the period with hours by person, anomalies found and resolved both zero, and the release field present. A clean period with no report fails.
- [ ] **the-record-by-person-and-period** Entries, anomalies, resolutions, rules cited and the release are retrievable by person and period
  - inject: One period run through anomalies, decisions, release and export for three people.
  - assert: A read by person and period returns the entries, each anomaly with its resolution and evidence, the cards with rule id and edition, and the release with a name. A record missing the release or a resolution fails.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the rules, the roster and the release runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Your build does this on the business's own systems; prove it there by hand and attach the evidence.
