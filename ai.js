import fetch from "node-fetch";
import "dotenv/config";
import { calcSMA, calcRSI, calcVolatility, fmt } from "./market.js";

export async function getAIPrediction(asset) {
  const chartData = asset.chartData;
  const sma7 = calcSMA(chartData, 7);
  const sma14 = calcSMA(chartData, 14);
  const rsi = calcRSI(chartData);
  const volatility = calcVolatility(chartData);
  const priceHistory = chartData.slice(-7).map(d => d.price);
  const trend = priceHistory[priceHistory.length - 1] > priceHistory[0] ? "upward" : "downward";
  const trendStrength = Math.abs(
    ((priceHistory[priceHistory.length - 1] - priceHistory[0]) / priceHistory[0]) * 100
  ).toFixed(2);

  const prompt = `You are a financial analyst AI embedded in a Telegram stock/crypto tracking bot. Analyze the following market data for ${asset.symbol} (${asset.name}) and provide a short-term price prediction.

CURRENT MARKET DATA:
- Asset: ${asset.symbol} (${asset.type})
- Current Price: $${fmt(asset.price)}
- 24h Change: ${asset.change?.toFixed(2)}%
- 7-day trend: ${trend} (${trendStrength}% move over 7 days)
- 7-day SMA: $${fmt(sma7)}
- 14-day SMA: $${fmt(sma14)}
- RSI (14): ${rsi?.toFixed(1) ?? "N/A"}
- Daily Volatility: ${volatility}%
- Market Cap: ${asset.marketCap ? "$" + fmt(asset.marketCap / 1e9, 2) + "B" : "N/A"}
- Volume: ${asset.volume ? "$" + fmt(asset.volume / 1e6, 1) + "M" : "N/A"}
- Recent price history (7 days, oldest to newest): ${priceHistory.map(p => "$" + fmt(p)).join(", ")}

Respond ONLY with a valid JSON object — no markdown, no backticks, no preamble:
{
  "signal": "BUY" | "HOLD" | "SELL",
  "confidence": number between 0 and 100,
  "targetPrice1d": number,
  "targetPrice7d": number,
  "targetPrice30d": number,
  "summary": "2-3 sentence plain English analysis referencing the actual indicators",
  "bullCase": "1 sentence",
  "bearCase": "1 sentence",
  "keyRisks": ["risk1", "risk2", "risk3"]
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
    "Content-Type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01", 
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  console.log("API response:", JSON.stringify(data, null, 2));
  const text = data.content?.find(b => b.type === "text")?.text ?? "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}
