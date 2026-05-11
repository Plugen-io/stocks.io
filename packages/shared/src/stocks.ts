/**
 * Catálogo de ações disponível na POC.
 * Preços e variação são estáticos (mock) — em produção viriam de um market data feed.
 */
export interface StockInfo {
  ticker: string;
  name: string;
  price: number;
  change: number; // variação % do dia
}

export const STOCK_CATALOG: readonly StockInfo[] = [
  { ticker: 'PETR4', name: 'Petrobras PN',   price: 38.42, change:  1.84 },
  { ticker: 'VALE3', name: 'Vale ON',        price: 62.10, change: -0.92 },
  { ticker: 'ITUB4', name: 'Itaú Unibanco PN', price: 31.78, change:  0.41 },
  { ticker: 'BBDC4', name: 'Bradesco PN',    price: 15.04, change:  2.13 },
  { ticker: 'MGLU3', name: 'Magalu ON',      price:  8.91, change: -3.41 },
  { ticker: 'WEGE3', name: 'WEG ON',         price: 42.65, change:  0.78 },
] as const;

export function findStock(ticker: string): StockInfo | undefined {
  return STOCK_CATALOG.find((s) => s.ticker === ticker.toUpperCase());
}
