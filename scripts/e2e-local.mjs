// Roteiro de ponta a ponta LOCAL (docs/09-teste-local.md) pela API e pelo connector, numa conta de dev nova e fictícia.
// Uso: com `npm run dev` rodando → `npm run e2e:local` (outra porta: CICLO_URL=http://localhost:8792 npm run e2e:local).
// Só fala com localhost (DEV_NO_AUTH): nunca aponte para produção. Mede /api/state e /api/home (meta < 150 ms).
import { randomUUID } from "node:crypto";

const BASE = (process.env.CICLO_URL ?? "http://localhost:8791").replace(/\/$/, "");
const host = new URL(BASE).hostname;
if (host !== "localhost" && host !== "127.0.0.1") { console.error("✖ só roda em localhost (usa o usuário de dev)"); process.exit(2); }

const USER = `e2e-${randomUUID().slice(0, 8)}`; // conta nova a cada execução, sem dado real
const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
const D = now.toISOString().slice(0, 10);
const plus = (n) => new Date(now.getTime() + n * 86_400_000).toISOString().slice(0, 10);
let passo = 0, falhas = 0;

async function api(method, path, body, { status } = {}) {
  const h = { "x-dev-user": USER };
  if (body !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { /* vazio */ }
  const okStatus = status ? r.status === status : r.status < 300;
  if (!okStatus) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 200)}`);
  return data;
}
async function tool(token, name, args = {}) {
  const r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const j = await r.json();
  if (r.status !== 200 || j.result?.isError) throw new Error(`${name} → ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return JSON.parse(j.result.content[0].text);
}
async function etapa(nome, fn) {
  passo++;
  try { const extra = await fn(); console.log(`✔ ${passo}. ${nome}${extra ? ` · ${extra}` : ""}`); }
  catch (e) { falhas++; console.log(`✖ ${passo}. ${nome}\n    ${e.message}`); }
}
const check = (cond, msg) => { if (!cond) throw new Error(msg); };
async function tempo(path, n = 7) {
  await api("GET", path); // aquece
  const ms = [];
  for (let i = 0; i < n; i++) { const t = performance.now(); await api("GET", path); ms.push(performance.now() - t); }
  ms.sort((a, b) => a - b);
  return Math.round(ms[Math.floor(n / 2)]);
}

const r = await fetch(`${BASE}/api/health`).catch(() => null);
if (!r?.ok) { console.error(`✖ ${BASE} não respondeu. Rode antes: npm run dev`); process.exit(2); }
console.log(`Conta de teste: ${USER} · data ${D}\n`);

