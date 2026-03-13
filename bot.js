import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import fetch from "node-fetch";
import db from "./db.js";
import {
  fetchCryptoData,
  fetchStockData,
  calcRSI,
  calcSMA,
  calcVolatility,
  generateMockChart,
  fmt,
} from "./market.js";
import { getAIPrediction } from "./ai.js";

// ── Bot setup ────────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("❌ Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ── Helpers ──────────────────────────────────────────────────────────────────
const esc = (text) =>
  String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");

function signalEmoji(signal) {
  return signal === "BUY" ? "🟢" : signal === "SELL" ? "🔴" : "🟡";
}

function changeEmoji(pct) {
  return pct >= 0 ? "📈" : "📉";
}

// ── /start ───────────────────────────────────────────────────────────────────
bot.start((ctx) => {
  const name = ctx.from.first_name || "there";
  ctx.replyWithMarkdownV2(
    `👋 *Hey ${esc(name)}\\!* Welcome to *Stoxed*\n\n` +
    `Here's what I can do:\n\n` +
    `📊 \`/price <symbol>\` — live price & stats\n` +
    `🤖 \`/predict <symbol>\` — AI price prediction\n` +
    `👀 \`/watch <symbol>\` — add to your watchlist\n` +
    `📋 \`/watchlist\` — view your watchlist\n` +
    `🗑 \`/unwatch <symbol>\` — remove from watchlist\n` +
    `💼 \`/portfolio\` — P&L on tracked holdings\n` +
    `⚠️ \`/alert <symbol> 90000\` — price alert\n` +
    `📰 \`/news\` — top market headlines\n` +
    `📰 \`/news <symbol\` — news for a specific asset\n` +
    `❓ \`/help\` — show this menu again\n\n` +
    `Supports crypto \\(BTC, ETH, SOL, BNB, ADA, XRP, DOGE, AVAX\\) and stocks \\(IBM, AAPL etc\\.\\)`
  );
});

bot.help((ctx) => ctx.reply(
  "Commands:\n\n" +
  "/price <symbol> — live price\n" +
  "/predict <symbol> — AI prediction\n" +
  "/watch <symbol> — add to watchlist\n" +
  "/watchlist — view watchlist\n" +
  "/unwatch <symbol> — remove from watchlist\n" +
  "/portfolio — view P&L\n" +
  "/alert <symbol> <price> — set price alert\n" +
  "/alerts — view your alerts\n" +
  "/removealert <id> — remove an alert\n"+
  "/news — returns top market headlines\n" +
  "/news <symbol> — returns news related to the symbol"
));

// ── /price ───────────────────────────────────────────────────────────────────
bot.command("price", async (ctx) => {
  const parts = ctx.message.text.split(" ");
  const symbol = parts[1]?.toUpperCase();
  if (!symbol) return ctx.reply("Usage: /price BTC\nExample: /price ETH");

  const msg = await ctx.reply("⏳ Fetching price...");

  try {
    const asset = await fetchCryptoData(symbol).catch(() => fetchStockData(symbol));
    const arrow = asset.change >= 0 ? "▲" : "▼";
    const changeStr = `${arrow} ${Math.abs(asset.change).toFixed(2)}%`;

    await ctx.telegram.editMessageText(
      ctx.chat.id, msg.message_id, null,
      `*${esc(asset.name)} \\(${esc(asset.symbol)}\\)*\n\n` +
      `💵 *Price:* \\$${esc(fmt(asset.price))}\n` +
      `${changeEmoji(asset.change)} *24h:* ${esc(changeStr)}\n` +
      (asset.marketCap ? `📦 *Market Cap:* \\$${esc(fmt(asset.marketCap / 1e9, 2))}B\n` : "") +
      (asset.volume ? `📊 *Volume:* \\$${esc(fmt(asset.volume / 1e6, 1))}M\n` : "") +
      `\n_Type /predict ${esc(symbol)} for AI analysis_`,
      { parse_mode: "MarkdownV2" }
    );
  } catch (e) {
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
      `❌ Couldn't find *${esc(symbol)}*\\. Try: BTC, ETH, SOL, IBM`,
      { parse_mode: "MarkdownV2" }
    );
  }
});

