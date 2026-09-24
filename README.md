# AI Pathway build standards, as Agent Skills

Open specifications for the back-office workflows that leak money in small
businesses, packaged so an AI coding agent can install one and build to it.

Free to implement under [CC BY 4.0](LICENSE), commercially included. The only
thing asked in return is the citation, because a workflow built to a shared
standard can be audited, handed over, and trusted by whoever holds the seat
next.

## Install

```
/plugin marketplace add digitalgym/aipathway-standards
/plugin install build-standards@aipathway-standards
```

Or copy any `skills/<name>/` folder into `.claude/skills/` in your own project.

Not on Claude? The same rules are in `AGENTS.md` (Codex, Copilot CLI and
anything that reads the convention), `.cursor/rules/aipathway-standards.mdc`
(Cursor) and `.github/copilot-instructions.md` (GitHub Copilot). All three
are generated from the same list as the skills, so they say the same thing.

## Running the checks

Every standard also publishes its checks as data, and
[`packages/conformance`](packages/conformance) is the harness that runs them:

```
npx @aipathway/conformance show booked-after-hours-build-standard
```

It ships a recording stub and a runner, so a build can be driven through the
ports and asserted without a live phone number. The checks are **not** bundled
into the package: the CLI fetches them from https://aipathway.com.au, so a standard
corrected on Tuesday needs no release and nobody can be conformant against a
stale copy. The package is the harness; the site is the standard.

## The standards

| Spec | Skill | What it builds |
|---|---|---|
| `AIP-BS-DATABASE-REACTIVATION` | [`database-reactivation`](skills/database-reactivation/SKILL.md) | Database Reactivation Build Standard |
| `AIP-BS-DEBTOR-CHASING` | [`debtor-chasing`](skills/debtor-chasing/SKILL.md) | Debtor Chasing Build Standard |
| `AIP-BS-BOOKED-AFTER-HOURS` | [`booked-after-hours`](skills/booked-after-hours/SKILL.md) | Booked After Hours Build Standard |
| `AIP-BS-QUOTE-OUT` | [`quote-out`](skills/quote-out/SKILL.md) | Quote Out Build Standard |
| `AIP-BS-RENT-ARREARS` | [`rent-arrears`](skills/rent-arrears/SKILL.md) | Rent Arrears Build Standard |
| `AIP-BS-FIRE-SERVICE-PACK-STANDARD` | [`fire-service-pack-standard`](skills/fire-service-pack-standard/SKILL.md) | Fire Service Pack Standard |
| `AIP-BS-MULTI-SITE-CONFORMANCE` | [`multi-site-conformance`](skills/multi-site-conformance/SKILL.md) | Multi Site Conformance Build Standard |
| `AIP-BS-CITED-ANSWER` | [`cited-answer`](skills/cited-answer/SKILL.md) | Cited Answer Build Standard |
| `AIP-BS-COMPLIANCE-CALENDAR` | [`compliance-calendar`](skills/compliance-calendar/SKILL.md) | Compliance Calendar Build Standard |
| `AIP-BS-INVOICE-CHECK` | [`invoice-check`](skills/invoice-check/SKILL.md) | Invoice Check Build Standard |
| `AIP-BS-REJECTED-PACK` | [`rejected-pack`](skills/rejected-pack/SKILL.md) | Rejected Pack Build Standard |

## What a standard contains

Each one carries the same six things, and a published audit holds every standard
to all of them:

- **The checks, in order.** The order is the claim, not a presentation choice.
- **The objects, with their fields.** The records the workflow turns on.
- **A conformance checklist**, so a DIY build or a vendor can be held to it.
- **A pass test** a stub cannot fake.
- **A provider block**, naming what to stub and what not to hand-roll. Where no
  product covers that step it says `production: none` rather than staying quiet.
- **A boundary**: what stays with a person, and why.

## These are specifications, not marketing

The standards are published because a workflow nobody can audit is worth less
than one anybody can. They name what should not be automated as plainly as what
should, they carry no results claims, and where the honest answer is "there is
no product for this, build it yourself" they say that.

Canonical home, always current: https://aipathway.com.au/explore-ai
Machine-readable: https://aipathway.com.au/llms.txt · https://aipathway.com.au/llms-full.txt · https://aipathway.com.au/AGENTS.md

## Generated, not hand-written

Every file here is generated from the live standards by
`scripts/build-skills.mjs` in the site repo, so a skill cannot drift from the
specification it claims to carry. Send corrections to the standard, not to this
repo: hello@aipathway.com.au.
