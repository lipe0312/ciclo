# Desenhos de arquitetura

| Pasta | O que tem | Para quem |
|---|---|---|
| `detalhada/` | C4 nível 2 com fronteiras de confiança, cadeia de segurança, banco, performance e limites de escala, com os números do código | quem mexe no código (aparece no `docs/02-arquitetura.md`) |
| `resumida/` | estilo prancheta (papel quadriculado, mono, carimbo) nas cores do Ciclo, com o laranja só na fronteira da Cloudflare; ícones próprios com bloco verde-limão; cilindro = banco, balde = bucket; protocolo nas setas; sem rota, tabela, secret ou lógica do produto (1080×1350, formato 4:5) | apresentação e post; `fonte/gerar.py` gera o SVG |

Cada pasta guarda `atual.svg` (a arquitetura de hoje). A proposta para escalar fica ao lado, como `futura.svg`:

| Arquivo | Estado |
|---|---|
| `detalhada/futura.svg` + [`futura.md`](futura.md) | pronto (proposta, nada implementado); gerado por `detalhada/fonte/gerar_futura.py` |
| `resumida/futura.svg` | pronto (4:5, mesmo layout de `resumida/atual.svg`, com cada peça explicada em palavras simples); gerado por `resumida/fonte/gerar_futura.py` |

Para exportar PNG: abra o SVG no Chrome (ou headless com `--screenshot --force-device-scale-factor=2`).
