/**
 * BrickEconomy Scraper v4 — Individual set pages
 * 
 * Strategy:
 * - Maintain a curated list of set URLs
 * - Scrape each set's individual page with Puppeteer
 * - Extract accurate per-set data from the DOM
 * - Cache for 24h (one scrape per day)
 * - 0 API calls consumed
 *
 * v4 changes (debugging retail_price/current_value/image_url returning 0 for
 * every set on 2026-06-27 while growth/pieces/year/theme extracted fine):
 * - Wait for a real content signal (the page's <title>) instead of a blind
 *   1.5s timeout — if BrickEconomy's valuation widget loads async/late, a
 *   fixed short wait silently misses it while the rest of the DOM is already there.
 * - Dismiss cookie/consent banners before reading text — a banner can sit on
 *   top of the page without blocking document.body.innerText, but some sites
 *   delay rendering the real widget content until consent is resolved.
 * - On regex extraction failure for price fields, dump the raw page text to
 *   data/debug-scrape/<setId>.txt so we can see exactly what Puppeteer saw.
 */

import puppeteer from 'puppeteer';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const CACHE_FILE = join(DATA_DIR, 'scrape-cache.json');
const SETS_FILE = join(DATA_DIR, 'tracked-sets.json');
const DEBUG_DIR = join(DATA_DIR, 'debug-scrape');
const BASE = 'https://www.brickeconomy.com';

function loadCache() {
  if (!existsSync(CACHE_FILE)) return null;
  try { return JSON.parse(readFileSync(CACHE_FILE, 'utf8')); } catch { return null; }
}

