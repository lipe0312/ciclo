# ADR-0009 · pdf.js sob demanda para ler exames no aparelho
**Status:** aceito (issue #27; decisão do dono: opção A da issue)

**Contexto:** o Diário → Saúde → Exames aceita o laudo em PDF (até 5 MB). O Claude precisa só do **texto**; o arquivo não deve ir para o servidor, para o R2 nem para terceiros. A outra opção era aceitar só texto colado (zero dependência), pior no celular.

**Decisão:**
- Nova dependência de runtime do front: **`pdfjs-dist` 6.4.299** (Apache-2.0), versão exata, só a build `legacy` (navegadores mais antigos do celular).
- Carregada **sob demanda**: `screens/diario/pdf.ts` só é importado (`import()`) quando a pessoa escolhe um PDF na tela de exames. O chunk do pdf.js e o worker (`pdf.worker.min.mjs?url`) saem da mesma origem; o bundle principal não muda.
- Compatível com a CSP estrita (`script-src 'self'`, `worker-src 'self'`): sem script inline, sem CDN. Só a camada de texto: `disableFontFace`, `useWasm: false`, `enableXfa: false`, sem cMaps/fontes remotas; até 40 páginas e 60 mil caracteres.
- Limite de 5 MB e "só PDF" no core (`checkExamFile`, testado: 5 MB aceito, 6 MB recusado). O servidor nunca recebe o arquivo (`POST /api/exames` só aceita JSON com o texto; corpo grande → 413).
- **Retenção:** o texto bruto fica em `health_exam.raw_text` só até `ciclo_exame_concluir` (que grava o resumo e apaga o texto na mesma escrita) ou, no máximo, **7 dias** (cron de 30 min + limpeza na leitura). Fica só o resumo estruturado (marcadores com "dentro/fora da referência" do próprio laudo) e o aviso "não é diagnóstico".

**Consequências:** ~0,5 MB (pdf.js) + ~1,3 MB (worker) baixados só por quem abre um PDF. PDF escaneado (imagem, sem camada de texto) não é lido: a tela pede para colar o texto. Atualizar o pdf.js segue a regra de versões fixadas com ≥ 2 semanas (Dependabot).