// ── /predict ─────────────────────────────────────────────────────────────────
bot.command("predict", async (ctx) => {
  const parts = ctx.message.text.split(" ");
  const symbol = parts[1]?.toUpperCase();
  if (!symbol) return ctx.reply("Usage: /predict BTC\nExample: /predict ETH");

  const msg = await ctx.reply("🤖 Analyzing market signals...");

  try {
    const asset = await fetchCryptoData(symbol).catch(() => fetchStockData(symbol));
    const prediction = await getAIPrediction(asset);

    const sig = signalEmoji(prediction.signal);
    const p1pct = (((prediction.targetPrice1d - asset.price) / asset.price) * 100).toFixed(1);
    const p7pct = (((prediction.targetPrice7d - asset.price) / asset.price) * 100).toFixed(1);
    const p30pct = (((prediction.targetPrice30d - asset.price) / asset.price) * 100).toFixed(1);
    const sign = (v) => (parseFloat(v) >= 0 ? "\\+" : "");

    await ctx.telegram.editMessageText(
      ctx.chat.id, msg.message_id, null,
      `${sig} *${esc(asset.symbol)} — ${esc(prediction.signal)}* \\(${esc(prediction.confidence)}% confidence\\)\n\n` +
      `💵 *Current:* \\$${esc(fmt(asset.price))}\n\n` +
      `🎯 *Price Targets:*\n` +
      `  • 1 day:  \\$${esc(fmt(prediction.targetPrice1d))} \\(${sign(p1pct)}${esc(p1pct)}%\\)\n` +
      `  • 7 days: \\$${esc(fmt(prediction.targetPrice7d))} \\(${sign(p7pct)}${esc(p7pct)}%\\)\n` +
      `  • 30 days: \\$${esc(fmt(prediction.targetPrice30d))} \\(${sign(p30pct)}${esc(p30pct)}%\\)\n\n` +
      `📝 *Analysis:*\n${esc(prediction.summary)}\n\n` +
      `🟢 *Bull:* ${esc(prediction.bullCase)}\n` +
      `🔴 *Bear:* ${esc(prediction.bearCase)}\n\n` +
      `⚠️ *Risks:*\n${prediction.keyRisks.map(r => `• ${esc(r)}`).join("\n")}\n\n` +
      `_Not financial advice\\. Educational purposes only\\._`,
      { parse_mode: "MarkdownV2" }
    );
  } catch (e) {
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
      `❌ Prediction failed for *${esc(symbol)}*\\. Please try again\\.`,
      { parse_mode: "MarkdownV2" }
    );
  }
});

// ── /watch ───────────────────────────────────────────────────────────────────
bot.command("watch", async (ctx) => {
  const parts = ctx.message.text.split(" ");
  const symbol = parts[1]?.toUpperCase();
  if (!symbol) return ctx.reply("Usage: /watch BTC");

  try {
    const asset = await fetchCryptoData(symbol).catch(() => fetchStockData(symbol));
    db.addToWatchlist(ctx.from.id, asset.symbol, asset.type);
    ctx.reply(`👀 Added *${asset.symbol}* to your watchlist\\!`, { parse_mode: "MarkdownV2" });
  } catch (e) {
    ctx.reply(`❌ Couldn't find *${esc(symbol)}*\\.`, { parse_mode: "MarkdownV2" });
  }
});

// ── /unwatch ─────────────────────────────────────────────────────────────────
bot.command("unwatch", async (ctx) => {
  const parts = ctx.message.text.split(" ");
  const symbol = parts[1]?.toUpperCase();
  if (!symbol) return ctx.reply("Usage: /unwatch BTC");

  db.removeFromWatchlist(ctx.from.id, symbol);
  ctx.reply(`🗑 Removed *${esc(symbol)}* from your watchlist\\.`, { parse_mode: "MarkdownV2" });
});

// ── /watchlist ────────────────────────────────────────────────────────────────
bot.command("watchlist", async (ctx) => {
  const items = db.getWatchlist(ctx.from.id);
  if (!items.length) return ctx.reply("Your watchlist is empty\\. Use /watch BTC to add assets\\.", { parse_mode: "MarkdownV2" });

  const msg = await ctx.reply("⏳ Fetching prices...");

  try {
    const results = await Promise.allSettled(
      items.map(item =>
        item.type === "crypto"
          ? fetchCryptoData(item.symbol)
          : fetchStockData(item.symbol)
      )
    );

    let text = `📋 *Your Watchlist*\n\n`;
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        const a = result.value;
        const arrow = a.change >= 0 ? "▲" : "▼";
        text += `*${esc(a.symbol)}* \\$${esc(fmt(a.price))} ${esc(arrow)} ${esc(Math.abs(a.change).toFixed(2))}%\n`;
      } else {
        text += `*${esc(items[i].symbol)}* — unavailable\n`;
      }
    });

    text += `\n_Use /predict <\\symbol\\> for AI analysis_`;
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, text, { parse_mode: "MarkdownV2" });
  } catch (e) {
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "❌ Failed to fetch watchlist prices\\.", { parse_mode: "MarkdownV2" });
  }
});

