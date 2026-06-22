/**
 * Rebrickable API — fetch set images
 * Free API, returns official LEGO product photos
 */

import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', 'output', 'images');
const API_BASE = 'https://rebrickable.com/api/v3/lego';

export async function fetchSetImage(setNumber, apiKey) {
  mkdirSync(CACHE_DIR, { recursive: true });

  // Normalize: BrickEconomy uses "10294-1", Rebrickable expects "10294-1"
  const cleanNumber = setNumber.includes('-') ? setNumber : `${setNumber}-1`;
  const imagePath = join(CACHE_DIR, `${cleanNumber}.jpg`);

  // Use cache if exists
  if (existsSync(imagePath)) return imagePath;

  try {
    const res = await fetch(`${API_BASE}/sets/${cleanNumber}/`, {
      headers: {
        'Authorization': `key ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`  ✗ Image for ${cleanNumber}: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const imageUrl = data.set_img_url;

    if (!imageUrl) return null;

    // Download the image
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return null;

    const buffer = Buffer.from(await imgRes.arrayBuffer());
    writeFileSync(imagePath, buffer);
    console.log(`  📸 ${cleanNumber}: image cached`);
    return imagePath;

  } catch (err) {
    console.error(`  ✗ Image fetch error for ${cleanNumber}:`, err.message);
    return null;
  }
}

/**
 * Pre-fetch images for all sets that will be used in today's content
 */
export async function prefetchImages(sets, apiKey) {
  console.log(`📸 Pre-fetching images for ${sets.length} sets...`);
  const imageMap = {};

  for (const set of sets) {
    const path = await fetchSetImage(set.set_number, apiKey);
    if (path) imageMap[set.set_number] = path;
    await new Promise(r => setTimeout(r, 500)); // rate limit courtesy
  }

  console.log(`✅ ${Object.keys(imageMap).length} images ready`);
  return imageMap;
}
