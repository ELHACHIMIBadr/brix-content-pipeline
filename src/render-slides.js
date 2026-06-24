/**
 * Slide renderer v4 — fixes: $0→"—", set-vs-set passes both sets, no flex:1 on stat boxes
 */

import puppeteer from 'puppeteer';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, '..', 'templates');
const OUTPUT_DIR = join(__dirname, '..', 'output', 'slides');
const WIDTH = 1080;
const HEIGHT = 1920;

function loadTemplate(name) {
  return readFileSync(join(TEMPLATE_DIR, `${name}.html`), 'utf8');
}

function fillTemplate(html, data) {
  let result = html;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value ?? '');
  }
  return result.replace(/\{\{[^}]+\}\}/g, '');
}

function fmtPrice(v) {
  if (!v || v === 0) return '—';
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

function fmtPct(v) {
  if (v === null || v === undefined || v === 0) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function fmtPctForce(v) {
  // Always show number even if 0 (for ROI display)
  if (v === null || v === undefined) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function roiBarSVG(retail, current, roi) {
  if (!retail || !current) return '';
  const w = 880, h = 80;
  const isPositive = roi >= 0;
  const color = isPositive ? '#34D399' : '#F87171';
  const pct = Math.min(Math.abs(roi) / (Math.abs(roi) + 100), 0.92);
  const barW = Math.max(w * 0.15, w * pct);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${w}" height="${h}" rx="14" fill="rgba(255,255,255,0.04)"/>
    <defs><linearGradient id="rb" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.5"/>
    </linearGradient></defs>
    <rect x="0" y="0" width="${barW}" height="${h}" rx="14" fill="url(#rb)"/>
    <text x="24" y="32" font-family="Inter,sans-serif" font-size="20" fill="rgba(255,255,255,0.4)" font-weight="600">$${Math.round(retail)}</text>
    <text x="${w - 24}" y="32" font-family="Inter,sans-serif" font-size="20" fill="${color}" text-anchor="end" font-weight="600">$${Math.round(current).toLocaleString()}</text>
    <text x="${barW / 2}" y="64" font-family="Inter,sans-serif" font-size="28" font-weight="800" fill="${color}" text-anchor="middle">${isPositive ? '+' : ''}${roi.toFixed(1)}%</text>
  </svg>`;
}

let svgN = 0;
function trendSVG(values, color, w = 880, h = 200) {
  if (!values || values.length < 2) return '';
  svgN++;
  const id = `g${svgN}`;
  const max = Math.max(...values), min = Math.min(...values), r = max - min || 1;
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1)) * w},${h - ((v - min) / r) * (h - 12) - 6}`
  ).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="0,${h} ${pts} ${w},${h}" fill="url(#${id})"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function imageTag(imagePath) {
  if (!imagePath) return '<div class="photo-placeholder">📦</div>';
  try {
    const buf = readFileSync(imagePath);
    const b64 = buf.toString('base64');
    const ext = imagePath.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
    return `<img src="data:image/${ext};base64,${b64}" />`;
  } catch {
    return '<div class="photo-placeholder">📦</div>';
  }
}

function prepareSlideData(templateType, setData, imageMap) {
  const s = setData;
  const img = imageMap?.[s?.set_number] || null;

  let trend = [];
  if (s?.price_events?.length >= 2) trend = s.price_events.map(e => e.value);
  else if (s?.price_trend?.length >= 2) trend = s.price_trend;

  const dailyChange = s?.daily_change || 0;
  const roiValue = s?.roi || 0;
  const displayChange = (dailyChange === 0 && roiValue !== 0) ? roiValue : dailyChange;
  const displayLabel = (dailyChange === 0 && roiValue !== 0) ? 'ROI from retail' : 'today';
  const isPositive = displayChange >= 0;
  const changeColor = isPositive ? '#34D399' : '#F87171';

  return {
    NAME: s?.name || '',
    SET_NUMBER: s?.set_number || '',
    THEME: s?.theme || '',
    SUBTHEME: s?.subtheme || '',
    YEAR: s?.year || '',
    PIECES: s?.pieces?.toLocaleString() || '',
    RETAIL_PRICE: fmtPrice(s?.retail_price),
    CURRENT_VALUE: fmtPrice(s?.current_value),
    ROI: fmtPctForce(roiValue),
    ROI_COLOR: roiValue >= 0 ? '#34D399' : '#F87171',
    DAILY_CHANGE: fmtPctForce(displayChange),
    CHANGE_LABEL: displayLabel,
    CHANGE_COLOR: changeColor,
    GROWTH_12M: fmtPct(s?.rolling_growth_12m),
    FORECAST_2Y: fmtPrice(s?.forecast_2y),
    FORECAST_5Y: fmtPrice(s?.forecast_5y),
    STATUS: s?.retired ? 'Retired' : 'Available',
    STATUS_COLOR: s?.retired ? '#F87171' : '#34D399',
    SET_IMAGE: imageTag(img),
    TREND_SVG: trendSVG(trend, changeColor) || roiBarSVG(s?.retail_price, s?.current_value, roiValue),
    TREND_SVG_GREEN: trendSVG(trend, '#34D399') || roiBarSVG(s?.retail_price, s?.current_value, roiValue),
    TODAY_DATE: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  };
}

async function renderToPNG(browser, html, outputPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
  await page.screenshot({ path: outputPath, type: 'png', fullPage: false });
  await page.close();
}

export async function renderPost(templateName, sets, imageMap, postId) {
  svgN = 0;
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const pngPaths = [];
  try {
    const files = getTemplateFiles(templateName);
    for (let i = 0; i < files.length; i++) {
      const { file, dataIndex } = files[i];
      const html = loadTemplate(file);
      const setData = Array.isArray(sets) ? (sets[dataIndex] || sets[0]) : sets;
      const data = prepareSlideData(templateName, setData, imageMap);
      
      // Template-specific overrides
      if (templateName === 'top-gainers' && dataIndex !== undefined) data.RANK = dataIndex + 1;
      if (file === 'set-vs-set-set') data.VS_LABEL = dataIndex === 0 ? 'SET A' : 'SET B';
      
      // For verdict, add both sets' data
      if (file === 'set-vs-set-verdict' && Array.isArray(sets) && sets.length >= 2) {
        const a = sets[0], b = sets[1];
        const winner = (a.roi || 0) >= (b.roi || 0) ? a : b;
        const loser = winner === a ? b : a;
        data.NAME = winner.name;
        data.WINNER_NAME = winner.name;
        data.WINNER_ROI = fmtPctForce(winner.roi);
        data.WINNER_VALUE = fmtPrice(winner.current_value);
        data.WINNER_PIECES = winner.pieces?.toLocaleString() || '';
        data.LOSER_NAME = loser.name;
        data.LOSER_ROI = fmtPctForce(loser.roi);
        data.LOSER_VALUE = fmtPrice(loser.current_value);
        data.SET_IMAGE = imageTag(imageMap?.[winner.set_number] || null);
      }

      const filled = fillTemplate(html, data);
      const out = join(OUTPUT_DIR, `${postId}-slide-${i + 1}.png`);
      await renderToPNG(browser, filled, out);
      pngPaths.push(out);
      console.log(`  🖼️  ${postId} slide ${i + 1}/${files.length}`);
    }
  } finally { await browser.close(); }
  return pngPaths;
}

function getTemplateFiles(t) {
  const map = {
    'top-gainers': [
      { file: 'top-gainers-set', dataIndex: 0 },
      { file: 'top-gainers-set', dataIndex: 1 },
      { file: 'top-gainers-set', dataIndex: 2 },
      { file: 'cta', dataIndex: 0 },
    ],
    'deep-dive': [
      { file: 'deep-dive-title', dataIndex: 0 },
      { file: 'deep-dive-metrics', dataIndex: 0 },
      { file: 'deep-dive-verdict', dataIndex: 0 },
      { file: 'cta', dataIndex: 0 },
    ],
    'price-alert': [
      { file: 'price-alert', dataIndex: 0 },
      { file: 'cta', dataIndex: 0 },
    ],
    'retirement-watch': [
      { file: 'retirement-countdown', dataIndex: 0 },
      { file: 'retirement-why', dataIndex: 0 },
      { file: 'cta', dataIndex: 0 },
    ],
    'weekly-wrap': [
      { file: 'weekly-wrap-winners', dataIndex: 0 },
      { file: 'cta', dataIndex: 0 },
    ],
    'set-vs-set': [
      { file: 'set-vs-set-set', dataIndex: 0 },
      { file: 'set-vs-set-set', dataIndex: 1 },
      { file: 'set-vs-set-verdict', dataIndex: 0 },
      { file: 'cta', dataIndex: 0 },
    ],
  };
  return map[t] || [{ file: t, dataIndex: 0 }];
}
