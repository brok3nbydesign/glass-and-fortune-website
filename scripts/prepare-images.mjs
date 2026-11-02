/* Copies the promotional art the website uses out of the game folder and
   writes web-sized versions into public/. Only the files listed here are
   touched, and the game folder is only ever read.

     npm run images            (GAME_DIR defaults to C:/lumina_dice)

   Screenshots come from raw-captures/, made by capture-game-screenshots.mjs. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const game = path.resolve(process.env.GAME_DIR || 'C:/lumina_dice');
const captures = path.join(root, 'raw-captures');
const img = path.join(root, 'public/images');
fs.mkdirSync(img, {recursive: true});
fs.mkdirSync(path.join(root, 'public/models'), {recursive: true});
fs.mkdirSync(path.join(root, 'public/favicon'), {recursive: true});

const art = p => path.join(game, 'assets/art', p);
const shot = n => path.join(captures, n + '.png');
let written = 0;

async function webp(src, name, widths, {quality = 78, crop} = {}) {
  for (const w of widths) {
    let s = sharp(src);
    if (crop) s = s.extract(crop);
    await s.resize({width: w, withoutEnlargement: true}).webp({quality, effort: 5}).toFile(path.join(img, `${name}-${w}.webp`));
    written++;
  }
}

/* Brand */
await sharp(art('GlassFortune_logo.png')).resize({width: 900}).webp({quality: 88, alphaQuality: 92}).toFile(path.join(img, 'logo-900.webp'));
await sharp(art('GlassFortune_logo.png')).resize({width: 520}).webp({quality: 88, alphaQuality: 92}).toFile(path.join(img, 'logo-520.webp'));
await sharp(art('GlassFortune_logo.png')).resize({width: 240}).png({compressionLevel: 9, palette: true}).toFile(path.join(img, 'logo-240.png'));
written += 3;

/* Atmosphere */
await webp(art('backgrounds/menu_parlour.webp'), 'parlour', [960, 1712], {quality: 70});
await webp(art('backgrounds/Glass_bG.png'), 'parlour-empty', [960, 1531], {quality: 70});
await webp(art('morrow/morrow_portrait.png'), 'morrow', [420, 760], {quality: 82});
await webp(art('tally/tally_idle.png'), 'tally', [300, 520], {quality: 82});
await webp(art('threads/thread_01_prism_lantern.jpg'), 'thread-lantern', [640, 1168], {quality: 76});

/* Item cards shown in the Charms & Curios feature */
const cards = {
  charm_monochrome_moth: 'items/charms/charm_monochrome_moth.jpg',
  charm_rainbow_thread: 'items/charms/charm_rainbow_thread.jpg',
  charm_hush_bell: 'items/charms/charm_hush_bell.jpg',
  curio_velvet_glove: 'items/curios/curio_velvet_glove.jpg',
  curio_lucky_cup: 'items/curios/curio_lucky_cup.jpg',
  curio_glass_leech: 'items/curios/curio_glass_leech.png',
};
for (const [name, file] of Object.entries(cards)) await webp(art(file), name, [360], {quality: 76});

/* Gameplay screenshots: thumbnails for the grid, 1920 for the lightbox */
for (const n of ['title', 'table', 'summary', 'starter', 'cabinet', 'late']) {
  await webp(shot(n), 'shot-' + n, [640, 1280, 1920], {quality: 80});
}

/* How-to-play crops, cut from the same real screenshots */
await webp(shot('table'), 'step-roll', [560], {crop: {left: 630, top: 380, width: 660, height: 200}});
await webp(shot('table'), 'step-bend', [560], {crop: {left: 640, top: 818, width: 420, height: 157}});
await webp(shot('summary'), 'step-cast', [560], {crop: {left: 574, top: 404, width: 772, height: 290}});
await webp(shot('table'), 'step-reading', [560], {crop: {left: 1085, top: 52, width: 310, height: 116}});

/* Trailer poster and social sharing image */
await sharp(shot('table')).resize({width: 1280}).webp({quality: 74}).toFile(path.join(img, 'trailer-poster-1280.webp'));
const logoForOg = await sharp(art('GlassFortune_logo.png')).resize({width: 760}).png().toBuffer();
await sharp(art('backgrounds/menu_parlour.webp'))
  .resize({width: 1200, height: 630, fit: 'cover', position: 'right'})
  .modulate({brightness: 0.62})
  .composite([{input: logoForOg, top: 60, left: 60}])
  .jpeg({quality: 84, mozjpeg: true})
  .toFile(path.join(root, 'public/og-image.jpg'));
written += 2;

/* Favicons: the logo's two dice, cropped from the logo itself */
const diceCrop = {left: 400, top: 330, width: 690, height: 345};
const square = await sharp(art('GlassFortune_logo.png')).extract(diceCrop)
  .resize({width: 512, height: 512, fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
for (const s of [32, 180, 192, 512]) {
  await sharp(square).resize(s, s).png({compressionLevel: 9}).toFile(path.join(root, `public/favicon/icon-${s}.png`));
  written++;
}

/* The die model, unchanged from the game */
fs.copyFileSync(path.join(game, 'assets/models/dice/glass_die.glb'), path.join(root, 'public/models/glass_die.glb'));
written++;

console.log(`Wrote ${written} files into public/.`);
