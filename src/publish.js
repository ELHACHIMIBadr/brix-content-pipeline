/**
 * Buffer GraphQL API publisher — correct mutation format
 * Creates image posts on TikTok and Instagram
 */

const BUFFER_API = 'https://api.buffer.com';

async function bufferGraphQL(query, apiKey) {
  const res = await fetch(BUFFER_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

/**
 * Create a post with images on a single channel
 */
async function createImagePost(channelId, text, imageUrls, apiKey, isInstagram = false) {
  // Build assets array — each image is { image: { url: "..." } }
  const assetsStr = imageUrls
    .map(url => `{ image: { url: "${url}" } }`)
    .join(', ');

  // Escape text for GraphQL string
  const escapedText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

  const metadataStr = isInstagram
    ? `metadata: { instagram: { type: post, shouldShareToFeed: true } }`
    : '';

  const query = `
    mutation CreatePost {
      createPost(
        input: {
          text: "${escapedText}"
          channelId: "${channelId}"
          schedulingType: automatic
          mode: addToQueue
          assets: [${assetsStr}]
          ${metadataStr}
        }
      ) {
        ... on PostActionSuccess {
          post {
            id
            text
            dueAt
            assets {
              id
              mimeType
            }
          }
        }
        ... on MutationError {
          message
        }
      }
    }
  `;

  return bufferGraphQL(query, apiKey);
}

/**
 * Publish to all configured channels
 */
export async function publishToBuffer(imageUrls, caption, config) {
  const { apiKey, igChannelId, tiktokChannelId } = config;

  if (!apiKey) {
    console.log('  ⏭️  Buffer not configured, skipping');
    return null;
  }

  if (!imageUrls || imageUrls.length === 0) {
    console.log('  ⏭️  No image URLs, skipping');
    return null;
  }

  const channels = [];
  if (igChannelId) channels.push({ id: igChannelId, name: 'Instagram', isInstagram: true });
  if (tiktokChannelId) channels.push({ id: tiktokChannelId, name: 'TikTok', isInstagram: false });

  console.log(`  📤 Publishing to ${channels.length} channel(s) via Buffer...`);

  for (const channel of channels) {
    try {
      const result = await createImagePost(channel.id, caption, imageUrls, apiKey, channel.isInstagram);

      if (result.errors) {
        console.error(`  ✗ ${channel.name}: ${JSON.stringify(result.errors)}`);
      } else if (result.data?.createPost?.post) {
        const post = result.data.createPost.post;
        console.log(`  ✅ ${channel.name}: scheduled (ID: ${post.id}, due: ${post.dueAt})`);
      } else if (result.data?.createPost?.message) {
        console.error(`  ✗ ${channel.name}: ${result.data.createPost.message}`);
      } else {
        console.error(`  ✗ ${channel.name}: unexpected response`, JSON.stringify(result));
      }
    } catch (err) {
      console.error(`  ✗ ${channel.name}: ${err.message}`);
    }
  }
}

/**
 * Dry-run: log what would be published
 */
export function dryRunPublish(slidePaths, caption, templateName, imageUrls) {
  console.log(`\n📋 DRY RUN — ${templateName}`);
  console.log(`   Slides: ${slidePaths.length} images`);
  if (imageUrls?.length) {
    console.log(`   Firebase URLs:`);
    imageUrls.forEach((u, i) => console.log(`     ${i + 1}. ${u}`));
  }
  console.log(`   Caption preview (first 200 chars):`);
  console.log(`     "${caption.substring(0, 200)}..."`);
  console.log('');
}
