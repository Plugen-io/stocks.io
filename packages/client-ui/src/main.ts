/**
 * UI main script — consome /api do agent local e renderiza estado dinâmico.
 *
 * Polling: /api/state a cada 5s
 * Handlers: setup, inflow, buy, sell, renew
 */

interface AgentState {
  setup: { initialized: boolean; deviceId?: string; label?: string; enrolledAt?: string };
  cert: null | { serialNumber: string; commonName: string; notAfter: string; isExpired: boolean };
  heartbeat: { lastSuccess: string | null; lastError: string | null; consecutiveFailures: number };
  wallet: { balance: number; totalEquity: number };
  holdings: Array<{ ticker: string; quantity: number; avgPrice: number; currentPrice: number; marketValue: number; pnl: number; pnlPct: number }>;
  recentTrades: Array<{ id: string; ticker: string; quantity: number; unitPrice: number; total: number; side: 'buy' | 'sell'; createdAt: string }>;
  recentInflows: Array<{ id: string; amount: number; success: number; errorCode: string | null; createdAt: string }>;
  catalog: Array<{ ticker: string; name: string; price: number; change: number }>;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;

const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const fmtTimeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `há ${s}s`;
  if (s < 3600) return `há ${Math.floor(s / 60)}m`;
  if (s < 86400) return `há ${Math.floor(s / 3600)}h`;
  return `há ${Math.floor(s / 86400)}d`;
};
const fmtCountdown = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expirado';
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

// ============================================================================
// API client
// ============================================================================
async function api<T = unknown>(path: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data: data as T };
}

// ============================================================================
// Render
// ============================================================================
let lastState: AgentState | null = null;

