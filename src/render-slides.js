/**
 * Slide renderer — generates PNG carousel slides from HTML templates
 * Uses Puppeteer to screenshot 1080×1920 slides (9:16 TikTok/IG format)
 */

import puppeteer from 'puppeteer';
import { readFileSync, mkdirSync, existsSync } from 'fs';
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
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value ?? '');
  }
  // Clean up any remaining unfilled placeholders
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  return result;
}

function formatPrice(value) {
  if (!value) return '$0';
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatROI(value) {
  if (!value) return '+0%';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatChange(value) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function trendToSVG(values, color, w = 600, h = 140) {
  if (!values || values.length < 2) return '';
  const max = Math.max(...values), min = Math.min(...values), range = max - min || 1;
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * (h - 10) - 5}`
  ).join(' ');
  const area = `0,${h} ${pts} ${w},${h}`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="${area}" fill="url(#gf)"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function imageTag(imagePath) {
  if (!imagePath) return '<div class="photo-placeholder">📦</div>';
  // Convert local path to file:// URL for Puppeteer
  return `<img src="file://${imagePath}" class="set-photo" />`;
}

/**
 * Prepare template data for each template type
 */
function prepareSlideData(templateType, setData, imageMap) {
  const set = setData;
  const img = imageMap?.[set?.set_number] || null;
  const isPositive = (set?.daily_change || 0) >= 0;
  const changeColor = isPositive ? '#34D399' : '#F87171';

  const base = {
    NAME: set?.name || '',
    SET_NUMBER: set?.set_number || '',
    THEME: set?.theme || '',
    SUBTHEME: set?.subtheme || '',
    YEAR: set?.year || '',
    PIECES: set?.pieces?.toLocaleString() || '',
    RETAIL_PRICE: formatPrice(set?.retail_price),
    CURRENT_VALUE: formatPrice(set?.current_value),
    ROI: formatROI(set?.roi),
    DAILY_CHANGE: formatChange(set?.daily_change || 0),
    CHANGE_COLOR: changeColor,
    GROWTH_12M: formatChange(set?.rolling_growth_12m || 0),
    FORECAST_2Y: formatPrice(set?.forecast_2y),
    FORECAST_5Y: formatPrice(set?.forecast_5y),
    STATUS: set?.retired ? 'Retired' : 'Available',
    STATUS_COLOR: set?.retired ? '#F87171' : '#34D399',
    SET_IMAGE: imageTag(img),
    TREND_SVG: trendToSVG(set?.price_trend, changeColor),
    TREND_SVG_GREEN: trendToSVG(set?.price_trend, '#34D399'),
    TODAY_DATE: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  };

  return base;
}

/**
 * Render a single HTML string to PNG
 */
async function renderToPNG(browser, html, outputPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
  await page.screenshot({ path: outputPath, type: 'png', fullPage: false });
  await page.close();
}

/**
 * Generate all slides for a post
 * Returns array of PNG file paths
 */
export async function renderPost(templateName, sets, imageMap, postId) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const pngPaths = [];

  try {
    // Each template has multiple slides stored as separate HTML files
    // e.g., top-gainers-cover.html, top-gainers-set.html, top-gainers-cta.html
    const templateFiles = getTemplateFiles(templateName);

    for (let i = 0; i < templateFiles.length; i++) {
      const { file, dataIndex } = templateFiles[i];
      const templateHTML = loadTemplate(file);
      const setData = Array.isArray(sets) ? (sets[dataIndex] || sets[0]) : sets;
      const slideData = prepareSlideData(templateName, setData, imageMap);

      // Add rank for top-gainers
      if (templateName === 'top-gainers' && dataIndex !== undefined) {
        slideData.RANK = dataIndex + 1;
      }

      const filledHTML = fillTemplate(templateHTML, slideData);
      const outPath = join(OUTPUT_DIR, `${postId}-slide-${i + 1}.png`);
      await renderToPNG(browser, filledHTML, outPath);
      pngPaths.push(outPath);
      console.log(`  🖼️  ${postId} slide ${i + 1}/${templateFiles.length}`);
    }
  } finally {
    await browser.close();
  }

  return pngPaths;
}

/**
 * Map template names to their slide HTML files
 */
function getTemplateFiles(templateName) {
  switch (templateName) {
    case 'top-gainers':
      return [
        { file: 'top-gainers-cover', dataIndex: 0 },
        { file: 'top-gainers-set', dataIndex: 0 },
        { file: 'top-gainers-set', dataIndex: 1 },
        { file: 'top-gainers-set', dataIndex: 2 },
        { file: 'cta', dataIndex: 0 },
      ];
    case 'deep-dive':
      return [
        { file: 'deep-dive-title', dataIndex: 0 },
        { file: 'deep-dive-metrics', dataIndex: 0 },
        { file: 'deep-dive-chart', dataIndex: 0 },
        { file: 'deep-dive-verdict', dataIndex: 0 },
        { file: 'cta', dataIndex: 0 },
      ];
    case 'price-alert':
      return [
        { file: 'price-alert', dataIndex: 0 },
        { file: 'cta', dataIndex: 0 },
      ];
    case 'retirement-watch':
      return [
        { file: 'retirement-countdown', dataIndex: 0 },
        { file: 'retirement-why', dataIndex: 0 },
        { file: 'cta', dataIndex: 0 },
      ];
    case 'weekly-wrap':
      return [
        { file: 'weekly-wrap-cover', dataIndex: 0 },
        { file: 'weekly-wrap-winners', dataIndex: 0 },
        { file: 'cta', dataIndex: 0 },
      ];
    case 'set-vs-set':
      return [
        { file: 'set-vs-set-cover', dataIndex: 0 },
        { file: 'set-vs-set-compare', dataIndex: 0 },
        { file: 'set-vs-set-verdict', dataIndex: 0 },
        { file: 'cta', dataIndex: 0 },
      ];
    default:
      return [{ file: templateName, dataIndex: 0 }];
  }
}
