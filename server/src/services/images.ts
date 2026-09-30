import sharp from 'sharp';

/**
 * Prepares an uploaded photo for storage:
 *  - rotates it upright using the EXIF orientation, then drops ALL metadata
 *    (phone photos carry GPS coordinates, which must not leak via public downloads);
 *  - makes a 640px WebP thumbnail for fast galleries on mobile data.
 */
export async function processPhoto(srcPath: string, mime: string, outPath: string, thumbPath: string) {
  const base = sharp(srcPath, { failOn: 'error', limitInputPixels: 100_000_000 }).rotate();
  const clean =
    mime === 'image/png' ? base.clone().png({ compressionLevel: 8 })
    : mime === 'image/webp' ? base.clone().webp({ quality: 90 })
    : mime === 'image/gif' ? base.clone().gif()
    : mime === 'image/avif' ? base.clone().avif({ quality: 70 })
    : base.clone().jpeg({ quality: 90, mozjpeg: true });
  const info = await clean.toFile(outPath);
  await base.clone().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toFile(thumbPath);
  return { width: info.width, height: info.height, size: info.size };
}
