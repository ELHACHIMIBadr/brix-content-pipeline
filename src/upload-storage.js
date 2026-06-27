/**
 * Firebase Storage uploader
 * Uploads PNG slides → returns public URLs for Buffer
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { retry } from './retry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = join(__dirname, '..', 'firebase-service-account.json');

let bucket = null;

/**
 * Known issue: google-auth-library / gaxios (used internally by firebase-admin)
 * mint OAuth tokens via node-fetch, which throws ERR_STREAM_PREMATURE_CLOSE on
 * keep-alive sockets to googleapis.com under some Node 20-22 patch versions —
 * CI runners (GitHub Actions) hit this very consistently. Node's native fetch
 * (undici) is unaffected by this bug. We override getAccessToken() on the
 * cert() credential to mint the token ourselves using native fetch, while still
 * using cert() for everything else (Firestore/Storage signing works normally).
 */
function patchedCert(serviceAccount) {
  const credential = admin.credential.cert(serviceAccount);
  const tokenUri = 'https://oauth2.googleapis.com/token';
  const scope = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/firebase',
    'https://www.googleapis.com/auth/devstorage.read_write',
  ].join(' ');

  credential.getAccessToken = async () => {
    const now = Math.floor(Date.now() / 1000);
    const b64url = (input) => Buffer.from(input).toString('base64url');
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
      iss: serviceAccount.client_email,
      scope,
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    }));
    const unsigned = `${header}.${payload}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), serviceAccount.private_key)
      .toString('base64url');
    const jwt = `${unsigned}.${signature}`;

    const res = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!res.ok) {
      throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
    };
  };

  return credential;
}

function initFirebase() {
  if (bucket) return bucket;

  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('  ✗ firebase-service-account.json not found');
    return null;
  }

  const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: patchedCert(serviceAccount),
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
      const url = await retry(() => uploadFile(localPath, remotePath), { attempts: 3, delayMs: 5000, label: `Slide ${i + 1}` });
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
