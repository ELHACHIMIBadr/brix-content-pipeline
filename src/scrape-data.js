/**
 * BrickEconomy Scraper v5 — Individual set pages
 * 
 * Strategy:
 * - Maintain a curated list of set URLs
 * - Scrape each set's individual page with Puppeteer
 * - Extract accurate per-set data from the DOM
 * - Cache for 24h (one scrape per day)
 * - 0 API calls consumed
 *
 * v5 — ROOT CAUSE FOUND (confirmed via debug dumps on 2026-06-27):
 * BrickEconomy serves the page in GBP (£) when scraped from a UK-geolocated
 * IP (GitHub Actions runner), not USD ($). Every regex in v3/v4 only matched
 * a literal "$", so retail_price/current_value silently stayed 0 for every
 * single set — confirmed by "Region · United Kingdom (GBP)" in the page footer
 * and "Retail price £199.99" etc. throughout the debug dumps.
 *
 * Fix:
 * 1. Parse the structured "Set Pricing" block (Retail price / Value labels
 *    followed by a price on the next line) instead of relying on a narrative
 *    sentence — far more stable across retired/available/exclusive statuses.
 * 2. Currency-agnostic regex ([£$€]) for all price patterns, narrative
 *    fallback included.
 * 3. Always normalize to USD using the "Regional Retail Prices (LEGO.com/Store)"
 *    block, which lists "United States $X.XX" regardless of the page's
 *    detected region — so BRIX's captions/templates stay consistent in USD
 *    no matter where the scraper runs from.
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
  const cleanId = setId.includes('-') ? setId : `${setId}-1`;
  const url = `${BASE}/set/${cleanId}/`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

    try {
      await page.waitForFunction(
        () => document.querySelector('title')?.textContent?.includes('|'),
        { timeout: 8000 }
      );
    } catch {
      // proceed anyway
    }

    await dismissCookieBanner(page);
    await new Promise(r => setTimeout(r, 1500));

    const data = await page.evaluate((baseUrl) => {
      const text = document.body.innerText || '';
      const html = document.body.innerHTML || '';

      // Currency-agnostic number pattern: matches £199.99 / $199.99 / €199.99
      const CUR = '[£$€]';

      const titleEl = document.querySelector('title');
      const titleText = titleEl ? titleEl.textContent : '';
      const titleMatch = titleText.match(/LEGO\s+\d+\s+(.+?)\s*\|/);
      const name = titleMatch ? titleMatch[1].trim() : '';

      const urlMatch = window.location.pathname.match(/\/set\/(\d+(?:-\d+)?)\//);
      const setNumber = urlMatch ? urlMatch[1] : '';

      const breadcrumbs = document.querySelectorAll('ol.breadcrumb li, nav ol li, .breadcrumb-item');
      let theme = '';
      if (breadcrumbs.length >= 3) {
        theme = breadcrumbs[1]?.textContent?.trim() || '';
      }
      if (!theme) {
        const themeMatch = text.match(/is a[n]? ([A-Za-z][A-Za-z\s&]+?) set/);
        if (themeMatch) theme = themeMatch[1].trim();
      }

      const piecesMatch = text.match(/([\d,]+)\s*piece/i);
      const pieces = piecesMatch ? parseInt(piecesMatch[1].replace(/,/g, '')) : 0;

      const yearMatch = text.match(/released in (\d{4})/i);
      const year = yearMatch ? parseInt(yearMatch[1]) : 0;

      // ── PRIMARY SOURCE: "Regional Retail Prices (LEGO.com/Store)" block ──
      // This block always lists "United States $X.XX" regardless of the
      // page's detected region/currency — use it to normalize to USD.
      let retailPriceUSD = 0;
      const usRetailMatch = text.match(/United States\s*\$([\d,]+(?:\.\d+)?)/i);
      if (usRetailMatch) retailPriceUSD = parseFloat(usRetailMatch[1].replace(/,/g, ''));

      // ── Structured "Set Pricing" block (currency-agnostic) ──
      // Format in page text:
      //   Set Pricing
      //   Retail price
      //   £199.99
      //   New/Sealed
      //   Value
      //   £239.39
      //   Growth
      //   +19.70%
      let retailPriceLocal = 0;
      let currentValueLocal = 0;
      let growthFromBlock = 0;
      const pricingBlockMatch = text.match(/Set Pricing([\s\S]{0,400}?)(?:Quick Buy|Set Predictions|Used\b)/i);
      if (pricingBlockMatch) {
        const block = pricingBlockMatch[1];
        const retailM = block.match(new RegExp(`Retail price\\s*${CUR}([\\d,]+(?:\\.\\d+)?)`, 'i'));
        if (retailM) retailPriceLocal = parseFloat(retailM[1].replace(/,/g, ''));
        const valueM = block.match(new RegExp(`Value\\s*${CUR}([\\d,]+(?:\\.\\d+)?)`, 'i'));
        if (valueM) currentValueLocal = parseFloat(valueM[1].replace(/,/g, ''));
        const growthM = block.match(/Growth\s*\+?(-?[\d.]+)%/i);
        if (growthM) growthFromBlock = parseFloat(growthM[1]);
      }

      // Currency-agnostic narrative fallbacks (used only if structured block missing)
      let retailPriceNarrative = 0;
      const retailPatterns = [
        new RegExp(`retail\\s+(?:price\\s+)?(?:of|for)\\s*${CUR}([\\d,]+(?:\\.\\d+)?)`, 'i'),
        new RegExp(`original retail price of ${CUR}([\\d,]+(?:\\.\\d+)?)`, 'i'),
        new RegExp(`RRP[^£$€]{0,20}${CUR}([\\d,]+(?:\\.\\d+)?)`, 'i'),
      ];
      for (const re of retailPatterns) {
        const m = text.match(re);
        if (m) { retailPriceNarrative = parseFloat(m[1].replace(/,/g, '')); break; }
      }

      let currentValueNarrative = 0;
      const valuedMatch = text.match(new RegExp(`valued at ${CUR}([\\d,]+(?:\\.\\d+)?)`, 'i'));
      const avgMatch = text.match(new RegExp(`average (?:above|below) MSRP at ${CUR}([\\d,]+(?:\\.\\d+)?)`, 'i'));
      const rangeMatch = text.match(new RegExp(`range from ${CUR}([\\d,]+(?:\\.\\d+)?) to ${CUR}([\\d,]+(?:\\.\\d+)?)`, 'i'));
      if (avgMatch) {
        currentValueNarrative = parseFloat(avgMatch[1].replace(/,/g, ''));
      } else if (valuedMatch) {
        currentValueNarrative = parseFloat(valuedMatch[1].replace(/,/g, ''));
      } else if (rangeMatch) {
        const low = parseFloat(rangeMatch[1].replace(/,/g, ''));
        const high = parseFloat(rangeMatch[2].replace(/,/g, ''));
        currentValueNarrative = (low + high) / 2;
      }

      // ── Resolve final retail price (USD) ──
      // Priority: US regional price (always USD) > structured block > narrative
      // If we only have a local-currency price (structured/narrative) and no
      // USD regional price, scale the current value by the same local price
      // so ROI% stays correct even if absolute USD figures are approximate.
      const retailPriceLocalBest = retailPriceLocal || retailPriceNarrative;
      const currentValueLocalBest = currentValueLocal || currentValueNarrative;

      let retailPrice = retailPriceUSD;
      let currentValue = 0;

      if (retailPrice && retailPriceLocalBest && currentValueLocalBest) {
        // Scale local current value into USD using the local retail price as
        // the conversion anchor — preserves the real ROI% without needing
        // live FX rates.
        currentValue = Math.round((currentValueLocalBest / retailPriceLocalBest) * retailPrice * 100) / 100;
      } else if (retailPrice && currentValueLocalBest && !retailPriceLocalBest) {
        currentValue = currentValueLocalBest; // best effort, likely already USD-ish
      } else if (!retailPrice) {
        // No US regional price found at all — fall back to whatever currency
        // the page was served in (still better than 0; figures will be in
        // that currency's units, ROI% remains accurate).
        retailPrice = retailPriceLocalBest;
        currentValue = currentValueLocalBest;
      }

      if (!currentValue && retailPrice) currentValue = retailPrice;

      // Growth percentage — prefer the structured block, then narrative
      const growthMatch = text.match(/up ([\d,.]+)%/i);
      const growthDown = text.match(/down ([\d,.]+)%/i);
      let growth = growthFromBlock || 0;
      if (!growth) {
        if (growthMatch) growth = parseFloat(growthMatch[1].replace(/,/g, ''));
        else if (growthDown) growth = -parseFloat(growthDown[1].replace(/,/g, ''));
      }

      const cagrMatch = text.match(/annual growth (?:will be |of |close to )([\d,.]+)%/i);
      const annualGrowth = cagrMatch ? parseFloat(cagrMatch[1].replace(/,/g, '')) : 0;

      const isRetired = /is a .+ set valued at/i.test(text) || /retired/i.test(text.substring(0, 500));
      const isAvailable = /currently available at retail/i.test(text);
      const retired = isRetired && !isAvailable;

      const retireMatch = text.match(/projected to retire in (.+?)\./i);
      const retirementEstimate = retireMatch ? retireMatch[1].trim() : '';

      const forecastMatch = text.match(new RegExp(`valuing the set between ${CUR}([\\d,]+(?:\\.\\d+)?) and ${CUR}([\\d,]+(?:\\.\\d+)?)`, 'i'));
      let forecast2y = null;
      if (forecastMatch) {
        const low = parseFloat(forecastMatch[1].replace(/,/g, ''));
        const high = parseFloat(forecastMatch[2].replace(/,/g, ''));
        forecast2y = Math.round((low + high) / 2);
      }

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
      };
    }, BASE);

    if (!data.name && !data.setNumber) return null;

    if (!data.retailPrice && !data.currentValue) {
      const text = await page.evaluate(() => document.body.innerText || '');
      const html = await page.content();
      dumpDebugText(cleanId, text, html);
      console.log(`  ⚠️  ${cleanId}: price extraction failed — dumped debug text to data/debug-scrape/${cleanId}.txt`);
    }

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
