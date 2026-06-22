/**
 * Caption generator using Claude API
 * Generates SEO-optimized captions + hashtags for TikTok and Instagram
 */

import Anthropic from '@anthropic-ai/sdk';

let client = null;

function getClient(apiKey) {
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

const SYSTEM_PROMPT = `You are BRIX's social media manager. BRIX is a LEGO investment tracking app.
Write captions for TikTok and Instagram carousel posts about LEGO investing.

Rules:
- Hook in the first line (question, bold claim, or surprising stat)
- 2-3 short paragraphs max
- End with a CTA: "Follow @brixcollector for daily LEGO investment data"
- Include 15-20 hashtags at the end, mix of high-volume and niche
- Core hashtags always: #lego #legoinvesting #legocollector #brix #brixcollector
- Tone: data-driven, confident, accessible. Not hype, not boring.
- Do NOT use emojis in the body text. Only in hashtags if natural.

Return ONLY the caption text. No explanations.`;

export async function generateCaption(templateType, sets, apiKey) {
  const c = getClient(apiKey);
  const setData = Array.isArray(sets) ? sets : [sets];

  const setDescriptions = setData.map(s =>
    `${s.name} (#${s.set_number}): ${s.theme}, ${s.year}, ${s.pieces} pcs, retail $${s.retail_price}, now $${Math.round(s.current_value)}, ROI ${s.roi > 0 ? '+' : ''}${s.roi}%, daily change ${s.daily_change > 0 ? '+' : ''}${s.daily_change}%, ${s.retired ? 'retired' : 'available'}`
  ).join('\n');

  const prompts = {
    'top-gainers': `Write a caption for a "Top 3 LEGO Movers Today" carousel post. Sets:\n${setDescriptions}`,
    'deep-dive': `Write a caption for a deep investment analysis of:\n${setDescriptions}\nInclude whether it's a buy/hold/sell.`,
    'price-alert': `Write a caption for a PRICE ALERT post. This set just had a significant price move:\n${setDescriptions}`,
    'retirement-watch': `Write a caption for a RETIREMENT WATCH post. This set is still available at retail but expected to appreciate:\n${setDescriptions}`,
    'weekly-wrap': `Write a caption for a "This Week in LEGO Investing" weekly recap. Top performers:\n${setDescriptions}`,
    'set-vs-set': `Write a caption for a SET VS SET comparison carousel:\n${setDescriptions}\nWhich is the better investment?`,
  };

  const prompt = prompts[templateType] || `Write a caption for a LEGO investment post about:\n${setDescriptions}`;

  try {
    const message = await c.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    return message.content[0].text.trim();
  } catch (err) {
    console.error('Caption generation error:', err.message);
    // Fallback caption
    const name = setData[0]?.name || 'LEGO';
    return `${name} is making moves. Track your LEGO investments with BRIX.\n\nFollow @brixcollector for daily LEGO investment data.\n\n#lego #legoinvesting #legocollector #brix #brixcollector #legoinvestment #legoretired #legodeals`;
  }
}
