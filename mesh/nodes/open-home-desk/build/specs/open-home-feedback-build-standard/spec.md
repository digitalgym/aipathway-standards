# AIP-BS-OPEN-HOME-FEEDBACK: open-home-feedback-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/open-home-feedback-build-standard (edition 2026-10-24)
**Markdown:** https://aipathway.com.au/explore-ai/open-home-feedback-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/open-home-feedback-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Twelve of these fourteen checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs with us. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **register-read-not-repaired** The register is read as written, never repaired. Each sign-in row needs a name, a way to reach them and the open it belongs to. A row missing any of them is an exception for a person, not a guess.
- **no-consent-no-follow-up** No consent recorded, no follow-up. Consent is what the attendee gave at sign-in, read from the register. A row where it is blank or no is an exception for the agent and is never drafted to.
- **one-attendee-across-opens** The same person at two opens is one attendee. Matched on the mobile or the email, not the name. They get one follow-up for the listing, and the duplicate is flagged so the agent sees they came back.
- **one-question-per-draft** Each draft thanks them and asks one question. Interest, price feedback or the contract, one of them. The draft names the agency, carries a way to opt out, and is written, not sent.
- **person-approves-each-send** A person approves every follow-up before it sends. The send is a separate step from the draft, and it reads the agent's yes against that draft. No approval, no send.
- **opt-out-is-permanent** An opt-out is honoured across every open and listing. A reply of STOP, or any request to stop, is recorded as withdrawn consent and blocks every later message to that person, whichever open they sign in at next.
- **reply-classified** Every reply is classified, and an unclear one goes to a person. Hot buyer, price feedback, not interested, or also has a property to sell (an appraisal lead). A reply can carry more than one. One that fits none is unclear and goes to the agent.
- **offer-or-complaint-to-agent** An offer or a complaint goes to the agent, unanswered. An offer is the agent's to pass to the vendor, and a complaint is the agent's to handle. The build hands both over with a typed reason and sends nothing back.
- **report-counts-and-verbatim** The vendor report counts, quotes and invents nothing. Counts that add up, price comments word for word, themes that each point at the replies they came from, and no names or numbers of attendees. No sentiment score and no percentage that the counts do not give.
- **person-approves-the-report** The agent approves the vendor report before it goes. The report is drafted to the agent first. It goes to the vendor only once the agent has approved that version.
- **who-said-what-recorded** Who said what is on the record. Consent as captured, every send with who approved it, every reply word for word, every class and every opt-out, kept so that a vendor dispute weeks later can be answered from the record and not from memory.
- **voice-step-off-by-default** The call is off by default, and only to someone who asked. If the agent turns the optional call on, it goes only to an attendee who ticked that they would take one, through a gate that decides at dial time, and opens by saying it is an AI calling for the agency.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: runs on the production provider, reports `with_us`.

When a check is `with_us`: The optional call is Office Voice's governed single call: create_call, basis they_asked, only to an attendee who asked to be called, and off unless the agent turns it on. The consent and unsubscribe record at volume, and a record of who said what that survives a vendor dispute, are not a product and are quoted as a scoped build. Queue each call with create_call on the Office Voice MCP (office_voice.create_call): the owner mints the key at office-voice.com/app/keys and ticks "Allow this to queue calls", and the dispatcher does the Do Not Call Register check, the calling hours and the one-attempt-a-day limit. There is no production run of these checks yet, so the stub run is the finished build. Do not stand up telephony of your own.
