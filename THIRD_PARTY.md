# Terceiros

| Item | Uso | Licença |
|---|---|---|
| [free-exercise-db](https://github.com/yuhonas/free-exercise-db) | 260 imagens de referência (início e fim, WebP 360 px, geradas por `scripts/catalogo-imagens.mjs`) em `apps/web/public/img/ex/` e os IDs do catálogo | Unlicense (domínio público) |
| TACO — Tabela Brasileira de Composição de Alimentos (NEPA/UNICAMP) | subconjunto compacto (49 alimentos, por 100 g) em `apps/worker/data/taco.min.json`; o Claude confere as estimativas de comida com ele (`ciclo_comida_dia`) | uso livre com citação |
| [Leaflet](https://leafletjs.com) 1.9.4 | mapa dos lugares (academias, casa, hotel), carregado só na tela com mapa (ADR-0010) | BSD-2-Clause |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) (tiles `tile.openstreetmap.org`) | imagens do mapa; atribuição "© OpenStreetMap" visível no mapa | ODbL (dados) · uso conforme a [política de tiles](https://operations.osmfoundation.org/policies/tiles/) |
| [Nominatim](https://nominatim.org) (OpenStreetMap) | busca de endereço, chamada pelo Worker com `User-Agent` próprio e limite de 1 req/s (ADR-0010) | ODbL (dados) · [política de uso](https://operations.osmfoundation.org/policies/nominatim/) |
| [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | ler o texto do laudo em PDF no aparelho, carregado só na tela de exames (ADR-0009) | Apache-2.0 |
| [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas) | dependência **opcional** do pdf.js, só para Node (fica no lock; não entra no bundle do app nem no Worker) | MIT |
| Ideia de ajuste de volume por pump/dor (MyFit / RP) | só o conceito; nenhum código copiado | — (MyFit é AGPL: não copiar código) |

Dependências de desenvolvimento (não vão para produção): wrangler, esbuild, typescript, @types/node.
