/**
 * BRIX Content Pipeline — Main Orchestrator
 *
 * Pipeline: fetch data → select content → render slides → generate captions → publish
 *
 * Usage:
 *   node src/index.js                  # Full run
 *   node src/index.js --dry-run        # Generate slides + captions but don't publish
 *   node src/index.js --template X     # Run only a specific template
 */

import { fetchAllSets, selectContent } from './fetch-data.js';
import { prefetchImages } from './get-images.js';
import { renderPost } from './render-slides.js';
import { generateCaption } from './gen-caption.js';
import { publishToBuffer, dryRunPublish } from './publish.js';

// ── Config ─────────────────────────────────────────

const config = {
  brickeconomyKey: process.env.BRICKECONOMY_API_KEY,
  rebrickableKey: process.env.REBRICKABLE_API_KEY,
  claudeKey: process.env.CLAUDE_API_KEY,
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

// ── Schedule: which templates run on which days ────

function getTodayTemplates() {
  const day = new Date().getDay(); // 0=Sun, 1=Mon, ...
  const filter = config.templateFilter;

  // Full schedule:
  // Morning (7h):  top-gainers (daily), deep-dive (Tue/Thu/Sat), set-vs-set (Mon/Wed/Fri)
  // Evening (17h): price-alert (daily), retirement-watch (Tue/Fri), weekly-wrap (Mon only)

  const all = {
    'top-gainers': true,                               // Daily
    'deep-dive': [2, 4, 6].includes(day),              // Tue, Thu, Sat
    'price-alert': true,                               // Daily
    'retirement-watch': [2, 5].includes(day),           // Tue, Fri
    'weekly-wrap': day === 1,                           // Monday
    'set-vs-set': [1, 3, 5].includes(day),             // Mon, Wed, Fri
  };

  if (filter) return [filter];

  return Object.entries(all)
    .filter(([_, active]) => active)
    .map(([name]) => name);
}

// ── Main Pipeline ──────────────────────────────────

async function main() {
  console.log('🧱 BRIX Content Pipeline');
  console.log(`📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`);
  console.log(config.dryRun ? '🏃 Mode: DRY RUN\n' : '🚀 Mode: LIVE\n');

  // Validate required keys
  if (!config.brickeconomyKey) { console.error('❌ BRICKECONOMY_API_KEY missing'); process.exit(1); }
  if (!config.rebrickableKey) { console.error('❌ REBRICKABLE_API_KEY missing'); process.exit(1); }
  if (!config.claudeKey) { console.error('❌ CLAUDE_API_KEY missing'); process.exit(1); }

  // Step 1: Fetch all set data
  const allSets = await fetchAllSets(config.brickeconomyKey);
  if (allSets.length === 0) { console.error('❌ No sets fetched'); process.exit(1); }

  // Step 2: Select content for each template
  const content = selectContent(allSets);

  // Step 3: Collect all sets that need images
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

  // Step 4: Generate posts for today's templates
  const templates = getTodayTemplates();
  console.log(`\n📝 Templates for today: ${templates.join(', ')}\n`);

  for (const templateName of templates) {
    console.log(`── ${templateName.toUpperCase()} ──`);

    // Get the appropriate set data for this template
    const templateSets = getTemplateSets(templateName, content);
    if (!templateSets) {
      console.log('  ⏭️  No data available, skipping');
      continue;
    }

    // Render slides
    const postId = `${templateName}-${Date.now()}`;
    const slidePaths = await renderPost(templateName, templateSets, imageMap, postId);

    // Generate caption
    const setsForCaption = Array.isArray(templateSets) ? templateSets : [templateSets];
    const caption = await generateCaption(templateName, setsForCaption, config.claudeKey);

    // Publish or dry-run
    if (config.dryRun) {
      dryRunPublish(slidePaths, caption, templateName);
    } else {
      await publishToBuffer(slidePaths, caption, config.buffer);
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