// ── /portfolio ────────────────────────────────────────────────────────────────
bot.command("portfolio", async (ctx) => {
  const holdings = db.getHoldings(ctx.from.id);

  if (!holdings.length) {
    return ctx.replyWithMarkdownV2(
      "💼 No holdings tracked yet\\.\n\n" +
      "Add one with:\n`/addholding BTC 0\\.5 45000`\n" +
      "_\\(symbol, quantity, cost basis per unit\\)_"
    );
  }

  const msg = await ctx.reply("⏳ Calculating portfolio...");

  try {
    const results = await Promise.allSettled(
      holdings.map(h =>
        h.type === "crypto" ? fetchCryptoData(h.symbol) : fetchStockData(h.symbol)
      )
    );

    let totalValue = 0, totalCost = 0;
    let lines = "";

    results.forEach((result, i) => {
      const h = holdings[i];
      if (result.status === "fulfilled") {
        const a = result.value;
        const value = a.price * h.shares;
        const cost = h.costBasis * h.shares;
        const pnl = value - cost;
        const pnlPct = ((pnl / cost) * 100).toFixed(1);
        totalValue += value;
        totalCost += cost;
        const arrow = pnl >= 0 ? "▲" : "▼";
        lines += `*${esc(h.symbol)}* ${esc(h.shares)} units\n`;
        lines += `  \\$${esc(fmt(a.price))} • P&L: ${pnl >= 0 ? "\\+" : ""}${esc(fmt(pnl))} \\(${pnl >= 0 ? "\\+" : ""}${esc(pnlPct)}%\\)\n\n`;
      }
    });

    const totalPnl = totalValue - totalCost;
    const totalPct = ((totalPnl / totalCost) * 100).toFixed(1);

    await ctx.telegram.editMessageText(
      ctx.chat.id, msg.message_id, null,
      `💼 *Portfolio Summary*\n\n` +
      lines +
      `━━━━━━━━━━━━━━━\n` +
      `💵 *Total Value:* \\$${esc(fmt(totalValue))}\n` +
      `📊 *Total P&L:* ${totalPnl >= 0 ? "\\+" : ""}\\$${esc(fmt(Math.abs(totalPnl)))} \\(${totalPnl >= 0 ? "\\+" : ""}${esc(totalPct)}%\\)`,
      { parse_mode: "MarkdownV2" }
    );
  } catch (e) {
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, "❌ Failed to fetch portfolio data\\.", { parse_mode: "MarkdownV2" });
  }
});

// ── /addholding ───────────────────────────────────────────────────────────────
bot.command("addholding", async (ctx) => {
  const parts = ctx.message.text.split(" ");
  const symbol = parts[1]?.toUpperCase();
  const shares = parseFloat(parts[2]);
  const costBasis = parseFloat(parts[3]);

  if (!symbol || isNaN(shares) || isNaN(costBasis)) {
    return ctx.reply("Usage: /addholding BTC 0.5 45000\n(symbol, quantity, cost per unit)");
  }

  try {
    const asset = await fetchCryptoData(symbol).catch(() => fetchStockData(symbol));
    db.addHolding(ctx.from.id, symbol, asset.type, shares, costBasis);
    ctx.replyWithMarkdownV2(
      `💼 Added holding:\n*${esc(symbol)}* — ${esc(String(shares))} units @ \\$${esc(fmt(costBasis))}`
    );
  } catch (e) {
    ctx.reply(`❌ Symbol not found: ${symbol}`);
  }
});

