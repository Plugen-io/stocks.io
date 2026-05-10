const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

async function pollAgent() {
  const status = $<HTMLSpanElement>('agent-status');
  const out = $<HTMLPreElement>('status-out');
  if (!status || !out) return;

  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    status.textContent = data.initialized ? 'enrolado' : 'aguarda setup';
    out.textContent = JSON.stringify(data, null, 2);
  } catch {
    status.textContent = 'offline';
    out.textContent = 'agent offline\n\ninicie com: npm run dev:agent';
  }
}

pollAgent();
setInterval(pollAgent, 5000);
