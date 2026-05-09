/**
 * Client agent — daemon Node que roda local.
 *
 * Responsabilidades:
 *   1. Detém a chave privada do device (em ~/.stockio-client/)
 *   2. Faz mTLS com o servidor (rotas autenticadas)
 *   3. Expõe API HTTP em localhost para a UI consumir
 *   4. Renova cert sob demanda (CSR com chave existente — estratégia A1)
 *   5. Envia heartbeat periódico
 *
 * Implementação completa: Fase 5.
 */
import express from 'express';
import { isInitialized } from './keystore.js';

const PORT = Number(process.env.AGENT_PORT ?? 7700);
const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, initialized: isInitialized() });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Stock.io agent escutando em http://127.0.0.1:${PORT}`);
  if (!isInitialized()) {
    console.log('   Device não inicializado. Acesse a UI pra fazer setup.');
  }
});
