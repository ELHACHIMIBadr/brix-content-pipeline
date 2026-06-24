/**
 * BrickEconomy API data fetcher
 * Fetches set data, stores historical prices, calculates top movers
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const HISTORY_FILE = join(DATA_DIR, 'price-history.json');
const CACHE_FILE = join(DATA_DIR, 'sets-cache.json');
const API_BASE = 'https://www.brickeconomy.com/api/v1';

function loadCache() {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch { return null; }
}

function saveCache(results, date) {
  writeFileSync(CACHE_FILE, JSON.stringify({ _fetchDate: date, sets: results }, null, 2));
}

function loadHistory() {
  if (!existsSync(HISTORY_FILE)) return {};
  return JSON.parse(readFileSync(HISTORY_FILE, 'utf8'));
}

function saveHistory(history) {
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function loadTrackedSets() {
  const file = join(DATA_DIR, 'tracked-sets.json');
  return JSON.parse(readFileSync(file, 'utf8')).sets;
}

async function fetchSet(setNumber, apiKey) {
  const url = `${API_BASE}/set/${setNumber}?currency=USD`;
  const res = await fetch(url, {
    headers: {
      'accept': 'application/json',
      'x-apikey': apiKey,
      'User-Agent': 'BRIX-Content-Pipeline/1.0',
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`  ✗ ${setNumber}: HTTP ${res.status} — ${errText}`);
    return null;
  }

  const json = await res.json();
  return json.data;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch all tracked sets, update price history, return enriched data
 */
export async function fetchAllSets(apiKey) {
  const setNumbers = loadTrackedSets();
  const history = loadHistory();
  const today = new Date().toISOString().split('T')[0];
  const results = [];

  const isOffline = process.argv.includes('--offline');

  // Check if we already fetched today — use cache to save API quota
  const cached = loadCache();
  if (cached && cached._fetchDate === today && !process.argv.includes('--force-fetch')) {
    console.log(`📋 Already fetched today (${today}) — using cache (${cached.sets.length} sets)`);
    console.log('   (use --force-fetch to override)');
    return cached.sets;
  }

  if (isOffline) {
    if (cached) { console.log('📋 Offline mode — using cached data'); return cached.sets; }
    console.error('❌ No cache available'); return [];
  }

  console.log(`📦 Fetching ${setNumbers.length} sets from BrickEconomy...`);
  let rateLimited = false;

  for (const num of setNumbers) {
    const data = await fetchSet(num, apiKey);
    if (!data) {
      // If we get rate limited, stop and fall back to cache
      if (!rateLimited) rateLimited = true;
      if (results.length === 0 && rateLimited) {
        const cached = loadCache();
        if (cached) {
          console.log('⚠️  Rate limited — falling back to cached data');
          return cached.sets;
        }
      }
      continue;
    }

    // Update price history
    if (!history[num]) history[num] = [];
    const lastEntry = history[num][history[num].length - 1];
    if (!lastEntry || lastEntry.date !== today) {
      history[num].push({ date: today, value: data.current_value_new });
    }
    // Keep max 90 days of history
    if (history[num].length > 90) history[num] = history[num].slice(-90);

    // Calculate daily change from history
    const priceHistory = history[num];
    const prevValue = priceHistory.length >= 2 ? priceHistory[priceHistory.length - 2].value : data.current_value_new;
    const dailyChange = ((data.current_value_new - prevValue) / prevValue) * 100;

    // Calculate ROI from retail
    const retailPrice = data.retail_price_us || 0;
    const roi = retailPrice > 0 ? ((data.current_value_new - retailPrice) / retailPrice) * 100 : 0;

    results.push({
      set_number: data.set_number,
      name: data.name,
      theme: data.theme,
      subtheme: data.subtheme || '',
      year: data.year,
      pieces: data.pieces_count,
      retired: data.retired || false,
      retail_price: retailPrice,
      current_value: data.current_value_new,
      current_value_used: data.current_value_used || null,
      daily_change: Math.round(dailyChange * 100) / 100,
      roi: Math.round(roi * 100) / 100,
      rolling_growth_12m: data.rolling_growth_12months || 0,
      forecast_2y: data.forecast_value_new_2_years || null,
      forecast_5y: data.forecast_value_new_5_years || null,
      retired_date: data.retired_date || null,
      released_date: data.released_date || null,
      // Last 12 price events from API for charts
      price_events: (data.price_events_new || []).map(e => ({ date: e.date, value: e.value })),
      // Our local history for trend charts
      price_trend: priceHistory.slice(-12).map(e => e.value),
    });

    // Respect rate limits: ~4 req/min max
    await delay(1500);
  }

  saveHistory(history);
  if (results.length > 0) saveCache(results, today);
  console.log(`✅ Fetched ${results.length}/${setNumbers.length} sets`);
  return results;
}

/**
 * Best available movement score for a set.
 * Priority: daily_change (if we have history) → rolling_growth_12m → ROI from retail
 */
function movementScore(s) {
  if (s.daily_change && Math.abs(s.daily_change) > 0.01) return s.daily_change;
  if (s.rolling_growth_12m && Math.abs(s.rolling_growth_12m) > 0.01) return s.rolling_growth_12m;
  return s.roi || 0;
}

/**
 * Select sets for each template type
 * Smart fallback: when daily_change is 0 (first run), uses ROI or 12m growth instead
 */
export function selectContent(allSets) {
  // Filter out sets with zero movement everywhere — nothing interesting to show
  const interesting = allSets.filter(s => Math.abs(movementScore(s)) > 0.01);
  const pool = interesting.length >= 3 ? interesting : allSets;

  // Sort by best available positive movement
  const topPositive = [...pool]
    .filter(s => movementScore(s) > 0)
    .sort((a, b) => movementScore(b) - movementScore(a));

  // Sort by biggest absolute movement (for top movers)
  const topMovers = [...pool]
    .sort((a, b) => Math.abs(movementScore(b)) - Math.abs(movementScore(a)));

  // Retired sets sorted by ROI (for retirement watch — pick non-retired with high potential)
  const notRetired = pool.filter(s => !s.retired && s.roi > 0).sort((a, b) => b.roi - a.roi);

  // By absolute ROI
  const byROI = [...pool].sort((a, b) => (b.roi || 0) - (a.roi || 0));

  // Top gainers: pick top 3 with positive movement, exclude zeros
  const topGainers = topPositive.slice(0, 3);

  // Price alert: biggest single positive mover (only if significant)
  const alertCandidate = topPositive[0] || null;
  const priceAlert = alertCandidate && Math.abs(movementScore(alertCandidate)) > 1 ? alertCandidate : null;

  // Weekly wrap: best gainer + worst loser
  const topLoser = [...pool].filter(s => movementScore(s) < 0).sort((a, b) => movementScore(a) - movementScore(b))[0] || null;

  return {
    topGainers: topGainers.length >= 3 ? topGainers : topMovers.slice(0, 3),
    deepDive: byROI[0] || null,
    priceAlert,
    retirementWatch: notRetired[0] || null,
    weeklyWrap: {
      totalSets: allSets.length,
      avgMovement: allSets.reduce((s, x) => s + (x.daily_change || 0), 0) / allSets.length,
      topGainer: topPositive[0] || byROI[0] || null,
      topLoser,
      retiredCount: allSets.filter(s => s.retired).length,
      athCount: topPositive.filter(s => movementScore(s) > 5).length,
    },
    setVsSet: byROI.length >= 2 ? [byROI[0], byROI[1]] : null,
  };
}
