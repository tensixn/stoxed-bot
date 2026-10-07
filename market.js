// ── Constants ────────────────────────────────────────────────────────────────
export const CRYPTO_IDS = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", BNB: "binancecoin",
  ADA: "cardano", DOGE: "dogecoin", XRP: "ripple", AVAX: "avalanche-2",
};

const REQUEST_TIMEOUT_MS = 10_000;
const QUOTE_TTL_MS = 60_000;          // reuse a price for 1 min
const HISTORY_TTL_MS = 15 * 60_000;   // daily candles barely change

// Optional free CoinGecko "demo" key — keyless calls share a much smaller rate limit.
const COINGECKO_HEADERS = process.env.COINGECKO_API_KEY
  ? { "x-cg-demo-api-key": process.env.COINGECKO_API_KEY }
  : {};

// ── Formatters ────────────────────────────────────────────────────────────────
export const fmt = (n, decimals = 2) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

// ── HTTP helpers ──────────────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function fetchJson(url, options = {}) {
  const host = new URL(url).host;
  let res;
  try {
    res = await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (e) {
    throw new ApiError(`Request to ${host} failed: ${e.message}`);
  }
  if (!res.ok) {
    const hint = res.status === 429 ? " (rate limited)" : "";
    throw new ApiError(`${host} returned HTTP ${res.status}${hint}`, res.status);
  }
  return res.json();
}

const cache = new Map();
async function cached(key, ttl, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
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
export const isCrypto = (symbol) => Boolean(CRYPTO_IDS[symbol.toUpperCase()]);

// Crypto symbols only ever go to CoinGecko. Falling back to Yahoo on a CoinGecko
// error would quote a same-ticker stock/ETF (e.g. "BTC") at a completely different price.
export function fetchAsset(symbol, { history = false } = {}) {
  return isCrypto(symbol)
    ? fetchCryptoData(symbol, { history })
    : fetchStockData(symbol, { history });
}

export async function fetchCryptoData(symbol, { history = false } = {}) {
  const id = CRYPTO_IDS[symbol.toUpperCase()];
  if (!id) throw new Error("Unknown crypto symbol");

  const coins = await cached(`cg:quote:${id}`, QUOTE_TTL_MS, () => fetchJson(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${id}&price_change_percentage=24h`,
    { headers: COINGECKO_HEADERS }
  ));
  const coin = Array.isArray(coins) ? coins[0] : null;
  if (!coin || coin.current_price == null) throw new Error("Not found");

  const asset = {
    symbol: symbol.toUpperCase(),
    name: coin.name,
    price: coin.current_price,
    change: coin.price_change_percentage_24h,
    marketCap: coin.market_cap,
    volume: coin.total_volume,
    type: "crypto",
  };

  if (history) {
    const chart = await cached(`cg:history:${id}`, HISTORY_TTL_MS, () => fetchJson(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=30&interval=daily`,
      { headers: COINGECKO_HEADERS }
    ));
    asset.chartData = (chart.prices ?? []).map(([ts, price]) => ({ ts, price }));
  }
  return asset;
}

export async function fetchStockData(symbol, { history = false } = {}) {
  // One call returns both the live quote and a month of daily closes.
  const json = await cached(`yf:${symbol.toUpperCase()}`, QUOTE_TTL_MS, () => fetchJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  ));
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta || meta.regularMarketPrice == null) throw new Error("Not found");

  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const chartData = (result.timestamp ?? [])
    .map((ts, i) => ({ ts: ts * 1000, price: closes[i] }))
    .filter(d => d.price != null);

  const price = meta.regularMarketPrice;
  // With range=1mo, chartPreviousClose is the close from a month ago, so take the
  // prior session's close from the daily candles instead.
  const prevClose = chartData.length >= 2 ? chartData[chartData.length - 2].price : meta.chartPreviousClose;
  const change = prevClose ? ((price - prevClose) / prevClose) * 100 : null;

  const asset = {
    symbol: symbol.toUpperCase(),
    name: meta.longName || meta.shortName || symbol.toUpperCase(),
    price,
    change,
    marketCap: null,
    volume: meta.regularMarketVolume,
    type: "stock",
  };
  if (history) asset.chartData = chartData;
  return asset;
}
