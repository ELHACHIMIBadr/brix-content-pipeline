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
const API_BASE = 'https://www.brickeconomy.com/api/v1';

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

  console.log(`📦 Fetching ${setNumbers.length} sets from BrickEconomy...`);

  for (const num of setNumbers) {
    const data = await fetchSet(num, apiKey);
    if (!data) continue;

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
  console.log(`✅ Fetched ${results.length}/${setNumbers.length} sets`);
  return results;
}

/**
 * Select sets for each template type
 */
export function selectContent(allSets) {
  const sorted = [...allSets].sort((a, b) => Math.abs(b.daily_change) - Math.abs(a.daily_change));
  const gainers = allSets.filter(s => s.daily_change > 0).sort((a, b) => b.daily_change - a.daily_change);
  const losers = allSets.filter(s => s.daily_change < 0).sort((a, b) => a.daily_change - b.daily_change);
  const retired = allSets.filter(s => !s.retired).sort((a, b) => (b.roi || 0) - (a.roi || 0));
  const byROI = [...allSets].sort((a, b) => b.roi - a.roi);

  return {
    // Template 1: Top Gainers — top 3 biggest movers
    topGainers: sorted.slice(0, 3),

    // Template 2: Deep Dive — highest ROI set not featured elsewhere
    deepDive: byROI[0] || null,

    // Template 3: Price Alert — set with biggest absolute price change
    priceAlert: gainers[0] || null,

    // Template 4: Retirement Watch — non-retired set with highest ROI potential
    retirementWatch: retired[0] || null,

    // Template 5: Weekly Wrap (generated only on Mondays)
    weeklyWrap: {
      totalSets: allSets.length,
      avgMovement: allSets.reduce((s, x) => s + x.daily_change, 0) / allSets.length,
      topGainer: gainers[0] || null,
      topLoser: losers[0] || null,
      retiredCount: allSets.filter(s => s.retired).length,
      athCount: gainers.filter(s => s.daily_change > 5).length,
    },

    // Template 6: Set vs Set — top 2 by ROI
    setVsSet: byROI.length >= 2 ? [byROI[0], byROI[1]] : null,
  };
}