// ── /alert ────────────────────────────────────────────────────────────────────
bot.command("alert", async (ctx) => {
  const parts = ctx.message.text.split(" ");
  const symbol = parts[1]?.toUpperCase();
  const targetPrice = parseFloat(parts[2]);

  if (!symbol || isNaN(targetPrice)) {
    return ctx.reply("Usage: /alert BTC 90000\n(triggers when price crosses that level)");
  }

  db.addAlert(ctx.from.id, symbol, targetPrice);
  ctx.replyWithMarkdownV2(
    `⚠️ Alert set\\! I'll notify you when *${esc(symbol)}* crosses \\$${esc(fmt(targetPrice))}\\.`
  );
});

// ── /alerts ───────────────────────────────────────────────────────────────────
bot.command("alerts", (ctx) => {
  const alerts = db.getAlerts(ctx.from.id);
  if (!alerts.length) return ctx.reply("No alerts set\\. Use /alert BTC 90000 to add one\\.", { parse_mode: "MarkdownV2" });

  let text = `⚠️ *Your Alerts*\n\n`;
  alerts.forEach(a => {
    text += `ID ${esc(String(a.id))}: *${esc(a.symbol)}* → \\$${esc(fmt(a.targetPrice))}\n`;
  });
  text += `\n_Use /removealert \\<id\\> to delete_`;
  ctx.replyWithMarkdownV2(text);
});

// ── /news ─────────────────────────────────────────────────────────────────────
bot.command("news", async (ctx) => {
  const parts = ctx.message.text.split(" ");
  const symbol = parts[1]?.toUpperCase();
  const query = symbol ? `${symbol} stock crypto` : "stock market crypto";
  const label = symbol ? `*${esc(symbol)} News*` : `*Market News*`;

  const msg = await ctx.reply("📰 Fetching latest news...");

  try {
    const res = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=5&apiKey=${process.env.NEWS_API_KEY}`
    );
    const json = await res.json();

    if (!json.articles?.length) {
      return ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
        "❌ No news found\\. Try `/news BTC` or `/news AAPL`\\.", { parse_mode: "MarkdownV2" });
    }

    let text = `📰 ${label}\n\n`;
    json.articles.forEach((article, i) => {
      const time = new Date(article.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      text += `*${i + 1}\\. ${esc(article.title)}*\n`;
      text += `_${esc(article.source.name)} • ${esc(time)}_\n`;
      if (article.description) {
        const desc = article.description.slice(0, 120) + (article.description.length > 120 ? "…" : "");
        text += `${esc(desc)}\n`;
      }
      text += `[Read more](${article.url})\n\n`;
    });

    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, text, {
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    });
  } catch (e) {
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
      "❌ Failed to fetch news\\. Please try again\\.", { parse_mode: "MarkdownV2" });
  }
});

// ── /removealert ──────────────────────────────────────────────────────────────
bot.command("removealert", (ctx) => {
  const id = parseInt(ctx.message.text.split(" ")[1]);
  if (isNaN(id)) return ctx.reply("Usage: /removealert 1");
  db.removeAlert(id, ctx.from.id);
  ctx.reply(`🗑 Alert #${id} removed.`);
});

// ── Price alert checker (every 5 minutes) ─────────────────────────────────────
async function checkAlerts() {
  const alerts = db.getAllAlerts();
  if (!alerts.length) return;

  for (const alert of alerts) {
    try {
      const asset = await fetchCryptoData(alert.symbol).catch(() => fetchStockData(alert.symbol));
      const crossed =
        (alert.lastPrice && alert.lastPrice < alert.targetPrice && asset.price >= alert.targetPrice) ||
        (alert.lastPrice && alert.lastPrice > alert.targetPrice && asset.price <= alert.targetPrice);

      db.updateAlertLastPrice(alert.id, asset.price);

      if (crossed) {
        const direction = asset.price >= alert.targetPrice ? "🚀 crossed above" : "📉 dropped below";
        await bot.telegram.sendMessage(
          alert.userId,
          `⚠️ *Alert triggered\\!*\n\n*${esc(alert.symbol)}* has ${direction} \\$${esc(fmt(alert.targetPrice))}\n` +
          `Current price: \\$${esc(fmt(asset.price))}`,
          { parse_mode: "MarkdownV2" }
        );
      }
    } catch (e) {
      // silently skip failed checks
    }
  }
}

setInterval(checkAlerts, 5 * 60 * 1000); // every 5 min

// ── Launch ────────────────────────────────────────────────────────────────────
bot.launch();
console.log("🚀 MKTWATCH bot is running...");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
