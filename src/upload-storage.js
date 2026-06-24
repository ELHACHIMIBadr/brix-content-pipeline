/**
 * Firebase Storage uploader
 * Uploads PNG slides → returns public URLs for Buffer
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = join(__dirname, '..', 'firebase-service-account.json');

let bucket = null;

function initFirebase() {
  if (bucket) return bucket;

  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('  ✗ firebase-service-account.json not found');
    return null;
  }

  const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: `${serviceAccount.project_id}.firebasestorage.app`,
    });
  }

  bucket = admin.storage().bucket();
  return bucket;
}

/**
 * Upload a single PNG file to Firebase Storage
 * Returns the public download URL
 */
async function uploadFile(localPath, remotePath) {
  const b = initFirebase();
  if (!b) return null;

  const file = b.file(remotePath);

  await b.upload(localPath, {
    destination: remotePath,
    metadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=86400',
    },
  });

  // Make the file public
  await file.makePublic();

  // Return public URL
  const publicUrl = `https://storage.googleapis.com/${b.name}/${remotePath}`;
  return publicUrl;
}

/**
 * Upload all slide PNGs and return array of public URLs
 */
export async function uploadSlides(slidePaths, postId) {
  console.log(`  ☁️  Uploading ${slidePaths.length} slides to Firebase Storage...`);

  const urls = [];

  for (let i = 0; i < slidePaths.length; i++) {
    const localPath = slidePaths[i];
    const fileName = basename(localPath);
    const remotePath = `content-pipeline/${postId}/${fileName}`;

    try {
      const url = await uploadFile(localPath, remotePath);
      if (url) {
        urls.push(url);
        console.log(`    ✅ Slide ${i + 1}: uploaded`);
      }
    } catch (err) {
      console.error(`    ✗ Slide ${i + 1}: ${err.message}`);
    }
  }

  console.log(`  ☁️  ${urls.length}/${slidePaths.length} slides uploaded`);
  return urls;
}
