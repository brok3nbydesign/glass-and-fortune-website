# Glass & Fortune — official website

The promotional website for **Glass & Fortune** by Brok3n by Design: one page with a cinematic opening, a glass die visitors can pick up and throw, an explanation of the game, real gameplay screenshots, a trailer slot and Wishlist on Steam buttons.

This folder is **only the website**. It contains no game code. The game stays in `C:\lumina_dice` and is never changed by anything here.

---

## 1. What's in the page

| Section | What it shows |
|---|---|
| Header | Logo, The Game, How to Play, Gallery, Wishlist button. Becomes a menu button on phones. |
| Opening (hero) | Logo, tagline, short description, Wishlist and Watch gameplay buttons, and the card table with the glass die. |
| The Game | What you do and why it is worth another round, Morrow and Tally. |
| How to Play | Four illustrated steps, cut from real screenshots. |
| Features | Four sections about the dice, Charms & Curios, scoring and the twelve Readings, plus a mid-page Wishlist button. |
| Gameplay trailer | A 16:9 video area. Shows a "trailer is being cut" card until you add a YouTube video. |
| Gallery | Six real screenshots that open full screen (arrows, keyboard and swipe all work). |
| Closing section | Logo, "Coming Soon" and a final Wishlist button. |
| Footer | Brok3n by Design link, Steam and social links once set, copyright. |

## 2. The things you will want to change

**All of these live in one file: `src/config.js`.** Open it in any text editor, change the value between the quote marks, save, and publish (section 6).

| Setting | What to put in it |
|---|---|
| `STEAM_URL` | Your public Steam page, e.g. `'https://store.steampowered.com/app/1234560/Glass__Fortune/'`. While it is empty every Wishlist button says **"Coming Soon to Steam"** and links nowhere, so nobody lands on a missing page. Once filled in, every Wishlist button becomes **"Wishlist on Steam"** and open the store. |
| `TRAILER_YOUTUBE_ID` | The code after `v=` in your YouTube link. For `https://www.youtube.com/watch?v=AbC123xyz` it is `'AbC123xyz'`. Nothing loads from YouTube until a visitor presses play, and it never plays sound on its own. |
| `SITE.url` | Your domain once connected, e.g. `'https://glassandfortune.com'` (no slash at the end). This switches on the canonical link, the sitemap and full addresses for social-media previews. |
| `RELEASE_LABEL` | Stays `'Coming Soon'` until you have a confirmed date. |
| `SOCIAL_LINKS` | Your official accounts, e.g. `[{label: 'Bluesky', url: 'https://bsky.app/profile/…'}]`. The row is hidden while the list is empty. |

**Website words** are in `src/data/content.js` — headings, paragraphs, the four How to Play steps, gallery captions and the lines shown when the die lands (`RESULT_LINES`). Change the words between the quote marks. Every claim in there was checked against the game's rules; if the game changes, update the matching sentence.

## 3. Running it on your PC

