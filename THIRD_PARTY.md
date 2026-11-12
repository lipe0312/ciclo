# Terceiros

| Item | Uso | Licença |
|---|---|---|
| [free-exercise-db](https://github.com/yuhonas/free-exercise-db) | 260 imagens de referência (início e fim, WebP 360 px, geradas por `scripts/catalogo-imagens.mjs`) em `apps/web/public/img/ex/` e os IDs do catálogo | Unlicense (domínio público) |
| TACO — Tabela Brasileira de Composição de Alimentos (NEPA/UNICAMP) | referência para estimativas de comida (planejado) | uso livre com citação |
| [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | ler o texto do laudo em PDF no aparelho, carregado só na tela de exames (ADR-0009) | Apache-2.0 |
| [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas) | dependência **opcional** do pdf.js, só para Node (fica no lock; não entra no bundle do app nem no Worker) | MIT |
| Ideia de ajuste de volume por pump/dor (MyFit / RP) | só o conceito; nenhum código copiado | — (MyFit é AGPL: não copiar código) |

Dependências de desenvolvimento (não vão para produção): wrangler, esbuild, typescript, @types/node.
