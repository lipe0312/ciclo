# Terceiros

| Item | Uso | Licença |
|---|---|---|
| [free-exercise-db](https://github.com/yuhonas/free-exercise-db) | 260 imagens de referência (início e fim, WebP 360 px, geradas por `scripts/catalogo-imagens.mjs`) em `apps/web/public/img/ex/` e os IDs do catálogo | Unlicense (domínio público) |
| TACO — Tabela Brasileira de Composição de Alimentos (NEPA/UNICAMP) | subconjunto compacto (49 alimentos, por 100 g) em `apps/worker/data/taco.min.json`; o Claude confere as estimativas de comida com ele (`ciclo_comida_dia`) | uso livre com citação |
| Ideia de ajuste de volume por pump/dor (MyFit / RP) | só o conceito; nenhum código copiado | — (MyFit é AGPL: não copiar código) |

Dependências de desenvolvimento (não vão para produção): wrangler, esbuild, typescript, @types/node.
