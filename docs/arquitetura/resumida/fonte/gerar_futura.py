"""Gera docs/arquitetura/resumida/futura.svg (1080x1350, 4:5, LinkedIn), par do atual.svg.
Uso: python3 -I docs/arquitetura/resumida/fonte/gerar_futura.py docs/arquitetura/resumida/futura.svg

Mesma direção "Prancheta" do atual (papel quadriculado, mono, carimbo, cores do Ciclo, laranja só na Cloudflare,
ícones de traço reto com bloco verde-limão). Cada peça traz o nome técnico e uma explicação curta e simples.
Conteúdo = proposta de docs/arquitetura/futura.md; metas a validar, nada implementado.
Regra: só tecnologia e conceito público; nada de rota, tabela, secret ou lógica do produto.
Os helpers (ícones, cilindro, balde) repetem os de gerar.py de propósito: cada script roda sozinho."""
import sys

OUT = sys.argv[1]
W, H = 1080, 1350

INK, PAPER, CARD, SUB = "#16161A", "#F6F6F3", "#FFFFFF", "#5B5B57"
GRID, GRID2, LIME, CF = "#E4E4DE", "#D6D6CF", "#C6F432", "#E8590C"
MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace"
SANS = "'IBM Plex Sans', -apple-system, Helvetica, Arial, sans-serif"

ICONS = {
    "phone": '<path d="M7 2.5h10v19H7z"/><path d="M11 18.5h2M10 5h4"/>',
    "ia": '<path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    "term": '<path d="M2.5 4h19v16h-19z"/><path d="M6.5 9.5l3 2.5-3 2.5M12 15h5.5"/>',
    "ampulheta": '<path d="M6 3h12M6 21h12"/><path d="M7.5 3c0 5 9 5 9 9s-9 4-9 9M16.5 3c0 5-9 5-9 9s9 4 9 9"/>',
    "chaves": '<path d="M9 3.5C6.5 3.5 6 5 6 7v2.5c0 1.3-1 2.3-2.5 2.5 1.5.2 2.5 1.2 2.5 2.5V17c0 2 .5 3.5 3 3.5"/><path d="M15 3.5c2.5 0 3 1.5 3 3.5v2.5c0 1.3 1 2.3 2.5 2.5-1.5.2-2.5 1.2-2.5 2.5V17c0 2-.5 3.5-3 3.5"/>',
    "digital": '<path d="M12 11v3c0 2.6-.6 4.8-1.6 6.6"/><path d="M8.5 9.5A3.7 3.7 0 0 1 15.5 11v2.5c0 2.4-.4 4.6-1.1 6.5"/><path d="M5.5 16.5V11a6.5 6.5 0 0 1 12-3.4"/><path d="M18.5 11v2.5c0 1.4-.1 2.7-.4 4"/>',
    "hub": '<path d="M9.5 9.5h5v5h-5z"/><path d="M12 9.5V4M9.5 14.5 5 19M14.5 14.5 19 19"/><path d="M10.5 2.5h3v2h-3zM3.5 18h2.5v2.5H3.5zM18 18h2.5v2.5H18z"/>',
    "funil": '<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>',
    "tabela": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 14.5h18M9.5 9.5V20"/>',
    "imagem": '<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m21 15.5-5-5-9 9"/>',
    "cofre": '<rect x="4.5" y="11" width="15" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
    "nuvem": '<path d="M7 18.5h10.5a4 4 0 0 0 .5-8A6.2 6.2 0 0 0 6 10a4.3 4.3 0 0 0 1 8.5z"/>',
    "onda": '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    "fila": '<path d="M2.5 6h5v12h-5zM9.5 6h5v12h-5z"/><path d="M17 8l4.5 4-4.5 4"/>',
    "copia": '<path d="M8 8h13v13H8z"/><path d="M16 8V3H3v13h5"/>',
}
REDONDOS = {"ia", "tabela", "imagem", "cofre", "onda", "nuvem"}


