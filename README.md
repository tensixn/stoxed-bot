# MKTWATCH Telegram Bot

A Telegram bot for tracking crypto & stock prices with AI-powered predictions.

## Setup (5 minutes)

### 1. Get your Telegram bot token
1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Follow the prompts — pick a name and username
4. Copy the token it gives you

### 2. Configure your environment
```bash
cp .env.example .env
```
Open `.env` and paste your token:
```
TELEGRAM_BOT_TOKEN=123456:ABC-your-token-here
ALPHA_VANTAGE_KEY=demo
```
> Get a free Alpha Vantage key at https://www.alphavantage.co/support/#api-key
> (optional — demo key works for IBM only)

### 3. Install & run
```bash
npm install
node bot.js
```

Your bot is now live! Open Telegram and message your bot.

---

## Commands

| Command | Description |
|---|---|
| `/price BTC` | Live price + 24h change |
| `/predict ETH` | AI analysis with signal, targets, risks |
| `/watch SOL` | Add to your watchlist |
| `/watchlist` | View all watched assets with prices |
| `/unwatch BTC` | Remove from watchlist |
| `/addholding BTC 0.5 45000` | Track a position (symbol, qty, cost basis) |
| `/portfolio` | View all holdings with P&L |
| `/alert BTC 90000` | Get notified when price crosses a level |
| `/alerts` | View your active alerts |
| `/removealert 1` | Remove an alert by ID |

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
