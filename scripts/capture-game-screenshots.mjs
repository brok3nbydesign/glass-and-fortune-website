/* Captures real gameplay screenshots from the Glass & Fortune game folder.

   The game is served read-only from GAME_DIR (default C:/lumina_dice); nothing
   in it is written to. A small hook is injected into the served copy only, so
   a scene can be staged the way a developer would set one up, using the
   game's own rules and interface. Output goes to raw-captures/ at 1920x1080.

     node scripts/capture-game-screenshots.mjs            all scenes
     node scripts/capture-game-screenshots.mjs table late  just those two      */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../raw-captures');
const gameDir = path.resolve(process.env.GAME_DIR || 'C:/lumina_dice');
const only = process.argv.slice(2);
const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
fs.mkdirSync(out, {recursive: true});

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.mp4': 'video/mp4', '.glb': 'model/gltf-binary', '.json': 'application/json',
};
const MARK = '/* ---------- input wiring ---------- */';
const hook = `window.__site={setup(o={}){
  Spoken.cancel();Narrator.setEnabled(false);for(const k in overlays)showOverlay(k,false);
  labRun=new LabRules.Lab('SITE');Object.assign(labRun.state,{phase:'play',ruleId:'open',castsLeft:3,charms:{},curios:{},...o});
  Object.assign(G,{sel:-1,animating:false,ruleRevealLocked:false,readingCasts:0,readingBends:0,casts:0,runStart:Date.now(),mysteries:[],tableRules:ECHOES.map(e=>e.rules[0])});
  finalCastArmed=false;previousReadyCharms=new Map();showScreen('play');labPaint();saveRun();
}};\n${MARK}`;

const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(gameDir, '.' + name);
  const allowed = name === '/glass-and-fortune.html' || ['/runtime/', '/assets/', '/audio/'].some(p => name.startsWith(p));
  if (!allowed || !file.startsWith(gameDir + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  let body = fs.readFileSync(file);
  if (name === '/glass-and-fortune.html') body = body.toString().replace(MARK, hook);
  res.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream'});
  res.end(body);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

const browser = await chromium.launch({
  headless: true, channel: 'chrome',
  args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
});
async function fresh({narrator = false} = {}) {
  const ctx = await browser.newContext({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1});
  await ctx.addInitScript(n => {
    const p = 'glass_redesigned:';
    localStorage.setItem(p + 'glass_light_visuals', '0');
    localStorage.setItem(p + 'glass_narrator', n ? '1' : '0');
    localStorage.setItem(p + 'glass_music_mute', '1');
    localStorage.setItem(p + 'glass_ambient', '0');
  }, narrator);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  page error:', e.message));
  await page.goto(base + '/glass-and-fortune.html');
  return {ctx, page};
}
const want = n => !only.length || only.includes(n);
const shot = async (page, n) => { await page.screenshot({path: path.join(out, n + '.png')}); console.log('captured', n); };

if (want('title')) {
  const {ctx, page} = await fresh();
  await page.waitForTimeout(5000);
  await shot(page, 'title');
  await ctx.close();
}

if (want('starter') || want('cabinet')) {
  const {ctx, page} = await fresh({narrator: true});
  await page.locator('#btnStart').click();
  await page.waitForTimeout(800);
  if (await page.locator('#btnSkipIntro').isVisible()) await page.locator('#btnSkipIntro').click();
  await page.locator('#aspect.active').waitFor();
  await page.waitForTimeout(4500);
  if (want('starter')) await shot(page, 'starter');
  await page.locator('#aspGrid .is-active').click();
  await page.locator('#shop.active').waitFor();
  await page.waitForTimeout(5000);
  if (want('cabinet')) await shot(page, 'cabinet');
  await ctx.close();
}

async function table(state) {
  const {ctx, page} = await fresh();
  await page.waitForTimeout(1500);
  await page.evaluate(o => __site.setup(o), state);
  await page.waitForTimeout(4500);
  return {ctx, page};
}

const handState = {
  reading: 4, castsLeft: 2, readingScore: 1640, total: 9380,
  charms: {moth: 2, twin: 1, hush: 1, rainbow: 1},
  curios: {glove: 1, bookmark: 1, storm: 1, candle: 1},
  dice: [5, 5, 5, 2, 2].map((n, i) => ({n, c: i === 3 ? 'amber' : 'emerald'})),
};

if (want('table')) {
  const {ctx, page} = await table(handState);
  await shot(page, 'table');
  await ctx.close();
}

if (want('select')) {
  const {ctx, page} = await table(handState);
  await page.locator('#play .die').nth(3).click();
  await page.waitForTimeout(1800);
  await shot(page, 'select');
  await ctx.close();
}

if (want('scoring') || want('summary')) {
  const {ctx, page} = await table({...handState, dice: [5, 5, 5, 2, 2].map(n => ({n, c: 'emerald'}))});
  await page.locator('#btnSubmit').click();
  await page.locator('#scoreReveal.active').waitFor();
  await page.waitForTimeout(3800);
  if (want('scoring')) await shot(page, 'scoring');
  if (want('summary')) {
    if (await page.locator('#scoreRevealSkip').isVisible()) await page.locator('#scoreRevealSkip').click();
    await page.locator('#scoreRevealContinue:not(:disabled)').waitFor({timeout: 30000});
    await page.locator('#scoreRevealSummary').click();
    await page.waitForTimeout(1500);
    await shot(page, 'summary');
  }
  await ctx.close();
}

if (want('late')) {
  const {ctx, page} = await table({
    reading: 10, castsLeft: 1, readingScore: 8200, total: 61200,
    charms: {moth: 2, twin: 2, hush: 1, grain: 1, census: 1, six: 1},
    curios: {glove: 1, bookmark: 1, bones: 1, leech: 1, organ: 1},
    threads: ['lantern', 'mirror', 'crown'],
    dice: [6, 6, 6, 6, 3].map((n, i) => ({n, c: ['ruby', 'sapphire', 'emerald', 'amber', 'amethyst'][i], ...(i === 1 ? {scar: 'gilt'} : {})})),
  });
  await shot(page, 'late');
  await ctx.close();
}

await browser.close();
server.close();
