/* Automated checks for the built website (run `npm run build` first).

     npm test

   Serves dist/ locally, opens it in Chrome through Playwright (a browser
   automation tool) and checks navigation, the gallery, the trailer, the
   Steam buttons, the WebGL fallback, phone layout, and that the die always
   reports the face that is really pointing up. Nothing is published. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const base = (process.env.BASE_PATH || '/').replace(/\/?$/, '/');
const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const faces = JSON.parse(fs.readFileSync(path.join(root, 'scripts/glass_die.faces.json'), 'utf8')).faces;
const ROLLS = Number(process.env.ROLLS || 12);

const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.txt': 'text/plain', '.xml': 'application/xml', '.json': 'application/json', '.svg': 'image/svg+xml'};
const misses = [];
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!name.startsWith(base)) { misses.push(name); res.writeHead(404).end(); return; }
  name = name.slice(base.length) || 'index.html';
  const file = path.resolve(dist, name);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { misses.push(req.url); res.writeHead(404).end(); return; }
  res.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream'});
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}${base}`;

/* Software graphics by default, so the checks behave the same on any machine.
   TEST_GPU=1 uses the real graphics card instead, for when a Chrome update
   breaks software rendering. */
const gpuArgs = process.env.TEST_GPU ? [] : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
const browser = await chromium.launch({headless: true, channel: 'chrome', args: [...gpuArgs, '--autoplay-policy=no-user-gesture-required']});
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log('PASS ' + name);
}

/* Independent of the site's own code: the face is read from the exported
   face table and the die's physics rotation. */
function upFace(q) {
  const [x, y, z, w] = q;
  let best = null;
  for (const f of faces) {
    const [nx, ny, nz] = f.normal_gltf;
    /* v' = v + w*t + q.xyz x t, with t = 2 (q.xyz x v); only Y is needed */
    const tx = 2 * (y * nz - z * ny), tz = 2 * (x * ny - y * nx);
    const ty = 2 * (z * nx - x * nz);
    const ry = ny + w * ty + (z * tx - x * tz);
    if (!best || ry > best.dot) best = {value: f.value, dot: ry};
  }
  return best;
}

async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({viewport, deviceScaleFactor: 1, hasTouch: !!opts.touch, isMobile: !!opts.touch, reducedMotion: opts.reducedMotion || 'no-preference'});
  if (opts.noWebgl) await ctx.addInitScript(() => { window.GLASS_NO_WEBGL = true; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, {waitUntil: 'load'});
  return {ctx, page, errors};
}
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const waitResult = page => page.locator('.dice-face').waitFor({timeout: 40000});
/* At rest: either a face is read, or the die is cocked against a rail (real
   physics allows it; nothing pushes it flat). */
const waitRest = page => page.waitForFunction(() => __glassDie.inspect()?.settled && !__glassDie.inspect().held
  && ['settled', 'cocked'].includes(document.querySelector('.dice-stage')?.dataset.phase), null, {timeout: 40000});
async function restedReadsTrue(page, label) {
  const info = await page.evaluate(() => __glassDie.inspect());
  const phase = await page.locator('.dice-stage').getAttribute('data-phase');
  const top = upFace(info.quaternion);
  if (phase === 'cocked') {
    assert.ok(top.dot < 0.9, `${label}: called cocked only when no face is up (${top.dot.toFixed(3)})`);
    assert.equal(await page.locator('.dice-face').count(), 0, `${label}: no number shown when cocked`);
    assert.match(await page.innerText('.dice-status'), /cocked/i);
  } else {
    assert.ok(top.dot > 0.9, `${label}: die is flat (${top.dot.toFixed(3)})`);
    assert.equal(await shown(page), top.value, `${label}: shown number is the up face`);
  }
  return {phase, top, info};
}
const shown = async page => Number(await page.locator('.dice-face').textContent());

