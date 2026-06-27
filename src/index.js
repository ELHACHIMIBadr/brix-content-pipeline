/**
 * BRIX Content Pipeline — Main Orchestrator
 * Pipeline: scrape → select → render (dual format) → caption → upload → publish
 *
 * Each post is rendered in two formats:
 *   - tiktok: 1080x1920 (9:16) — native TikTok Photo Mode
 *   - instagram: 1080x1350 (4:5) — native Instagram carousel
 * They are uploaded and published separately so neither platform crops/letterboxes.
 */

import 'dotenv/config';
import { scrapeAllData, selectContent } from './scrape-data.js';
import { prefetchImages } from './get-images.js';
import { renderPost } from './render-slides.js';
import { generateCaption } from './gen-caption.js';
import { uploadSlides } from './upload-storage.js';
import { publishToBuffer, dryRunPublish } from './publish.js';

const config = {
  claudeKey: process.env.CLAUDE_API_KEY,
  rebrickableKey: process.env.REBRICKABLE_API_KEY,
  buffer: {
    apiKey: process.env.BUFFER_API_KEY,
    orgId: process.env.BUFFER_ORG_ID,
    igChannelId: process.env.BUFFER_IG_CHANNEL_ID,
    tiktokChannelId: process.env.BUFFER_TIKTOK_CHANNEL_ID,
  },
  dryRun: process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run'),
  templateFilter: getArgValue('--template'),
};

function getArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx > -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function getTodayTemplates() {
  const day = new Date().getDay();
  const filter = config.templateFilter;
  const all = {
    'top-gainers':      [0, 2, 4, 6].includes(day),  // Sun, Tue, Thu, Sat
    'deep-dive':        [1, 4].includes(day),        // Mon, Thu
    'price-alert':      [3, 5].includes(day),        // Wed, Fri
    'retirement-watch': [2, 5].includes(day),         // Tue, Fri
    'weekly-wrap':      day === 1,                    // Mon
    'set-vs-set':       [0, 3, 6].includes(day),      // Sun, Wed, Sat
  };
  if (filter) return [filter];
  return Object.entries(all).filter(([_, active]) => active).map(([name]) => name);
}

async function main() {
  console.log('🧱 BRIX Content Pipeline');
  console.log(`📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`);
  console.log(config.dryRun ? '🏃 Mode: DRY RUN\n' : '🚀 Mode: LIVE\n');

  if (!config.claudeKey) { console.error('❌ CLAUDE_API_KEY missing'); process.exit(1); }

  const allSets = await scrapeAllData();
  if (allSets.length === 0) { console.error('❌ No sets found'); process.exit(1); }

  const content = selectContent(allSets);

  const setsNeedingImages = [
    ...(content.topGainers || []),
    content.deepDive,
    content.priceAlert,
    content.retirementWatch,
    content.weeklyWrap?.topGainer,
    content.weeklyWrap?.topLoser,
    ...(content.setVsSet || []),
  ].filter(Boolean);

  const imageMap = await prefetchImages(setsNeedingImages, config.rebrickableKey);

  const templates = getTodayTemplates();
  console.log(`📝 Templates for today: ${templates.join(', ')}\n`);

  for (const templateName of templates) {
    console.log(`── ${templateName.toUpperCase()} ──`);

    const templateSets = getTemplateSets(templateName, content);
    if (!templateSets) {
      console.log('  ⏭️  No data available, skipping');
      continue;
    }

    const postId = `${templateName}-${Date.now()}`;

    // slidePathsByFormat: { tiktok: [...9:16 pngs], instagram: [...4:5 pngs] }
    const slidePathsByFormat = await renderPost(templateName, templateSets, imageMap, postId);

    const setsForCaption = Array.isArray(templateSets) ? templateSets : [templateSets];
    const caption = await generateCaption(templateName, setsForCaption, config.claudeKey);

    // Upload each format's slides separately — every channel gets only its own matching set
    const imageUrlsByFormat = {
      tiktok: await uploadSlides(slidePathsByFormat.tiktok, `${postId}-tt`),
      instagram: await uploadSlides(slidePathsByFormat.instagram, `${postId}-ig`),
    };

    if (config.dryRun) {
      dryRunPublish(slidePathsByFormat, caption, templateName, imageUrlsByFormat);
    } else {
      await publishToBuffer(imageUrlsByFormat, caption, config.buffer);
    }
  }

  console.log('\n✅ Pipeline complete!');
}

function getTemplateSets(templateName, content) {
  switch (templateName) {
    case 'top-gainers': return content.topGainers;
    case 'deep-dive': return content.deepDive;
    case 'price-alert': return content.priceAlert;
    case 'retirement-watch': return content.retirementWatch;
    case 'weekly-wrap': return content.weeklyWrap?.topGainer;
    case 'set-vs-set': return content.setVsSet;
    default: return null;
  }
}

main().catch(err => {
  console.error('💥 Pipeline failed:', err);
  process.exit(1);
});
