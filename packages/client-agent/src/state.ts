/**
 * Estado consolidado pro UI consumir via GET /api/state.
 */
import { STOCK_CATALOG } from '@stocks.io/shared';
import { getBalance, getHoldings, listTrades, listInflows } from './local-db.js';
import { getSetupStatus } from './setup.js';
import { getCertInfo } from './renewal.js';
import { getHeartbeatStatus } from './heartbeat.js';

export function getAgentState() {
  const setup = getSetupStatus();
  const cert = getCertInfo();
  const balance = getBalance();
  const holdings = getHoldings().map((h) => {
    const stock = STOCK_CATALOG.find((s) => s.ticker === h.ticker);
    const currentPrice = stock?.price ?? h.avgPrice;
    const marketValue = h.quantity * currentPrice;
    const cost = h.quantity * h.avgPrice;
    return {
      ...h,
      currentPrice,
      marketValue,
      pnl: marketValue - cost,
      pnlPct: cost > 0 ? ((marketValue - cost) / cost) * 100 : 0,
    };
  });
  const totalEquity = balance + holdings.reduce((sum, h) => sum + h.marketValue, 0);

  return {
    setup,
    cert,
    heartbeat: getHeartbeatStatus(),
    wallet: {
      balance,
      totalEquity,
    },
    holdings,
    recentTrades: listTrades(20),
    recentInflows: listInflows(20),
    catalog: STOCK_CATALOG,
  };
}
