# stocks.io — Brand guide

POC mTLS com identidade visual de terminal financeiro.

## Tom

- **Profissional, denso, técnico.** Inspirado em Bloomberg Terminal, TradingView, IEX Cloud.
- Densidade de informação alta — sem espaço desperdiçado.
- Sem ilustrações, gradientes, ou linguagem casual. Tudo é fact-based.

## Tipografia

| Família | Uso |
|---|---|
| **Inter** | UI geral (headers, navegação, parágrafos) |
| **JetBrains Mono** | Tickers, números, IDs, timestamps, código |

Números **sempre** com `tabular-nums` (`font-variant-numeric`) para alinhamento em colunas.

## Cores (OKLCH)

### Superfícies
| Token | Valor | Uso |
|---|---|---|
| `--color-bg` | `oklch(0.14 0.01 240)` | Fundo da app |
| `--color-surface` | `oklch(0.18 0.01 240)` | Cards, headers |
| `--color-surface-2` | `oklch(0.22 0.01 240)` | Cards aninhados |
| `--color-border` | `oklch(0.28 0.01 240)` | Divisores principais |

### Texto
| Token | Uso |
|---|---|
| `--color-text` | Principal |
| `--color-text-muted` | Labels, metadados |
| `--color-text-faint` | Hints, separadores |

### Direção (semântica financeira)
| Token | Significado |
|---|---|
| `--color-up` | verde — alta, sucesso, ativo |
| `--color-down` | vermelho — baixa, falha, revogado |
| `--color-accent` | âmbar — alerta, mTLS, atenção |

**Regra crítica:** Verde e vermelho são **reservados** para direção de mercado e estado de conexão. Não usar como decoração.

## Logo

- `public/logo-mark.svg` — só o mark (5 barras ascendentes, última verde)
- `public/logo-full.svg` — mark + wordmark "stocks.io"
- `public/favicon.svg` — mark com fundo escuro arredondado

**Construção do mark:** 5 barras verticais de altura crescente, evocando trend bullish. As 4 primeiras em zinc, a última em verde com wick estendido. Não rotacionar, não recolorir, não inverter.

**Espaço mínimo:** o mark deve ter padding equivalente à altura de 1 barra ao redor.

## Componentes (utilities Tailwind 4)

- `.panel` + `.panel-header` — caixas de informação
- `.chip` + variantes (`chip-up`, `chip-down`, `chip-accent`) — badges curtos
- `.ticker` — fonte mono + tabular-nums + letter-spacing levemente aberto
- `.live-dot` — LED verde pulsante (status "ao vivo")

## Copyright

© 2026 plugen.io · POC mTLS
