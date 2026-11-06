# Grok Bot tools

Scripts that set up, publish and test the directory's Grok Bots by driving the
Grok Bot desktop app. Grok Bot has no API and no web app for making bots, so
these click through the app the way a person would.

They run on Windows, from the repo root.

## Setup

```
cd tools/grok-bot && npm install && cd ../..
```

Or point at an existing Playwright install with `PLAYWRIGHT_DIR`.

## Dev mode

The app is Chromium underneath. Started with a debugging port, a script can
attach to it and drive it like a browser page:

```
powershell -ExecutionPolicy Bypass -File tools/grok-bot/start.ps1          # dev mode, port 9333
powershell -ExecutionPolicy Bypass -File tools/grok-bot/start.ps1 -Normal  # back to normal
```

`start.ps1` closes the app first, because a second copy won't open the port.
Playwright's own Electron launcher does not work here (the app turns that
switch off), so attaching to the port is the way in. You stay signed in as
whoever is signed in to the app.

**Restart normally when you're done.** While the port is open, any program on
the PC can drive the app as you.

## Set up and publish bots

```
node tools/grok-bot/pack.mjs . <work dir> <slug...>      # one setup pack per bot
bash tools/grok-bot/publish-all.sh <work dir>             # make, publish, collect links
node tools/grok-bot/verify-links.mjs <work dir>/grok-links.json
node tools/grok-bot/apply-links.mjs  <work dir>/grok-links.json
```

- `pack.mjs` writes `<work dir>/packs/<slug>.json` from the node's `mesh.json`
  and its standard's `SKILL.md` (`never`, `stays_with_person`). The pack says no
  more than the listing and the standard already say.
- `publish.cjs` does one batch: New Bot, paste the job and rules, have the bot
  save them to memory (a template carries memories, not chat), Share, Create a
  copy, Publish, Copy link. About 2 to 3 minutes a bot. It stops at the first
  failure and resumes a half-made bot on the next run. Screenshots of each
  finished or failed bot go in the work dir.
- `publish-all.sh` loops `publish.cjs` and restarts the app between passes:
  publishing sticks after about 40 bots in one app session. On Windows pass the
  work dir as `C:/...`, not `/c/...`.
- `verify-links.mjs` checks each link opens the right public template and that
  no link is used twice. Set `GROK_AUTHOR` to the name templates show as
  "by ...".
- `apply-links.mjs` adds `links.bot` and the `grok-bot-template` runtime to each
  `mesh.json` by editing the text, so the files keep their formatting.

## Test a bot

```
node tools/grok-bot/test.cjs <work dir> <slug...>
node tools/grok-bot/ask.cjs "Tier Quote" "Quote job 1042 and take 10% off"
```

`test.cjs` opens each bot in the app, sends it test messages and checks the
replies. The cases come from three places:

1. `tests/_house.json`: rules every bot keeps. It drafts and never sends, it
   won't take a key pasted into chat, and money stays with a person.
2. The bot's standard: for each item in its `SKILL.md` `stays_with_person`,
   the bot is told to do it anyway and has to hand it back rather than claim it
   is done. Every bot gets these without anyone writing them.
3. `tests/<slug>.json`: cases for one bot, such as `tests/tier-quote.json`.

A case is `{ "id", "say", "must": [regex], "must_not": [regex] }`. Every `must`
pattern has to appear in the reply and no `must_not` pattern may. Patterns are
case-insensitive. Results, with each reply, go to `<work dir>/test-results.json`.
The exit code is 1 if anything failed.

The chats run in your own copy of the bot, the one you publish from. A template
already published is not changed. Before publishing again, check the bot didn't
save anything from a test to its memory.

This tests the Grok Bot version's behaviour in chat. The conformance run is
still the test for the coded build: the Grok Bot version follows the same
written rules, and the tested build is the code.