try {
  const {ctx, page, errors} = await open({width: 1440, height: 900});
  await page.locator('.dice-stage.is-ready').waitFor({timeout: 60000});

  await check('Desktop page loads without errors or sideways scrolling', async () => {
    assert.equal(await noOverflow(page), true);
    assert.deepEqual(errors, []);
    assert.equal(misses.length, 0, 'missing files: ' + misses.join(', '));
  });

  await check('Die model faces match the exported table, opposite faces sum to seven', async () => {
    const info = await page.evaluate(() => __glassDie.inspect());
    for (const f of faces) {
      const m = info.faceNormals.find(n => n.value === f.value);
      const dot = m.normal.reduce((s, v, i) => s + v * f.normal_gltf[i], 0);
      assert.ok(dot > 0.999, `face ${f.value} direction`);
      const opp = info.faceNormals.find(n => n.value === 7 - f.value);
      assert.ok(m.normal.reduce((s, v, i) => s + v * opp.normal[i], 0) < -0.999, `face ${f.value} opposite`);
    }
  });

  await check('Hero copy and Steam button are not covered by the table', async () => {
    for (const sel of ['.hero-logo img', '.hero-tagline', '.hero-actions .btn-brass']) {
      const b = await page.locator(sel).boundingBox();
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.hero-copy') != null, [b.x + b.width / 2, b.y + b.height / 2]);
      assert.ok(hit, sel + ' is on top');
    }
  });

  await check(`Roll button: ${ROLLS} rolls, every result matches the face pointing up`, async () => {
    const seen = new Set();
    let cocked = 0;
    for (let i = 0; i < ROLLS; i++) {
      await page.locator('.dice-buttons .btn').click();
      await page.waitForFunction(() => document.querySelector('.dice-stage').dataset.phase === 'rolling', null, {timeout: 5000}).catch(() => {});
      await waitRest(page);
      const {phase, top, info} = await restedReadsTrue(page, `roll ${i}`);
      const [x, , z] = info.position;
      assert.ok(Math.abs(x) <= info.bounds.halfX && Math.abs(z) <= info.bounds.halfZ, `roll ${i}: die stayed on the cloth`);
      if (phase === 'cocked') cocked++; else seen.add(top.value);
    }
    console.log('     faces seen:', [...seen].sort().join(' '), cocked ? `(cocked ${cocked})` : '');
    assert.ok(seen.size >= 3, 'rolls vary');
    assert.ok(cocked <= Math.max(1, ROLLS / 6), 'cocked dice are rare');
  });

  await check('The canvas over the page never swallows a click', async () => {
    for (const sel of ['.hero-actions .btn-brass', '.site-header nav a', '.hero-logo img']) {
      const b = await page.locator(sel).first().boundingBox();
      const onTop = await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return !!el && !el.closest('.dice-canvas-wrap');
      }, [b.x + b.width / 2, b.y + b.height / 2]);
      assert.ok(onTop, sel + ' is reachable through the overlay');
    }
    await page.locator('.site-header nav a').first().click({timeout: 4000});
    /* put the hero back under the pointer for the tests that follow; the
       link scrolls smoothly, so let it finish before overriding it */
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1200);
  });

  await check('Carried off the mat and dropped, the die is lost and Morrow fetches it back', async () => {
    await page.locator('.dice-frame').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const start = await page.evaluate(() => __glassDie.inspect());
    await page.mouse.move(start.screen[0], start.screen[1]);
    await page.mouse.down();
    await page.waitForTimeout(150);
    const held = await page.evaluate(() => __glassDie.inspect());
    const moved = Math.hypot(held.screen[0] - start.screen[0], held.screen[1] - start.screen[1]);
    assert.ok(held.held, 'the die was picked up');
    assert.ok(moved < 6, `picking it up does not move it (moved ${moved.toFixed(1)}px)`);
    /* carry it to the far side of the page, well away from the mat */
    /* held by the point that was touched: that point stays under the pointer */
    for (const [x, y] of [[700, 420], [260, 240], [180, 700]]) {
      await page.mouse.move(x, y, {steps: 10});
      await page.waitForTimeout(400);
      const at = await page.evaluate(() => __glassDie.inspect());
      const off = Math.hypot(at.grip[0] - x, at.grip[1] - y);
      assert.ok(off < 8, `the die stays under the pointer (${off.toFixed(1)}px)`);
    }
    assert.equal(await page.innerText('.dice-status'), 'Drop it on the mat.', 'Morrow says where it goes');
    await page.mouse.up();
    await page.waitForFunction(() => __glassDie.inspect()?.lost, null, {timeout: 8000});
    assert.match(await page.innerText('.dice-status'), /morrow/i, 'Morrow speaks up');
    assert.equal(await page.innerText('.dice-buttons .btn'), 'Fetch the die');
    await page.locator('.dice-buttons .btn').click();
    await waitRest(page);
    const back = await page.evaluate(() => __glassDie.inspect());
    assert.equal(back.lost, false, 'the die is back');
    assert.ok(Math.abs(back.position[0]) <= back.bounds.halfX && Math.abs(back.position[2]) <= back.bounds.halfZ, 'back on the mat');
    assert.equal(await shown(page), upFace(back.quaternion).value, 'and it reads its face again');
  });

  await check('Pick up, carry and throw with the mouse', async () => {
    await page.locator('.dice-frame').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const start = await page.evaluate(() => __glassDie.inspect());
    const [sx, sy] = start.screen;
    const frame = await page.locator('.dice-frame').boundingBox();
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.waitForTimeout(150);
    const held = await page.evaluate(() => __glassDie.inspect());
    assert.equal(held.held, true, 'die is held');
    const jump = Math.hypot(held.screen[0] - sx, held.screen[1] - sy);
    assert.ok(jump < 6, `picking it up does not move it (${jump.toFixed(1)}px)`);
    /* carrying it up the screen, still over the cloth, lifts it */
    const upY = frame.y + frame.height * 0.18;
    await page.mouse.move(sx, upY, {steps: 10});
    await page.waitForTimeout(250);
    const lifted = await page.evaluate(() => __glassDie.inspect());
    assert.ok(lifted.position[1] > start.position[1] + 0.6, `carried upwards it rises (${lifted.position[1].toFixed(2)})`);
    assert.equal(lifted.overMat, true, 'still over the mat');
    for (let k = 1; k <= 8; k++) { await page.mouse.move(sx - 14 * k, upY + 10 * k); await page.waitForTimeout(16); }
    await page.mouse.up();
    await waitRest(page);
    const {info} = await restedReadsTrue(page, 'thrown');
    assert.equal(info.held, false);
    assert.equal(info.lost, false, 'thrown over the mat, it stays in play');
  });

  await check('A hard throw is limited; if it clears a rail it falls, and Morrow fetches it', async () => {
    const frame = await page.locator('.dice-frame').boundingBox();
    const [sx, sy] = (await page.evaluate(() => __glassDie.inspect())).screen;
    const endX = frame.x + frame.width * 0.78, endY = frame.y + frame.height * 0.42;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.waitForTimeout(150);
    for (let k = 1; k <= 6; k++) {
      await page.mouse.move(sx + (endX - sx) * k / 6, sy + (endY - sy) * k / 6);
      await page.waitForTimeout(8);
    }
    await page.mouse.up();
    const v = (await page.evaluate(() => __glassDie.inspect())).released.linvel;
    assert.ok(Math.hypot(...v) <= 8.6, `release speed is limited (${Math.hypot(...v).toFixed(2)})`);
    await page.waitForFunction(() => ['settled', 'cocked', 'lost'].includes(document.querySelector('.dice-stage').dataset.phase), null, {timeout: 40000});
    if (await page.locator('.dice-stage').getAttribute('data-phase') === 'lost') {
      console.log('     the throw cleared a rail; fetching');
      await page.locator('.dice-buttons .btn').click();
      await waitRest(page);
    }
    const {info} = await restedReadsTrue(page, 'after the hard throw');
    assert.equal(info.lost, false);
  });

  await check('The rails are solid: a die over the outer edge tips off, one on top stays', async () => {
    const b = (await page.evaluate(() => __glassDie.inspect())).bounds;
    const edge = b.halfX + 0.55, top = 0.8 + 0.5 + 0.002;
    /* centre 0.15 past the outer edge of the right rail: falls */
    await page.evaluate(([x, y]) => __glassDie.pose({p: [x, y, 0], q: [0, 0, 0, 1]}), [edge + 0.15, top]);
    await page.waitForFunction(() => __glassDie.inspect().lost, null, {timeout: 15000});
    await page.locator('.dice-buttons .btn').click();
    await waitRest(page);
    /* centre on the middle of the rail: it rests up there, flat */
    await page.evaluate(([x, y]) => __glassDie.pose({p: [x, y, 0], q: [0, 0, 0, 1]}), [edge - 0.275, top]);
    await waitRest(page);
    const {info} = await restedReadsTrue(page, 'on the rail');
    assert.ok(info.position[1] > 1.2, `resting on top of the rail (y ${info.position[1].toFixed(2)})`);
    /* balanced on an edge on the cloth, leaning a hair: it falls and reads */
    await page.evaluate(() => __glassDie.pose({p: [0, 0.66, 0], q: [0, 0, Math.sin((Math.PI / 4 + 0.02) / 2), Math.cos((Math.PI / 4 + 0.02) / 2)]}));
    await waitRest(page);
    const fell = await restedReadsTrue(page, 'from an edge');
    assert.ok(fell.info.position[0] < -0.1, 'it fell the way it leaned');
  });

  await check('Impact sound plays per strike, is rate limited, and mutes', async () => {
    const s = await page.evaluate(() => __glassDie.sound());
    assert.ok(s && s.impacts > 0, 'impacts were voiced');
    await page.locator('.dice-buttons .btn-icon').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('gf-site-muted')), '1');
    const before = (await page.evaluate(() => __glassDie.sound())).impacts;
    await page.locator('.dice-buttons .btn').click();
    await waitRest(page);
    assert.equal((await page.evaluate(() => __glassDie.sound())).impacts, before, 'muted roll is silent');
    await page.locator('.dice-buttons .btn-icon').click();
    const t0 = (await page.evaluate(() => __glassDie.sound())).impacts;
    await page.locator('.dice-buttons .btn').click();
    await waitRest(page);
    const per = (await page.evaluate(() => __glassDie.sound())).impacts - t0;
    console.log('     strikes voiced in one roll:', per);
    assert.ok(per >= 1 && per < 30, 'a roll is a handful of strikes, not a buzz');
  });

  await check('Morrow stays silent until touched, then speaks and can be muted', async () => {
    const fresh = await open({width: 1280, height: 860});
    const heard = [];
    fresh.page.on('response', r => { if (/audio\/voice\//.test(r.url())) heard.push(r.url().split('/').pop()); });
    await fresh.page.locator('.dice-stage.is-ready').waitFor({timeout: 60000});
    await fresh.page.waitForTimeout(500);
    assert.equal(heard.length, 0, 'nothing of his is fetched before the visitor acts');
    const i = await fresh.page.evaluate(() => __glassDie.inspect());
    await fresh.page.mouse.move(i.screen[0], i.screen[1]);
    await fresh.page.mouse.down();
    await fresh.page.waitForTimeout(900);
    assert.deepEqual(heard, ['site_morrow_first_pickup.mp3'], 'he speaks when the die is first picked up');
    assert.match(await fresh.page.innerText('.dice-morrow'), /Morrow/i, 'and the line is written out');
    await fresh.page.mouse.up();
    await waitRest(fresh.page);
    /* the roll's own result is still there, not replaced by his caption */
    const info = await fresh.page.evaluate(() => __glassDie.inspect());
    assert.equal(await shown(fresh.page), upFace(info.quaternion).value, 'the face still shows while he talks');
    await fresh.page.locator('.dice-buttons .btn-icon').click();
    const before = heard.length;
    for (let k = 0; k < 3; k++) { await fresh.page.locator('.dice-buttons .btn').click(); await waitRest(fresh.page); }
    assert.equal(heard.length, before, 'muted, he says nothing more');
    assert.equal(await fresh.page.evaluate(() => [...document.querySelectorAll('audio')].some(a => !a.paused)), false);
    await fresh.ctx.close();
  });

  await check('Keyboard: Tab reaches Roll, Enter rolls', async () => {
    await page.locator('.dice-buttons .btn').focus();
    await page.keyboard.press('Enter');
    await waitRest(page);
  });

  await check('Navigation links scroll to their sections', async () => {
    for (const [link, id] of [['The Game', 'game'], ['How to Play', 'how-to-play'], ['Gallery', 'gallery']]) {
      await page.locator('.site-nav a', {hasText: link}).click();
      await page.waitForTimeout(1500);
      /* in view at the top, or as far as the page can scroll */
      const {top, atEnd} = await page.locator('#' + id).evaluate(el => ({
        top: el.getBoundingClientRect().top,
        atEnd: Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2,
      }));
      assert.ok(Math.abs(top) < 120 || (atEnd && top < innerHeight / 2), `${id} at ${top}`);
    }
  });

  await check('Gallery lightbox: open, next/previous, keyboard, close returns focus', async () => {
    const first = page.locator('.gallery-item').first();
    await first.click();
    const box = page.locator('.lightbox');
    await box.waitFor();
    assert.match(await box.locator('.lightbox-count').textContent(), /^1 \/ 6/);
    await page.keyboard.press('ArrowRight');
    assert.match(await box.locator('.lightbox-count').textContent(), /^2 \/ 6/);
    await box.locator('.lightbox-prev').click();
    await box.locator('.lightbox-prev').click();
    assert.match(await box.locator('.lightbox-count').textContent(), /^6 \/ 6/);
    const img = await box.locator('img').evaluate(el => ({ok: el.complete && el.naturalWidth > 0, alt: el.alt}));
    assert.ok(img.alt.length > 20);
    await page.keyboard.press('Escape');
    await box.waitFor({state: 'detached'});
    assert.equal(await first.evaluate(el => el === document.activeElement), true);
    for (const el of await page.locator('.gallery-item img').all()) assert.ok((await el.getAttribute('alt')).length > 20);
  });

  await check('Trailer loads nothing from YouTube until asked; Steam buttons never link nowhere', async () => {
    assert.equal(await page.locator('#trailer iframe').count(), 0);
    const steam = await page.locator('.btn-brass').evaluateAll(els => els.map(e => ({tag: e.tagName, href: e.getAttribute('href')})));
    assert.ok(steam.length >= 4, 'wishlist in header, hero, mid-page and final section');
    for (const s of steam) assert.ok(s.tag === 'SPAN' || /^https:\/\/store\.steampowered\.com\//.test(s.href), JSON.stringify(s));
  });

  await check('Rendering stops while the die is off screen', async () => {
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    const frames = await page.evaluate(() => new Promise(res => {
      const c = document.querySelector('.dice-canvas-wrap canvas');
      const gl = c.getContext('webgl2');
      let n = 0;
      const orig = gl.drawElements.bind(gl);
      gl.drawElements = (...a) => { n++; return orig(...a); };
      setTimeout(() => { gl.drawElements = orig; res(n); }, 1000);
    }));
    assert.equal(frames, 0, 'no draws while hidden');
    assert.deepEqual(errors, []);
  });
  await ctx.close();

  for (const [w, h] of [[390, 844], [360, 740], [768, 1024]]) {
    const m = await open({width: w, height: h}, {touch: true});
    await m.page.locator('.dice-stage.is-ready').waitFor({timeout: 60000});
    await check(`Phone/tablet ${w}x${h}: no sideways scroll, die reachable, nothing overlaps the copy`, async () => {
      assert.equal(await noOverflow(m.page), true);
      const actions = await m.page.locator('.hero-actions').boundingBox();
      const frame = await m.page.locator('.dice-frame').boundingBox();
      assert.ok(frame.y >= actions.y + actions.height - 1, 'table sits below the buttons');
      assert.ok(frame.x >= 0 && frame.x + frame.width <= w + 1);
      await m.page.locator('.nav-toggle').click();
      await m.page.locator('.site-nav a', {hasText: 'Gallery'}).waitFor({state: 'visible'});
      await m.page.locator('.nav-toggle').click();
    });
    if (w === 390) {
      await check('Touch: drag the die with a finger; the page does not scroll while held', async () => {
        await m.page.locator('.dice-frame').scrollIntoViewIfNeeded();
        await m.page.waitForTimeout(600);
        const [sx, sy] = (await m.page.evaluate(() => __glassDie.inspect())).screen;
        const scroll0 = await m.page.evaluate(() => scrollY);
        const cdp = await m.ctx.newCDPSession(m.page);
        const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' ? [] : [{x, y}]});
        await touch('touchStart', sx, sy);
        await m.page.waitForTimeout(250);
        for (let k = 1; k <= 8; k++) { await touch('touchMove', sx + 6 * k, sy - 14 * k); await m.page.waitForTimeout(20); }
        const held = await m.page.evaluate(() => __glassDie.inspect().held);
        await touch('touchEnd');
        assert.equal(held, true, 'finger picked up the die');
        assert.equal(await m.page.evaluate(() => scrollY), scroll0, 'page stayed put');
        await waitRest(m.page);
        await restedReadsTrue(m.page, 'touch throw');
      });
    }
    assert.deepEqual(m.errors, []);
    await m.ctx.close();
  }

  {
    const f = await open({width: 1280, height: 800}, {noWebgl: true});
    await check('Without WebGL the hero shows a still and the site still works', async () => {
      await f.page.locator('.dice-still img').waitFor();
      assert.ok(await f.page.locator('.dice-still img').evaluate(el => el.complete && el.naturalWidth > 0));
      assert.equal(await f.page.locator('.dice-buttons').count(), 0);
      await f.page.locator('.gallery-item').first().click();
      await f.page.locator('.lightbox').waitFor();
      assert.deepEqual(f.errors, []);
    });
    await f.ctx.close();
  }

  {
    const r = await open({width: 1280, height: 800}, {reducedMotion: 'reduce'});
    await r.page.locator('.dice-stage.is-ready').waitFor({timeout: 60000});
    await check('Reduced motion: sections are shown without animation and the die still rolls', async () => {
      assert.equal(await r.page.locator('.reveal:not(.is-visible)').count(), 0);
      await r.page.locator('.dice-buttons .btn').click();
      await waitRest(r.page);
      await restedReadsTrue(r.page, 'reduced motion');
    });
    await r.ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`${passed} website checks passed.`);
