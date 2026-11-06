// node tools/grok-bot/ask.cjs "<bot name>" "<message>"
// Open a bot in the app and send it one message; prints the reply. For poking
// at a bot by hand while writing test cases.
const { connect, openBot, ask } = require("./lib.cjs");
const [name, message] = process.argv.slice(2);
(async () => {
  const { browser, page } = await connect();
  await openBot(page, name);
  console.log(await ask(page, message, name));
  await browser.close();
})().catch((e) => {
  console.error("FAILED:", e.message.split("\n")[0]);
  process.exit(1);
});