function render(state: AgentState) {
  lastState = state;

  // Header status
  const status = $('#agent-status');
  if (status) {
    if (!state.setup.initialized) {
      status.textContent = 'aguarda setup';
      status.className = 'text-[var(--color-accent)]';
    } else if (state.heartbeat.consecutiveFailures > 2) {
      status.textContent = `falha (${state.heartbeat.consecutiveFailures})`;
      status.className = 'text-[var(--color-down)]';
    } else if (state.cert?.isExpired) {
      status.textContent = 'cert expirado';
      status.className = 'text-[var(--color-down)]';
    } else {
      status.textContent = 'online';
      status.className = 'text-[var(--color-up)]';
    }
  }

  // Portfolio total
  const portfolioTotal = $('#portfolio-total');
  const portfolioBadge = $('#portfolio-badge');
  if (portfolioTotal) portfolioTotal.textContent = fmtBRL(state.wallet.totalEquity);
  if (portfolioBadge) {
    const pnl = state.holdings.reduce((s, h) => s + h.pnl, 0);
    const cost = state.holdings.reduce((s, h) => s + h.quantity * h.avgPrice, 0);
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    portfolioBadge.textContent = `${pnl >= 0 ? '+' : ''}${fmtBRL(pnl)} · ${fmtPct(pnlPct)}`;
    portfolioBadge.className = `chip ${pnl >= 0 ? 'chip-up' : 'chip-down'}`;
  }

  // Saldo BRL
  const walletBalance = $('#wallet-balance');
  if (walletBalance) walletBalance.textContent = fmtBRL(state.wallet.balance);

  // Cert info
  const certSerial = $('#cert-serial');
  const certStatus = $('#cert-status');
  const certExpires = $('#cert-expires');
  if (certSerial) certSerial.textContent = state.cert ? `${state.cert.serialNumber.slice(0, 16)}…` : '—';
  if (certStatus) {
    if (!state.cert) {
      certStatus.textContent = '—';
      certStatus.className = 'ticker text-sm mt-1 text-[var(--color-text-faint)]';
    } else if (state.cert.isExpired) {
      certStatus.textContent = 'expired';
      certStatus.className = 'ticker text-sm mt-1 text-[var(--color-down)]';
    } else {
      certStatus.textContent = 'active';
      certStatus.className = 'ticker text-sm mt-1 text-[var(--color-up)]';
    }
  }
  if (certExpires) certExpires.textContent = state.cert ? fmtCountdown(state.cert.notAfter) : '—';

  // Holdings
  const holdingsBody = $('#holdings-body');
  if (holdingsBody) {
    if (state.holdings.length === 0) {
      holdingsBody.innerHTML = '<div class="px-4 py-8 text-center text-sm text-[var(--color-text-faint)]">Nenhuma posição. Use o catálogo abaixo pra comprar.</div>';
    } else {
      holdingsBody.innerHTML = state.holdings.map((h) => `
        <div class="px-4 py-3 flex items-center justify-between hover:bg-[var(--color-surface-2)]/40 transition">
          <div class="flex items-center gap-3">
            <span class="ticker text-sm text-[var(--color-text)]">${h.ticker}</span>
            <span class="text-xs text-[var(--color-text-muted)]">${h.quantity} un · médio ${fmtBRL(h.avgPrice)}</span>
          </div>
          <div class="flex items-center gap-3 ticker text-sm">
            <span class="text-[var(--color-text)] tabular-nums">${fmtBRL(h.marketValue)}</span>
            <span class="chip ${h.pnl >= 0 ? 'chip-up' : 'chip-down'}">${fmtPct(h.pnlPct)}</span>
            <button class="px-2 py-1 text-xs uppercase border border-[var(--color-down)]/40 text-[var(--color-down)] rounded-sm hover:bg-[var(--color-down)]/15" data-sell="${h.ticker}">vender</button>
          </div>
        </div>
      `).join('');
    }
  }

  // Catálogo
  const catalogBody = $('#catalog-body');
  if (catalogBody) {
    catalogBody.innerHTML = state.catalog.map((s) => `
      <div class="px-4 py-3 flex items-center justify-between hover:bg-[var(--color-surface-2)]/40 transition">
        <div class="flex items-center gap-3">
          <span class="ticker text-sm text-[var(--color-text)]">${s.ticker}</span>
          <span class="text-xs text-[var(--color-text-muted)]">${s.name}</span>
        </div>
        <div class="flex items-center gap-3 ticker text-sm">
          <span class="text-[var(--color-text)] tabular-nums">${fmtBRL(s.price)}</span>
          <span class="chip ${s.change >= 0 ? 'chip-up' : 'chip-down'}">${fmtPct(s.change)}</span>
          <input type="number" min="1" value="1" class="ticker w-14 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-sm px-2 py-1 text-right text-xs" data-qty="${s.ticker}" />
          <button class="px-2 py-1 text-xs uppercase border border-[var(--color-up)]/40 text-[var(--color-up)] rounded-sm hover:bg-[var(--color-up)]/15" data-buy="${s.ticker}">comprar</button>
        </div>
      </div>
    `).join('');
  }

  // Recent trades
  const tradesBody = $('#trades-body');
  if (tradesBody) {
    if (state.recentTrades.length === 0) {
      tradesBody.innerHTML = '<div class="px-4 py-6 text-center text-xs text-[var(--color-text-faint)]">Nenhum trade ainda.</div>';
    } else {
      tradesBody.innerHTML = state.recentTrades.slice(0, 8).map((t) => `
        <div class="px-4 py-2 flex items-center justify-between text-xs ticker">
          <div class="flex items-center gap-2">
            <span class="${t.side === 'buy' ? 'chip-up' : 'chip-down'} chip uppercase">${t.side}</span>
            <span class="text-[var(--color-text)]">${t.ticker}</span>
            <span class="text-[var(--color-text-muted)]">${t.quantity} × ${fmtBRL(t.unitPrice)}</span>
          </div>
          <div class="flex items-center gap-3 text-[var(--color-text-muted)]">
            <span>${fmtBRL(t.total)}</span>
            <span class="text-[var(--color-text-faint)]">${fmtTimeAgo(t.createdAt)}</span>
          </div>
        </div>
      `).join('');
    }
  }

  // Setup modal visibility
  const modal = $('#setup-modal');
  if (modal) {
    modal.classList.toggle('hidden', state.setup.initialized);
  }
}

// ============================================================================
// Handlers
// ============================================================================

