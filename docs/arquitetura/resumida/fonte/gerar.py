"""Gera docs/arquitetura/resumida/atual.svg (1080x1350, 4:5, LinkedIn).
Uso: python3 -I docs/arquitetura/resumida/fonte/gerar.py docs/arquitetura/resumida/atual.svg

Direção "Prancheta" (papel quadriculado, mono, carimbo técnico) com as cores do Ciclo (docs/DESIGN.md:
papel #F6F6F3, tinta #16161A, verde-limão #C6F432) e o laranja só na fronteira da Cloudflare.
Ícones próprios: traço reto (ponta quadrada) com um bloco verde-limão deslocado atrás.
Regra de conteúdo: só tecnologia e conceito público; nada de rota, tabela, secret ou lógica do produto."""
import sys

OUT = sys.argv[1]
W, H = 1080, 1350

INK, PAPER, CARD, SUB = "#16161A", "#F6F6F3", "#FFFFFF", "#5B5B57"
GRID, GRID2, LIME, CF = "#E4E4DE", "#D6D6CF", "#C6F432", "#E8590C"
MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace"
SANS = "'IBM Plex Sans', -apple-system, Helvetica, Arial, sans-serif"

# Ícones 24x24, traço reto. Desenho próprio (nada de pacote): janela, chaves {}, ticket, hub, fluxo, funil, cofre, onda.
ICONS = {
    "phone": '<path d="M7 2.5h10v19H7z"/><path d="M11 18.5h2M10 5h4"/>',
    "ia": '<path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    "term": '<path d="M2.5 4h19v16h-19z"/><path d="M6.5 9.5l3 2.5-3 2.5M12 15h5.5"/>',
    "ampulheta": '<path d="M6 3h12M6 21h12"/><path d="M7.5 3c0 5 9 5 9 9s-9 4-9 9M16.5 3c0 5-9 5-9 9s9 4 9 9"/>',
    "lambda": '<path d="M6 4h2.8L17 20h2"/><path d="M12.2 11.5 7 20"/>',
    "janela": '<path d="M3 4h18v16H3z"/><path d="M3 9h18M6 6.5h0M9 6.5h0"/>',
    "chaves": '<path d="M9 3.5C6.5 3.5 6 5 6 7v2.5c0 1.3-1 2.3-2.5 2.5 1.5.2 2.5 1.2 2.5 2.5V17c0 2 .5 3.5 3 3.5"/><path d="M15 3.5c2.5 0 3 1.5 3 3.5v2.5c0 1.3 1 2.3 2.5 2.5-1.5.2-2.5 1.2-2.5 2.5V17c0 2-.5 3.5-3 3.5"/>',
    "digital": '<path d="M12 11v3c0 2.6-.6 4.8-1.6 6.6"/><path d="M8.5 9.5A3.7 3.7 0 0 1 15.5 11v2.5c0 2.4-.4 4.6-1.1 6.5"/><path d="M5.5 16.5V11a6.5 6.5 0 0 1 12-3.4"/><path d="M18.5 11v2.5c0 1.4-.1 2.7-.4 4"/>',
    "ticket": '<path d="M3 6.5h18V10a2 2 0 0 0 0 4v3.5H3V14a2 2 0 0 0 0-4z"/><path d="M9.5 6.5v11" stroke-dasharray="2 2"/>',
    "hub": '<path d="M9.5 9.5h5v5h-5z"/><path d="M12 9.5V4M9.5 14.5 5 19M14.5 14.5 19 19"/><path d="M10.5 2.5h3v2h-3zM3.5 18h2.5v2.5H3.5zM18 18h2.5v2.5H18z"/>',
    "fluxo": '<path d="M3 3h8v6H3zM13 15h8v6h-8z"/><path d="M7 9v3h10v3"/>',
    "funil": '<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>',
    "relogio": '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12h4"/><path d="M12 3v1.5M21 12h-1.5M12 21v-1.5M3 12h1.5"/>',
    "tabela": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 14.5h18M9.5 9.5V20"/>',
    "imagem": '<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m21 15.5-5-5-9 9"/>',
    "cofre": '<rect x="4.5" y="11" width="15" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
    "nuvem": '<path d="M7 18.5h10.5a4 4 0 0 0 .5-8A6.2 6.2 0 0 0 6 10a4.3 4.3 0 0 0 1 8.5z"/>',
    "onda": '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
}


REDONDOS = {"ia", "tabela", "imagem", "cofre", "onda", "nuvem"}


