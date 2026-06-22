/**
 * Buffer GraphQL API publisher
 * Schedules carousel posts on TikTok and Instagram
 */

import { readFileSync } from 'fs';

const BUFFER_API = 'https://api.buffer.com';

async function bufferQuery(query, variables, apiKey) {
  const res = await fetch(BUFFER_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Buffer API error ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Upload an image to Buffer and get a media URL
 */
async function uploadImage(imagePath, apiKey) {
  const imageBuffer = readFileSync(imagePath);
  const base64 = imageBuffer.toString('base64');
  const mimeType = 'image/png';

  // Buffer's image upload uses REST, not GraphQL
  const res = await fetch(`${BUFFER_API}/i/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      media: `data:${mimeType};base64,${base64}`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Image upload failed: ${res.status}`);
  }

  const data = await res.json();
  return data.url || data.uploaded_url;
}

/**
 * Create and schedule a carousel post on Buffer
 */
export async function publishToBuffer(slidePaths, caption, config) {
  const { apiKey, orgId, igChannelId, tiktokChannelId } = config;

  if (!apiKey || !orgId) {
    console.log('  ⏭️  Buffer not configured, skipping publish');
    return null;
  }

  console.log(`  📤 Uploading ${slidePaths.length} images to Buffer...`);

  // Upload all slide images
  const mediaUrls = [];
  for (const path of slidePaths) {
    try {
      const url = await uploadImage(path, apiKey);
      mediaUrls.push(url);
    } catch (err) {
      console.error(`  ✗ Failed to upload ${path}:`, err.message);
    }
  }

  if (mediaUrls.length === 0) {
    console.error('  ✗ No images uploaded, skipping post');
    return null;
  }

  // Create post on each channel
  const channels = [];
  if (igChannelId) channels.push(igChannelId);
  if (tiktokChannelId) channels.push(tiktokChannelId);

  if (channels.length === 0) {
    console.log('  ⏭️  No channels configured');
    return null;
  }

  const mutation = `
    mutation CreateImagePost($input: CreateImagePostInput!) {
      createImagePost(input: $input) {
        id
        status
        scheduledAt
      }
    }
  `;

  const results = [];

  for (const channelId of channels) {
    try {
      const result = await bufferQuery(mutation, {
        input: {
          organizationId: orgId,
          channelIds: [channelId],
          text: caption,
          media: mediaUrls.map(url => ({ url })),
          schedulingOption: 'next_available',
        },
      }, apiKey);

      results.push(result);
      console.log(`  ✅ Scheduled on channel ${channelId}`);
    } catch (err) {
      console.error(`  ✗ Failed to post to ${channelId}:`, err.message);
    }
  }

  return results;
}

/**
 * Dry-run: just log what would be published
 */
export function dryRunPublish(slidePaths, caption, templateName) {
  console.log(`\n📋 DRY RUN — ${templateName}`);
  console.log(`   Slides: ${slidePaths.length} images`);
  slidePaths.forEach((p, i) => console.log(`     ${i + 1}. ${p}`));
  console.log(`   Caption preview (first 200 chars):`);
  console.log(`     "${caption.substring(0, 200)}..."`);
  console.log('');
}
