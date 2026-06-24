// BRIX Template Generator v3 — all templates with flex:1 photo pattern
// Usage: node generate-templates.js

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, 'templates');

const CSS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 1080px; height: 1920px; background: #0D1B35; color: #fff; font-family: 'Inter', sans-serif; overflow: hidden; display: flex; flex-direction: column; padding: 80px 44px 80px; }
.muted { color: rgba(255,255,255,0.4); }
.meta { font-size: 24px; color: rgba(255,255,255,0.4); letter-spacing: 0.04em; }
.photo { width: 100%; border-radius: 24px; overflow: hidden; background: #edf0f4; position: relative; display: flex; align-items: center; justify-content: center; }
.photo img { width: 100%; height: 100%; object-fit: contain; }
.photo .num { position: absolute; top: 14px; right: 14px; background: rgba(13,27,53,0.85); border: 1px solid rgba(245,200,66,0.25); border-radius: 10px; padding: 5px 14px; font-size: 20px; color: rgba(255,255,255,0.5); font-weight: 600; }
.photo .photo-placeholder { font-size: 64px; padding: 60px 0; }
.stat { flex: 1; background: rgba(255,255,255,0.04); border-radius: 18px; padding: 24px; }
.stat .label { font-size: 17px; color: rgba(255,255,255,0.35); letter-spacing: 0.12em; font-weight: 600; margin-bottom: 8px; }
.stat .val { font-size: 46px; font-weight: 700; }
.footer { margin-top: auto; padding-top: 16px; display: flex; align-items: center; justify-content: space-between; }
.logo { display: flex; align-items: center; gap: 12px; }
.logo-icon { width: 48px; height: 48px; background: #F5C842; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 18px; color: #0D1B35; }
.logo-text { font-weight: 700; font-size: 24px; color: #F5C842; letter-spacing: 0.08em; }
.url { font-size: 20px; color: rgba(255,255,255,0.3); }
.gold { color: #F5C842; } .green { color: #34D399; } .red { color: #F87171; }
.row { display: flex; align-items: center; gap: 16px; }
.rank { width: 64px; height: 64px; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 28px; }
.tag { display: inline-block; padding: 10px 22px; border-radius: 8px; font-size: 22px; font-weight: 700; letter-spacing: 0.14em; background: rgba(245,200,66,0.12); color: #F5C842; }
.tag-green { background: rgba(52,211,153,0.12); color: #34D399; }
.tag-red { background: rgba(248,113,113,0.12); color: #F87171; }`;

const FOOTER = `<div class="footer"><div class="logo"><div class="logo-icon">BX</div><span class="logo-text">BRIX</span></div><span class="url">brixcollector.com</span></div>`;

const T = {

// ═══════════════════════════════════════════
// TOP GAINERS SET (no cover, direct to set)
// ═══════════════════════════════════════════
"top-gainers-set": `<div style="display:flex;justify-content:space-between;align-items:center">
  <div class="row"><div class="rank" style="background:{{CHANGE_COLOR}}20;color:{{CHANGE_COLOR}}">#{{RANK}}</div><span class="meta" style="margin:0">{{THEME}} &middot; {{YEAR}} &middot; {{PIECES}} pcs</span></div>
  <span style="font-size:28px;font-weight:800;color:#F5C842">TODAY'S TOP MOVERS</span>
</div>
<div class="photo" style="flex:1;min-height:0;margin:12px 0 0">{{SET_IMAGE}}<div class="num">#{{SET_NUMBER}}</div></div>
<h2 style="margin:14px 0 0;font-size:50px;font-weight:800">{{NAME}}</h2>
<div style="margin:10px 0 14px;display:flex;align-items:baseline;gap:20px">
  <span style="font-size:110px;font-weight:800;color:{{CHANGE_COLOR}};line-height:1;letter-spacing:-0.03em">{{DAILY_CHANGE}}</span>
  <span style="font-size:24px;color:rgba(255,255,255,0.4)">{{CHANGE_LABEL}}</span>
</div>
<div style="display:flex;gap:12px">
  <div class="stat"><div class="label">RETAIL</div><div class="val muted" style="text-decoration:line-through;text-decoration-color:rgba(255,255,255,0.15)">{{RETAIL_PRICE}}</div></div>
  <div class="stat"><div class="label">NOW</div><div class="val gold">{{CURRENT_VALUE}}</div></div>
  <div class="stat"><div class="label">STATUS</div><div class="val" style="color:{{STATUS_COLOR}}">{{STATUS}}</div></div>
</div>
<div style="margin-top:10px">{{TREND_SVG}}</div>`,

// ═══════════════════════════════════════════
// DEEP DIVE — Title slide
// ═══════════════════════════════════════════
"deep-dive-title": `<div style="display:flex;justify-content:space-between;align-items:center">
  <span class="tag">INVESTMENT ANALYSIS</span>
  <span class="meta">{{THEME}} &middot; {{YEAR}}</span>
</div>
<div class="photo" style="flex:1;min-height:0;margin:12px 0 0">{{SET_IMAGE}}<div class="num">#{{SET_NUMBER}}</div></div>
<h1 style="margin:14px 0 0;font-size:64px;font-weight:800">{{NAME}}</h1>
<p style="font-size:28px;color:rgba(255,255,255,0.45);margin-top:10px">Is it still worth buying at {{CURRENT_VALUE}}?</p>
<div style="display:flex;gap:12px;margin-top:16px">
  <div class="stat"><div class="label">RETAIL</div><div class="val muted">{{RETAIL_PRICE}}</div></div>
  <div class="stat"><div class="label">NOW</div><div class="val gold">{{CURRENT_VALUE}}</div></div>
  <div class="stat"><div class="label">ROI</div><div class="val green">{{ROI}}</div></div>
</div>`,

// ═══════════════════════════════════════════
// DEEP DIVE — Metrics slide
// ═══════════════════════════════════════════
"deep-dive-metrics": `<div class="row" style="margin-bottom:16px">
  <div style="width:120px;height:120px;border-radius:20px;overflow:hidden;background:#edf0f4;display:flex;align-items:center;justify-content:center;flex-shrink:0">{{SET_IMAGE}}</div>
  <div><span class="meta">{{THEME}} &middot; #{{SET_NUMBER}}</span><h2 style="font-size:44px;margin-top:4px">{{NAME}}</h2></div>
</div>
<span class="tag">KEY METRICS</span>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px;flex:1">
  <div class="stat"><div class="label">RETAIL PRICE</div><div class="val muted">{{RETAIL_PRICE}}</div></div>
  <div class="stat"><div class="label">CURRENT VALUE</div><div class="val gold">{{CURRENT_VALUE}}</div></div>
  <div class="stat"><div class="label">TOTAL ROI</div><div class="val green">{{ROI}}</div></div>
  <div class="stat"><div class="label">PIECES</div><div class="val">{{PIECES}}</div></div>
  <div class="stat"><div class="label">RELEASED</div><div class="val">{{YEAR}}</div></div>
  <div class="stat"><div class="label">STATUS</div><div class="val" style="color:{{STATUS_COLOR}}">{{STATUS}}</div></div>
  <div class="stat"><div class="label">12M GROWTH</div><div class="val green">{{GROWTH_12M}}</div></div>
  <div class="stat"><div class="label">2Y FORECAST</div><div class="val gold">{{FORECAST_2Y}}</div></div>
</div>`,

// ═══════════════════════════════════════════
// DEEP DIVE — Verdict slide
// ═══════════════════════════════════════════
"deep-dive-verdict": `<div class="row" style="margin-bottom:16px">
  <div style="width:120px;height:120px;border-radius:20px;overflow:hidden;background:#edf0f4;display:flex;align-items:center;justify-content:center;flex-shrink:0">{{SET_IMAGE}}</div>
  <div><span class="tag tag-green">VERDICT</span><h2 style="font-size:48px;margin-top:8px;color:#34D399">Strong Buy</h2></div>
</div>
<p style="font-size:26px;color:rgba(255,255,255,0.45);line-height:1.6;margin-bottom:20px">At {{CURRENT_VALUE}}, this set still has significant upside based on category trends and retirement patterns.</p>
<div style="display:flex;flex-direction:column;gap:14px;flex:1">
  <div class="stat" style="display:flex;align-items:center;gap:20px"><span style="font-size:32px;color:#34D399">&#10003;</span><span style="font-size:26px">{{THEME}} theme holds strong collector demand</span></div>
  <div class="stat" style="display:flex;align-items:center;gap:20px"><span style="font-size:32px;color:#34D399">&#10003;</span><span style="font-size:26px">{{PIECES}} pieces = high perceived value</span></div>
  <div class="stat" style="display:flex;align-items:center;gap:20px"><span style="font-size:32px;color:#34D399">&#10003;</span><span style="font-size:26px">12-month growth at {{GROWTH_12M}}</span></div>
</div>
<div style="background:rgba(245,200,66,0.08);border:2px solid rgba(245,200,66,0.18);border-radius:24px;padding:32px;text-align:center;margin-top:16px">
  <p class="muted" style="font-size:20px;letter-spacing:0.12em;margin-bottom:10px">2-YEAR FORECAST</p>
  <p style="font-size:64px;font-weight:800;color:#F5C842">{{FORECAST_2Y}}</p>
</div>`,

// ═══════════════════════════════════════════
// PRICE ALERT
// ═══════════════════════════════════════════
"price-alert": `<div style="position:absolute;top:0;left:0;right:0;height:6px;background:linear-gradient(90deg,#F5C842,#34D399)"></div>
<div style="display:flex;justify-content:space-between;align-items:center">
  <span class="tag">PRICE ALERT</span>
  <span class="meta">{{THEME}} &middot; {{YEAR}} &middot; {{PIECES}} pcs</span>
</div>
<div class="photo" style="flex:1;min-height:0;margin:12px 0 0">{{SET_IMAGE}}<div class="num">#{{SET_NUMBER}}</div></div>
<h2 style="margin:14px 0 0;font-size:50px;font-weight:800">{{NAME}}</h2>
<div style="background:rgba(52,211,153,0.06);border:2px solid rgba(52,211,153,0.12);border-radius:24px;padding:32px;text-align:center;margin:14px 0">
  <p class="muted" style="font-size:20px;letter-spacing:0.14em;margin-bottom:12px">CURRENT MARKET VALUE</p>
  <p style="font-size:96px;font-weight:800;color:#F5C842;line-height:1">{{CURRENT_VALUE}}</p>
  <div style="display:flex;justify-content:center;align-items:center;gap:14px;margin-top:14px">
    <span style="font-size:36px;font-weight:700;color:{{CHANGE_COLOR}}">{{DAILY_CHANGE}}</span>
    <span class="muted" style="font-size:24px">{{CHANGE_LABEL}}</span>
  </div>
</div>
<div style="display:flex;gap:12px">
  <div class="stat"><div class="label">RETAIL</div><div class="val muted">{{RETAIL_PRICE}}</div></div>
  <div class="stat"><div class="label">ROI</div><div class="val green">{{ROI}}</div></div>
  <div class="stat"><div class="label">STATUS</div><div class="val" style="color:{{STATUS_COLOR}}">{{STATUS}}</div></div>
</div>`,

// ═══════════════════════════════════════════
// RETIREMENT COUNTDOWN
// ═══════════════════════════════════════════
"retirement-countdown": `<div style="display:flex;justify-content:space-between;align-items:center">
  <span class="tag tag-red">RETIRING SOON</span>
  <span class="meta">{{THEME}} &middot; {{YEAR}} &middot; {{PIECES}} pcs</span>
</div>
<div class="photo" style="flex:1;min-height:0;margin:12px 0 0">{{SET_IMAGE}}<div class="num">#{{SET_NUMBER}}</div></div>
<h2 style="margin:14px 0 0;font-size:50px;font-weight:800">{{NAME}}</h2>
<div style="background:rgba(248,113,113,0.06);border:2px solid rgba(248,113,113,0.12);border-radius:24px;padding:32px;text-align:center;margin:14px 0">
  <p class="muted" style="font-size:20px;letter-spacing:0.14em;margin-bottom:12px">STILL AVAILABLE AT RETAIL</p>
  <p style="font-size:72px;font-weight:800">{{RETAIL_PRICE}}</p>
</div>
<div style="background:rgba(255,255,255,0.04);border-radius:20px;padding:28px;display:flex;justify-content:space-between;align-items:center">
  <div><p class="muted" style="font-size:18px;letter-spacing:0.1em">BUY NOW</p><p style="font-size:44px;font-weight:700;margin-top:4px">{{RETAIL_PRICE}}</p></div>
  <span class="muted" style="font-size:44px">&rarr;</span>
  <div style="text-align:right"><p class="muted" style="font-size:18px;letter-spacing:0.1em">2Y FORECAST</p><p style="font-size:44px;font-weight:700;color:#34D399;margin-top:4px">{{FORECAST_2Y}}</p></div>
</div>`,

// ═══════════════════════════════════════════
// RETIREMENT WHY
// ═══════════════════════════════════════════
"retirement-why": `<div class="row" style="margin-bottom:16px">
  <div style="width:120px;height:120px;border-radius:20px;overflow:hidden;background:#edf0f4;display:flex;align-items:center;justify-content:center;flex-shrink:0">{{SET_IMAGE}}</div>
  <div><span class="tag tag-green">WHY IT MATTERS</span><h2 style="font-size:38px;margin-top:8px">Why Buy Before<br>Retirement?</h2></div>
</div>
<div style="display:flex;flex-direction:column;gap:14px;flex:1">
  <div class="stat" style="display:flex;align-items:center;gap:20px;flex:1"><span style="font-size:40px">&#x1F4C8;</span><span style="font-size:26px">Sets in {{THEME}} average +85% ROI post-retirement</span></div>
  <div class="stat" style="display:flex;align-items:center;gap:20px;flex:1"><span style="font-size:40px">&#x1F4E6;</span><span style="font-size:26px">{{PIECES}} pieces = high perceived value for collectors</span></div>
  <div class="stat" style="display:flex;align-items:center;gap:20px;flex:1"><span style="font-size:40px">&#x23F3;</span><span style="font-size:26px">Limited production window = lower future supply</span></div>
  <div class="stat" style="display:flex;align-items:center;gap:20px;flex:1"><span style="font-size:40px">&#x1F3F7;&#xFE0F;</span><span style="font-size:26px">{{THEME}} license = strong long-term collector demand</span></div>
</div>
<div style="background:rgba(245,200,66,0.08);border:2px solid rgba(245,200,66,0.18);border-radius:24px;padding:32px;text-align:center;margin-top:14px">
  <p class="muted" style="font-size:20px;letter-spacing:0.1em;margin-bottom:8px">ESTIMATED ROI FROM RETAIL</p>
  <p style="font-size:60px;font-weight:800;color:#34D399">{{ROI}}</p>
</div>`,

// ═══════════════════════════════════════════
// WEEKLY WRAP WINNERS (no cover)
// ═══════════════════════════════════════════
"weekly-wrap-winners": `<div style="display:flex;justify-content:space-between;align-items:center">
  <span class="tag tag-green">TOP PERFORMER</span>
  <span style="font-size:28px;font-weight:800;color:#F5C842">WEEKLY WRAP</span>
</div>
<div class="photo" style="flex:1;min-height:0;margin:12px 0 0">{{SET_IMAGE}}<div class="num">#{{SET_NUMBER}}</div></div>
<h2 style="margin:14px 0 0;font-size:48px;font-weight:800">{{NAME}}</h2>
<div style="margin:10px 0 14px;display:flex;align-items:baseline;gap:20px">
  <span style="font-size:100px;font-weight:800;color:#34D399;line-height:1;letter-spacing:-0.03em">{{DAILY_CHANGE}}</span>
  <span style="font-size:24px;color:rgba(255,255,255,0.4)">{{CHANGE_LABEL}}</span>
</div>
<div style="display:flex;gap:12px">
  <div class="stat"><div class="label">RETAIL</div><div class="val muted">{{RETAIL_PRICE}}</div></div>
  <div class="stat"><div class="label">NOW</div><div class="val gold">{{CURRENT_VALUE}}</div></div>
  <div class="stat"><div class="label">ROI</div><div class="val green">{{ROI}}</div></div>
</div>
<div style="margin-top:10px">{{TREND_SVG}}</div>`,

// ═══════════════════════════════════════════
// SET VS SET — Individual set slide (replaces cover)
// ═══════════════════════════════════════════
"set-vs-set-set": `<div style="display:flex;justify-content:space-between;align-items:center">
  <div class="row"><span class="tag">{{VS_LABEL}}</span><span class="meta" style="margin:0">{{THEME}} &middot; {{YEAR}} &middot; {{PIECES}} pcs</span></div>
  <span style="font-size:28px;font-weight:800;color:#F5C842">SET VS SET</span>
</div>
<div class="photo" style="flex:1;min-height:0;margin:12px 0 0">{{SET_IMAGE}}<div class="num">#{{SET_NUMBER}}</div></div>
<h2 style="margin:14px 0 0;font-size:50px;font-weight:800">{{NAME}}</h2>
<div style="margin:10px 0 14px;display:flex;align-items:baseline;gap:20px">
  <span style="font-size:110px;font-weight:800;color:{{CHANGE_COLOR}};line-height:1;letter-spacing:-0.03em">{{DAILY_CHANGE}}</span>
  <span style="font-size:24px;color:rgba(255,255,255,0.4)">{{CHANGE_LABEL}}</span>
</div>
<div style="display:flex;gap:12px">
  <div class="stat"><div class="label">RETAIL</div><div class="val muted" style="text-decoration:line-through;text-decoration-color:rgba(255,255,255,0.15)">{{RETAIL_PRICE}}</div></div>
  <div class="stat"><div class="label">NOW</div><div class="val gold">{{CURRENT_VALUE}}</div></div>
  <div class="stat"><div class="label">STATUS</div><div class="val" style="color:{{STATUS_COLOR}}">{{STATUS}}</div></div>
</div>
<div style="margin-top:10px">{{TREND_SVG}}</div>`,

// ═══════════════════════════════════════════
// SET VS SET — Cover (both sets)
// ═══════════════════════════════════════════
"set-vs-set-cover": `<span style="font-size:30px;font-weight:800;color:#F5C842;letter-spacing:0.06em">HEAD TO HEAD</span>
<div style="display:flex;gap:20px;margin:14px 0;flex:1;min-height:0">
  <div style="flex:1;display:flex;flex-direction:column">
    <div class="photo" style="flex:1;min-height:0">{{SET_IMAGE}}<div class="num">#{{SET_NUMBER}}</div></div>
    <p style="text-align:center;margin-top:10px;font-size:28px;font-weight:800">{{NAME}}</p>
    <p class="meta" style="text-align:center">{{CURRENT_VALUE}} &middot; {{ROI}}</p>
  </div>
  <div style="display:flex;align-items:center"><div style="width:80px;height:80px;border-radius:40px;background:rgba(245,200,66,0.15);border:2px solid rgba(245,200,66,0.25);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;color:#F5C842">VS</div></div>
  <div style="flex:1;display:flex;flex-direction:column">
    <div class="photo" style="flex:1;min-height:0"><div class="photo-placeholder">&#x1F4E6;</div></div>
    <p style="text-align:center;margin-top:10px;font-size:28px;font-weight:800">Challenger</p>
    <p class="meta" style="text-align:center">&mdash;</p>
  </div>
</div>
<h1 style="text-align:center;font-size:56px;font-weight:800">Which Is the Better<br>Investment?</h1>`,

// ═══════════════════════════════════════════
// SET VS SET — Compare
// ═══════════════════════════════════════════
"set-vs-set-compare": `<div class="row" style="margin-bottom:16px">
  <div style="width:120px;height:120px;border-radius:20px;overflow:hidden;background:#edf0f4;display:flex;align-items:center;justify-content:center;flex-shrink:0">{{SET_IMAGE}}</div>
  <div><span class="tag">COMPARISON</span><h2 style="font-size:42px;margin-top:6px">{{NAME}}</h2></div>
</div>
<div style="display:flex;flex-direction:column;gap:14px;flex:1">
  <div class="stat" style="flex:1;display:flex;flex-direction:column;justify-content:center"><div class="label">RETAIL PRICE</div><div class="val muted" style="font-size:52px">{{RETAIL_PRICE}}</div></div>
  <div class="stat" style="flex:1;display:flex;flex-direction:column;justify-content:center"><div class="label">CURRENT VALUE</div><div class="val gold" style="font-size:52px">{{CURRENT_VALUE}}</div></div>
  <div class="stat" style="flex:1;display:flex;flex-direction:column;justify-content:center"><div class="label">TOTAL ROI</div><div class="val green" style="font-size:52px">{{ROI}}</div></div>
  <div style="display:flex;gap:14px">
    <div class="stat" style="flex:1"><div class="label">PIECES</div><div class="val">{{PIECES}}</div></div>
    <div class="stat" style="flex:1"><div class="label">STATUS</div><div class="val" style="color:{{STATUS_COLOR}}">{{STATUS}}</div></div>
  </div>
</div>`,

// ═══════════════════════════════════════════
// SET VS SET — Verdict
// ═══════════════════════════════════════════
"set-vs-set-verdict": `<div class="photo" style="flex:1;min-height:0">{{SET_IMAGE}}<div class="num" style="background:rgba(245,200,66,0.2);color:#F5C842;border-color:rgba(245,200,66,0.3)">WINNER</div></div>
<span class="tag" style="margin-top:14px">VERDICT</span>
<h2 style="margin:12px 0 8px;font-size:52px;font-weight:800">{{NAME}} Wins</h2>
<p style="font-size:26px;color:rgba(255,255,255,0.45);line-height:1.5">With {{ROI}} ROI and {{PIECES}} pieces, this set leads on both value appreciation and long-term collectibility.</p>
<div style="display:flex;gap:12px;margin-top:16px">
  <div class="stat"><div class="label">TOTAL ROI</div><div class="val gold" style="font-size:52px">{{ROI}}</div></div>
  <div class="stat"><div class="label">CURRENT</div><div class="val green" style="font-size:52px">{{CURRENT_VALUE}}</div></div>
  <div class="stat"><div class="label">FORECAST</div><div class="val gold" style="font-size:52px">{{FORECAST_2Y}}</div></div>
</div>`,

// ═══════════════════════════════════════════
// CTA — Link in bio
// ═══════════════════════════════════════════
"cta": `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
  <div style="width:130px;height:130px;background:#F5C842;border-radius:30px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:48px;color:#0D1B35;margin-bottom:44px">BX</div>
  <h1 style="font-size:64px;color:#F5C842;font-weight:800">BRIX</h1>
  <p style="font-size:36px;color:#fff;margin-top:16px;font-weight:700">Know What Your<br>LEGO Is Worth</p>
  <p class="muted" style="font-size:28px;margin-top:18px;line-height:1.5">Track prices. Spot opportunities.<br>Build wealth, brick by brick.</p>
  <div style="margin-top:40px;background:#F5C842;color:#0D1B35;font-weight:700;font-size:34px;padding:28px 56px;border-radius:20px">Link in bio &uarr;</div>
  <p class="muted" style="font-size:24px;margin-top:24px">@brix.app1 &middot; brixcollector.com</p>
</div>`,

};

for (const [name, body] of Object.entries(T)) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>\n${body}\n${FOOTER}\n</body></html>`;
  writeFileSync(join(DIR, `${name}.html`), html, 'utf8');
  console.log(`  ✅ ${name}.html`);
}
console.log(`\n🎉 ${Object.keys(T).length} templates written!`);