def ic(name, x, y, size, lime=True, sw=1.9, color=INK):
    """Ícone com bloco verde-limão deslocado atrás (efeito de impressão desalinhada)."""
    k = size / 24
    cap = ("round", "round") if name in REDONDOS else ("square", "miter")
    back = f'<rect x="{x + size * 0.36:.1f}" y="{y + size * 0.36:.1f}" width="{size * 0.66:.1f}" height="{size * 0.66:.1f}" fill="{LIME}"/>' if lime else ""
    return (f'{back}<g transform="translate({x} {y}) scale({k:.4f})" fill="none" stroke="{color}" stroke-width="{sw / k:.2f}" '
            f'stroke-linecap="{cap[0]}" stroke-linejoin="{cap[1]}">{ICONS[name]}</g>')


def cylinder(x, y, w, h, ry=12):
    return (f'<path d="M{x} {y} v{h} a{w / 2} {ry} 0 0 0 {w} 0 v-{h}" fill="{CARD}" stroke="{INK}" stroke-width="2"/>'
            f'<ellipse cx="{x + w / 2}" cy="{y}" rx="{w / 2}" ry="{ry}" fill="{CARD}" stroke="{INK}" stroke-width="2"/>')


def bucket(x, y, w, h, ry=12):
    return (f'<path d="M{x} {y} L{x + 18} {y + h} a{w / 2 - 18} {ry - 2} 0 0 0 {w - 36} 0 L{x + w} {y}" fill="{CARD}" stroke="{INK}" stroke-width="2"/>'
            f'<ellipse cx="{x + w / 2}" cy="{y}" rx="{w / 2}" ry="{ry}" fill="{CARD}" stroke="{INK}" stroke-width="2"/>')


CLIENTES = [("phone", "PWA", "celular · offline"), ("ia", "Claude · ChatGPT", "MCP remoto"),
            ("term", "Claude Code", "MCP via stdio"), ("ampulheta", "Agente agendado", "drena a fila")]
PROTO = ["HTTPS · passkey", "MCP · OAuth 2.1", "MCP · token", "MCP · token"]
MODULOS = [("janela", "App estático"), ("chaves", "REST API"), ("digital", "Passkey"), ("ticket", "OAuth 2.1"),
           ("hub", "Servidor MCP"), ("fluxo", "Regras de domínio"), ("funil", "Rate limit"), ("relogio", "Cron 1 min")]
DADOS = [("tabela", "D1 · SQLite", "1 banco · 1 região"), ("imagem", "R2 · bucket", "fotos e vídeos"),
         ("cofre", "Secrets", "fora do banco"), ("onda", "Workers AI", "voz → texto")]
EXTERNOS = "LLMs (chave do usuário) / Open Food Facts / OpenStreetMap / Turnstile / Web Push"
SEG = ["Passkey, sem senha", "Isolamento por conta", "Rate limit e cota", "Chaves cifradas (AES-GCM)"]
PERF = ["Abre offline", "1 request abre o app", "Regras no aparelho", "~130 KB de JS"]
LIM = ["1 banco, 1 região", "Cota grátis diária", "Polling, sem tempo real", "Sem fila, cache e métricas"]

