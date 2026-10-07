import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import { calcSMA, calcRSI, calcVolatility, fmt } from "./market.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

// Reads ANTHROPIC_API_KEY from the environment; retries 429/5xx twice by default.
const client = new Anthropic({ timeout: 60_000 });

const PREDICTION_SCHEMA = {
  type: "object",
  properties: {
    signal: { type: "string", enum: ["BUY", "HOLD", "SELL"] },
    confidence: { type: "number" },
    targetPrice1d: { type: "number" },
    targetPrice7d: { type: "number" },
    targetPrice30d: { type: "number" },
    summary: { type: "string" },
    bullCase: { type: "string" },
    bearCase: { type: "string" },
    keyRisks: { type: "array", items: { type: "string" } },
  },
  required: [
    "signal", "confidence", "targetPrice1d", "targetPrice7d", "targetPrice30d",
    "summary", "bullCase", "bearCase", "keyRisks",
  ],
  additionalProperties: false,
};

export async function getAIPrediction(asset) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");

  const chartData = asset.chartData ?? [];
  if (chartData.length < 15) throw new Error(`Not enough price history for ${asset.symbol}`);

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
- 24h Change: ${asset.change?.toFixed(2) ?? "N/A"}%
- 7-day trend: ${trend} (${trendStrength}% move over 7 days)
- 7-day SMA: $${fmt(sma7)}
- 14-day SMA: $${fmt(sma14)}
- RSI (14): ${rsi?.toFixed(1) ?? "N/A"}
- Daily Volatility: ${volatility}%
- Market Cap: ${asset.marketCap ? "$" + fmt(asset.marketCap / 1e9, 2) + "B" : "N/A"}
- Volume: ${asset.volume ? "$" + fmt(asset.volume / 1e6, 1) + "M" : "N/A"}
- Recent price history (7 days, oldest to newest): ${priceHistory.map(p => "$" + fmt(p)).join(", ")}

Fill in every field of the response schema. "confidence" is 0-100. "summary" is a 2-3 sentence plain English analysis referencing the actual indicators; "bullCase" and "bearCase" are one sentence each; "keyRisks" lists three risks.`;

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: PREDICTION_SCHEMA },
    },
    // If the model declines, Anthropic re-runs the request on its recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") throw new Error("Model declined the request");
  if (response.stop_reason === "max_tokens") throw new Error("Model response was cut off");

  const text = response.content.find(b => b.type === "text")?.text ?? "";
  return JSON.parse(text);
}