function attachStaticHandlers() {
  // Setup form
  $('#setup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tokenEl = $<HTMLInputElement>('#setup-token');
    const labelEl = $<HTMLInputElement>('#setup-label');
    const errEl = $('#setup-error');
    const btn = $<HTMLButtonElement>('#setup-submit');
    if (!tokenEl || !btn) return;

    btn.disabled = true;
    btn.textContent = 'autenticando...';
    if (errEl) errEl.textContent = '';

    const { status, data } = await api<{ deviceId: string; error?: string }>('/api/setup', {
      method: 'POST',
      body: JSON.stringify({
        enrollmentToken: tokenEl.value.trim(),
        deviceLabel: labelEl?.value.trim() || undefined,
      }),
    });

    btn.disabled = false;
    btn.textContent = 'autenticar';

    if (status === 201) {
      void refresh();
    } else if (errEl) {
      errEl.textContent = (data as { error?: string })?.error ?? `HTTP ${status}`;
    }
  });

  // Inflow
  $('#inflow-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amountEl = $<HTMLInputElement>('#inflow-amount');
    const msgEl = $('#inflow-msg');
    if (!amountEl) return;
    const amount = Number(amountEl.value);
    if (!amount || amount <= 0) {
      if (msgEl) { msgEl.textContent = 'valor inválido'; msgEl.className = 'text-xs text-[var(--color-down)]'; }
      return;
    }
    if (msgEl) { msgEl.textContent = 'enviando via mTLS...'; msgEl.className = 'text-xs text-[var(--color-text-muted)]'; }

    const { status, data } = await api<{ success: boolean; balance: number; error?: string; message?: string }>('/api/inflow', {
      method: 'POST',
      body: JSON.stringify({ amountBRL: amount }),
    });

    if (status === 200 && data.success) {
      if (msgEl) { msgEl.textContent = `+${fmtBRL(amount)} confirmado`; msgEl.className = 'text-xs text-[var(--color-up)]'; }
      amountEl.value = '';
      void refresh();
    } else if (msgEl) {
      const msg = (data as { error?: string; message?: string }).message ?? (data as { error?: string }).error ?? `HTTP ${status}`;
      msgEl.textContent = msg;
      msgEl.className = 'text-xs text-[var(--color-down)]';
    }
  });

  // Renew
  $('#btn-renew')?.addEventListener('click', async () => {
    const out = $('#status-out');
    if (out) out.textContent = 'renovando...';
    const { status, data } = await api<{ serialNumber?: string; error?: string }>('/api/renew', { method: 'POST' });
    if (out) out.textContent = status === 200 ? `renovado: serial ${(data as { serialNumber?: string }).serialNumber?.slice(0, 16)}...` : `erro: ${(data as { error?: string }).error}`;
    void refresh();
  });

  // Buy/Sell (delegação no body porque os elementos são re-renderizados)
  document.body.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const buyTicker = target.dataset.buy;
    const sellTicker = target.dataset.sell;

    if (buyTicker) {
      const qtyInput = document.querySelector<HTMLInputElement>(`[data-qty="${buyTicker}"]`);
      const qty = Number(qtyInput?.value ?? '1');
      if (!qty || qty <= 0) return;
      const { status, data } = await api<{ error?: string }>('/api/trade', {
        method: 'POST',
        body: JSON.stringify({ ticker: buyTicker, quantity: qty, side: 'buy' }),
      });
      if (status !== 201) alert((data as { error?: string }).error ?? `HTTP ${status}`);
      void refresh();
    }

    if (sellTicker) {
      const qty = Number(prompt(`Quantas ações de ${sellTicker} vender?`, '1') ?? '0');
      if (!qty || qty <= 0) return;
      const { status, data } = await api<{ error?: string }>('/api/trade', {
        method: 'POST',
        body: JSON.stringify({ ticker: sellTicker, quantity: qty, side: 'sell' }),
      });
      if (status !== 201) alert((data as { error?: string }).error ?? `HTTP ${status}`);
      void refresh();
    }
  });
}

// ============================================================================
// Polling
// ============================================================================
async function refresh() {
  try {
    const { data } = await api<AgentState>('/api/state');
    render(data);
  } catch (err) {
    const status = $('#agent-status');
    if (status) {
      status.textContent = 'offline';
      status.className = 'text-[var(--color-down)]';
    }
    console.error('agent unreachable:', err);
  }
}

attachStaticHandlers();
void refresh();
setInterval(refresh, 5000);

// Countdown do cert atualiza a cada segundo (não precisa request)
setInterval(() => {
  if (!lastState?.cert) return;
  const el = $('#cert-expires');
  if (el) el.textContent = fmtCountdown(lastState.cert.notAfter);
}, 1000);