def ic(name, x, y, size, lime=True, sw=1.9, color=INK):
    k = size / 24
    cap = ("round", "round") if name in REDONDOS else ("square", "miter")
    back = f'<rect x="{x + size * 0.36:.1f}" y="{y + size * 0.36:.1f}" width="{size * 0.66:.1f}" height="{size * 0.66:.1f}" fill="{LIME}"/>' if lime else ""
    return (f'{back}<g transform="translate({x} {y}) scale({k:.4f})" fill="none" stroke="{color}" stroke-width="{sw / k:.2f}" '
            f'stroke-linecap="{cap[0]}" stroke-linejoin="{cap[1]}">{ICONS[name]}</g>')


def cylinder(x, y, w, h, ry=12, fill=CARD, sw=2):
    return (f'<path d="M{x} {y} v{h} a{w / 2} {ry} 0 0 0 {w} 0 v-{h}" fill="{fill}" stroke="{INK}" stroke-width="{sw}"/>'
            f'<ellipse cx="{x + w / 2}" cy="{y}" rx="{w / 2}" ry="{ry}" fill="{fill}" stroke="{INK}" stroke-width="{sw}"/>')


def bucket(x, y, w, h, ry=12):
    return (f'<path d="M{x} {y} L{x + 18} {y + h} a{w / 2 - 18} {ry - 2} 0 0 0 {w - 36} 0 L{x + w} {y}" fill="{CARD}" stroke="{INK}" stroke-width="2"/>'
            f'<ellipse cx="{x + w / 2}" cy="{y}" rx="{w / 2}" ry="{ry}" fill="{CARD}" stroke="{INK}" stroke-width="2"/>')


