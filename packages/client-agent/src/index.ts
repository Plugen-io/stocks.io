/**
 * Client agent — daemon Node que roda local.
 *
 * Expõe API HTTP em http://127.0.0.1:7700/api/* pra UI consumir.
 *
 * Endpoints:
 *   GET  /api/health          → status do agent
 *   GET  /api/state           → estado consolidado (wallet, holdings, cert, heartbeat)
 *   POST /api/setup           → wizard de enrollment {enrollmentToken, deviceLabel?}
 *   POST /api/renew           → renova cert atual (mantém chave privada)
 *   POST /api/inflow          → adiciona crédito BRL via mTLS no server {amountBRL}
 *   POST /api/trade           → compra/venda local {ticker, quantity, side}
 *   GET  /api/trades          → histórico de trades
 *   POST /api/reset           → APAGA keystore + DB local (CUIDADO)
 */
import express from 'express';
import crypto from 'node:crypto';
import { isInitialized, reset as resetKeystore } from './keystore.js';
import { runSetup, getSetupStatus } from './setup.js';
import { renewCert } from './renewal.js';
import { getAgentState } from './state.js';
import { startHeartbeat } from './heartbeat.js';
import { requestMtls } from './tls-client.js';
import { findStock } from '@stocks.io/shared';
import {
  getBalance,
  addToBalance,
  addToHolding,
  removeFromHolding,
  getHolding,
  recordTrade,
  recordInflowLog,
  listTrades,
} from './local-db.js';
import type { InflowResponse } from '@stocks.io/shared';

const PORT = Number(process.env.AGENT_PORT ?? 7700);
const app = express();
app.use(express.json());

// ============================================================================
// Status
// ============================================================================
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    initialized: isInitialized(),
    agentVersion: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/state', (_req, res) => {
  res.json(getAgentState());
});

// ============================================================================
// Setup wizard
// ============================================================================
app.post('/api/setup', async (req, res) => {
  const { enrollmentToken, deviceLabel } = req.body ?? {};
  if (!enrollmentToken || typeof enrollmentToken !== 'string') {
    return res.status(400).json({ error: 'enrollmentToken required' });
  }
  if (isInitialized()) {
    return res.status(409).json({ error: 'already initialized' });
  }
  try {
    const result = await runSetup({ enrollmentToken, deviceLabel });
    startHeartbeat();
    return res.status(201).json(result);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/setup/status', (_req, res) => {
  res.json(getSetupStatus());
});

// ============================================================================
// Cert renew
// ============================================================================
app.post('/api/renew', async (_req, res) => {
  if (!isInitialized()) return res.status(400).json({ error: 'device not initialized' });
  try {
    const result = await renewCert();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ============================================================================
// Inflow (faz mTLS com o server e atualiza wallet local)
// ============================================================================
app.post('/api/inflow', async (req, res) => {
  if (!isInitialized()) return res.status(400).json({ error: 'device not initialized' });

  const amountBRL = Number(req.body?.amountBRL);
  if (!Number.isFinite(amountBRL) || amountBRL <= 0) {
    return res.status(400).json({ error: 'amountBRL must be positive number' });
  }

  const idempotencyKey = crypto.randomUUID();
  try {
    const r = await requestMtls<InflowResponse>('/inflow', {
      method: 'POST',
      body: { amountBRL, idempotencyKey },
    });

    if (r.ok && r.data.success) {
      addToBalance(amountBRL);
      recordInflowLog({
        id: idempotencyKey,
        amount: amountBRL,
        serverInflowId: r.data.inflowId ?? null,
        success: true,
      });
      return res.json({
        success: true,
        inflowId: r.data.inflowId,
        balance: getBalance(),
        amountAdded: amountBRL,
      });
    }

    // Falha: registra log e devolve erro pro UI
    const errorCode = r.data.error ?? 'AUTH_FAILED';
    recordInflowLog({
      id: idempotencyKey,
      amount: amountBRL,
      serverInflowId: null,
      success: false,
      errorCode,
    });
    return res.status(r.status).json({
      success: false,
      error: errorCode,
      message: r.data.message ?? `Server rejected inflow (HTTP ${r.status})`,
    });
  } catch (err) {
    recordInflowLog({
      id: idempotencyKey,
      amount: amountBRL,
      serverInflowId: null,
      success: false,
      errorCode: 'NETWORK',
    });
    return res.status(503).json({
      success: false,
      error: 'NETWORK',
      message: (err as Error).message,
    });
  }
});

// ============================================================================
// Trade (compra/venda local)
// ============================================================================
app.post('/api/trade', (req, res) => {
  const { ticker, quantity, side } = req.body ?? {};
  if (!ticker || typeof ticker !== 'string') return res.status(400).json({ error: 'ticker required' });
  if (!Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ error: 'quantity must be positive integer' });
  if (side !== 'buy' && side !== 'sell') return res.status(400).json({ error: 'side must be buy|sell' });

  const stock = findStock(ticker);
  if (!stock) return res.status(404).json({ error: `unknown ticker ${ticker}` });

  const total = quantity * stock.price;

  try {
    if (side === 'buy') {
      const balance = getBalance();
      if (balance < total) {
        return res.status(400).json({ error: `insufficient balance: need ${total.toFixed(2)}, have ${balance.toFixed(2)}` });
      }
      addToBalance(-total);
      const newHolding = addToHolding(stock.ticker, quantity, stock.price);
      const trade = recordTrade({
        id: crypto.randomUUID(),
        ticker: stock.ticker,
        quantity,
        unitPrice: stock.price,
        total,
        side: 'buy',
      });
      return res.status(201).json({ trade, holding: newHolding, balance: getBalance() });
    } else {
      const holding = getHolding(stock.ticker);
      if (!holding || holding.quantity < quantity) {
        return res.status(400).json({ error: `insufficient holding: have ${holding?.quantity ?? 0}, want ${quantity}` });
      }
      const updated = removeFromHolding(stock.ticker, quantity);
      addToBalance(total);
      const trade = recordTrade({
        id: crypto.randomUUID(),
        ticker: stock.ticker,
        quantity,
        unitPrice: stock.price,
        total,
        side: 'sell',
      });
      return res.status(201).json({ trade, holding: updated, balance: getBalance() });
    }
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/trades', (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  res.json(listTrades(limit));
});

// ============================================================================
// Reset (dev/debug)
// ============================================================================
app.post('/api/reset', (_req, res) => {
  resetKeystore();
  res.json({ ok: true, message: 'keystore wiped — restart agent to reinitialize' });
});

// ============================================================================
// Listen
// ============================================================================
app.listen(PORT, '127.0.0.1', () => {
  console.log(`stocks.io agent listening at http://127.0.0.1:${PORT}`);
  if (isInitialized()) {
    console.log(`   device enrolled — starting heartbeat`);
    startHeartbeat();
  } else {
    console.log(`   device not initialized — open UI and run setup wizard`);
  }
});
