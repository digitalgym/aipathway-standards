// Shared helpers for driving the Grok Bot desktop app over its Chrome
// debugging port. Grok Bot has no API for making or publishing bots, so these
// scripts click through the app the way a person would. See README.md.

const { execSync } = require("child_process");

const PORT = process.env.GROK_PORT || "9333";

function playwright() {
  try {
    return require("playwright");
  } catch {
    if (process.env.PLAYWRIGHT_DIR) return require(process.env.PLAYWRIGHT_DIR);
    throw new Error("Playwright not found: run `npm install` in tools/grok-bot, or set PLAYWRIGHT_DIR");
  }
}

/** Attach to the running app. Start it with start.ps1 first. */
async function connect() {
  const browser = await playwright().chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = browser.contexts()[0].pages().find((p) => p.url().startsWith("file:"));
  if (!page) throw new Error("Grok Bot window not found on the debug port");
  return { browser, page };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clipboard = () => execSync("powershell -NoProfile -Command Get-Clipboard").toString().trim();

/** Poll every 5 s until test() is true, or throw after `tries`. */
async function until(page, test, label, tries = 48) {
  for (let i = 0; i < tries; i++) {
    if (await test()) return;
    await page.waitForTimeout(5000);
  }
  throw new Error(`timed out waiting for ${label}`);
}

/** Escape any dialog left open; a stray one swallows the next click. */
async function clearOverlays(page) {
  for (let k = 0; k < 3 && (await page.locator("[role=dialog]:visible").count()); k++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
  }
}

/** Open an existing bot by clicking its name in the sidebar. */
async function openBot(page, name) {
  await clearOverlays(page);
  const btn = page.locator("button", { hasText: name });
  for (let i = 0, n = await btn.count(); i < n; i++) {
    const bb = await btn.nth(i).boundingBox();
    if (bb && bb.x < 300) {
      await btn.nth(i).click();
      await page.waitForTimeout(2500);
      return;
    }
  }
  throw new Error(`no bot called "${name}" in the sidebar`);
}

/**
 * Send one message in the open chat and return the bot's reply text. The reply
 * is the text after the bot's name, up to its timestamp; the app's side panel
 * follows the chat in the page text, so waiting for "any text" is not enough.
 * Waits until the reply is there and has stopped growing.
 */
async function ask(page, text, botName, tries = 36) {
  const box = page.locator("textarea, [contenteditable=true]").last();
  await box.click();
  await box.fill(text);
  await page.keyboard.press("Enter");
  const esc = botName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pick = (body) => {
    const after = (body.split(text).pop() ?? "").replace(/\s+/g, " ");
    const m = after.match(new RegExp(`${esc} (.+?) \\d{1,2}:\\d{2} ?[AP]M`));
    return m ? m[1].trim() : "";
  };
  let reply = "";
  let last = "";
  await until(
    page,
    async () => {
      const body = await page.innerText("body");
      reply = pick(body);
      const settled = reply.length > 20 && reply === last && !/is working/.test(body);
      last = reply;
      return settled;
    },
    "a reply",
    tries,
  );
  return reply;
}

module.exports = { connect, wait, clipboard, until, clearOverlays, openBot, ask };
