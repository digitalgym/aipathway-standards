// node tools/grok-bot/publish.cjs <work dir> <slug...>
// For each pack in <work dir>/packs (made by pack.mjs): create the Bot, give it
// its job, save that to memory, make a public template, publish it and record
// the x.ai/bot link in <work dir>/grok-links.json. Stops on the first failure
// so nothing half-made piles up; rerunning resumes a half-made bot.
const fs = require("fs");
const { connect, wait, clipboard: clip, until, clearOverlays } = require("./lib.cjs");
const [dir, ...slugs] = process.argv.slice(2);
const linksFile = dir + "/grok-links.json";
const links = fs.existsSync(linksFile) ? JSON.parse(fs.readFileSync(linksFile, "utf8")) : {};

(async () => {
  const { browser: b, page } = await connect();
  for (const slug of slugs) {
    if (links[slug]) { console.log(`${slug}: already ${links[slug]}`); continue; }
    const pack = JSON.parse(fs.readFileSync(`${dir}/packs/${slug}.json`, 'utf8'));
    try {
      await clearOverlays(page);
      // Resume: if this Bot is already open (a previous run made it), skip creating it again.
      const already = (await page.locator('button', { hasText: pack.name }).count()) > 0 && (await page.innerText('body')).includes(`You are ${pack.name}.`);
      if (!already) {
      await page.getByRole('button', { name: 'New Bot', exact: true }).first().click();
      const dlg = page.locator('[role=dialog]').last();
      await dlg.getByPlaceholder('Name your Bot').fill(pack.name);
      await dlg.getByRole('button', { name: 'square character shape' }).click();
      await dlg.getByRole('button', { name: 'Blue character color' }).click();
      await dlg.getByRole('button', { name: 'Create', exact: true }).click();
      await page.waitForTimeout(4000);

      const msg = `This is your job and your rules. Remember all of it, word for word, and follow it every time you run.\n\n${pack.instructions}\n\nYour routine: ${pack.routine}.\nApps you will use: ${pack.connect.join('; ')}.\nCredit: ${pack.credit}.\n\nReply with a two-line summary of your job, then wait.`;
      const box = page.locator('textarea, [contenteditable=true]').last();
      await box.click(); await box.fill(msg); await page.keyboard.press('Enter');
      await until(page, async () => { const t = await page.innerText('body'); return !/is working/.test(t) && t.split('then wait.').pop().length > 200; }, 'job reply');
      }
      const summary = (await page.innerText('body')).split('then wait.').pop().replace(/\s+/g, ' ').slice(0, 300);
      // The template keeps memories, not chat, so the rules must be in memory before the copy.
      const SAVE = 'Save your job and every rule above to your memory now, word for word, then confirm in one line.';
      const box3 = page.locator('textarea, [contenteditable=true]').last();
      await box3.click(); await box3.fill(SAVE); await page.keyboard.press('Enter');
      await until(page, async () => { const t = await page.innerText('body'); const after = t.split(SAVE).pop(); return !/is working/.test(t) && /memor|saved/i.test(after); }, 'memory confirm');

      // Share sits in the Bot's details panel; its name above the chat toggles the panel.
      const shareBtn = () => page.locator('button[aria-label="Share"]:visible, button:visible:text-is("Share")').first();
      if (!(await shareBtn().count())) {
        const pill = page.locator('button', { hasText: pack.name });
        for (let i = 0, n = await pill.count(); i < n; i++) {
          const bb = await pill.nth(i).boundingBox();
          if (bb && bb.x > 300 && bb.y < 90) { await pill.nth(i).click(); break; }
        }
        await page.waitForTimeout(1500);
      }
      await shareBtn().click();
      await page.waitForTimeout(1500);
      await page.locator('button:visible, [role=menuitem]:visible', { hasText: 'Create a copy' }).first().click();
      await until(page, async () => (await page.getByRole('button', { name: 'Publish', exact: true }).count()) > 0 && !/is working/.test(await page.innerText('body')), 'template card');
      await clearOverlays(page);
      await page.getByRole('button', { name: 'Publish', exact: true }).last().click();
      await until(page, async () => (await page.getByRole('button', { name: 'Copy link', exact: true }).count()) > 0, 'publish', 12);
      await page.getByRole('button', { name: 'Copy link', exact: true }).last().click();
      await page.waitForTimeout(1000);
      const link = clip();
      if (!/^https:\/\/x\.ai\/bot\/[\w-]+$/.test(link)) throw new Error(`clipboard was not a bot link: ${link.slice(0, 60)}`);
      links[slug] = link;
      fs.writeFileSync(linksFile, JSON.stringify(links, null, 2));
      console.log(`${slug}: ${link} | ${summary.slice(0, 160)}`);
      await page.screenshot({ path: `${dir}/done-${slug}.png` });
      await wait(20000); // pace like a person
    } catch (e) {
      console.log(`${slug}: FAILED ${e.message.split('\n')[0]}`);
      await page.screenshot({ path: `${dir}/fail-${slug}.png` });
      break; // stop the batch on the first failure so nothing half-made piles up
    }
  }
  await b.close();
})();
