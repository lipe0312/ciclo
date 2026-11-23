"""Gera docs/arquitetura/detalhada/futura.svg: arquitetura-alvo do Ciclo (milhões de contas), mesmo formato do atual.svg.
Uso: python3 -I docs/arquitetura/detalhada/fonte/gerar_futura.py docs/arquitetura/detalhada/futura.svg
Premissas, metas e recursos a confirmar: docs/arquitetura/futura.md. Nada aqui é implementado ainda."""
import sys, textwrap

OUT = sys.argv[1]
W = 1800
CWF = 0.545  # largura média do caractere / tamanho da fonte (Inter-like)

# ---------------------------------------------------------------- utilidades
def esc(t): return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def wrap(t, width, fs):
    n = max(10, int(width / (fs * CWF)))
    return textwrap.wrap(t, n, break_long_words=False)

def bullets(x, y, items, width, fs=12.6, lh=19.5, dot="• ", cls="t", gap=5):
    out, cy = [], y
    for it in items:
        ls = wrap(it, width - fs * 1.1, fs)
        for i, l in enumerate(ls):
            if i == 0:
                out.append(f'<text x="{x}" y="{cy}" class="{cls}" font-size="{fs}">{dot}{esc(l)}</text>')
            else:
                out.append(f'<text x="{x + fs * 0.9:.1f}" y="{cy}" class="{cls}" font-size="{fs}">{esc(l)}</text>')
            cy += lh
        cy += gap
    return "\n".join(out), cy

def height_of(items, width, fs=12.6, lh=19.5, gap=5):
    return sum(len(wrap(it, width - fs * 1.1, fs)) * lh + gap for it in items)

def use(name, x, y, s, color):
    return f'<use href="#i-{name}" x="{x}" y="{y}" width="{s}" height="{s}" style="stroke:{color}"/>'

def tag(x, y, label, color="#B45309", bg="#FEF3C7"):
    w = round(len(label) * 5.6 + 12)
    return (f'<rect x="{x - w}" y="{y}" width="{w}" height="16" rx="8" fill="{bg}" stroke="{color}" stroke-width="0.8"/>'
            f'<text x="{x - w / 2}" y="{y + 11.5}" text-anchor="middle" font-size="9.5" font-weight="700" fill="{color}">{label}</text>')

def card(x, y, w, h, title, lines, ic, color, stroke="#CBD5E1", dash=False, fs=12.4, tg=None, fill="#FFFFFF"):
    d = ' stroke-dasharray="6 4"' if dash else ""
    s = [f'<g filter="url(#sh)"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{fill}" stroke="{stroke}" stroke-width="1.3"{d}/></g>']
    s.append(use(ic, x + 12, y + 10, 21, color))
    s.append(f'<text x="{x + 40}" y="{y + 26}" class="h" fill="{color}">{esc(title)}</text>')
    b, _ = bullets(x + 14, y + 52, lines, w - 26, fs=fs, lh=18, gap=3.5, cls="m")
    s.append(b)
    if tg: s.append(tag(x + w - 8, y + 9, tg))
    return "\n".join(s)