function saveCache(data) {
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

function loadTrackedSets() {
  return JSON.parse(readFileSync(SETS_FILE, 'utf8')).sets;
}

function dumpDebugText(setId, text, html) {
  try {
    mkdirSync(DEBUG_DIR, { recursive: true });
    writeFileSync(join(DEBUG_DIR, `${setId}.txt`), text);
    if (html) writeFileSync(join(DEBUG_DIR, `${setId}.html`), html);
  } catch (e) {
    console.error(`  ⚠️  Could not write debug dump for ${setId}: ${e.message}`);
  }
}

/**
 * Try to dismiss common cookie/consent banners (OneTrust, Cookiebot, generic).
 * Best-effort — never throws.
 */
async function dismissCookieBanner(page) {
  try {
    await page.evaluate(() => {
      const selectors = [
        '#onetrust-accept-btn-handler',
        '.cookie-accept', '.cookie-consent-accept', '.cc-accept',
        'button[aria-label="Accept"]', 'button[aria-label="Accept all"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { el.click(); return; }
      }
      // Generic fallback: any button whose text mentions accept/agree
      const buttons = Array.from(document.querySelectorAll('button'));
      const match = buttons.find(b => /accept|agree|got it/i.test(b.textContent || ''));
      if (match) match.click();
    });
  } catch {
    // non-fatal
  }
}

/**
 * Scrape a single set page and extract structured data
 */
async function scrapeSetPage(page, setId) {
  // Build URL: /set/{number}/lego-{slug} — we only need the number part
  const cleanId = setId.includes('-') ? setId : `${setId}-1`;
  const url = `${BASE}/set/${cleanId}/`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

    // Wait for the actual page title to be populated (real content signal)
    // rather than a blind fixed delay — BrickEconomy's valuation widget can
    // finish rendering after networkidle2 fires.
    try {
      await page.waitForFunction(
        () => document.querySelector('title')?.textContent?.includes('|'),
        { timeout: 8000 }
      );
    } catch {
      // proceed anyway — we'll dump debug text below if extraction fails
    }

    await dismissCookieBanner(page);
    await new Promise(r => setTimeout(r, 1500)); // settle time for any post-consent re-render

    const data = await page.evaluate((baseUrl) => {
      const text = document.body.innerText || '';
      const html = document.body.innerHTML || '';

      // Name: from the h1 or title, after the set number
      const titleEl = document.querySelector('title');
      const titleText = titleEl ? titleEl.textContent : '';
      // Title format: "LEGO 10294 Titanic | BrickEconomy"
      const titleMatch = titleText.match(/LEGO\s+\d+\s+(.+?)\s*\|/);
      const name = titleMatch ? titleMatch[1].trim() : '';

      // Set number from URL
      const urlMatch = window.location.pathname.match(/\/set\/(\d+(?:-\d+)?)\//);
      const setNumber = urlMatch ? urlMatch[1] : '';

      // Theme: from breadcrumb
      const breadcrumbs = document.querySelectorAll('ol.breadcrumb li, nav ol li, .breadcrumb-item');
      let theme = '';
      if (breadcrumbs.length >= 3) {
        theme = breadcrumbs[1]?.textContent?.trim() || '';
      }
      // Fallback: look for theme in page text
      if (!theme) {
        const themeMatch = text.match(/is a[n]? ([A-Za-z][A-Za-z\s&]+?) set/);
        if (themeMatch) theme = themeMatch[1].trim();
      }

      // Pieces
      const piecesMatch = text.match(/([\d,]+)\s*piece/i);
      const pieces = piecesMatch ? parseInt(piecesMatch[1].replace(/,/g, '')) : 0;

      // Year
      const yearMatch = text.match(/released in (\d{4})/i);
      const year = yearMatch ? parseInt(yearMatch[1]) : 0;

      // Retail price — try several known BrickEconomy phrasings:
      //  "available at retail for $X"   (available sets)
      //  "from an original retail price of $X" (retired sets)
      //  "retail price of/for $X"
      //  "RRP ... $X" / "RRP: $X"
      let retailPrice = 0;
      const retailPatterns = [
        /retail\s+(?:price\s+)?(?:of|for)\s*\$([\d,]+(?:\.\d+)?)/i,
        /original retail price of \$([\d,]+(?:\.\d+)?)/i,
        /RRP[^$]{0,20}\$([\d,]+(?:\.\d+)?)/i,
      ];
      for (const re of retailPatterns) {
        const m = text.match(re);
        if (m) { retailPrice = parseFloat(m[1].replace(/,/g, '')); break; }
      }

      // Current value — look for "valued at $X" or "average above MSRP at $X"
      let currentValue = 0;
      const valuedMatch = text.match(/valued at \$([\d,]+(?:\.\d+)?)/i);
      const avgMatch = text.match(/average (?:above|below) MSRP at \$([\d,]+(?:\.\d+)?)/i);
      const rangeMatch = text.match(/range from \$([\d,]+(?:\.\d+)?) to \$([\d,]+(?:\.\d+)?)/i);

      if (avgMatch) {
        currentValue = parseFloat(avgMatch[1].replace(/,/g, ''));
      } else if (valuedMatch) {
        currentValue = parseFloat(valuedMatch[1].replace(/,/g, ''));
      } else if (rangeMatch) {
        const low = parseFloat(rangeMatch[1].replace(/,/g, ''));
        const high = parseFloat(rangeMatch[2].replace(/,/g, ''));
        currentValue = (low + high) / 2;
      }
      // If still 0, current value = retail price (set is at/near retail)
      if (!currentValue && retailPrice) currentValue = retailPrice;

      // Growth percentage
      const growthMatch = text.match(/up ([\d,.]+)%/i);
      const growthDown = text.match(/down ([\d,.]+)%/i);
      let growth = 0;
      if (growthMatch) growth = parseFloat(growthMatch[1].replace(/,/g, ''));
      else if (growthDown) growth = -parseFloat(growthDown[1].replace(/,/g, ''));

      // Annual growth (CAGR)
      const cagrMatch = text.match(/annual growth (?:will be |of |close to )([\d,.]+)%/i);
      const annualGrowth = cagrMatch ? parseFloat(cagrMatch[1].replace(/,/g, '')) : 0;

      // Status: retired or available
      const isRetired = /is a .+ set valued at/i.test(text) || /retired/i.test(text.substring(0, 500));
      const isAvailable = /currently available at retail/i.test(text);
      const retired = isRetired && !isAvailable;

      // Retirement estimate
      const retireMatch = text.match(/projected to retire in (.+?)\./i);
      const retirementEstimate = retireMatch ? retireMatch[1].trim() : '';

      // Forecast value
      const forecastMatch = text.match(/valuing the set between \$([\d,]+(?:\.\d+)?) and \$([\d,]+(?:\.\d+)?)/i);
      let forecast2y = null;
      if (forecastMatch) {
        const low = parseFloat(forecastMatch[1].replace(/,/g, ''));
        const high = parseFloat(forecastMatch[2].replace(/,/g, ''));
        forecast2y = Math.round((low + high) / 2);
      }

      // Image URL — try og:image first, then a product image in the DOM
      const ogImage = document.querySelector('meta[property="og:image"]');
      let imageUrl = ogImage ? ogImage.getAttribute('content') : '';
      if (!imageUrl) {
        const productImg = document.querySelector('img[src*="/set/"], img.SetImage, .ItemImage img');
        if (productImg) imageUrl = productImg.getAttribute('src') || '';
      }

      return {
        setNumber, name, theme, year, pieces,
        retailPrice, currentValue, growth, annualGrowth,
        retired, retirementEstimate, forecast2y, imageUrl,
        _rawTextSample: text.substring(0, 600), // for debugging
      };
    }, BASE);

    if (!data.name && !data.setNumber) return null;

    // If price extraction failed, dump full text+html for offline inspection
    if (!data.retailPrice && !data.currentValue) {
      const text = await page.evaluate(() => document.body.innerText || '');
      const html = await page.content();
      dumpDebugText(cleanId, text, html);
      console.log(`  ⚠️  ${cleanId}: price extraction failed — dumped debug text to data/debug-scrape/${cleanId}.txt`);
    }

    // Calculate ROI
    const roi = data.retailPrice > 0
      ? Math.round(((data.currentValue - data.retailPrice) / data.retailPrice) * 100 * 10) / 10
      : data.growth;

    return {
      set_number: data.setNumber,
      name: data.name,
      theme: data.theme,
      year: data.year,
      pieces: data.pieces,
      retired: data.retired,
      retirement_estimate: data.retirementEstimate,
      retail_price: data.retailPrice,
      current_value: data.currentValue,
      roi,
      rolling_growth_12m: data.annualGrowth,
      daily_change: 0,
      forecast_2y: data.forecast2y,
      forecast_5y: null,
      price_events: [],
      price_trend: [],
      image_url: data.imageUrl,
    };
  } catch (err) {
    console.error(`  ✗ ${cleanId}: ${err.message}`);
    return null;
  }
}

/**
 * Main scrape function
 */
export async function scrapeAllData() {
  const today = new Date().toISOString().split('T')[0];

  // Check cache
  const cached = loadCache();
  if (cached && cached._scrapeDate === today && !process.argv.includes('--force-fetch')) {
    console.log(`📋 Already scraped today (${today}) — using cache (${cached.sets.length} sets)`);
    return cached.sets;
  }

  const setIds = loadTrackedSets();
  console.log(`🌐 Scraping ${setIds.length} individual set pages (0 API calls)...\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const results = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 900 });

    for (let i = 0; i < setIds.length; i++) {
      const id = setIds[i];
      console.log(`  [${i + 1}/${setIds.length}] Scraping ${id}...`);

      const data = await scrapeSetPage(page, id);
      if (data) {
        results.push(data);
        console.log(`    ✅ ${data.name} — $${Math.round(data.current_value)} (${data.roi > 0 ? '+' : ''}${data.roi}%)`);
      }

      // Polite delay between requests
      await new Promise(r => setTimeout(r, 2000));
    }
  } finally {
    await browser.close();
  }

  console.log(`\n✅ Scraped ${results.length}/${setIds.length} sets successfully\n`);

  if (results.length > 0) {
    saveCache({ _scrapeDate: today, sets: results });
  }

  return results;
}

/**
 * Select content for each template
 */
export function selectContent(allSets) {
  function score(s) {
    if (s.daily_change && Math.abs(s.daily_change) > 0.01) return s.daily_change;
    if (s.rolling_growth_12m && Math.abs(s.rolling_growth_12m) > 0.01) return s.rolling_growth_12m;
    return s.roi || 0;
  }

  const withScore = allSets.filter(s => Math.abs(score(s)) > 0.01);
  const pool = withScore.length >= 3 ? withScore : allSets;

  const topPositive = [...pool].filter(s => score(s) > 0).sort((a, b) => score(b) - score(a));
  const byROI = [...pool].sort((a, b) => (b.roi || 0) - (a.roi || 0));
  const retiring = pool.filter(s => !s.retired && s.retirement_estimate);
  const recentlyRetired = pool.filter(s => s.retired);

  const dayOfMonth = new Date().getDate();
  const offset = dayOfMonth % Math.max(1, topPositive.length - 3);

  return {
    topGainers: topPositive.slice(offset, offset + 3).length >= 3
      ? topPositive.slice(offset, offset + 3)
      : topPositive.slice(0, 3),

    deepDive: recentlyRetired[dayOfMonth % Math.max(1, recentlyRetired.length)] || byROI[0] || null,

    priceAlert: topPositive.length > 3
      ? topPositive[3 + (dayOfMonth % Math.max(1, topPositive.length - 3))]
      : topPositive[0] || null,

    retirementWatch: retiring.length > 0
      ? retiring[dayOfMonth % retiring.length]
      : pool.filter(s => !s.retired)[0] || null,

    weeklyWrap: {
      totalSets: allSets.length,
      avgMovement: 0,
      topGainer: topPositive[0] || null,
      topLoser: [...pool].sort((a, b) => score(a) - score(b))[0] || null,
      retiredCount: allSets.filter(s => s.retired).length,
      athCount: topPositive.filter(s => score(s) > 50).length,
    },

    setVsSet: byROI.length >= 2
      ? [byROI[0], byROI.find((s, i) => i > 0 && s.set_number !== byROI[0].set_number) || byROI[1]]
      : null,
  };
}
