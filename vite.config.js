import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {SITE} from './src/config.js';

/* The custom domain serves the site from "/". For a temporary test at
   https://USERNAME.github.io/REPOSITORY/ build with BASE_PATH=/REPOSITORY/
   (the GitHub workflow does this automatically until a domain is set). */
const base = process.env.BASE_PATH || '/';
const siteUrl = (process.env.SITE_URL || SITE.url || '').replace(/\/+$/, '');

/* Fills in the address-dependent parts of index.html and writes robots.txt
   and sitemap.xml, all from SITE.url in src/config.js. */
function siteMeta() {
  return {
    name: 'glass-site-meta',
    transformIndexHtml(html) {
      const origin = siteUrl || base.replace(/\/$/, '');
      html = html.replaceAll('__SITE_URL__', origin);
      html = html.replace('<!--canonical-->', siteUrl
        ? `<link rel="canonical" href="${siteUrl}/" />\n    <meta property="og:url" content="${siteUrl}/" />`
        : '');
      return html;
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n${siteUrl ? `\nSitemap: ${siteUrl}/sitemap.xml\n` : ''}`,
      });
      if (siteUrl) {
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl}/</loc><changefreq>monthly</changefreq></url>\n</urlset>\n`,
        });
      }
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), siteMeta()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 3400, // the 3D die chunk is large by design and loads after the page
  },
});
