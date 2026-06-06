# QR/Barcode Reader — Sistema Industrial de Leitura

> Fork do `html5-qrcode` v2.3.8 — estendido com pipeline de pré-processamento adaptativo, banco de dados SQLite e interface industrial para coleta de datasets de visão computacional.

![Versão](https://img.shields.io/badge/versão-1.0.8-blue)
![Licença](https://img.shields.io/badge/licença-Apache--2.0-green)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

---

## Visão Geral

Sistema web para leitura de QR codes e barcodes via webcam com foco em:

- **Alta taxa de leitura** — pipeline inteligente que testa múltiplos algoritmos e níveis de zoom automaticamente
- **Coleta de dataset** — cada leitura persiste imagens, dados de pipeline e metadados no SQLite para treinamento de modelos de IA
- **Interface industrial** — UI no estilo Cognex/Zebra/Honeywell, dark mode, métricas em tempo real
- **Dois ambientes** — DEV com hot-reload (porta 4000) e PROD (porta 5000)

---

## Funcionalidades

### Smart Scanner Adaptativo
O sistema testa **16 receitas de pré-processamento** em ordem crescente de complexidade, parando na primeira que conseguir decodificar:

| Receita | Zoom | Filtros |
|---|---|---|
| `sharp` | 1× | Unsharp mask |
| `ac+sharp` | 1× | Auto-contraste + sharp |
| `1.5x` / `2x` / `3x` | 1.5× / 2× / 3× | Zoom digital (recorte central) |
| `clahe` / `clahe+sharp` | 1× | CLAHE — equalização adaptativa por tiles |
| `gauss+adapt` | 1× | Blur Gaussiano + Threshold adaptativo |
| `clahe+adapt` | 1× | CLAHE + Threshold adaptativo |
| `0.75x+sharp` | 0.75× | Reduz para códigos muito grandes |

- **Orçamento de 80ms/tick** — não trava a UI
- **Memória adaptativa** — prioriza a última receita que funcionou
- **Zoom digital** = recorte central do frame (não interpolação)

### Decoders em paralelo
- **BarcodeDetector** — API nativa Chrome/Edge (melhor alcance)
- **jsQR** — decoder JavaScript com pré-processamento adaptativo
- **ZXing** — decoder padrão do html5-qrcode (fallback)

O Live Feed mostra qual ferramenta decodificou cada leitura com badge colorido.

### Pipeline de Imagem
Cada leitura bem-sucedida gera:
1. **Grayscale** — conversão ITU-R BT.601
2. **Binarização Otsu** — threshold automático por histograma
3. **Extração de matriz** — amostragem de módulos → bit-string
4. **Persistência** — salvo no SQLite com imagens em base64

### Interface
- Topbar com status de câmera, API e DB em tempo real
- Métricas: total, sucesso, taxa e última duração (ms)
- Visualizador do pipeline com estado por etapa
- **Live Feed** com scroll automático, badge DUP, badge de ferramenta e receita
- Tabs: Resultados (tabela paginada + busca), Estatísticas, Exportar

### Banco de Dados & Export
- SQLite em modo WAL, tabelas `sessions` e `scans`
- Export em JSON, CSV, JSONL e JSON+Matrix (para treinamento de LLMs/visão)

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5, Canvas 2D API, Web Audio API |
| Scanner | html5-qrcode v2.3.8, jsQR, BarcodeDetector |
| Build | Webpack 5, webpack-dev-server v4, TypeScript |
| Backend | Express.js, better-sqlite3 |
| Infra | concurrently, cross-env |

---

## Instalação e Uso

### Pré-requisitos
- Node.js >= 18
- npm >= 9

### Instalação
```bash
git clone https://github.com/jpp08/QRCODE_READER.git
cd QRCODE_READER
npm install
```

### Ambiente DEV
```bash
npm run dev
```
- UI: [http://localhost:4000](http://localhost:4000)
- API: [http://localhost:4001/api](http://localhost:4001/api)
- Hot-reload ativo — alterações em `app/` refletem imediatamente

### Ambiente PROD
```bash
npm run start:prod
```
- UI + API: [http://localhost:5000](http://localhost:5000)

### Build PROD
```bash
npm run build:prod
```
Gera bundle minificado em `dist/` com `html5-qrcode.min.js`, `pipeline.js`, `vendor/jsQR.js` e `index.html`.

---

## Estrutura do Projeto

```
├── app/                    # DEV — UI e assets estáticos
│   ├── index.html          # Interface DEV (DEV pill, porta 4000)
│   └── pipeline.js         # Pipeline de imagem (canvas, filtros, CLAHE, etc.)
├── app-prod/               # PROD — UI de produção
│   └── index.html
├── server/
│   ├── index.js            # Express API (:4001 DEV / :5000 PROD)
│   ├── db/database.js      # SQLite WAL — tabelas sessions e scans
│   └── routes/             # scans.js, sessions.js, export.js
├── src/                    # Código TypeScript do html5-qrcode (base)
├── scripts/                # Scripts de build
├── webpack.config.dev.js
└── webpack.config.prod.js
```

---

## API

### Health
```
GET /api/health
→ { status, version, env }
```

### Scans
```
POST /api/scans          — salva uma leitura
GET  /api/scans          — lista (paginado, suporta ?search=&limit=&offset=)
GET  /api/scans/stats    — estatísticas agregadas e por formato
DELETE /api/scans/:id    — remove um registro
```

### Sessions
```
POST /api/sessions       — cria sessão
PUT  /api/sessions/:id/end — encerra sessão
GET  /api/sessions       — lista sessões
```

### Export
```
GET /api/export?format=json|csv|jsonl[&include_matrix=true]
```

---

## Filtros de Imagem Disponíveis (`pipeline.js`)

| Método | Descrição |
|---|---|
| `_grayscale(canvas)` | Conversão luminância ITU-R BT.601 |
| `_binarize(canvas)` | Threshold de Otsu (histograma) |
| `_gaussianBlur(canvas)` | Kernel 3×3 — suaviza ruído de sensor |
| `_sharpen(canvas)` | Unsharp mask 3×3 — realça bordas |
| `_autoContrast(canvas)` | Estica histograma para [0, 255] |
| `_clahe(canvas)` | Equalização adaptativa por tiles (clipLimit=3.0) |
| `_adaptiveThreshold(canvas)` | Threshold local por integral image O(1)/pixel |
| `_extractMatrix(canvas, bounds)` | Extrai bit-string da matriz QR |

---

## Histórico de Versões

| Versão | Descrição |
|---|---|
| 1.0.8 | Badge de ferramenta no Live Feed (BarcodeDetector / jsQR / ZXing) + botão Limpar feed |
| 1.0.7 | Smart scanner adaptativo: 16 receitas, zoom digital, CLAHE, AdaptiveThreshold |
| 1.0.6 | Alerta sonoro (Web Audio API) ao ler |
| 1.0.5 | Multi-scale jsQR (1.5× e 2×) + BarcodeDetector nativo |
| 1.0.4 | Live Feed com buffer, DUP indicator, scroll automático |
| 1.0.3 | Interface industrial dark UI (Cognex/Zebra style) |
| 1.0.2 | SQLite WAL + pipeline grayscale/Otsu/matrix + backend Express |

---

## Licença

Apache 2.0 — baseado em [mebjas/html5-qrcode](https://github.com/mebjas/html5-qrcode).
