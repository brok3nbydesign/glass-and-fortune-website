# Website build checklist

Progress record, so the work can be picked up again at any point.

## Done (2 Nov 2026)

- [x] Game inspected: logo, parlour art, Morrow, Tally, Charm/Curio art, die model and face table, glass settings, impact sound, rules, Steam Coming Soon plan
- [x] Separate project at `C:\glass-and-fortune-website` (React, Vite, Three.js / React Three Fiber, Rapier)
- [x] Real 1920×1080 screenshots captured from the game (`scripts/capture-game-screenshots.mjs`)
- [x] Web images generated from game art (`npm run images`, 2.2 MB total, loaded as needed)
- [x] Header, hero, The Game, How to Play, Features, Trailer slot, Gallery + lightbox, closing Wishlist, footer
- [x] Interactive glass die: pick up with no jump, carry anywhere on the page, throw, drop off the mat and have Morrow fetch it, Roll button, result read from orientation, nudge when leaning, cannot leave the table, sound with mute, still-image fallback, reduced motion, off-screen pause, deferred loading
- [x] Steam URL, trailer ID, domain, socials in one config file; nothing links anywhere until set
- [x] SEO: title, description, Open Graph/Twitter image, favicon, structured data, robots.txt; canonical + sitemap once the domain is set
- [x] GitHub Actions workflow for Pages (works on github.io sub-path and custom domain)
- [x] `npm test`: 20 checks passing at `/` and at a repository sub-path (`TEST_GPU=1` uses the graphics card)
- [x] WEBSITE_README.md with publishing and Namecheap steps
- [x] Local Git repository with the site committed

## Waiting on you

- [ ] Steam store URL → `STEAM_URL` in `src/config.js`
- [ ] Trailer on YouTube → `TRAILER_YOUTUBE_ID`
- [ ] GitHub repository created and the folder pushed; Pages source set to GitHub Actions
- [x] Domain glassandfortune.com in `SITE.url` (as https://glassandfortune.com, matching the custom domain saved on GitHub); repo brok3nbydesign/glass-and-fortune-website
- [ ] Namecheap records and GitHub custom domain (WEBSITE_README.md section 7)
- [ ] Official social links, if any → `SOCIAL_LINKS`
- [ ] Look at the die on a real phone and judge the glass and the strike sound by eye and ear
