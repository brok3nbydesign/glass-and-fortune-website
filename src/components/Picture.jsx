import {assetUrl} from '../assetUrl.js';

/* A responsive WebP from public/images, named `<id>-<width>.webp`. */
export default function Picture({id, widths, sizes, alt, width, height, className, eager = false}) {
  const largest = widths[widths.length - 1];
  return (
    <img
      className={className}
      src={assetUrl(`images/${id}-${largest}.webp`)}
      srcSet={widths.map(w => `${assetUrl(`images/${id}-${w}.webp`)} ${w}w`).join(', ')}
      sizes={sizes}
      alt={alt}
      width={width}
      height={height}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
}
