async function loadStatus() {
  const out = document.getElementById('status-out')!;
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    out.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    out.textContent = `agent offline: ${(err as Error).message}\n\nInicie o agent com: npm run dev:agent`;
    out.classList.add('text-amber-400');
  }
}

loadStatus();