def arrow(x1, y1, x2, y2, dashed=False):
    d = ' stroke-dasharray="6 5"' if dashed else ""
    return f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{INK}" stroke-width="2" marker-end="url(#ar)"{d}/>'


def pill(x, y, label):
    w = round(len(label) * 8.6 + 8)
    return (f'<rect x="{x}" y="{y}" width="{w}" height="22" fill="{PAPER}"/>'
            f'<text x="{x + 4}" y="{y + 16}" font-family="{MONO}" font-size="14.5" fill="{INK}">{label}</text>')


CLIENTES = [("phone", "PWA", "offline · tempo real"), ("ia", "Claude · ChatGPT", "MCP remoto · OAuth 2.1"),
            ("term", "Claude Code", "MCP via stdio"), ("ampulheta", "Rotinas de IA", "do Mac para a fila")]
PROTO = ["HTTPS · passkey", "MCP · OAuth 2.1", "MCP · token", "MCP · token"]
SERVICOS = [("digital", "Auth", "quem é você"), ("chaves", "API", "regras do app"), ("hub", "MCP", "fala com a IA"),
            ("imagem", "Mídia", "foto e vídeo"), ("ia", "Serviço IA", "cache e teto")]
TERCEIROS = "LLMs / KMS / Backup em 2º provedor / OpenTelemetry / Open Food Facts / OpenStreetMap / Push"
SEG = ["Isolamento: 1 SQLite por conta", "Dado de saúde cifrado (KMS)", "WAF, bot e rate limit na borda"]
PERF = ["Ação local em < 50 ms", "Delta sync + WebSocket", "Cache na borda; IA e push em fila"]
OPE = ["Traces, SLO e alerta de custo", "Backup: PITR 30 dias + 2º provedor", "IaC, deploy gradual e rollback"]
LIM = ["Depende de 1 fornecedor", "Dados fora do Brasil: a decidir", "Mais peças: exige observabilidade"]

# ---- posições (tudo derivado daqui) ----
CL_Y, CL_H = 194, 106
ZB_Y = 352
EDGE_Y = 374
GW_Y, GW_H = 440, 125
DT_Y, DT_H = 602, 146
ST_Y, ST_H = 778, 100
ZB_BOT = 906
TERC_Y = 926

P = [f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="{SANS}">
<title>Ciclo · arquitetura alvo</title>
<desc>Proposta de arquitetura do Ciclo para milhões de contas: borda com WAF, gateway com serviços separados, plano de controle em D1, um SQLite por conta em Durable Objects, filas, R2, KMS, backup em segundo provedor, segurança, performance, operação e limites. Metas a validar.</desc>
<defs>
<pattern id="g" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="{GRID}" stroke-width="1"/></pattern>
<pattern id="G" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M120 0H0V120" fill="none" stroke="{GRID2}" stroke-width="1.2"/></pattern>
<pattern id="h" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V9" stroke="{CF}" stroke-width="1.4" opacity=".55"/></pattern>
<marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1 L10 5 L0 9" fill="none" stroke="{INK}" stroke-width="1.8"/></marker>
</defs>
<rect width="{W}" height="{H}" fill="{PAPER}"/><rect width="{W}" height="{H}" fill="url(#g)"/><rect width="{W}" height="{H}" fill="url(#G)"/>''']

# ---------- cabeçalho ----------
P.append(f'<text x="60" y="78" font-family="{MONO}" font-size="15" letter-spacing="2.2" fill="{SUB}">CICLO · TREINO, COMIDA E SAÚDE COM A SUA IA</text>')
P.append(f'<text x="58" y="136" font-size="58" font-weight="600" fill="{INK}" letter-spacing="-1">Arquitetura alvo</text>')
P.append(f'<rect x="60" y="150" width="96" height="8" fill="{LIME}"/>')
P.append(f'<text x="1020" y="78" text-anchor="end" font-family="{MONO}" font-size="15" fill="{SUB}">2026 · PROPOSTA</text>')
P.append(f'<path d="M60 170H1020" stroke="{INK}" stroke-width="2.5"/>')

# ---------- clientes ----------
cw, cg = 222, 24
cx = [60 + i * (cw + cg) for i in range(4)]
for i, (icn, t, s) in enumerate(CLIENTES):
    x = cx[i]
    dash = ' stroke-dasharray="7 5"' if i == 3 else ""
    P.append(f'<rect x="{x}" y="{CL_Y}" width="{cw}" height="{CL_H}" fill="{CARD}" stroke="{INK}" stroke-width="2"{dash}/>')
    P.append(ic(icn, x + 16, CL_Y + 14, 24))
    P.append(f'<text x="{x + 16}" y="{CL_Y + 68}" font-size="22" font-weight="600" fill="{INK}">{t}</text>')
    P.append(f'<text x="{x + 16}" y="{CL_Y + 92}" font-family="{MONO}" font-size="14" fill="{SUB}">{s}</text>')
mids = [x + cw / 2 for x in cx]

# ---------- Cloudflare ----------
P.append(f'<rect x="40" y="{ZB_Y}" width="1000" height="{ZB_BOT - ZB_Y}" fill="none" stroke="{CF}" stroke-width="2" stroke-dasharray="10 6"/>')
P.append(f'<rect x="196" y="{ZB_Y - 14}" width="160" height="28" fill="{CF}"/>')
P.append(ic("nuvem", 204, ZB_Y - 11, 22, lime=False, sw=2.2, color="#FFFFFF"))
P.append(f'<text x="234" y="{ZB_Y + 5.5}" font-family="{MONO}" font-size="15" font-weight="700" letter-spacing="1.8" fill="#FFFFFF">CLOUDFLARE</text>')
for i, m in enumerate(mids):
    dash = ' stroke-dasharray="6 5"' if i == 3 else ""
    P.append(f'<path d="M{m} {CL_Y + CL_H} V{EDGE_Y}" stroke="{INK}" stroke-width="2"{dash}/>')
    P.append(f'<path d="M{m} {EDGE_Y + 42} V{GW_Y - 2}" stroke="{INK}" stroke-width="2" marker-end="url(#ar)"{dash}/>')
    P.append(pill(m + 8, 314, PROTO[i]))
P.append(f'<rect x="64" y="{EDGE_Y}" width="952" height="42" fill="#FBEFE4" stroke="{INK}" stroke-width="1.5"/><rect x="64" y="{EDGE_Y}" width="952" height="42" fill="url(#h)"/>')
P.append(f'<rect x="300" y="{EDGE_Y + 9}" width="480" height="24" fill="#FBEFE4"/>')
P.append(f'<text x="540" y="{EDGE_Y + 27}" text-anchor="middle" font-family="{MONO}" font-size="16" font-weight="700" fill="{INK}">EDGE · WAF · BOT · TLS · CACHE</text>')

# ---------- Gateway + serviços (a ousadia: sombra dura verde-limão) ----------
P.append(f'<rect x="72" y="{GW_Y + 8}" width="952" height="{GW_H}" fill="{LIME}"/>')
P.append(f'<rect x="64" y="{GW_Y}" width="952" height="{GW_H}" fill="{CARD}" stroke="{INK}" stroke-width="3"/>')
P.append(f'<rect x="64" y="{GW_Y}" width="952" height="44" fill="{INK}"/>')
P.append(ic("funil", 80, GW_Y + 9, 26, lime=False, sw=2.4, color=LIME))
P.append(f'<text x="118" y="{GW_Y + 30}" font-family="{MONO}" font-size="17" font-weight="700" letter-spacing="1.5" fill="#FFFFFF">GATEWAY</text>')
P.append(f'<text x="1000" y="{GW_Y + 30}" text-anchor="end" font-family="{MONO}" font-size="15" fill="#B8B8B0">porta única · valida, limita e roteia</text>')
tw = 952 / 5
for k, (icn, t, s) in enumerate(SERVICOS):
    x = 64 + k * tw
    if k: P.append(f'<path d="M{x:.1f} {GW_Y + 44} V{GW_Y + GW_H}" stroke="{INK}" stroke-width="1"/>')
    P.append(ic(icn, x + 14, GW_Y + 44 + 17, 24))
    P.append(f'<text x="{x + 48:.1f}" y="{GW_Y + 44 + 36}" font-size="20" font-weight="600" fill="{INK}">{t}</text>')
    P.append(f'<text x="{x + 48:.1f}" y="{GW_Y + 44 + 58}" font-family="{MONO}" font-size="13" fill="{SUB}">{s}</text>')
smid = [64 + k * tw + tw / 2 for k in range(5)]

# ---------- dados ----------
dx = [64, 330, 786]
dw = [250, 440, 230]
for m, tx_ in ((smid[0], 0), (smid[1], 1), (smid[2], 1), (smid[3], 1)):
    P.append(arrow(m, GW_Y + GW_H + 8, m, DT_Y - 2))
P.append(arrow(smid[4], GW_Y + GW_H + 8, smid[4], DT_Y - 2, dashed=True))
# plano de controle: cilindro
cyc = DT_Y + 12
P.append(cylinder(dx[0], cyc, dw[0], DT_H - 24))
P.append(ic("tabela", dx[0] + 18, cyc + 32, 26))
P.append(f'<text x="{dx[0] + 18}" y="{cyc + 88}" font-size="21" font-weight="600" fill="{INK}">D1 · controle</text>')
P.append(f'<text x="{dx[0] + 18}" y="{cyc + 112}" font-family="{MONO}" font-size="14" fill="{SUB}">contas e sessões</text>')
# plano de dados: 1 SQLite por conta
P.append(f'<rect x="{dx[1]}" y="{DT_Y}" width="{dw[1]}" height="{DT_H}" fill="{CARD}" stroke="{INK}" stroke-width="2.5"/>')
P.append(f'<text x="{dx[1] + 20}" y="{DT_Y + 38}" font-size="23" font-weight="700" fill="{INK}">1 SQLite por conta</text>')
P.append(f'<text x="{dx[1] + 20}" y="{DT_Y + 62}" font-family="{MONO}" font-size="14" fill="{SUB}">Durable Object · tempo real · PITR 30 dias</text>')
for i, lab in enumerate(["A", "B", "C", "…", "N"]):
    x = dx[1] + 22 + i * 82
    if lab == "…":
        P.append(f'<text x="{x + 32}" y="{DT_Y + 112}" text-anchor="middle" font-size="26" font-weight="700" fill="{INK}">…</text>'); continue
    P.append(cylinder(x, DT_Y + 92, 64, 30, ry=8, fill=LIME if lab != "N" else CARD, sw=1.8))
    P.append(f'<text x="{x + 32}" y="{DT_Y + 118}" text-anchor="middle" font-family="{MONO}" font-size="13" font-weight="700" fill="{INK}">{lab}</text>')
P.append(f'<rect x="{dx[1] + dw[1] - 38}" y="{DT_Y + 12}" width="26" height="26" fill="{INK}"/>')
P.append(f'<text x="{dx[1] + dw[1] - 25}" y="{DT_Y + 31}" text-anchor="middle" font-family="{MONO}" font-size="16" font-weight="700" fill="{LIME}">∞</text>')
# filas
P.append(f'<rect x="{dx[2]}" y="{DT_Y}" width="{dw[2]}" height="{DT_H}" fill="{CARD}" stroke="{INK}" stroke-width="2" stroke-dasharray="7 5"/>')
P.append(ic("fila", dx[2] + 18, DT_Y + 22, 28))
P.append(f'<text x="{dx[2] + 18}" y="{DT_Y + 88}" font-size="21" font-weight="600" fill="{INK}">Queues</text>')
P.append(f'<text x="{dx[2] + 18}" y="{DT_Y + 112}" font-family="{MONO}" font-size="14" fill="{SUB}">IA · push · export</text>')
P.append(f'<text x="{dx[2] + 18}" y="{DT_Y + 132}" font-family="{MONO}" font-size="14" fill="{SUB}">+ Workflows</text>')

# ---------- armazenamento e chaves ----------
sd = [64 + i * 244 for i in range(4)]
sw_ = 220
xs_, xk_ = sd[1] + 120, sd[2] + 100
for x in (xs_, xk_):
    P.append(arrow(x, DT_Y + DT_H, x, ST_Y - 2))
P.append(f'<rect x="{xs_ + 8}" y="{DT_Y + DT_H + 4}" width="76" height="20" fill="{PAPER}"/><text x="{xs_ + 12}" y="{DT_Y + DT_H + 19}" font-family="{MONO}" font-size="13.5" fill="{INK}">snapshot</text>')
P.append(f'<rect x="{xk_ + 8}" y="{DT_Y + DT_H + 4}" width="44" height="20" fill="{PAPER}"/><text x="{xk_ + 12}" y="{DT_Y + DT_H + 19}" font-family="{MONO}" font-size="13.5" fill="{INK}">DEK</text>')
P.append(bucket(sd[0], ST_Y + 12, sw_, ST_H - 24))
cards_st = [(0, "imagem", "R2 · mídia", "URL assinada, direto", 36, False), (1, "copia", "R2 · retenção", "backup + auditoria", 18, False),
            (2, "cofre", "KMS · chaves", "sem chave, sem dado", 18, False), (3, "onda", "Workers AI", "voz → texto (opcional)", 18, True)]
for i, icn, t, s, pad, dash in cards_st:
    x = sd[i]
    if i == 1: P.append(f'<rect x="{x}" y="{ST_Y}" width="{sw_}" height="{ST_H}" fill="{CARD}" stroke="{INK}" stroke-width="2"/>')
    if i == 2: P.append(f'<rect x="{x}" y="{ST_Y}" width="{sw_}" height="{ST_H}" fill="{CARD}" stroke="{INK}" stroke-width="2"/>')
    if i == 3: P.append(f'<rect x="{x}" y="{ST_Y}" width="{sw_}" height="{ST_H}" fill="{CARD}" stroke="{INK}" stroke-width="2" stroke-dasharray="7 5"/>')
    dy_ = (24, 68, 84) if i == 0 else (14, 62, 82)
    P.append(ic(icn, x + pad, ST_Y + dy_[0], 24))
    P.append(f'<text x="{x + pad}" y="{ST_Y + dy_[1]}" font-size="19" font-weight="600" fill="{INK}">{t}</text>')
    P.append(f'<text x="{x + pad}" y="{ST_Y + dy_[2]}" font-family="{MONO}" font-size="12.5" fill="{SUB}">{s}</text>')

# saída para terceiros
gx = sd[1] + sw_ + 12
P.append(f'<path d="M{gx} {DT_Y + DT_H} V{TERC_Y - 2}" stroke="{INK}" stroke-width="2" stroke-dasharray="6 5" marker-end="url(#ar)"/>')
P.append(f'<rect x="{gx + 8}" y="{ST_Y + ST_H + 4}" width="148" height="20" fill="{PAPER}"/><text x="{gx + 12}" y="{ST_Y + ST_H + 19}" font-family="{MONO}" font-size="14" fill="{INK}">fetch · allowlist</text>')

# ---------- terceiros ----------
P.append(f'<rect x="40" y="{TERC_Y}" width="1000" height="56" fill="none" stroke="{SUB}" stroke-width="1.6" stroke-dasharray="4 4"/>')
P.append(f'<text x="60" y="{TERC_Y + 34}" font-family="{MONO}" font-size="15" font-weight="700" letter-spacing="2" fill="{SUB}">TERCEIROS</text>')
P.append(f'<text x="186" y="{TERC_Y + 34}" font-size="17" fill="{INK}">{TERCEIROS}</text>')

# ---------- notas 2x2 ----------
NY = 1004
P.append(f'<path d="M60 {NY}H1020" stroke="{INK}" stroke-width="2.5"/>')
P.append(f'<path d="M540 {NY + 14}V{NY + 232}" stroke="{INK}" stroke-width="1"/><path d="M60 {NY + 122}H1020" stroke="{INK}" stroke-width="1"/>')
grid = [("SEGURANÇA", SEG, 60, NY + 28, False), ("PERFORMANCE", PERF, 560, NY + 28, False),
        ("OPERAÇÃO", OPE, 60, NY + 152, False), ("LIMITES QUE FICAM", LIM, 560, NY + 152, True)]
for titulo, items, x, y0, num in grid:
    P.append(f'<text x="{x}" y="{y0}" font-family="{MONO}" font-size="16" font-weight="700" letter-spacing="2" fill="{INK}">{titulo}</text>')
    for n, it in enumerate(items):
        y = y0 + 30 + n * 26
        if num:
            P.append(f'<rect x="{x}" y="{y - 16}" width="21" height="21" fill="{INK}"/>')
            P.append(f'<text x="{x + 10.5}" y="{y}" text-anchor="middle" font-family="{MONO}" font-size="13.5" font-weight="700" fill="{LIME}">{n + 1}</text>')
            P.append(f'<text x="{x + 32}" y="{y}" font-size="18" fill="{INK}">{it}</text>')
        else:
            P.append(f'<text x="{x}" y="{y}" font-size="18" fill="{INK}"><tspan font-family="{MONO}" font-weight="700">+</tspan>  {it}</text>')

# ---------- carimbo ----------
P.append(f'<rect x="60" y="1252" width="960" height="56" fill="{CARD}" stroke="{INK}" stroke-width="2"/>')
cells = [("CUSTO", "proporcional ao uso", 300), ("CONTAS", "milhões", 190), ("DISPONIBILIDADE", "99,9% (meta)", 250), ("RPO · RTO", "5 min · 1 h", 220)]
x = 60
for k, v, w in cells:
    if x > 60: P.append(f'<path d="M{x} 1252 V1308" stroke="{INK}" stroke-width="1.2"/>')
    P.append(f'<text x="{x + 14}" y="1273" font-family="{MONO}" font-size="12" letter-spacing="1.5" fill="{SUB}">{k}</text>')
    P.append(f'<text x="{x + 14}" y="1297" font-family="{MONO}" font-size="18" font-weight="700" fill="{INK}">{v}</text>')
    x += w
P.append("</svg>")

open(OUT, "w", encoding="utf-8").write("\n".join(P) + "\n")
print("ok", OUT)
