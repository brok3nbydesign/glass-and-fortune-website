import {STEAM_URL, RELEASE_LABEL} from '../config.js';

/* One button for every Wishlist call to action. Until STEAM_URL is set in
   src/config.js it shows the release label and links nowhere, so nobody is
   sent to a store page that does not exist yet. */
export default function WishlistButton({size = '', label = 'Wishlist on Steam', className = ''}) {
  const classes = `btn btn-brass ${size} ${className}`.trim();
  if (!STEAM_URL) {
    return (
      <span className={`${classes} is-pending`} title="The Steam page link will appear here once it is public">
        <span>{RELEASE_LABEL} to Steam</span>
      </span>
    );
  }
  return (
    <a className={classes} href={STEAM_URL} target="_blank" rel="noopener">
      <span>{label}</span>
    </a>
  );
}
