# ADR-0014 · Open Food Facts na busca de alimento das porções
**Status:** aceito (issue #80, decisão do dono de 2026-11-16)

## Contexto
A camada de IA de porções (#80) só pode escolher alimentos de uma lista de candidatos (o validador recusa alimento inventado). A base comum (30 alimentos), os pratos comuns e o subconjunto da TACO não cobrem industrializados ("bebida láctea X", "barra de proteína Y").

## Decisão
- `buscar_alimento(nome)` consulta, nesta ordem: a TACO local (`apps/worker/src/taco.ts`) e, só se ela não achar nada, a API pública do **Open Food Facts** (`world.openfoodfacts.org/cgi/search.pl`), por `fetch`, sem SDK nem dependência nova.
- **Só o nome do alimento sai**: o trecho não reconhecido, normalizado (sem acento, só letras e números, até 60 caracteres). Nunca a frase inteira, a conta, o e-mail ou o IP do usuário (a chamada sai do Worker). User-Agent genérico.
- **Timeout de 2 s.** Falhou ou demorou: segue sem o candidato (fica a regra).
- **Cache global no D1** (`alimento_externo`), chave = SHA-256 do nome normalizado, 30 dias. Só dado público (nome do produto, kcal e proteína por 100 g).
- A resposta é validada: código de barras de 6 a 14 dígitos, kcal 0–900 e proteína 0–100 por 100 g; o nome do produto é limpo de marcação. Os valores passam pelo mesmo validador da IA.

## Consequências
- Rede de saída nova, documentada em `docs/03-seguranca.md`. Sem dado pessoal.
- Dados do Open Food Facts são colaborativos (ODbL): servem para estimativa média, nunca para uso clínico. A atribuição fica no `THIRD_PARTY.md` quando houver tela que mostre a fonte.
- Desligar: remover a chamada em `buscarOpenFoodFacts` (nada mais depende dela).
