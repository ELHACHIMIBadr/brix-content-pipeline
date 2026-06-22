# BRIX Content Pipeline

Automated LEGO investment content generation for TikTok & Instagram.  
Generates carousel posts with real market data, renders them as PNGs, writes AI captions, and publishes via Buffer.

## Architecture

```
GitHub Actions (cron 7h + 17h UTC)
    ↓
  BrickEconomy API → set prices, ROI, trends
  Rebrickable API  → official LEGO product photos
    ↓
  HTML templates + Puppeteer → 1080×1920 PNG slides
    ↓
  Claude API → SEO captions + hashtags
    ↓
  Buffer API → auto-publish to TikTok + Instagram
```

## 6 Content Templates

| Template | Frequency | Slides | Description |
|----------|-----------|--------|-------------|
| Top Gainers | Daily | 5 | Top 3 movers by daily change |
| Deep Dive | Tue/Thu/Sat | 5 | Full analysis of one set |
| Price Alert | Daily | 2 | Set crosses price milestone |
| Retirement Watch | Tue/Fri | 3 | Set retiring soon = buy opportunity |
| Weekly Wrap | Monday | 4 | Week in review digest |
| Set vs Set | Mon/Wed/Fri | 5 | Head-to-head investment comparison |

## Setup

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/brix-content-pipeline.git
cd brix-content-pipeline
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your API keys
```

### 3. Get your API keys

- **BrickEconomy**: Your existing API key (100 req/day)
- **Rebrickable**: Free at https://rebrickable.com/api/
- **Claude API**: https://console.anthropic.com — load $5 credits
- **Buffer**: https://buffer.com → Settings → API → Personal API Key

### 4. Get Buffer channel IDs

After connecting TikTok + Instagram in Buffer:
```bash
# Use Buffer's API Explorer to find your org and channel IDs
curl -H "Authorization: Bearer YOUR_BUFFER_KEY" https://api.buffer.com \
  -d '{"query": "{ organizations { id name channels { id name service } } }"}'
```

### 5. Test locally

```bash
# Dry run — generates slides + captions but doesn't publish
node src/index.js --dry-run

# Test a specific template
node src/index.js --template top-gainers --dry-run
```

Output goes to `output/slides/` and `output/images/`.

### 6. Deploy to GitHub

Add these secrets to your repo (Settings → Secrets → Actions):

- `BRICKECONOMY_API_KEY`
- `REBRICKABLE_API_KEY`
- `CLAUDE_API_KEY`
- `BUFFER_API_KEY`
- `BUFFER_ORG_ID`
- `BUFFER_IG_CHANNEL_ID`
- `BUFFER_TIKTOK_CHANNEL_ID`

The pipeline runs automatically at 7:00 and 17:00 UTC via GitHub Actions.

## Customization

### Add/remove tracked sets

Edit `data/tracked-sets.json`. Keep under 80 sets to stay within the 100 req/day BrickEconomy limit.

### Modify templates

HTML templates are in `templates/`. They use `{{VARIABLE}}` placeholders filled by `src/render-slides.js`. Slides render at 1080×1920 (9:16).

### Change schedule

Edit `.github/workflows/publish.yml` cron expressions. Current: 7:00 and 17:00 UTC.

### Change template rotation

Edit `getTodayTemplates()` in `src/index.js` to change which templates run on which days.

## Costs

| Service | Monthly Cost |
|---------|-------------|
| BrickEconomy API | Already paid |
| Rebrickable API | Free |
| Claude API (~60 captions) | ~$0.60 |
| Buffer (TikTok + IG) | $12 (Essentials) or Free (10 posts/channel) |
| GitHub Actions | Free (within 2000 min/month) |
| **Total** | **~$13/month** |

## File Structure

```
brix-content-pipeline/
├── .github/workflows/publish.yml   ← GitHub Actions cron
├── data/
│   ├── tracked-sets.json           ← Sets to monitor
│   └── price-history.json          ← Auto-generated price cache
├── templates/                      ← 16 HTML slide templates
├── src/
│   ├── index.js                    ← Main orchestrator
│   ├── fetch-data.js               ← BrickEconomy API + data selection
│   ├── get-images.js               ← Rebrickable set photos
│   ├── render-slides.js            ← Puppeteer HTML → PNG
│   ├── gen-caption.js              ← Claude API captions
│   └── publish.js                  ← Buffer GraphQL API
├── output/                         ← Generated slides + images (gitignored)
├── .env.example
├── package.json
└── README.md
```
