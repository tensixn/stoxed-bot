import fetch from "node-fetch";

// ── Constants ────────────────────────────────────────────────────────────────
export const CRYPTO_IDS = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", BNB: "binancecoin",
  ADA: "cardano", DOGE: "dogecoin", XRP: "ripple", AVAX: "avalanche-2",
};

const AV_KEY = process.env.ALPHA_VANTAGE_KEY || "demo";

// ── Formatters ────────────────────────────────────────────────────────────────
export const fmt = (n, decimals = 2) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

// ── Mock chart data ───────────────────────────────────────────────────────────
export function generateMockChart(basePrice, days = 30) {
  const data = [];
  let price = basePrice * (0.85 + Math.random() * 0.1);
  for (let i = days; i >= 0; i--) {
    price = price * (1 + (Math.random() - 0.48) * 0.03);
    data.push({ day: i === 0 ? "Now" : `-${i}d`, price: parseFloat(price.toFixed(2)) });
  }
  data[data.length - 1].price = basePrice;
  return data;
}

// ── Technical indicators ──────────────────────────────────────────────────────
export function calcSMA(data, window) {
  if (data.length < window) return null;
  const slice = data.slice(-window);
  return slice.reduce((s, d) => s + d.price, 0) / window;
}

export function calcRSI(data, period = 14) {
  if (data.length < period + 1) return null;
  const changes = data.slice(-period - 1).map((d, i, arr) =>
    i === 0 ? 0 : d.price - arr[i - 1].price
  ).slice(1);
  const gains = changes.filter(c => c > 0).reduce((s, c) => s + c, 0) / period;
  const losses = Math.abs(changes.filter(c => c < 0).reduce((s, c) => s + c, 0)) / period;
  if (losses === 0) return 100;
  return 100 - (100 / (1 + gains / losses));
}

export function calcVolatility(data) {
  if (data.length < 5) return null;
  const returns = data.slice(-10).map((d, i, arr) =>
    i === 0 ? 0 : (d.price - arr[i - 1].price) / arr[i - 1].price
  ).slice(1);
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
  return (Math.sqrt(variance) * 100).toFixed(2);
}

// ── API fetchers ──────────────────────────────────────────────────────────────
export async function fetchCryptoData(symbol) {
  const id = CRYPTO_IDS[symbol.toUpperCase()];
  if (!id) throw new Error("Unknown crypto symbol");

  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${id}&price_change_percentage=24h`
  );
  const [coin] = await res.json();
  if (!coin) throw new Error("Not found");

  return {
    symbol: symbol.toUpperCase(),
    name: coin.name,
    price: coin.current_price,
    change: coin.price_change_percentage_24h,
    marketCap: coin.market_cap,
    volume: coin.total_volume,
    type: "crypto",
    chartData: generateMockChart(coin.current_price),
  };
}

export async function fetchStockData(symbol) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error("Not found");

  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose;
  const change = ((price - prevClose) / prevClose) * 100;

  return {
    symbol: symbol.toUpperCase(),
    name: meta.longName || symbol.toUpperCase(),
    price,
    change,
    marketCap: null,
    volume: meta.regularMarketVolume,
    type: "stock",
    chartData: generateMockChart(price),
  };
}