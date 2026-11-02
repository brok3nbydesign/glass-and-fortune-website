/* Files in public/ are served from the site root, or from the repository
   path while testing on username.github.io/repo/. BASE_URL covers both. */
export const assetUrl = path => import.meta.env.BASE_URL + path.replace(/^\//, '');