let token, plan, sid, exam;
await etapa("conta nova: perfil vazio e Primeiros passos pendente", async () => {
  const s = await api("GET", `/api/state?date=${D}`);
  check(s.onboarding === "pendente" && Object.keys(s.profile).length === 0, "conta não nasceu vazia");
});
await etapa("Primeiros passos: objetivo, prioridades, dias, academia → concluído", async () => {
  await api("PUT", "/api/profile", { data: { level: 1, subPriorities: ["ombro_lat", "biceps", "triceps_longa"], priorities: ["ombro", "biceps", "triceps"], minutes: 60, daysTarget: 4, goal: { id: "bracos_ombros", statement: "Braços e ombros maiores mantendo a cintura (fictício)", horizonWeeks: 12 } } });
  await api("PUT", "/api/gyms/acad1", { name: "Academia de teste", equipment: ["halteres", "banco", "polia", "barra"] });
  await api("PATCH", "/api/account", { onboarding: "concluido" });
  token = (await api("POST", "/api/account/tokens", { label: "e2e" })).token;
  check(token, "sem token do Claude");
  check((await api("GET", "/api/account")).onboarding === "concluido", "onboarding não concluiu");
});
await etapa("semana gerada", async () => {
  const w = await api("GET", `/api/week?date=${D}`);
  check(w && JSON.stringify(w).length > 20, "semana vazia");
  plan = (await api("POST", "/api/plan-day", { date: D, daysLeft: 3, gymId: "acad1" })).plan;
  check(plan?.items?.length >= 2, "treino do dia sem exercícios");
  await api("PUT", `/api/day-plan/${D}`, { plan, gymId: "acad1" });
  return `${plan.items.length} exercícios hoje`;
});
await etapa("treino: começar, séries, descanso, editar série (desfazer e refazer), pular, terminar", async () => {
  sid = randomUUID();
  await api("POST", "/api/sessions", { id: sid, date: D, plan });
  const [a, b] = plan.items;
  for (let n = 1; n <= 2; n++) await api("POST", `/api/sessions/${sid}/sets`, { exerciseId: a.exerciseId, setNo: n, kg: 10, reps: 10 });
  await api("PUT", `/api/sessions/${sid}/rest`, { seconds: 90 });
  await api("DELETE", `/api/sessions/${sid}/sets/${a.exerciseId}/2`);                         // editar = desfaz a série…
  await api("POST", `/api/sessions/${sid}/sets`, { exerciseId: a.exerciseId, setNo: 2, kg: 12, reps: 8 }); // …e grava de novo
  await api("DELETE", `/api/sessions/${sid}/rest`);
  await api("POST", `/api/sessions/${sid}/skip`, { exerciseId: b.exerciseId, reason: "ocupado" });
  const s = await api("GET", `/api/sessions/${sid}`);                                          // X/voltar: a sessão se restaura
  check(JSON.stringify(s).includes("12"), "série editada não voltou na restauração");
  const fim = await api("POST", `/api/sessions/${sid}/finish`, { feedback: { feel: "bom" } });
  check(fim.summary, "sem resumo do treino");
});
await etapa("checkout do dia", async () => {
  await api("PUT", `/api/checkout/${D}`, { trained: true, alcohol: 0, note: "checkout de teste" });
});
await etapa("comida (texto; a voz vira este mesmo texto)", async () => {
  await api("POST", "/api/food", { date: D, text: "2 ovos e 1 pão francês", meal: "cafe" }, { status: 201 });
  const f = await api("GET", `/api/food?from=${D}&to=${D}`);
  check(JSON.stringify(f).includes("ovos"), "registro de comida sumiu");
});
await etapa("dor no mapa", async () => {
  await api("POST", "/api/pains", { region: "ombro_e", intensity: 2, context: "dor de teste" });
  const s = await api("GET", `/api/state?date=${D}`);
  check(JSON.stringify(s).includes("ombro_e"), "dor não aparece no estado");
});
await etapa("pedido no chat → vigia local pega pelo tier certo → responde", async () => {
  const p = await api("POST", "/api/inbox", { text: "hoje só tenho 30 min", tier: "haiku" });
  const pend = await tool(token, "ciclo_chat_pendentes", { tier: "haiku", origem: "vigia" });
  check(pend.pendentes.some((x) => x.id === p.id), "o vigia (haiku) não viu o pedido");
  await tool(token, "ciclo_responder_pedido", { id: p.id, resposta: "Cortei para 30 min (teste)." });
  const st = await api("GET", "/api/claude");
  check(st.status.modo === "online", `status do Claude = ${st.status.modo}`);
  return `tier ${p.tier ?? "haiku"} · ${st.status.texto}`;
});
await etapa("exame colado → analisado → texto bruto apagado", async () => {
  exam = (await api("POST", "/api/exames", { label: "Exame fictício", text: "VITAMINA D 22 ng/mL (ref. 30 a 100)" }, { status: 201 })).id;
  const pend = await tool(token, "ciclo_exame_pendente");
  check(pend.exame?.id === exam, "exame não ficou pendente");
  await tool(token, "ciclo_exame_concluir", { id: exam, resumo: { marcadores: [{ nome: "Vitamina D", valor: 22, unidade: "ng/mL", referencia: "30–100", status: "fora" }] } });
  const d = await api("GET", `/api/diario?from=${plus(-6)}&to=${D}`);
  const e = d.exams.find((x) => x.id === exam);
  check(e?.status === "analisado" && e.hasText === false, "texto bruto continua guardado");
});
// Tempo das duas chamadas que abrem o app (conta nova com um treino; mediana de 7). Meta: < 150 ms locais.
await etapa("tempo de /api/state e /api/home (meta < 150 ms)", async () => {
  const t1 = await tempo(`/api/state?date=${D}`), t2 = await tempo(`/api/home?date=${D}`);
  check(t1 < 150 && t2 < 150, `state ${t1} ms · home ${t2} ms`);
  return `state ${t1} ms · home ${t2} ms`;
});
await etapa("exportar e apagar a conta de teste", async () => {
  const ex = await api("GET", "/api/account/export");
  check(ex.formato === "ciclo-export-1" && ex.session.length === 1, "export incompleto");
  await api("DELETE", "/api/account", { confirm: "APAGAR" });
});


console.log(falhas ? `\n✖ ${falhas} de ${passo} etapas falharam` : `\n✔ ${passo} etapas ok`);
process.exit(falhas ? 1 : 0);
