/**
 * Caption generator using Claude API
 * Generates SEO-optimized captions + hashtags for TikTok and Instagram
 */

import Anthropic from '@anthropic-ai/sdk';
import { retry } from './retry.js';

let client = null;

function getClient(apiKey) {
  // maxRetries: 0 because our own retry() wrapper already handles retries —
  // stacking both leads to long compounded backoff on transient CI network blips.
  // timeout: 60s — GitHub Actions runners occasionally have slow/flaky egress,
  // and the SDK's default timeout combined with "Premature close" errors was
  // killing requests too early.
  if (!client) client = new Anthropic({ apiKey, maxRetries: 0, timeout: 60_000 });
  return client;
}

const SYSTEM_PROMPT = `You are BRIX's social media manager. BRIX is a LEGO investment tracking app.
Write captions for TikTok and Instagram carousel posts about LEGO investing.

Rules:
- Hook in the first line (question, bold claim, or surprising stat)
- 2-3 short paragraphs max
- End with a CTA: "Follow @brix.app1 for daily LEGO investment data | Link in bio"
- Always include ALL of these hashtags at the end, plus add 10 more relevant ones:
  #LEGO #LEGOInvesting #LEGOCollector #BRIX #BrickInvestor #LEGORetired #LEGOValue #LEGOTOK #fyp #foryou #legotiktok #brickinvesting #legoinvestment #legosets #legocommunity
- Tone: data-driven, confident, accessible. Not hype, not boring.
- Do NOT use emojis in the body text.

Return ONLY the caption text. No explanations.`;

export async function generateCaption(templateType, sets, apiKey) {
  const c = getClient(apiKey);
  const setData = Array.isArray(sets) ? sets : [sets];

  const setDescriptions = setData.map(s =>
    `${s.name} (#${s.set_number}): ${s.theme}, ${s.year}, ${s.pieces} pcs, retail $${s.retail_price}, now $${Math.round(s.current_value)}, ROI ${s.roi > 0 ? '+' : ''}${s.roi}%, ${s.retired ? 'retired' : 'available'}`
  ).join('\n');

  const prompts = {
    'top-gainers': `Write a caption for a "Today's Top LEGO Movers" carousel post. Sets:\n${setDescriptions}`,
    'deep-dive': `Write a caption for a deep investment analysis of:\n${setDescriptions}\nInclude whether it's a buy/hold/sell.`,
    'price-alert': `Write a caption for a PRICE ALERT post. This set just had a significant price move:\n${setDescriptions}`,
    'retirement-watch': `Write a caption for a RETIREMENT WATCH post. This set is still available at retail but expected to appreciate:\n${setDescriptions}`,
    'weekly-wrap': `Write a caption for a "This Week in LEGO Investing" weekly recap. Top performers:\n${setDescriptions}`,
    'set-vs-set': `Write a caption for a SET VS SET comparison carousel:\n${setDescriptions}\nWhich is the better investment?`,
  };

  const prompt = prompts[templateType] || `Write a caption for a LEGO investment post about:\n${setDescriptions}`;

  try {
    const message = await retry(() => c.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }), { attempts: 4, delayMs: 8000, label: 'Claude API' });

    return message.content[0].text.trim();
  } catch (err) {
    console.error('Caption generation error:', err.message);
    const name = setData[0]?.name || 'LEGO';
    return `${name} is making moves. Track your LEGO investments with BRIX.\n\nFollow @brix.app1 for daily LEGO investment data | Link in bio\n\n#LEGO #LEGOInvesting #LEGOCollector #BRIX #BrickInvestor #LEGORetired #LEGOValue #LEGOTOK #fyp #foryou #legotiktok #brickinvesting #legoinvestment #legosets #legocommunity`;
  }
}
