import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const adapter = new JSONFile(join(__dirname, "mktwatch.json"));
const db = new Low(adapter, { watchlist: [], holdings: [], alerts: [], nextAlertId: 1 });

await db.read();

function save() { return db.write(); }

function addToWatchlist(userId, symbol, type = "crypto") {
  const exists = db.data.watchlist.find(w => w.userId === userId && w.symbol === symbol);
  if (!exists) {
    db.data.watchlist.push({ userId, symbol, type, addedAt: new Date().toISOString() });
    save();
  }
}

function removeFromWatchlist(userId, symbol) {
  db.data.watchlist = db.data.watchlist.filter(w => !(w.userId === userId && w.symbol === symbol));
  save();
}

function getWatchlist(userId) {
  return db.data.watchlist.filter(w => w.userId === userId);
}

function addHolding(userId, symbol, type, shares, costBasis) {
  const idx = db.data.holdings.findIndex(h => h.userId === userId && h.symbol === symbol);
  if (idx >= 0) {
    db.data.holdings[idx] = { ...db.data.holdings[idx], shares, costBasis };
  } else {
    db.data.holdings.push({ userId, symbol, type, shares, costBasis });
  }
  save();
}

function getHoldings(userId) {
  return db.data.holdings.filter(h => h.userId === userId);
}

function addAlert(userId, symbol, targetPrice) {
  const id = db.data.nextAlertId++;
  db.data.alerts.push({ id, userId, symbol, targetPrice, lastPrice: null, createdAt: new Date().toISOString() });
  save();
}

function getAlerts(userId) {
  return db.data.alerts.filter(a => a.userId === userId);
}

function getAllAlerts() {
  return db.data.alerts;
}

function removeAlert(id, userId) {
  db.data.alerts = db.data.alerts.filter(a => !(a.id === id && a.userId === userId));
  save();
}

function updateAlertLastPrice(id, price) {
  const alert = db.data.alerts.find(a => a.id === id);
  if (alert) { alert.lastPrice = price; save(); }
}

export default {
  addToWatchlist, removeFromWatchlist, getWatchlist,
  addHolding, getHoldings,
  addAlert, getAlerts, getAllAlerts, removeAlert, updateAlertLastPrice,
};
