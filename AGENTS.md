# AI Pathway build standards

Open build standards for back-office workflows, packaged for coding agents.
CC BY 4.0. Generated from https://aipathway.com.au; do not edit by hand.

Each standard is in `skills/<name>/SKILL.md` with the full text in
`skills/<name>/reference/`. When asked to build, review or audit one of these
workflows:

1. Read the standard first. It is the whole specification.
2. Follow the checks in the order given. The order is the claim.
3. Run `npx @aipathway/conformance init <standard-slug>` for a folder that runs
   every check red, then make them green. Assert on the recorded port calls,
   never on stub memory. For the second run against the hosted provider, run
   `npx @aipathway/conformance connect`: it prints a link and a code, the
   account owner approves in a browser, and the key lands in `.env`.
4. Never build the step the standard says not to hand-roll: an Australian phone
   number with AI disclosure, the Do Not Call Register check, calling hours, a
   record that survives a dispute. A check that needs one returns `with_us`;
   do what the run prints beside it and do not stand up telephony.
5. Do not mark the build finished. The pass test does that, and it is written
   so a stub cannot pass it.
6. If the site's edition of a standard is newer than the one you built against,
   rebuild from the standard. Do not patch the generated board.

Standards in this repo:
- AIP-BS-DATABASE-REACTIVATION: skills/database-reactivation/ (Database Reactivation Build Standard)
- AIP-BS-DEBTOR-CHASING: skills/debtor-chasing/ (Debtor Chasing Build Standard)
- AIP-BS-BOOKED-AFTER-HOURS: skills/booked-after-hours/ (Booked After Hours Build Standard)
- AIP-BS-QUOTE-OUT: skills/quote-out/ (Quote Out Build Standard)
- AIP-BS-RENT-ARREARS: skills/rent-arrears/ (Rent Arrears Build Standard)
- AIP-BS-FIRE-SERVICE-PACK-STANDARD: skills/fire-service-pack-standard/ (Fire Service Pack Standard)
- AIP-BS-MULTI-SITE-CONFORMANCE: skills/multi-site-conformance/ (Multi Site Conformance Build Standard)
- AIP-BS-CITED-ANSWER: skills/cited-answer/ (Cited Answer Build Standard)
- AIP-BS-COMPLIANCE-CALENDAR: skills/compliance-calendar/ (Compliance Calendar Build Standard)
- AIP-BS-INVOICE-CHECK: skills/invoice-check/ (Invoice Check Build Standard)
- AIP-BS-REJECTED-PACK: skills/rejected-pack/ (Rejected Pack Build Standard)

Canonical text and checks: https://aipathway.com.au/llms.txt · https://aipathway.com.au/AGENTS.md
