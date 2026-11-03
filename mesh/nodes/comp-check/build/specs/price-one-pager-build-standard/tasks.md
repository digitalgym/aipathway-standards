# Tasks: price-one-pager-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **subject-from-the-record** The subject property comes from a record
  - inject: A subject property whose source record has no land size.
  - assert: The page shows land size as unknown and every comparable rule that needs land size is reported as not applied. A build that fills in a land size fails.
- [ ] **rules-stated-first** The selection rules are written down before any sale is chosen
  - inject: A run with a rule set on file, observed in order.
  - assert: The rule set is read before the first sale is read, and the page carries every rule with its value. Rules chosen after looking at the sales fail.
- [ ] **comparables-meet-every-rule** Every comparable shown meets every stated rule
  - inject: A pool of sales holding one too far away, one too old, one of a different type and one outside the bedroom band, beside sales that meet every rule.
  - assert: None of the four rule-breaking sales appears as a comparable, and each is reported with the rule it broke.
- [ ] **source-and-date-on-each** Each comparable carries its source and its sale date
  - inject: A pool with one qualifying sale that has no source and one that has no sale date.
  - assert: Every comparable on the page has a source, a sale date and a read date. The two incomplete sales are not on it.
- [ ] **withheld-price-not-used** A withheld or unverified price is never part of the range
  - inject: A qualifying sale with its price withheld and another with a price marked unverified.
  - assert: Neither price is used in the range. If listed, each is marked withheld or unverified rather than given a figure.
- [ ] **too-few-says-so** Too few comparables means no range, and the page says so
  - inject: A pool with fewer verified qualifying sales than the minimum.
  - assert: The draft carries no range and says how many were found against how many the rules need. The rules on the page are the rules that were read.
- [ ] **range-from-the-comparables** The range is worked out from the comparables and nothing else
  - inject: A known set of verified comparables whose low, high and median are known.
  - assert: The draft's range matches exactly. Any other number in the range box fails.
- [ ] **agent-estimate-separate** The agent's estimate is shown separately, labelled as theirs
  - inject: An agent estimate well above the evidence range.
  - assert: The draft shows both, apart, the estimate labelled with the agent's name. The evidence range is unchanged by it.
- [ ] **underquote-flagged-to-agent** A quoted price below the evidence is flagged to the agent
  - inject: An agent's quoted figure below the lowest verified comparable.
  - assert: The agent is notified with the comparables above the figure, and the one-pager is held until the agent revises or approves with a reason. A build that sends it on fails.
- [ ] **stale-data-held** Stale data is held, not shown as current
  - inject: A run whose last read of the sales is older than the freshness window.
  - assert: The build reads again, or holds the draft marked stale. The date on the page is the date the sales were read.
  - on the stub: The stub proves the window is read and enforced against the read date. Only a live source proves the read date is the date the data was actually current.
- [ ] **agent-approves-first** The agent approves the exact version before the vendor sees it
  - inject: A draft approved by the agent, then edited, then sent.
  - assert: The first version may go. The edited version is refused until approved again. Nothing reaches the vendor without an approval naming the agent and the version.
  - on the stub: The stub proves nothing leaves without a release event carrying a named person. Only the live path proves what left is what was released, rather than something regenerated after the approval.
- [ ] **record-of-what-was-shown** What was shown, and when, is recorded and never overwritten
  - inject: A one-pager released, then corrected and released again.
  - assert: Both versions are retrievable by property and date, each exactly as it was released. The first is not changed by the second.
  - on the stub: The stub proves the record is written on release and that a second release does not touch the first. Only a durable store outside the agent's own laptop proves it is still there, unchanged, when the vendor disputes the price.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the rules and the record runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Quoted as a scoped build: send the check id, do not build it yourself.