def cyl(x, y, w, h, stroke, fill, ry=9, sw=1.4):
    return (f'<path d="M{x} {y} v{h} a{w / 2} {ry} 0 0 0 {w} 0 v-{h}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'
            f'<ellipse cx="{x + w / 2}" cy="{y}" rx="{w / 2}" ry="{ry}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

def arrow(x1, y1, x2, y2, dashed=False, color="#334155", both=False, w=2):
    d = ' stroke-dasharray="6 5"' if dashed else ""
    ms = ' marker-start="url(#ar)"' if both else ""
    return f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{color}" stroke-width="{w}" fill="none" marker-end="url(#ar)"{ms}{d}/>'

def lblpill(x, y, label, fs=11.5):
    w = round(len(label) * fs * 0.56 + 14)
    return (f'<rect x="{x}" y="{y}" width="{w}" height="19" rx="4" fill="#FFFFFF" stroke="#CBD5E1"/>'
            f'<text x="{x + 7}" y="{y + 13.5}" class="lbl" font-size="{fs}">{esc(label)}</text>')

def zone(x, y, w, h, color, fill, label, ic=None, lx=14):
    lw = round(len(label) * 9.1 + (40 if ic else 24))
    s = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{fill}" stroke="{color}" stroke-width="1.5" stroke-dasharray="8 6"/>',
         f'<rect x="{x + lx}" y="{y - 10}" width="{lw}" height="20" rx="4" fill="{color}"/>']
    tx = x + lx + 10
    if ic:
        s.append(use(ic, x + lx + 4, y - 9, 18, "#FFFFFF")); tx = x + lx + 28
    s.append(f'<text x="{tx}" y="{y + 4}" class="zl" fill="#FFFFFF" font-size="11">{esc(label)}</text>')
    return "\n".join(s)

def panel(x, y, w, h, title, ic, color, tint, border, items, fs=12.6):
    s = [f'<g filter="url(#sh)"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="#FFFFFF" stroke="{border}" stroke-width="1.3"/></g>',
         f'<path d="M{x} {y + 12} a12 12 0 0 1 12 -12 h{w - 24} a12 12 0 0 1 12 12 v30 h-{w} z" fill="{tint}"/>',
         use(ic, x + 16, y + 9, 22, color),
         f'<text x="{x + 46}" y="{y + 26}" class="h" fill="{color}">{esc(title)}</text>']
    b, _ = bullets(x + 18, y + 64, items, w - 34, fs=fs)
    s.append(b)
    return "\n".join(s)

# ---------------------------------------------------------------- conteúdo
CLIENTES = [
    ("phone", "App PWA local-first", "#2563EB", [
        "Preact + @ciclo/core no aparelho: ação em < 50 ms",
        "Service Worker e fila offline com idempotência",
        "Sincronização por delta (versão da conta) e WebSocket",
        "Passkey; Face ID em ação sensível",
        "Orçamento de JS e Web Vitals no CI"]),
    ("chat", "IA da pessoa (MCP)", "#2563EB", [
        "claude.ai · ChatGPT · Cursor, por uma URL",
        "OAuth 2.1 + PKCE, token de 1 h, escopo ler/escrever",
        "Escrita destrutiva só com prévia + confirmar",
        "Usa a assinatura da pessoa: custo de IA zero para o app"]),
    ("term", "Claude Code (Mac)", "#2563EB", [
        "Ponte stdio para HTTPS, mesmo MCP e mesmo escopo",
        "Anexa mídia do Mac (pastas permitidas)",
        "Skills e subagentes de revisão",
        "Sem dependência de runtime"]),
    ("clock", "Rotinas de IA", "#2563EB", [
        "Hoje: processo agendado no Mac que drena a caixa",
        "Alvo: consumidores de fila no servidor, na chave da pessoa",
        "Resposta em segundos, não em minutos",
        "Falha vai para a fila de mortos (DLQ)"]),
]
SERVICOS = [
    ("key", "Auth", "#4F46E5", ["Passkey, convite, recuperação", "Servidor OAuth 2.1 (PKCE)", "Sessão com rotação e revogação", "Step-up de Face ID", "Escreve só no plano de controle"]),
    ("cpu", "API", "#4F46E5", ["REST validada por schema", "Chama o @ciclo/core (regra única)", "Fala com o objeto da conta", "Delta sync + ETag"]),
    ("plug", "MCP", "#4F46E5", ["JSON-RPC sem estado, 39 ferramentas", "Prévia e confirmação nas escritas", "Texto do usuário é dado", "Limite por ferramenta"]),
    ("image", "Mídia", "#4F46E5", ["URL assinada: upload direto ao R2", "Tipo por magic bytes (fila de verificação)", "Cota por conta, contada no objeto", "Leitura por URL curta"]),
    ("spark", "Serviço de IA", "#4F46E5", ["Cache, retry e fallback entre provedores", "Teto em US$ por conta, reservado antes", "Chave do usuário em envelope (DEK)", "Saída validada pelo core"]),
]

SEG = [
    "Isolamento físico: um SQLite por conta, sem JOIN entre contas; erro de filtro não vaza dado",
    "Criptografia por conta: dado de saúde cifrado com DEK da conta e KEK no KMS; apagar a chave apaga o dado (crypto-shredding)",
    "Passkey, sessão com rotação, Face ID em ação sensível e detecção de anomalia (país, aparelho)",
    "WAF gerenciado + bot management + rate limit de borda + Turnstile, em domínio próprio com DNSSEC",
    "Log de auditoria só de acréscimo, com hash em cadeia, em bucket com retenção",
    "Menor privilégio: cada Worker enxerga só os bindings de que precisa; segredos fora do código",
    "Nenhum acesso humano a dado de saúde; emergência por break-glass com aprovação e auditoria",
    "Cadeia de suprimentos: SAST, SCA, SBOM, provenance (SLSA), CI sem segredo de longa duração",
    "Pentest anual, security.txt e divulgação responsável; modelo de ameaças por fronteira",
    "LGPD: RIPD, encarregado, exportar e apagar automatizados e transferência internacional com salvaguardas",
]
PERF = [
    "Ação local < 50 ms: o core roda no aparelho e a escrita é otimista",
    "Sincronização por delta + ETag no lugar de recarregar tudo; WebSocket no lugar do polling de 8 s",
    "Objeto da conta perto da pessoa (location hint). A América do Sul ainda não hospeda objetos: o caminho vai à costa leste dos EUA, medir na PoC",
    "Cache de borda: estáticos imutáveis, catálogo versionado, consultas de alimento e endereço",
    "IA, push, export e verificação de mídia saem do caminho crítico (filas)",
    "Smart Placement para Workers que falam com o plano de controle",
    "HTTP/3, compressão e orçamento de 130 KB de JS no CI",
    "Orçamento de latência por rota no k6; regressão trava o merge",
    "Metas (a validar): sync p95 < 500 ms a partir do Brasil; catálogo na borda < 100 ms",
]
ESC = [
    "Escala horizontal por construção: 1 objeto por conta, sem ponto único de escrita",
    "O único ponto global é o plano de controle (pequeno e quente): réplicas de leitura e cache de sessão no Gateway",
    "Objeto ocioso hiberna: custo de quem não usa tende a zero",
    "Custo = requisições + tempo ativo dos objetos + linhas lidas e escritas + GB-mês (objetos e R2) + operações de fila",
    "Exemplo (premissas): 1 M contas, 20% ativas por dia, 100 req/dia ≈ 20 M req/dia ≈ 230 req/s na média e ~2,3 mil no pico",
    "Mídia no R2 sem custo de saída, com cota por conta e ciclo de vida",
    "IA fora do orçamento: assinatura ou chave da pessoa; Gateway com cache e teto",
    "Guarda-corpos: orçamento por conta, alerta de billing a 80% e chave de corte",
    "Preço unitário: a confirmar nas páginas oficiais antes de decidir (nada foi assumido aqui)",
]
OBS = [
    "Traces OpenTelemetry de ponta a ponta: Gateway, serviço, objeto da conta e fila, com request-id em tudo",
    "Métricas RED por rota e por ferramenta MCP; métricas de produto agregadas, sem dado de saúde",
    "Logs estruturados sem dado pessoal, exportados para armazenamento e SIEM",
    "SLOs com alerta de queima de orçamento de erro (disponibilidade 99,9%, latência p95)",
    "RUM: Web Vitals e erros do app no aparelho real",
    "Checagens sintéticas de login, abrir o app e MCP, de várias regiões",
    "Painel de custo por conta e global",
    "Status page, runbooks e plantão",
]
DR = [
    "Recuperação a qualquer ponto dos últimos 30 dias por conta: restaura uma pessoa sem tocar nas outras",
    "Snapshot diário por conta, cifrado, no R2 e copiado para um segundo provedor com outra chave",
    "Plano de controle: Time Travel do D1 (a confirmar) + export periódico fora da Cloudflare",
    "Metas: perda máxima 5 min (RPO) e volta em 1 h (RTO), com ensaio de restauração a cada trimestre",
    "Falha de região: o app segue offline e a fila de escrita reenvia quando voltar",
    "Saída do fornecedor: dado exportável em formato aberto (o export por conta já existe)",
    "Exclusão com comprovante: crypto-shredding mais saga que apaga R2, snapshots e cópias",
]
ENT = [
    "Infra como código (wrangler + provider Terraform da Cloudflare), revisada em PR",
    "Ambiente efêmero por PR com Worker, objeto e R2 próprios; passkey exige origem fixa, então o staging usa domínio próprio",
    "Deploy gradual por porcentagem com rollback automático por SLO. Objetos rodam uma versão por vez: testar a migração de schema antes",
    "Migração em duas fases (expandir, depois contrair), com versão de schema por objeto",
    "k6 no CI: carga, soak e pico, com orçamento de latência",
    "Teste de caos: fila lenta, objeto indisponível, provedor de IA fora",
    "Feature flags por coorte (liberar o teste fechado aos poucos)",
    "SAST, SCA, SBOM e DAST no pipeline, com artefato assinado",
]
LACUNAS = ["observabilidade", "teste de carga", "backup com restauração ensaiada", "infra como código", "deploy gradual com rollback",
           "fila e tempo real", "sharding por conta", "SAST · SCA · SBOM · pentest", "WAF e domínio próprio", "modelo de custo"]

# ---------------------------------------------------------------- conteúdo extra e layout vertical (dinâmico)
CTRL = ["Contas, passkeys, sessões, OAuth e convites",
        "Cotas e uso diário (agregado)",
        "Diretório conta → objeto e região",
        "Réplicas de leitura com Sessions API: lê o que acabou de escrever",
        "Só escrito pelo Auth e pelo Gateway"]
DOB = ["SQLite embutido: as tabelas de dado da pessoa ficam dentro do objeto",
       "Consistência forte por conta; zero JOIN entre contas",
       "WebSocket hibernável: tempo real e custo próximo de zero ocioso",
       "Alarmes por conta (push, fechar treino, purgas) no lugar do cron global",
       "Limites: 10 GB por objeto e ~1.000 req/s (soft)"]
ASYNC = ["Consumidores idempotentes, retry com backoff e reprocesso da DLQ",
         "Workflows (execução durável, dormem por dias): fim do teste, exclusão em cascata e export",
         "Fan-out por conta no lugar de um cron que varre todo mundo",
         "Retenção da fila de 4 a 14 dias; sem custo de saída"]
STORAGE = [
    ("image", "R2 · mídia privada", ["u/<conta>/<id aleatório>, bucket privado", "Upload direto por URL assinada", "Ciclo de vida: lixeira, depois apagar", "Cota por conta, contada no objeto"], "#065F46", "#059669", "#ECFDF5", False, None),
    ("copy", "R2 · retenção", ["Snapshot diário por conta, cifrado", "Auditoria só de acréscimo, com hash em cadeia", "Bucket com retenção (lock)"], "#065F46", "#059669", "#ECFDF5", False, "lock: a confirmar"),
    ("key", "Segredos e chaves", ["Secrets Store da conta (beta)", "KEK no KMS externo; DEK por conta", "Rotação versionada; acesso auditado"], "#065F46", "#059669", "#FFFFFF", False, "beta"),
    ("mic", "Workers AI (opcional)", ["Whisper: voz em texto (pt-BR)", "Porções: 1ª camada barata", "Cache por hash do texto"], "#475569", "#94A3B8", "#FFFFFF", True, None),
]
C_CARDS = [
    ("spark", "LLMs com a chave da pessoa", ["Anthropic · OpenAI · Gemini · OpenRouter · DeepSeek", "Só via serviço de IA: cache, fallback e teto", "Sem redirect; erro do provedor descartado"], False, "s"),
    ("key", "KMS externo", ["Guarda a KEK; o Worker só pede para cifrar e decifrar", "A chave nunca sai do KMS"], False, "s"),
    ("leaf", "Open Food Facts · Nominatim", ["Só o texto necessário, com cache de borda", "Limite global de consultas"], False, "s"),
    ("bell", "Turnstile · Web Push", ["Anti-robô no convite e no login suspeito", "Push sem conteúdo pessoal"], False, "s"),
    ("eye", "Observabilidade e SIEM", ["OTel, métricas e logs sem dado pessoal", "Produto a escolher (Grafana, Datadog…)", "Alerta de SLO e de custo"], True, "a"),
    ("copy", "Backup em 2º provedor", ["Armazenamento compatível com S3", "Snapshot cifrado com outra chave", "Restauração ensaiada a cada trimestre"], True, "a"),
    ("git", "GitHub · CI/CD", ["IaC revisada em PR; ambiente por PR", "SAST, SCA, SBOM, k6 e DAST", "Artefato assinado e provenance", "Deploy gradual com rollback por SLO"], False, "d"),
]

def ch(lines, w, fs=12.4):
    return 52 + height_of(lines, w - 26, fs=fs, lh=18, gap=3.5) + 4

cw, cg = 315, 20
sw, sg = 252, 15
stw, stg = 315, 20
TX, TW = 1436, 318
A_H = max(ch(c[3], cw) for c in CLIENTES)
ZA_Y, CARD_A_Y = 125, 146
ZA_H = (CARD_A_Y - ZA_Y) + A_H + 14
ZB_Y = ZA_Y + ZA_H + 46
EDGE_Y = ZB_Y + 24
GW_Y = EDGE_Y + 74
SV_Y = GW_Y + 92 + 36
S_H = max(ch(s[3], sw) for s in SERVICOS)
DT_Y = SV_Y + S_H + 38
D_H = max(110 + height_of(CTRL, 350, 12.4, 18, 3.5), 132 + height_of(DOB, 436, 12.4, 18, 3), 110 + height_of(ASYNC, 400, 12.4, 18, 3)) + 10
ST_Y = DT_Y + D_H + 36
ST_H = max(ch(s[2], stw) for s in STORAGE)
cy_, C_POS = CARD_A_Y, []
for ic_, t_, ls_, dash_, kind_ in C_CARDS:
    hh = ch(ls_, TW)
    C_POS.append((cy_, hh)); cy_ += hh + 14
C_END = cy_ - 14 + 16
ZB_H = max(ST_Y + ST_H + 20, C_END) - ZB_Y

PX, PW, PG = 30, 570, 15
row1_h = max(height_of(l, PW - 34) for l in (SEG, PERF, ESC)) + 78
row2_h = max(height_of(l, PW - 34) for l in (OBS, DR, ENT)) + 78
P1_Y = ZB_Y + ZB_H + 34
P2_Y = P1_Y + row1_h + 16
LAC_Y = P2_Y + row2_h + 24
def _rows():
    lx, rows = 46, 1
    for lab in LACUNAS:
        w = round(len(lab) * 7.3 + 24)
        if lx + w > 1752: lx, rows = 46, rows + 1
        lx += w + 8
    return rows
LAC_H = 52 + _rows() * 32 + 8
H = int(LAC_Y + LAC_H + 44)

P = []
P.append(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
  <title>Ciclo · arquitetura alvo (milhões de contas)</title>
  <desc>Proposta de arquitetura para escalar o Ciclo a milhões de contas com baixo custo: borda com WAF, gateway, serviços separados, plano de controle global, um SQLite por conta em Durable Objects, filas, workflows, mídia no R2, criptografia por conta, observabilidade, backup em dois provedores e entrega com rollout gradual.</desc>
  <defs>
    <style>
      .t {{ fill:#0F172A; }} .m {{ fill:#475569; }} .s {{ fill:#64748B; font-size:11px; }} .b {{ font-weight:700; }}
      .h {{ font-size:15px; font-weight:700; }} .mono {{ font-family:'JetBrains Mono', SFMono-Regular, Menlo, Consolas, monospace; }}
      .zl {{ font-weight:800; letter-spacing:1.2px; }} .lbl {{ fill:#334155; font-weight:600; }}
      .ico {{ fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }}
    </style>
    <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#334155"/></marker>
    <filter id="sh" x="-5%" y="-5%" width="110%" height="120%"><feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#0F172A" flood-opacity="0.08"/></filter>
    <symbol id="i-lock" viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2" class="ico"/><path d="M8 11V7a4 4 0 0 1 8 0v4" class="ico"/></symbol>
    <symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z" class="ico"/></symbol>
    <symbol id="i-warn" viewBox="0 0 24 24"><path d="M12 3 2 21h20z" class="ico"/><path d="M12 10v5M12 18v.5" class="ico"/></symbol>
    <symbol id="i-phone" viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2.5" class="ico"/><path d="M10.5 18.5h3" class="ico"/></symbol>
    <symbol id="i-chat" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" class="ico"/><path d="M8 9.5h8M8 12.5h5" class="ico"/></symbol>
    <symbol id="i-term" viewBox="0 0 24 24"><rect x="2.5" y="4" width="19" height="16" rx="2" class="ico"/><path d="m6.5 9.5 3 2.5-3 2.5M12 15h5" class="ico"/></symbol>
    <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" class="ico"/><path d="M12 7v5l3 2" class="ico"/></symbol>
    <symbol id="i-cloud" viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" class="ico"/></symbol>
    <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 2 4 5.5v6c0 5 3.5 8.5 8 10.5 4.5-2 8-5.5 8-10.5v-6z" class="ico"/><path d="m8.5 12 2.5 2.5 4.5-5" class="ico"/></symbol>
    <symbol id="i-key" viewBox="0 0 24 24"><circle cx="8" cy="15" r="4.5" class="ico"/><path d="m11.5 11.5 8-8M16.5 6.5l2.5 2.5M14 9l2 2" class="ico"/></symbol>
    <symbol id="i-cpu" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2" class="ico"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" class="ico"/></symbol>
    <symbol id="i-git" viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.5" class="ico"/><circle cx="6" cy="18" r="2.5" class="ico"/><circle cx="18" cy="8" r="2.5" class="ico"/><path d="M6 8.5v7M18 10.5c0 4-6 3-11 6" class="ico"/></symbol>
    <symbol id="i-plug" viewBox="0 0 24 24"><path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5" class="ico"/></symbol>
    <symbol id="i-image" viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="15" rx="2" class="ico"/><circle cx="8.5" cy="9.5" r="1.6" class="ico"/><path d="m21 15.5-5-5-9 9" class="ico"/></symbol>
    <symbol id="i-spark" viewBox="0 0 24 24"><path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z" class="ico"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" class="ico"/></symbol>
    <symbol id="i-db" viewBox="0 0 24 24"><ellipse cx="12" cy="5.5" rx="8" ry="3" class="ico"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" class="ico"/></symbol>
    <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" class="ico"/><circle cx="12" cy="12" r="3" class="ico"/></symbol>
    <symbol id="i-chart" viewBox="0 0 24 24"><path d="M5 20V11M11 20V5M17 20v-6M2.5 20h19" class="ico"/></symbol>
    <symbol id="i-layers" viewBox="0 0 24 24"><path d="M3 7.5l9-4.5 9 4.5-9 4.5z" class="ico"/><path d="M3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5" class="ico"/></symbol>
    <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7" class="ico"/><path d="M20 4v5h-5" class="ico"/></symbol>
    <symbol id="i-box" viewBox="0 0 24 24"><path d="M21 8l-9-5-9 5 9 5z" class="ico"/><path d="M3 8v8l9 5 9-5V8M12 13v8" class="ico"/></symbol>
    <symbol id="i-bell" viewBox="0 0 24 24"><path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" class="ico"/><path d="M10 21h4" class="ico"/></symbol>
    <symbol id="i-map" viewBox="0 0 24 24"><path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" class="ico"/><path d="M9 4v13.5M15 6.5V20" class="ico"/></symbol>
    <symbol id="i-leaf" viewBox="0 0 24 24"><path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15" class="ico"/><path d="M5 19c3-4 6-6.5 10-8.5" class="ico"/></symbol>
    <symbol id="i-mic" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" class="ico"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" class="ico"/></symbol>
    <symbol id="i-queue" viewBox="0 0 24 24"><rect x="2.5" y="6" width="5" height="12" rx="1" class="ico"/><rect x="9.5" y="6" width="5" height="12" rx="1" class="ico"/><path d="M17 8l4.5 4-4.5 4" class="ico"/></symbol>
    <symbol id="i-flow" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="5" rx="1" class="ico"/><rect x="14" y="16" width="7" height="5" rx="1" class="ico"/><path d="M6.5 8v4h11v4" class="ico"/></symbol>
    <symbol id="i-copy" viewBox="0 0 24 24"><rect x="8" y="8" width="13" height="13" rx="2" class="ico"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" class="ico"/></symbol>
  </defs>
  <rect width="{W}" height="{H}" fill="#F7F8FA"/>''')

# ---------------------------------------------------------------- cabeçalho
P.append('<text x="40" y="40" class="zl" fill="#059669" font-size="12">DEPOIS · ARQUITETURA ALVO · MILHÕES DE CONTAS · PROPOSTA, NADA IMPLEMENTADO</text>')
P.append('<text x="40" y="76" fill="#0F172A" font-size="30" font-weight="800">Ciclo: o mesmo produto, desenhado para escalar sem perder segurança</text>')
P.append('<text x="40" y="102" class="m" font-size="14">Metas a validar: p95 de sincronização &lt; 500 ms · disponibilidade 99,9% · RPO 5 min e RTO 1 h · custo proporcional ao uso · dado de saúde cifrado por conta</text>')
chips = [("1 SQLite por conta", "#ECFDF5", "#A7F3D0", "#065F46", 150), ("Filas + Workflows", "#EEF2FF", "#C7D2FE", "#3730A3", 148),
         ("Criptografia por conta", "#FEF2F2", "#FECACA", "#991B1B", 170), ("Backup em 2 provedores", "#FFFBEB", "#FDE68A", "#92400E", 180),
         ("Deploy gradual", "#F5F3FF", "#DDD6FE", "#5B21B6", 130)]
cx = 1770
for label, bg, bd, fg, w in reversed(chips):
    cx -= w
    P.append(f'<rect x="{cx}" y="26" width="{w}" height="30" rx="15" fill="{bg}" stroke="{bd}"/><text x="{cx + w / 2}" y="46" text-anchor="middle" font-size="12.5" font-weight="700" fill="{fg}">{label}</text>')
    cx -= 8
P.append('<g transform="translate(1290 72)" class="s">'
         '<line x1="0" y1="10" x2="34" y2="10" stroke="#334155" stroke-width="1.8" marker-end="url(#ar)"/><text x="42" y="14">síncrono</text>'
         '<line x1="110" y1="10" x2="144" y2="10" stroke="#334155" stroke-width="1.8" stroke-dasharray="5 4" marker-end="url(#ar)"/><text x="152" y="14">assíncrono</text>'
         '<rect x="236" y="2" width="30" height="16" rx="3" fill="none" stroke="#2563EB" stroke-width="1.5" stroke-dasharray="6 4"/><text x="274" y="14">fronteira de confiança</text>'
         '<rect x="414" y="1" width="62" height="16" rx="8" fill="#FEF3C7" stroke="#B45309" stroke-width="0.8"/><text x="445" y="12.5" text-anchor="middle" font-size="9.5" font-weight="700" fill="#B45309">a confirmar</text></g>')

# ---------------------------------------------------------------- zona A: clientes
P.append(zone(30, ZA_Y, 1360, ZA_H, "#2563EB", "#EFF6FF", "INTERNET · ZONA NÃO CONFIÁVEL"))
cxs = [50 + i * (cw + cg) for i in range(4)]
for x, (ic, t, col, ls) in zip(cxs, CLIENTES):
    P.append(card(x, CARD_A_Y, cw, A_H, t, ls, ic, col, stroke="#93C5FD", dash=(t == "Rotinas de IA")))
mids = [x + cw / 2 for x in cxs]

# ---------------------------------------------------------------- zona B: Cloudflare
P.append(zone(30, ZB_Y, 1360, ZB_H, "#F38020", "#FFF7ED", "CLOUDFLARE · PLANO PAGO", "cloud", lx=235))
P.append(f'<rect x="50" y="{EDGE_Y}" width="1320" height="44" rx="8" fill="#FFEDD5" stroke="#FDBA74"/>')
P.append(use("shield", 62, EDGE_Y + 10, 24, "#C2410C"))
P.append(f'<text x="94" y="{EDGE_Y + 27}" class="t" font-size="12.6"><tspan class="b" fill="#9A3412">EDGE anycast</tspan>  ·  domínio próprio + DNSSEC  ·  TLS 1.3 + HSTS preload  ·  WAF gerenciado  ·  bot management  ·  rate limit de borda  ·  Turnstile  ·  cache de estáticos e do catálogo  ·  HTTP/3</text>')
protos = ["HTTPS · passkey · WebSocket", "MCP · OAuth 2.1", "MCP · token", "MCP · token"]
for m, pr in zip(mids, protos):
    P.append(arrow(m, CARD_A_Y + A_H, m, EDGE_Y - 1))
    P.append(lblpill(m + 8, ZA_Y + ZA_H + 12, pr))
    P.append(arrow(m, EDGE_Y + 44, m, GW_Y - 1))
# gateway
P.append(f'<g filter="url(#sh)"><rect x="50" y="{GW_Y}" width="1320" height="92" rx="10" fill="#FFFFFF" stroke="#6366F1" stroke-width="1.5"/></g>')
P.append(f'<path d="M50 {GW_Y + 10} a10 10 0 0 1 10 -10 h1300 a10 10 0 0 1 10 10 v20 h-1320 z" fill="#4F46E5"/>')
P.append(use("layers", 62, GW_Y + 2, 22, "#FFFFFF"))
P.append(f'<text x="92" y="{GW_Y + 16}" fill="#FFFFFF" font-size="14" font-weight="700">GATEWAY · Worker de entrada (único ponto público)</text>')
P.append(f'<text x="1356" y="{GW_Y + 16}" fill="#C7D2FE" font-size="11.5" text-anchor="end">service bindings para os serviços · sem estado</text>')
gl = wrap("valida a sessão ou o token (com cache local)  ·  rate limit por conta e por IP  ·  idempotência e request-id para o trace  ·  roteia a conta para o plano de dados  ·  CSP com nonce e headers de segurança  ·  nega por padrão", 1290, 12.6)
for i, l in enumerate(gl):
    P.append(f'<text x="66" y="{GW_Y + 54 + i * 19}" class="t" font-size="12.6">{esc(l)}</text>')
# serviços
sxs = [50 + i * (sw + sg) for i in range(5)]
smid = [x + sw / 2 for x in sxs]
for x, m, (ic, t, col, ls) in zip(sxs, smid, SERVICOS):
    P.append(arrow(m, GW_Y + 92, m, SV_Y - 2))
    P.append(card(x, SV_Y, sw, S_H, t, ls, ic, col, stroke="#A5B4FC"))
# plano de controle
SB = SV_Y + S_H
for m in (smid[0], 470, smid[2]):
    P.append(arrow(m, SB, m, DT_Y - 1))
for m in (smid[3], smid[4]):
    P.append(arrow(m, SB, m, DT_Y - 1, dashed=True))
P.append(f'<g filter="url(#sh)"><rect x="50" y="{DT_Y}" width="380" height="{D_H}" rx="12" fill="#ECFDF5" stroke="#059669" stroke-width="1.5"/></g>')
P.append(cyl(72, DT_Y + 26, 86, 58, "#059669", "#D1FAE5"))
P.append(use("db", 91, DT_Y + 44, 26, "#065F46"))
P.append(f'<text x="172" y="{DT_Y + 42}" class="h" fill="#065F46">PLANO DE CONTROLE</text>')
P.append(f'<text x="172" y="{DT_Y + 60}" class="m" font-size="12.5">D1 global · pequeno e quente</text>')
P.append(tag(414, DT_Y + 10, "a confirmar: réplicas"))
b, _ = bullets(66, DT_Y + 110, CTRL, 350, fs=12.4, lh=18, gap=3.5, cls="m"); P.append(b)
# plano de dados
P.append(f'<g filter="url(#sh)"><rect x="450" y="{DT_Y}" width="470" height="{D_H}" rx="12" fill="#ECFDF5" stroke="#059669" stroke-width="2.2"/></g>')
P.append(f'<text x="466" y="{DT_Y + 26}" class="h" fill="#065F46">PLANO DE DADOS · 1 Durable Object por conta</text>')
P.append(tag(906, DT_Y + 10, "PITR 30 dias"))
for i, lab in enumerate(["conta A", "conta B", "conta C", "…", "milhões"]):
    x = 470 + i * 88
    if lab == "…":
        P.append(f'<text x="{x + 36}" y="{DT_Y + 92}" text-anchor="middle" font-size="22" font-weight="800" fill="#059669">…</text>'); continue
    P.append(cyl(x, DT_Y + 62, 72, 34, "#059669", "#D1FAE5" if lab != "milhões" else "#FFFFFF", ry=8))
    P.append(f'<text x="{x + 36}" y="{DT_Y + 86}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#065F46">{lab}</text>')
b, _ = bullets(466, DT_Y + 132, DOB, 436, fs=12.4, lh=18, gap=3, cls="m"); P.append(b)
# assíncrono
P.append(f'<g filter="url(#sh)"><rect x="940" y="{DT_Y}" width="430" height="{D_H}" rx="12" fill="#FFFFFF" stroke="#6366F1" stroke-width="1.5"/></g>')
P.append(use("queue", 954, DT_Y + 10, 24, "#4F46E5"))
P.append(f'<text x="986" y="{DT_Y + 28}" class="h" fill="#3730A3">ASSÍNCRONO · Queues e Workflows</text>')
qx = 954
for lab in ["ia", "push", "export", "exclusão", "mídia"]:
    w = round(len(lab) * 7 + 20)
    P.append(f'<rect x="{qx}" y="{DT_Y + 44}" width="{w}" height="24" rx="12" fill="#EEF2FF" stroke="#C7D2FE"/><text x="{qx + w / 2}" y="{DT_Y + 60}" text-anchor="middle" font-size="12" font-weight="700" fill="#3730A3">{lab}</text>')
    qx += w + 8
P.append(f'<text x="954" y="{DT_Y + 92}" class="m" font-size="12" font-weight="700">Filas com DLQ</text>')
b, _ = bullets(954, DT_Y + 110, ASYNC, 400, fs=12.4, lh=18, gap=3, cls="m"); P.append(b)
# armazenamento
stx = [50 + i * (stw + stg) for i in range(4)]
DB_ = DT_Y + D_H
for x, (ic, t, ls, col, bd, fill, dash, tg) in zip(stx, STORAGE):
    P.append(card(x, ST_Y, stw, ST_H, t, ls, ic, col, stroke=bd, dash=dash, fill=fill, tg=tg))
P.append(arrow(540, DB_, 540, ST_Y - 1, dashed=True)); P.append(lblpill(548, DB_ + 8, "snapshot · auditoria", 10.5))
P.append(arrow(800, DB_, 800, ST_Y - 1)); P.append(lblpill(808, DB_ + 8, "DEK", 10.5))
P.append(arrow(1150, DB_, 1150, ST_Y - 1, dashed=True))

# ---------------------------------------------------------------- zona C: terceiros
P.append(zone(1420, ZA_Y, 350, ZB_Y + ZB_H - ZA_Y, "#475569", "#F1F5F9", "TERCEIROS · SAÍDA POR ALLOWLIST"))
src_y = SV_Y + S_H / 2
ys, last_a, gh = [], None, None
for (ic, t, ls, dash, kind), (y, h) in zip(C_CARDS, C_POS):
    P.append(card(TX, y, TW, h, t, ls, ic, "#334155", dash=dash))
    cyc = y + h / 2
    if kind in ("s", "a"):
        ys.append((cyc, kind))
    else:
        gh = cyc
top, bot = min(y for y, _ in ys), max(y for y, _ in ys)
top, bot = min(top, src_y), max(bot, src_y)
P.append(f'<path d="M1370 {src_y} H1405 M1405 {top} V{bot}" stroke="#334155" stroke-width="2" fill="none"/>')
for yy, kind in ys:
    P.append(arrow(1405, yy, 1435, yy, dashed=(kind == "a")))
P.append(f'<path d="M1436 {gh} H1392" stroke="#64748B" stroke-width="1.8" stroke-dasharray="6 5" fill="none" marker-end="url(#ar)"/>')
P.append(f'<text x="1400" y="{gh - 8}" class="s">deploy</text>')

# ---------------------------------------------------------------- painéis
def row(y, h, specs):
    for i, (title, ic, col, tint, bd, items) in enumerate(specs):
        P.append(panel(PX + i * (PW + PG), y, PW, h, title, ic, col, tint, bd, items))
row(P1_Y, row1_h, [("Segurança máxima", "lock", "#991B1B", "#FEF2F2", "#FCA5A5", SEG),
                   ("Performance", "bolt", "#92400E", "#FFFBEB", "#FCD34D", PERF),
                   ("Escala e custo", "chart", "#065F46", "#ECFDF5", "#6EE7B7", ESC)])
row(P2_Y, row2_h, [("Observabilidade", "eye", "#0E7490", "#ECFEFF", "#67E8F9", OBS),
                   ("Backup e recuperação de desastre", "refresh", "#5B21B6", "#F5F3FF", "#C4B5FD", DR),
                   ("Entrega e operação", "git", "#334155", "#F1F5F9", "#94A3B8", ENT)])

# faixa de lacunas
P.append(f'<g filter="url(#sh)"><rect x="30" y="{LAC_Y}" width="1740" height="{LAC_H}" rx="12" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.3"/></g>')
P.append(use("warn", 46, LAC_Y + 12, 22, "#B45309"))
P.append(f'<text x="76" y="{LAC_Y + 29}" class="h" fill="#92400E">O que o “antes” não tinha e nenhum pedido pedia</text>')
lx, ly = 46, LAC_Y + 46
for lab in LACUNAS:
    w = round(len(lab) * 7.3 + 24)
    if lx + w > 1752:
        lx, ly = 46, ly + 32
    P.append(f'<rect x="{lx}" y="{ly}" width="{w}" height="26" rx="13" fill="#FFFBEB" stroke="#FDE68A"/><text x="{lx + w / 2}" y="{ly + 17.5}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#92400E">{esc(lab)}</text>')
    lx += w + 8

P.append(f'<text x="40" y="{H - 16}" class="s">Notação: C4 nível 2 + fronteiras de confiança. Proposta; premissas, metas e recursos a confirmar em docs/arquitetura/futura.md. Comparar com detalhada/atual.svg.</text>')
P.append(f'<text x="1760" y="{H - 16}" class="s" text-anchor="end">github.com/lipe0312/ciclo</text>')
P.append("</svg>")
open(OUT, "w", encoding="utf-8").write("\n".join(P) + "\n")
print("ok", OUT, "H=", H)
