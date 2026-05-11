/**
 * DB local do agent — SQLite em ~/.stocksio-client/state.db
 *
 * Guarda: wallet (saldo), holdings (carteira de ações), purchases (histórico).
 * Tudo é LOCAL — não vai pro server. O server só conhece o saldo via /inflow.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const KEYSTORE_DIR = process.env.STOCKSIO_HOME ?? path.join(os.homedir(), '.stocksio-client');
const DB_PATH = path.join(KEYSTORE_DIR, 'state.db');

let dbInstance: Database.Database | null = null;

function ensureDir() {
  if (!fs.existsSync(KEYSTORE_DIR)) {
    fs.mkdirSync(KEYSTORE_DIR, { recursive: true, mode: 0o700 });
  }
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  ensureDir();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      balance REAL NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO wallet (id, balance) VALUES (1, 0);

    CREATE TABLE IF NOT EXISTS holdings (
      ticker TEXT PRIMARY KEY,
      quantity INTEGER NOT NULL DEFAULT 0,
      avg_price REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total REAL NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inflows_log (
      id TEXT PRIMARY KEY,
      amount REAL NOT NULL,
      server_inflow_id TEXT,
      success INTEGER NOT NULL,
      error_code TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS purchases_created_idx ON purchases(created_at DESC);
    CREATE INDEX IF NOT EXISTS inflows_created_idx ON inflows_log(created_at DESC);
  `);

  dbInstance = db;
  return db;
}

// ============================================================================
// Wallet
// ============================================================================

export function getBalance(): number {
  const row = getDb().prepare('SELECT balance FROM wallet WHERE id = 1').get() as { balance: number };
  return row.balance;
}

export function setBalance(amount: number): void {
  getDb().prepare('UPDATE wallet SET balance = ? WHERE id = 1').run(amount);
}

export function addToBalance(delta: number): number {
  const db = getDb();
  const tx = db.transaction(() => {
    const cur = (db.prepare('SELECT balance FROM wallet WHERE id = 1').get() as { balance: number }).balance;
    const next = cur + delta;
    db.prepare('UPDATE wallet SET balance = ? WHERE id = 1').run(next);
    return next;
  });
  return tx();
}

// ============================================================================
// Holdings
// ============================================================================

export interface Holding {
  ticker: string;
  quantity: number;
  avgPrice: number;
}

export function getHoldings(): Holding[] {
  return getDb().prepare(`
    SELECT ticker, quantity, avg_price as avgPrice
    FROM holdings WHERE quantity > 0
    ORDER BY ticker
  `).all() as Holding[];
}

export function getHolding(ticker: string): Holding | undefined {
  return getDb().prepare(`
    SELECT ticker, quantity, avg_price as avgPrice
    FROM holdings WHERE ticker = ?
  `).get(ticker.toUpperCase()) as Holding | undefined;
}

/**
 * Adiciona quantidade ao holding, recalcula avg_price (média ponderada).
 */
export function addToHolding(ticker: string, quantity: number, unitPrice: number): Holding {
  const db = getDb();
  const t = ticker.toUpperCase();
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT quantity, avg_price FROM holdings WHERE ticker = ?').get(t) as
      | { quantity: number; avg_price: number }
      | undefined;
    if (!existing) {
      db.prepare('INSERT INTO holdings (ticker, quantity, avg_price) VALUES (?, ?, ?)').run(t, quantity, unitPrice);
      return { ticker: t, quantity, avgPrice: unitPrice };
    }
    const totalQty = existing.quantity + quantity;
    const totalCost = existing.quantity * existing.avg_price + quantity * unitPrice;
    const newAvg = totalCost / totalQty;
    db.prepare('UPDATE holdings SET quantity = ?, avg_price = ? WHERE ticker = ?').run(totalQty, newAvg, t);
    return { ticker: t, quantity: totalQty, avgPrice: newAvg };
  });
  return tx();
}

export function removeFromHolding(ticker: string, quantity: number): Holding {
  const db = getDb();
  const t = ticker.toUpperCase();
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT quantity, avg_price FROM holdings WHERE ticker = ?').get(t) as
      | { quantity: number; avg_price: number }
      | undefined;
    if (!existing || existing.quantity < quantity) {
      throw new Error(`insufficient holding ${t}: have ${existing?.quantity ?? 0}, want ${quantity}`);
    }
    const next = existing.quantity - quantity;
    db.prepare('UPDATE holdings SET quantity = ? WHERE ticker = ?').run(next, t);
    return { ticker: t, quantity: next, avgPrice: existing.avg_price };
  });
  return tx();
}

// ============================================================================
// Purchases / sales history
// ============================================================================

export interface Trade {
  id: string;
  ticker: string;
  quantity: number;
  unitPrice: number;
  total: number;
  side: 'buy' | 'sell';
  createdAt: string;
}

export function recordTrade(t: Omit<Trade, 'createdAt'>): Trade {
  getDb().prepare(`
    INSERT INTO purchases (id, ticker, quantity, unit_price, total, side)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(t.id, t.ticker, t.quantity, t.unitPrice, t.total, t.side);
  return { ...t, createdAt: new Date().toISOString() };
}

export function listTrades(limit = 50): Trade[] {
  return getDb().prepare(`
    SELECT id, ticker, quantity, unit_price as unitPrice, total, side, created_at as createdAt
    FROM purchases ORDER BY created_at DESC LIMIT ?
  `).all(limit) as Trade[];
}

// ============================================================================
// Inflows log
// ============================================================================

export function recordInflowLog(opts: {
  id: string;
  amount: number;
  serverInflowId: string | null;
  success: boolean;
  errorCode?: string | null;
}): void {
  getDb().prepare(`
    INSERT INTO inflows_log (id, amount, server_inflow_id, success, error_code)
    VALUES (?, ?, ?, ?, ?)
  `).run(opts.id, opts.amount, opts.serverInflowId, opts.success ? 1 : 0, opts.errorCode ?? null);
}

export function listInflows(limit = 50) {
  return getDb().prepare(`
    SELECT id, amount, server_inflow_id as serverInflowId, success, error_code as errorCode, created_at as createdAt
    FROM inflows_log ORDER BY created_at DESC LIMIT ?
  `).all(limit);
}