P = [f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="{SANS}">
<title>Ciclo · arquitetura atual</title>
<desc>Arquitetura atual do Ciclo: clientes (app e IAs via MCP), um Worker na Cloudflare, D1, bucket R2, secrets, Workers AI, terceiros, segurança, performance e limites.</desc>
<defs>
<pattern id="g" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="{GRID}" stroke-width="1"/></pattern>
<pattern id="G" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M120 0H0V120" fill="none" stroke="{GRID2}" stroke-width="1.2"/></pattern>
<pattern id="h" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V9" stroke="{CF}" stroke-width="1.4" opacity=".55"/></pattern>
<marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1 L10 5 L0 9" fill="none" stroke="{INK}" stroke-width="1.8"/></marker>
</defs>
<rect width="{W}" height="{H}" fill="{PAPER}"/><rect width="{W}" height="{H}" fill="url(#g)"/><rect width="{W}" height="{H}" fill="url(#G)"/>''']

# ---------- cabeçalho ----------
P.append(f'<text x="60" y="78" font-family="{MONO}" font-size="15" letter-spacing="2.2" fill="{SUB}">CICLO · TREINO, COMIDA E SAÚDE COM A SUA IA</text>')
P.append(f'<text x="58" y="136" font-size="58" font-weight="600" fill="{INK}" letter-spacing="-1">Arquitetura atual</text>')
P.append(f'<rect x="60" y="150" width="96" height="8" fill="{LIME}"/>')
P.append(f'<text x="1020" y="78" text-anchor="end" font-family="{MONO}" font-size="15" fill="{SUB}">2026</text>')
P.append(f'<path d="M60 170H1020" stroke="{INK}" stroke-width="2.5"/>')

# ---------- clientes (boxes: ícone, título, descrição) ----------
cw, cg = 222, 24
cx = [60 + i * (cw + cg) for i in range(4)]
for i, (icn, t, s) in enumerate(CLIENTES):
    x = cx[i]
    dash = ' stroke-dasharray="7 5"' if i == 3 else ""
    P.append(f'<rect x="{x}" y="194" width="{cw}" height="108" fill="{CARD}" stroke="{INK}" stroke-width="2"{dash}/>')
    P.append(ic(icn, x + 16, 208, 24))
    P.append(f'<text x="{x + 16}" y="262" font-size="22" font-weight="600" fill="{INK}">{t}</text>')
    P.append(f'<text x="{x + 16}" y="287" font-family="{MONO}" font-size="15" fill="{SUB}">{s}</text>')
mids = [x + cw / 2 for x in cx]

# ---------- Cloudflare (mantido da opção A) ----------
P.append(f'<rect x="40" y="362" width="1000" height="546" fill="none" stroke="{CF}" stroke-width="2" stroke-dasharray="10 6"/>')
P.append(f'<rect x="196" y="348" width="160" height="28" fill="{CF}"/>')
P.append(ic("nuvem", 204, 351, 22, lime=False, sw=2.2, color="#FFFFFF"))
P.append(f'<text x="234" y="367.5" font-family="{MONO}" font-size="15" font-weight="700" letter-spacing="1.8" fill="#FFFFFF">CLOUDFLARE</text>')
for i, m in enumerate(mids):
    dash = ' stroke-dasharray="6 5"' if i == 3 else ""
    P.append(f'<path d="M{m} 302 V386" stroke="{INK}" stroke-width="2"{dash}/>')
    P.append(f'<path d="M{m} 428 V450" stroke="{INK}" stroke-width="2" marker-end="url(#ar)"{dash}/>')
    P.append(f'<rect x="{m + 8}" y="314" width="{len(PROTO[i]) * 8.6 + 8:.0f}" height="22" fill="{PAPER}"/>')
    P.append(f'<text x="{m + 12}" y="330" font-family="{MONO}" font-size="14.5" fill="{INK}">{PROTO[i]}</text>')
P.append(f'<rect x="64" y="386" width="952" height="42" fill="#FBEFE4" stroke="{INK}" stroke-width="1.5"/><rect x="64" y="386" width="952" height="42" fill="url(#h)"/>')
P.append(f'<rect x="420" y="395" width="240" height="24" fill="#FBEFE4"/>')
P.append(f'<text x="540" y="413" text-anchor="middle" font-family="{MONO}" font-size="16" font-weight="700" fill="{INK}">EDGE · TLS · DDoS · CSP</text>')

# ---------- Worker (a ousadia: sombra dura verde-limão) ----------
P.append(f'<rect x="72" y="460" width="952" height="206" fill="{LIME}"/>')
P.append(f'<rect x="64" y="452" width="952" height="206" fill="{CARD}" stroke="{INK}" stroke-width="3"/>')
P.append(f'<rect x="64" y="452" width="952" height="44" fill="{INK}"/>')
P.append(ic("lambda", 80, 461, 26, lime=False, sw=2.4, color=LIME))
P.append(f'<text x="118" y="482" font-family="{MONO}" font-size="17" font-weight="700" letter-spacing="1.5" fill="#FFFFFF">WORKER</text>')
P.append(f'<text x="1000" y="482" text-anchor="end" font-family="{MONO}" font-size="15" fill="#B8B8B0">V8 isolate · sem estado · 1 deploy</text>')
cellw = 952 / 4
for k, (icn, t) in enumerate(MODULOS):
    r, c = divmod(k, 4)
    x = 64 + c * cellw; y = 496 + r * 81
    if c: P.append(f'<path d="M{x:.1f} {y} V{y + 81}" stroke="{INK}" stroke-width="1"/>')
    P.append(ic(icn, x + 18, y + 27, 24))
    P.append(f'<text x="{x + 56:.1f}" y="{y + 47}" font-size="20" font-weight="500" fill="{INK}">{t}</text>')
P.append(f'<path d="M64 577 H1016" stroke="{INK}" stroke-width="1"/>')

# ---------- dados ----------
dw, dg = 220, 24
dx = [64 + i * (dw + dg) for i in range(4)]
for x in dx:
    P.append(f'<path d="M{x + dw / 2} 666 V690" stroke="{INK}" stroke-width="2" marker-end="url(#ar)"/>')
P.append(cylinder(dx[0], 708, dw, 148))
P.append(bucket(dx[1], 708, dw, 148))
P.append(f'<rect x="{dx[2]}" y="696" width="{dw}" height="172" fill="{CARD}" stroke="{INK}" stroke-width="2"/>')
P.append(f'<rect x="{dx[3]}" y="696" width="{dw}" height="172" fill="{CARD}" stroke="{INK}" stroke-width="2" stroke-dasharray="7 5"/>')
for i, (x, (icn, t, s)) in enumerate(zip(dx, DADOS)):
    pad = 36 if i == 1 else 18
    P.append(ic(icn, x + pad, 740, 28))
    P.append(f'<text x="{x + pad}" y="808" font-size="22" font-weight="600" fill="{INK}">{t}</text>')
    P.append(f'<text x="{x + pad}" y="836" font-family="{MONO}" font-size="15" fill="{SUB}">{s}</text>')
# marca 1 liga o D1 ao limite 1
P.append(f'<rect x="{dx[0] + dw - 38}" y="736" width="26" height="26" fill="{INK}"/>')
P.append(f'<text x="{dx[0] + dw - 25}" y="755" text-anchor="middle" font-family="{MONO}" font-size="16" font-weight="700" fill="{LIME}">1</text>')
# saída
gx = dx[1] + dw + dg / 2
P.append(f'<path d="M{gx} 666 V928" stroke="{INK}" stroke-width="2" stroke-dasharray="6 5" marker-end="url(#ar)"/>')
P.append(f'<rect x="{gx + 8}" y="884" width="148" height="20" fill="{PAPER}"/><text x="{gx + 12}" y="899" font-family="{MONO}" font-size="14" fill="{INK}">fetch · allowlist</text>')

# ---------- terceiros ----------
P.append(f'<rect x="40" y="930" width="1000" height="64" fill="none" stroke="{SUB}" stroke-width="1.6" stroke-dasharray="4 4"/>')
P.append(f'<text x="60" y="969" font-family="{MONO}" font-size="15" font-weight="700" letter-spacing="2" fill="{SUB}">TERCEIROS</text>')
P.append(f'<text x="186" y="969" font-size="19" fill="{INK}">{EXTERNOS}</text>')

# ---------- notas ----------
P.append(f'<path d="M60 1028H1020" stroke="{INK}" stroke-width="2.5"/>')
colw = 960 / 3
for j, (titulo, items, num) in enumerate([("SEGURANÇA", SEG, False), ("PERFORMANCE", PERF, False), ("LIMITES", LIM, True)]):
    x = 60 + j * colw + (10 if j else 0)
    if j: P.append(f'<path d="M{x - 20:.1f} 1044 V1226" stroke="{INK}" stroke-width="1"/>')
    P.append(f'<text x="{x:.1f}" y="1066" font-family="{MONO}" font-size="16" font-weight="700" letter-spacing="2" fill="{INK}">{titulo}</text>')
    for n, it in enumerate(items):
        y = 1110 + n * 36
        if num:
            P.append(f'<rect x="{x:.1f}" y="{y - 17}" width="22" height="22" fill="{INK}"/>')
            P.append(f'<text x="{x + 11:.1f}" y="{y}" text-anchor="middle" font-family="{MONO}" font-size="14" font-weight="700" fill="{LIME}">{n + 1}</text>')
            P.append(f'<text x="{x + 32:.1f}" y="{y}" font-size="19" fill="{INK}">{it}</text>')
        else:
            P.append(f'<text x="{x:.1f}" y="{y}" font-size="19" fill="{INK}"><tspan font-family="{MONO}" font-weight="700">+</tspan>  {it}</text>')

# ---------- carimbo (sem notação e sem plano) ----------
P.append(f'<rect x="60" y="1252" width="960" height="56" fill="{CARD}" stroke="{INK}" stroke-width="2"/>')
cells = [("CUSTO", "R$ 0/mês", 220), ("CONTAS", "≤ 50 · teste", 250), ("ACESSO", "só por convite", 290), ("REGIÃO", "1", 200)]
x = 60
for k, v, w in cells:
    if x > 60: P.append(f'<path d="M{x} 1252 V1308" stroke="{INK}" stroke-width="1.2"/>')
    P.append(f'<text x="{x + 14}" y="1273" font-family="{MONO}" font-size="12" letter-spacing="1.5" fill="{SUB}">{k}</text>')
    P.append(f'<text x="{x + 14}" y="1297" font-family="{MONO}" font-size="18" font-weight="700" fill="{INK}">{v}</text>')
    x += w
P.append("</svg>")

open(OUT, "w", encoding="utf-8").write("\n".join(P) + "\n")
print("ok", OUT)
