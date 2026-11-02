/* Every value that is likely to change lives here. Edit this file, save,
   and redeploy; nothing else needs touching. See WEBSITE_README.md. */

export const SITE = {
  title: 'Glass & Fortune',
  /* Your custom domain once it is connected, e.g. 'https://example.com'.
     Leave empty until then; canonical links and the sitemap use it. */
  url: '',
};

/* The public Steam store page, e.g.
   'https://store.steampowered.com/app/1234560/Glass__Fortune/'.
   While this is empty every Wishlist button shows "Coming soon to Steam"
   and does not link anywhere, so nobody is sent to a page that is not there. */
export const STEAM_URL = '';

/* The YouTube video ID of the trailer: the part after "v=" in
   https://www.youtube.com/watch?v=XXXXXXXXXXX. Empty shows the poster only. */
export const TRAILER_YOUTUBE_ID = '';

/* Shown as "Coming Soon" until a release date is confirmed. */
export const RELEASE_LABEL = 'Coming Soon';

export const STUDIO = {
  name: 'Brok3n by Design',
  url: 'https://brok3nbydesign.com',
};

/* Verified official social links only. Each entry: { label: 'Bluesky', url: 'https://…' }.
   The footer hides this row while the list is empty. */
export const SOCIAL_LINKS = [];
