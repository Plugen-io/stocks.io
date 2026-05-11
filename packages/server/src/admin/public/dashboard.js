// Dashboard interactivity — chart + action buttons

async function apiCall(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

// ============================================================================
// Heartbeat chart
// ============================================================================
async function loadHeartbeatChart() {
  const canvas = document.getElementById('heartbeat-chart');
  if (!canvas) return;
  const { data } = await apiCall('GET', '/admin/api/heartbeats');
  const heartbeats = data?.heartbeats ?? [];

  // Agrupa por device, datasets = devices
  const byDevice = new Map();
  for (const h of heartbeats) {
    if (!byDevice.has(h.deviceId)) byDevice.set(h.deviceId, []);
    byDevice.get(h.deviceId).push({ x: new Date(h.ts).getTime(), y: h.latencyMs ?? 0 });
  }

  const colors = ['#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444'];
  const datasets = [...byDevice.entries()].map(([deviceId, points], i) => ({
    label: deviceId.slice(0, 8),
    data: points,
    borderColor: colors[i % colors.length],
    backgroundColor: colors[i % colors.length] + '20',
    pointRadius: 3,
    tension: 0.2,
  }));

  new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      animation: false,
      scales: {
        x: {
          type: 'linear',
          ticks: {
            color: '#888',
            callback: (v) => new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          },
          grid: { color: '#ffffff10' },
        },
        y: {
          title: { display: true, text: 'latência (ms)', color: '#888' },
          ticks: { color: '#888' },
          grid: { color: '#ffffff10' },
          beginAtZero: true,
        },
      },
      plugins: {
        legend: { labels: { color: '#ccc' } },
      },
    },
  });
}

// ============================================================================
// Actions
// ============================================================================
document.body.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'generate-token') {
    btn.disabled = true;
    btn.textContent = 'gerando...';
    const { data } = await apiCall('POST', '/admin/api/tokens', { validityDays: 7 });
    btn.disabled = false;
    btn.textContent = '+ gerar token';
    if (data?.token) {
      const out = document.getElementById('token-output');
      out.hidden = false;
      out.textContent = data.token;
      out.title = 'clique pra selecionar';
    }
    return;
  }

  if (action === 'revoke') {
    if (!confirm('Revogar este certificado? O device será desconectado.')) return;
    const certId = btn.dataset.cert;
    const { ok, data } = await apiCall('POST', `/admin/api/certs/${certId}/revoke`, { reason: 'admin manual revoke' });
    if (!ok) alert('erro: ' + JSON.stringify(data));
    else location.reload();
    return;
  }

  if (action === 'unrevoke') {
    const certId = btn.dataset.cert;
    const { ok, data } = await apiCall('POST', `/admin/api/certs/${certId}/unrevoke`);
    if (!ok) alert('erro: ' + JSON.stringify(data));
    else location.reload();
    return;
  }

  if (action === 'force-renew') {
    if (!confirm('Forçar renovação? O cert atual será marcado como superseded; o device terá que renovar antes da próxima request.')) return;
    const deviceId = btn.dataset.device;
    const { ok, data } = await apiCall('POST', `/admin/api/devices/${deviceId}/force-renew`);
    if (!ok) alert('erro: ' + JSON.stringify(data));
    else location.reload();
    return;
  }
});

// Init
void loadHeartbeatChart();