You need **Node.js** (version 22.12 or newer; you already have it for the game's tools).

Open PowerShell and go to the website folder:

```bash
cd C:\glass-and-fortune-website
```

First time only, install the building blocks:

```bash
npm install
```

See it live while you edit (changes appear as you save):

```bash
npm run dev
```

Then open the address it prints, normally **http://localhost:5173**.

Build the finished site and look at exactly what will be published:

```bash
npm run build
```

```bash
npm run preview
```

and open **http://localhost:4173**.

Run the automatic checks (build first):

```bash
npm test
```

They open the site in Chrome behind the scenes, using a tool called Playwright, and check navigation, the gallery, the Steam buttons, the phone layout, the no-WebGL fallback and that the die always reports the face that is really up. The last run passed all 18 checks.

## 4. Updating the artwork and screenshots

The site never reads the game folder while it runs. Two helper scripts copy what it needs:

1. **New screenshots** — opens the real game and captures six scenes at 1920×1080 into `raw-captures/`:

   ```bash
   node scripts/capture-game-screenshots.mjs
   ```

   To recapture just some: `node scripts/capture-game-screenshots.mjs table late`. The scenes (which Charms, dice and Reading) are set near the bottom of that file.

2. **Make web-sized images** from those screenshots and from the game's art (logo, parlour, Morrow, Tally, item cards, the die model):

   ```bash
   npm run images
   ```

   Everything lands in `public/images`, `public/models` and `public/favicon`. The list of art files it uses is at the top of `scripts/prepare-images.mjs`.

When the dice look changes in the game, re-run both, then build and publish.

## 5. How the glass die works

- **The model** is the game's own `glass_die.glb`, copied unchanged. Its glass settings are the game's approved "Dense" look in garnet.
- **The table** is a walnut card table with navy velvet and a brass inlay, drawn by the page itself (no extra downloads). Its rails sit exactly where the invisible walls are, so the die can never leave the table — and if it somehow did, it drops back into the middle.
- **Physics** is Rapier, a real rigid-body engine: gravity, bouncing, friction, spin and settling.
- **Picking it up**: press or touch the die and it lifts and follows your pointer. Let go and it is thrown with the speed and direction of your last movement. While a finger holds it, the page doesn't scroll.
- **Roll the die** button does a throw from the side of the table. It is also the keyboard route (Tab to it, press Enter).
- **The result is read from the die**, never chosen in advance: once it stops, the page checks which face's direction points most nearly straight up. The face directions are read from the model itself. If the die is leaning against a rail, it gets a gentle nudge rather than an unclear answer.
- **Sound** is the game's own synthesised glass-on-felt strike (`runtime/dice-3d-sound.js`, copied unchanged). Louder strikes sound louder, strikes are rate-limited, and nothing plays until the visitor touches the die or a button. The speaker button mutes it and the choice is remembered. There is no music.
- **Saving power**: the 3D scene only downloads after the rest of the page has loaded, only animates while something is moving, and stops completely when scrolled off screen or in a background tab.
- **No WebGL** (very old devices, some locked-down browsers): the opening shows a still picture of the die instead. Everything else works normally.
- **Reduced motion** (a phone/computer accessibility setting): the scroll fade-ins are skipped and throws are gentler.

The code is in `src/components/dice/DiceScene.jsx` (the 3D scene) and `src/components/InteractiveDice.jsx` (the buttons and text around it).

## 6. Publishing on GitHub Pages

The site publishes itself each time you upload changes to GitHub. You need a GitHub account.

### First time

1. Open **GitHub Desktop** and choose **File → Add local repository**. Pick `C:\glass-and-fortune-website`. It is already a Git repository with the site committed, so **don't** use "New repository" and don't create one on github.com first.
2. Press **Publish repository**. Keep the name `glass-and-fortune-website` and **untick "Keep this code private"**: on a free GitHub account, Pages only publishes public repositories. Anyone can then see this website's code and images, which is fine, they're already on the public site. **Never add the game folder (`C:\lumina_dice`) to it.**
3. On github.com open the new repository → **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Open the **Actions** tab. The first **Deploy website** run probably failed, because Pages wasn't switched on yet when it started. Open it and press **Re-run all jobs** (or choose **Deploy website → Run workflow**). It takes a few minutes. A green tick means it worked; a red cross shows exactly which step failed.
5. Your test address is **https://YOUR-USERNAME.github.io/glass-and-fortune-website/** (Settings → Pages shows it).

### Every update afterwards

Change files, then in GitHub Desktop write a short summary, **Commit to main**, then **Push origin**. The Actions tab shows the new deployment.

## 7. Connecting your Namecheap domain

Do these in order. GitHub asks that the domain be added on GitHub **before** the DNS records, so nobody else can claim it in between.

### a. (Recommended) verify the domain with GitHub

GitHub → your profile picture → **Settings → Pages → Add a domain**. Enter the domain. GitHub shows one **TXT** record; add it in Namecheap (step c, type **TXT**, host and value exactly as GitHub shows), wait a few minutes, then press **Verify**. This stops anyone else's GitHub site from using your domain.

### b. Add the domain to the website repository

Repository → **Settings → Pages → Custom domain**. Type the domain you want visitors to use — `www.yourdomain.com` or `yourdomain.com` — and **Save**. GitHub automatically redirects the other one to it once both records below exist. (With this workflow no `CNAME` file is needed.)

### c. Add the DNS records at Namecheap

Namecheap → **Domain List → Manage** (next to your domain). On the **Domain** tab check **Nameservers**: if it says **Namecheap BasicDNS** (or PremiumDNS), continue here. If it names another company, add the same records at that company instead.

Open **Advanced DNS → Host Records**. Remove only records that would clash on the `@` and `www` hosts: any **URL Redirect** records, and existing A or CNAME records for `@` or `www` (Namecheap's parking page usually adds a `www` CNAME to `parkingpage.namecheap.com`). **Leave any MX, TXT, SPF, DKIM or DMARC records alone** — those run email.

Add, using **Add New Record**:

| Type | Host | Value | TTL |
|---|---|---|---|
| A Record | `@` | `185.199.108.153` | Automatic |
| A Record | `@` | `185.199.109.153` | Automatic |
| A Record | `@` | `185.199.110.153` | Automatic |
| A Record | `@` | `185.199.111.153` | Automatic |
| CNAME Record | `www` | `YOUR-USERNAME.github.io` | Automatic |

Replace `YOUR-USERNAME` with your GitHub username (or organisation name). Do **not** add the repository name to it, and do not add a `*` (wildcard) record. Press the green **Save All Changes** button.

Optional, for visitors on IPv6 — four **AAAA Records**, host `@`: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`.

These values were checked against GitHub's and Namecheap's documentation on 2 Nov 2026.

### d. Turn on HTTPS

DNS changes take from a few minutes to a day. When **Settings → Pages** says the DNS check succeeded, tick **Enforce HTTPS** (it may take a little while to become available while GitHub issues the certificate).

### e. Tell the site its address

Put the domain in `SITE.url` in `src/config.js` (section 2), commit and push. This adds the canonical link and the sitemap.

### f. Check it

Open both `https://yourdomain.com` and `https://www.yourdomain.com`. Both should show the site with a padlock, and one should switch to the other.

## 8. Troubleshooting

| Problem | What to do |
|---|---|
| The site shows a 404 | Settings → Pages → Source must be **GitHub Actions**. Check the Actions tab finished with a green tick. |
| Pictures or the die are missing on the github.io address | Make sure the latest Actions run succeeded; it sets the address automatically. Then refresh with Ctrl+F5. |
| The Actions run fails at "Install dependencies" | `package-lock.json` must be uploaded with everything else. |
| Domain says "DNS check unsuccessful" | Wait (up to 24 hours), then re-check the five records above. A leftover Namecheap parking record is the usual cause. |
| "Enforce HTTPS" can't be ticked | The certificate is still being issued. Wait, then remove and re-save the custom domain if it stays greyed out for a day. |
| The die doesn't appear, just a picture | The browser or device has WebGL switched off. That's the intended fallback. |
| No sound from the die | The speaker button may be off, or the phone's silent switch is on. |
| Wishlist buttons say "Coming Soon to Steam" | `STEAM_URL` in `src/config.js` is still empty. |

## 9. Folder map

```text
glass-and-fortune-website/
├── .github/workflows/deploy.yml   builds and publishes to GitHub Pages
├── public/                        files served as-is
│   ├── images/                    web-sized art and screenshots (made by npm run images)
│   ├── models/glass_die.glb       the game's die
│   ├── favicon/                   tab icons
│   └── og-image.jpg               picture shown when the link is shared
├── scripts/
│   ├── capture-game-screenshots.mjs   screenshots from the real game
│   ├── prepare-images.mjs             art → web images
│   └── check-site.mjs                 the automatic checks
├── src/
│   ├── config.js                  Steam link, trailer, domain, socials
│   ├── data/content.js            all the words
│   ├── components/                one file per page section
│   │   └── dice/                  the 3D table, die and its sound
│   └── styles/global.css          colours, type and layout
├── index.html                     page title, description, sharing tags
├── CHECKLIST.md                   build progress
└── WEBSITE_README.md              this file
```

Built with React and Vite (page building), Three.js with React Three Fiber (3D), and Rapier (physics).
