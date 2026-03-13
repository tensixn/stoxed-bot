# Stoxed Telegram Bot

A Telegram bot for tracking crypto & stock prices with AI-powered predictions.

## Commands

| Command | Description |
|---|---|
| `/price BTC` | Live price + 24h change |
| `/predict ETH` | AI analysis with signal, targets, risks |
| `/watch SOL` | Add to your watchlist |
| `/watchlist` | View all watched assets with prices |
| `/unwatch <symbol>` | Remove from watchlist |
| `/addholding <symbol> <qty> <cost>` | Track a position (symbol, qty, cost basis) |
| `/portfolio` | View all holdings with P&L |
| `/alert <symbol> <price>` | Get notified when price crosses a level |
| `/alerts` | View your active alerts |
| `/removealert <id>` | Remove an alert by ID |
| `/news` | Returns top market headlines |
| `/news <symbol>` | Returns news for a specific asset |

## Supported Assets

**Crypto:** BTC, ETH, SOL, BNB, ADA, DOGE, XRP, AVAX

**Stocks:** Any symbol supported by Alpha Vantage (IBM works on demo key; upgrade for AAPL, TSLA etc.)

---

## Deploying 24/7 (so it runs when your computer is off)

### Railway (recommended, free tier available)
1. Push this folder to a GitHub repo
2. Go to https://railway.app → New Project → Deploy from GitHub
3. Add your environment variables in the Railway dashboard
4. Done — it runs forever

### Render
1. Push to GitHub
2. Go to https://render.com → New Web Service
3. Set start command to `node bot.js`
4. Add env vars and deploy

---

## Project Structure

```
mktwatch-bot/
├── bot.js        # Main bot — all commands and alert checker
├── market.js     # CoinGecko + Alpha Vantage API + technical indicators
├── ai.js         # Claude API integration for predictions
├── db.js         # JSON file database (watchlist, holdings, alerts)
├── .env          # Your secret keys (never commit this)
└── mktwatch.json # Auto-created database file
```
