/* Ciclo · app (PWA). Sem framework e sem build além do core.js (gerado de packages/core).
   Modos: DEMO (arquivo aberto direto ou ?demo) guarda tudo no navegador;
          SERVIDOR (Worker) lê /api/state e grava pela API, com fila offline para a academia sem sinal. */
"use strict";
(() => {
  const C = window.CicloCore;
  if (!C) { document.body.textContent = "core.js não carregou — rode `npm run build:core`."; return; }

  // ---------- utilidades ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (id, cls = "", st = "") => `<svg class="i ${cls}" style="${st}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const img = (id) => `img/ex/${encodeURIComponent(id)}.webp`;
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const fmt = (n, d = 0) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const SERVER = location.protocol.startsWith("http") && !/[?&]demo\b/.test(location.search);
  const TZ = "America/Sao_Paulo";
  const isoDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const addDays = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const DOW = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
  const DOW_NM = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const dowIdx = (iso) => (new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7;
  const longDate = (iso) => new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z")).replace(/^./, (c) => c.toUpperCase()).replace(".", "");
  const M = C.MUSCLES, EXB = C.EXERCISE_BY_ID;
  const mName = (m) => M[m]?.nm ?? m;

  // ---------- estado ----------
  const realToday = isoDate();
  const today = SERVER ? realToday : addDays(C.mondayOf(realToday), 3); // demo: "quinta" fictícia
  const monday = C.mondayOf(today);
  const dates = C.weekDates(monday);

  const DEFAULT_PROFILE = {
    sex: "m", age: 24, heightCm: 175, weightKg: 72, bodyType: "magro", fatWhere: ["barriga"], level: 1,
    goal: { id: "bracos_ombros", statement: "Braços e ombros maiores mantendo a cintura", horizonWeeks: 12, metrics: { bracoCm: 1.5, cinturaCm: 0, pesoKg: 1.5, aderenciaPct: 80 } },
    priorities: ["ombro", "biceps", "triceps"], remembered: [], calibrate: true,
    daysUsual: ["seg", "ter", "qui", "sex"], daysTarget: 4, minutes: 60, weekStart: "seg", flexWeek: true, hour: "noite",
    prefs: {}, pinned: {}, avoid: [], dynamics: "tradicional", crowdedStrategy: "halteres", mobility: { squat: true, overhead: true },
    dayGym: { seg: "acad1", ter: "acad1", qua: "acad2", qui: "acad1", sex: "acad2", sab: "casa", dom: "casa" },
    diet: { mode: "leve", typical: "", restrictions: [], supplements: ["whey"], kcal: 2650, protein: 139 },
    autonomy: "carga_sozinho", tone: "direto", reviewTime: "dom20",
    tiers: { Hoje: "haiku", Treino: "sonnet", Corpo: "opus", Comida: "haiku", Plano: "opus" },
  };
  const DEFAULT_GYMS = [
    { id: "acad1", name: "Academia 1", equipment: C.EQUIPMENT.map((e) => e.id).filter((e) => !["hack", "kettle", "scott", "roscamaq", "tricmaq", "pantsent"].includes(e)), busyHours: ["18-20"] },
    { id: "acad2", name: "Academia 2", equipment: ["halteres", "banco", "polia", "puxador", "legpress", "extensora", "flexora", "barrafixa"], busyHours: [] },
    { id: "casa", name: "Casa", equipment: ["halteres", "elastico", "barrafixa"], busyHours: [] },
  ];

  const S = {
    profile: clone(DEFAULT_PROFILE), gyms: clone(DEFAULT_GYMS),
    week: { done: {}, freq: {}, attendance: {}, checkins: {}, sessions: [] },
    pains: [], inbox: [], food: [], media: {}, history: {}, measures: [], edits: [],
    features: { ai: false, media: false },
    plan: null, session: null,
    ui: { daysLeft: 1, minutes: 60, gymId: null, focus: [], crowded: false, mode: "normal", format: "tradicional", swapsToday: {}, locked: false,
          ckDate: today, perfilSec: null, cat: "todos", gymTab: "acad1", bodyView: "frente", promptCat: "Hoje", tierOverride: null },
  };

  // dados fictícios da demonstração (seg Superior A, ter Inferior A, qua faltou)
  function seedDemo() {
    S.week.done = { peito: 6, costas: 7, ombro: 6, post: 2, biceps: 5, triceps: 4, quad: 6, isquio: 4, gluteo: 3, pant: 3, core: 2 };
    S.week.freq = Object.fromEntries(C.MUSCLE_IDS.map((m) => [m, 1]));
    S.week.attendance = { [dates[0]]: "fui", [dates[1]]: "fui", [dates[2]]: "nao_fui" };
    S.week.sessions = [{ date: dates[0], name: "Sup. A", groups: ["sup"] }, { date: dates[1], name: "Inf. A", groups: ["inf"] }];
    S.week.checkins = {
      [dates[0]]: { sleepH: 7, energy: 3, soreness: 0, stress: 2, food: 0, weightKg: 72.4 },
      [dates[1]]: { sleepH: 6, energy: 2, soreness: 1, stress: 2, food: 1, weightKg: 72.6 },
    };
    S.history = {
      Incline_Dumbbell_Curl: [{ kg: 12, reps: 12 }, { kg: 12, reps: 11 }, { kg: 12, reps: 10 }],
      Cable_Seated_Lateral_Raise: [{ kg: 5, reps: 16 }, { kg: 5, reps: 15 }, { kg: 5, reps: 14 }],
      Cable_Rope_Overhead_Triceps_Extension: [{ kg: 20, reps: 15 }, { kg: 20, reps: 15 }, { kg: 20, reps: 15 }],
      Incline_Dumbbell_Press: [{ kg: 24, reps: 10 }, { kg: 24, reps: 9 }],
      "Wide-Grip_Lat_Pulldown": [{ kg: 55, reps: 10 }, { kg: 55, reps: 9 }],
    };
    S.media = {
      Cable_Rope_Overhead_Triceps_Extension: { kind: "video", note: "Polia da esquerda, corda curta, pino 4", dur: "0:12" },
      Leg_Press: { kind: "foto", note: "Banco no furo 3 · pés no meio da plataforma" },
    };
    S.measures = [{ date: addDays(monday, -28), braco: 33.0, cintura: 79.0 }, { date: addDays(monday, -14), braco: 33.3, cintura: 79.1 }, { date: dates[0], braco: 33.6, cintura: 79.2 }];
    S.inbox = [{ id: "d1", created_at: Date.now() - 864e5, text: "Leg press estava ocupado na terça, troquei pelo Smith.", action: "trocar_exercicio", tier: "haiku", status: "aplicado",
      response: "Anotado. Deixei o Smith como 1ª alternativa quando o leg press estiver cheio (terças 19h)." }];
  }

  // ---------- persistência ----------
  const LS = "ciclo:v1";
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } };
  function saveLocal() {
    const keep = { ui: { ...S.ui, perfilSec: null }, session: S.session, plan: S.ui.locked ? S.plan : null };
    if (!SERVER) Object.assign(keep, { profile: S.profile, gyms: S.gyms, week: S.week, pains: S.pains, inbox: S.inbox, food: S.food, media: S.media, measures: S.measures, edits: S.edits, history: S.history });
    lsSet(LS + (SERVER ? ":srv" : ":demo") + ":" + today, keep);
  }
  function loadLocal() {
    const v = lsGet(LS + (SERVER ? ":srv" : ":demo") + ":" + today, null);
    if (!v) return false;
    for (const k of Object.keys(v)) if (v[k] != null) S[k] = k === "ui" ? { ...S.ui, ...v.ui } : v[k];
    return true;
  }

  // API + fila offline (a academia nem sempre tem sinal)
  let queue = lsGet(LS + ":queue", []);
  async function api(method, path, body, raw) {
    const r = await fetch(path, { method, credentials: "same-origin", headers: raw ? { "Content-Type": raw.type } : body ? { "Content-Type": "application/json" } : {}, body: raw ?? (body ? JSON.stringify(body) : undefined) });
    const data = r.headers.get("Content-Type")?.includes("json") ? await r.json() : null;
    if (!r.ok) { const e = new Error(data?.error || `HTTP ${r.status}`); e.status = r.status; e.data = data; throw e; }
    return data;
  }
  async function send(method, path, body) {
    if (!SERVER) return null;
    try { await flush(); return await api(method, path, body); }
    catch (e) {
      if (e.status) { toast(e.message); throw e; }
      queue.push({ method, path, body }); lsSet(LS + ":queue", queue); setPill(); return null;
    }
  }
  async function flush() {
    while (queue.length) {
      const q = queue[0];
      try { await api(q.method, q.path, q.body); } catch (e) { if (!e.status) throw e; }
      queue.shift(); lsSet(LS + ":queue", queue);
    }
    setPill();
  }
  addEventListener("online", () => flush().catch(() => {}));

  async function loadServer() {
    const st = await api("GET", `/api/state?date=${today}`);
    S.profile = { ...DEFAULT_PROFILE, ...st.profile };
    S.gyms = st.gyms.length ? st.gyms : S.gyms;
    S.features = st.features ?? S.features;
    const w = st.week;
    S.week = {
      done: w.done, freq: w.freq,
      attendance: Object.fromEntries(w.attendance.map((a) => [a.date, a.status])),
      checkins: Object.fromEntries(w.checkins.map((c) => [c.date, { sleepH: c.sleep_h, energy: c.energy, soreness: c.soreness, stress: c.stress, food: c.food, weightKg: c.weight_kg }])),
      sessions: w.sessions.map((s) => ({ ...s, name: s.name })),
    };
    S.pains = w.pains; S.inbox = w.inbox;
    S.history = st.history ?? {};
    S.media = Object.fromEntries((st.media ?? []).filter((m) => m.exercise_id).map((m) => [m.exercise_id, { kind: m.kind, note: m.note, url: `/api/media/${m.id}` }]));
    S.measures = st.measures ?? [];
    if (st.dayPlan && !S.ui.locked) { S.plan = st.dayPlan.plan; S.ui.locked = st.dayPlan.source !== "core"; S.ui.planSource = st.dayPlan.source; }
    const open = w.sessions.find((s) => s.date === today && !s.finished_at);
    if (open && (!S.session || S.session.id !== open.id)) S.session = { id: open.id, date: today, startedAt: open.started_at, plan: S.plan, logs: {}, skipped: {}, rest: null };
  }

  // ---------- regras (core) ----------
  const gymById = (id) => S.gyms.find((g) => g.id === id) ?? S.gyms[0];
  const defaultGymFor = (iso) => S.profile.dayGym?.[DOW[dowIdx(iso)]] ?? S.gyms[0]?.id;
  function lastGroup() {
    const past = S.week.sessions.filter((s) => s.date < today).slice(-1)[0];
    if (!past) return null;
    const g = past.groups ?? [];
    return g.length === 2 ? "full" : g[0] ?? null;
  }
  function dayInput(ui = S.ui, extraPains = []) {
    const p = S.profile, gym = gymById(ui.gymId);
    return {
      targets: C.weeklyTargets(p.level, p.priorities), done: S.week.done, freq: S.week.freq, priorities: p.priorities,
      daysLeft: ui.daysLeft, minutes: ui.minutes, lastGroup: lastGroup(), mode: ui.mode, focus: ui.focus.length ? ui.focus : null,
      equipment: gym ? gym.equipment : [], crowded: ui.crowded, prefs: p.prefs, pinned: { ...p.pinned, ...ui.swapsToday }, avoid: p.avoid,
      pains: [...S.pains, ...extraPains].map((x) => ({ region: x.region, intensity: x.intensity })),
    };
  }
  function computePlan(force) {
    if (S.session && !S.session.finishedAt) return S.session.plan;
    if (S.ui.locked && S.plan && !force) return S.plan;
    S.plan = C.planDay(dayInput());
    return S.plan;
  }
  const activePlan = () => (S.session && !S.session.finishedAt ? S.session.plan : computePlan());

  function suggestFor(it) {
    const ex = EXB[it.exerciseId];
    const last = S.history[it.exerciseId];
    if (last?.length && ex) { const t = C.nextTarget(last, it.reps, ex.inc); if (t) return { kg: t.kg, reps: t.reps, note: t.reason }; }
    const sl = C.startLoad(it.exerciseId, S.profile.remembered ?? [], it.reps[1]);
    return { kg: sl.kg, reps: it.reps[0], note: sl.note };
  }

  // ---------- render raiz ----------
  let view = "hoje";
  function render() {
    const fn = { hoje: renderHoje, treino: renderTreino, comida: renderComida, corpo: renderCorpo, perfil: renderPerfil, vida: renderVida }[view];
    fn();
    setPill();
    saveLocal();
  }
  function setPill() {
    const el = $("#modePill");
    el.textContent = !SERVER ? "Demonstração" : queue.length ? `Offline · ${queue.length} na fila` : navigator.onLine ? "Online" : "Offline";
    $("#footMode").textContent = SERVER ? "Dados no seu Cloudflare (D1/R2)." : "Demonstração: dados fictícios, salvos só neste navegador.";
  }
  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("show"), 2400); }

  // ============ HOJE ============
  const CK = {
    sleepH: { nm: "Sono", opts: [[5, "≤5h"], [6, "6h"], [7, "7h"], [8, "8h"], [9, "9h+"]] },
    energy: { nm: "Energia", opts: [[1, "baixa"], [2, "ok"], [3, "alta"]] },
    soreness: { nm: "Dor muscular", opts: [[0, "zero"], [1, "leve"], [2, "alta"]] },
    stress: { nm: "Estresse", opts: [[1, "baixo"], [2, "médio"], [3, "alto"]] },
    food: { nm: "Comida ontem", opts: [[-1, "menos"], [0, "normal"], [1, "mais"]] },
  };
  const FOCUS = [["auto", "Automático", []], ["ombro", "Ombros", ["ombro"]], ["bracos", "Braços", ["biceps", "triceps"]], ["peito", "Peito", ["peito"]], ["costas", "Costas", ["costas"]], ["pernas", "Pernas", ["quad", "isquio", "gluteo"]]];

  function checkinCard() {
    const d = S.ui.ckDate, ck = S.week.checkins[d] ?? {}, saved = !!S.week.checkins[d];
    const draft = S.ui.ckDraft?.date === d ? S.ui.ckDraft : { date: d, ...ck };
    const cov = C.coverage(Object.keys(S.week.checkins).map((date) => ({ date })), dates, today);
    const r = saved ? C.readiness(ck) : null;
    return `<div class="card ${!S.week.checkins[today] ? "hl" : ""}" id="ckCard">
      <div class="row between wrapx"><div><p class="kicker">Check-in · ${d === today ? "hoje" : esc(longDate(d))}</p>
        <h2 style="margin-top:2px">${saved ? `Prontidão: ${r.label}` : "Como você está? (10 s)"}</h2></div>
        <span class="badge ${cov.missing.length ? "warn" : "ok"} num">${cov.filled}/${cov.due} dias</span></div>
      ${saved ? `<p class="small sub" style="margin-top:4px">${esc(r.advice)}</p>` : `<p class="small sub" style="margin-top:4px">É o dado mais importante da revisão de domingo. Toque e pronto.</p>`}
      <div style="margin-top:12px">${Object.entries(CK).map(([k, c]) => `<div class="ckrow"><span class="small">${c.nm}</span>
        <div class="seg" role="group" aria-label="${c.nm}">${c.opts.map(([v, l]) => `<button data-act="ck" data-k="${k}" data-v="${v}" aria-pressed="${draft[k] === v}">${l}</button>`).join("")}</div></div>`).join("")}
        <div class="ckrow"><span class="small">Peso (opcional)</span><input class="input num" id="ckWeight" inputmode="decimal" placeholder="kg" value="${draft.weightKg ?? ""}" style="max-width:120px"></div></div>
      <div class="row between wrapx" style="margin-top:12px">
        <div class="dots" style="flex:1;min-width:240px;margin:0">${dates.map((x, i) => {
          const st = x > today ? "fut" : S.week.checkins[x] ? "ok" : "miss";
          return `<button class="dot-day ${st} ${x === d ? "sel" : ""}" data-act="ckday" data-d="${x}" ${x > today ? "disabled" : ""} aria-label="${DOW_NM[i]} ${st === "ok" ? "feito" : st === "miss" ? "pendente" : ""}"><i></i>${DOW_NM[i]}</button>`; }).join("")}</div>
        <button class="btn pri" data-act="cksave">${icon("check")}${saved ? "Atualizar" : "Salvar"}</button></div>
    </div>`;
  }

  function weekCard(plan) {
    const projGroups = [];
    let g = plan.groups.length === 2 ? "full" : plan.groups[0];
    for (let i = 1; i < S.ui.daysLeft; i++) { g = g === "sup" ? "inf" : "sup"; projGroups.push(g); }
    let futIdx = 0;
    const days = dates.map((d, i) => {
      const att = S.week.attendance[d], ses = S.week.sessions.find((s) => s.date === d);
      let cls, lbl, st = "";
      if (d < today) {
        cls = att === "fui" || ses ? "fui" : att === "nao_fui" ? "nao" : "livre";
        lbl = cls === "fui" ? (ses?.name ?? "treino").replace("Superior", "Sup.").replace("Inferior", "Inf.") : cls === "nao" ? "faltou" : att === "folga" ? "folga" : "marcar";
        st = cls === "fui" ? icon("check") : cls === "nao" ? icon("x") : "";
      } else if (d === today) {
        cls = "hoje" + (att === "fui" || S.session ? " fui" : "");
        lbl = plan.mode === "compensatorio" ? "Corpo todo" : plan.groups[0] === "sup" ? "Sup." : "Inf.";
        st = att === "fui" || S.session ? icon("check") : "";
      } else {
        const p = projGroups[futIdx++];
        cls = p ? "prev" : "livre"; lbl = p ? (p === "sup" ? "Sup." : "Inf.") : "folga";
      }
      const gid = d === today ? S.ui.gymId : defaultGymFor(d);
      const gy = gymById(gid)?.name.replace("Academia ", "A") ?? "";
      return `<button class="day ${cls}" data-act="day" data-d="${d}" aria-label="${DOW_NM[i]}: ${esc(lbl)}"><b>${DOW_NM[i]}</b><span class="st">${st}</span><span class="lbl">${esc(lbl)}</span><span class="gy">${d >= today && lbl !== "folga" ? esc(gy) : ""}</span></button>`;
    }).join("");
    const fid = FOCUS.find(([, , ms]) => ms.join() === S.ui.focus.join())?.[0] ?? "auto";
    return `<div class="card">
      <div class="row between wrapx"><h2>Semana flexível</h2><span class="small sub num">fecha em ${plan.weekClosePct}% · ${Object.values(S.week.attendance).filter((x) => x === "fui").length} feitos</span></div>
      <p class="small sub" style="margin:4px 0 12px">Dias passados: toque para marcar fui / faltou / folga. Iniciar o treino já conta como “fui”.</p>
      <div class="week">${days}</div><hr>
      <div class="ctl"><div><h3>Dias que ainda dá (com hoje)</h3><p class="small sub">o resto da semana se reorganiza</p></div>
        <div class="seg">${[1, 2, 3, 4].map((n) => `<button data-act="ui" data-k="daysLeft" data-v="${n}" aria-pressed="${S.ui.daysLeft === n}">${n}</button>`).join("")}</div></div>
      <div class="ctl"><div><h3>Tempo hoje</h3><p class="small sub">≈ 1 série a cada 3 min</p></div>
        <div class="seg">${[30, 45, 60, 75, 90].map((n) => `<button data-act="ui" data-k="minutes" data-v="${n}" aria-pressed="${S.ui.minutes === n}">${n}</button>`).join("")}</div></div>
      <div class="ctl"><div><h3>Academia hoje</h3><p class="small sub">só entram aparelhos de lá</p></div>
        <div class="seg">${S.gyms.map((gm) => `<button data-act="ui" data-k="gymId" data-v="${esc(gm.id)}" aria-pressed="${S.ui.gymId === gm.id}">${esc(gm.name.replace("Academia ", "Acad "))}</button>`).join("")}</div></div>
      <div style="margin-top:12px"><h3>Foco de hoje</h3><div class="chips" style="margin-top:8px">${FOCUS.map(([id, nm]) => `<button class="chip" data-act="focus" data-v="${id}" aria-pressed="${fid === id}">${nm}</button>`).join("")}
        <button class="chip" data-act="crowd" aria-pressed="${S.ui.crowded}">${icon("warn")}Academia cheia</button></div></div>
      <div class="ctl" style="margin-top:12px"><div><h3>Formato</h3><p class="small sub">mesmo volume, outra dinâmica</p></div>
        <div class="seg">${[["tradicional", "Normal"], ["superserie", "Superséries"], ["circuito", "Circuito"]].map(([v, l]) => `<button data-act="ui" data-k="format" data-v="${v}" aria-pressed="${S.ui.format === v}">${l}</button>`).join("")}</div></div>
    </div>`;
  }

  function planCard(plan) {
    const s = S.session;
    const running = s && !s.finishedAt;
    return `<div class="card dark">
      <div class="row between wrapx start"><div><p class="kicker" style="color:#A1A1AA">Treino de hoje · ${esc(gymById(S.ui.gymId)?.name)}</p>
        <h2 style="font-size:22px;margin-top:4px">${esc(plan.name)}</h2>
        <p class="small sub num" style="margin-top:4px">${plan.items.length} exercícios · ${plan.setsTotal} séries · ~${plan.estMinutes} min${S.ui.format !== "tradicional" ? ` · ${S.ui.format === "superserie" ? "superséries" : "circuito"}` : ""}</p></div>
        <a class="btn pri" href="#treino" data-act="${running ? "" : "gostart"}">${running ? "Continuar" : "Começar"} ${icon("arrow")}</a></div>
      <ul class="small" style="margin:12px 0 0;padding-left:18px;color:#D4D4D8;display:grid;gap:4px">${plan.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
      <div class="chips" style="margin-top:12px">${Object.entries(plan.perMuscle).map(([m, n]) => `<span class="badge" style="background:#26262B;color:#F4F4F5">${esc(mName(m))} <b class="num">${n}</b></span>`).join("")}
        ${plan.prehab.length ? `<span class="badge" style="background:#26262B;color:#C6F432">+ fortalecimento</span>` : ""}</div>
      ${S.ui.locked ? `<p class="tiny" style="margin-top:10px;color:#A1A1AA">${S.ui.planSource === "claude" ? "Montado pelo Claude" : "Editado por você · o Claude revisa"} · mudar os controles <button class="btn sm ghost" style="color:#C6F432" data-act="unlock">refaz o treino</button></p>` : ""}
    </div>`;
  }

  function compensaCard(plan) {
    if (plan.mode !== "normal") return `<div class="card"><div class="row between wrapx"><div><p class="kicker">Modo ${plan.mode === "compensatorio" ? "compensatório" : "expresso"}</p><p class="small sub">Gerado a seu pedido.</p></div><button class="btn sm" data-act="mode" data-v="normal">Voltar ao normal</button></div></div>`;
    if (!plan.suggestCompensatory) return "";
    const other = plan.groups[0] === "sup" ? "inf" : "sup";
    const lacking = C.MUSCLE_IDS.filter((m) => M[m].group === other && (S.week.freq[m] ?? 0) < 2).map(mName);
    return `<div class="card hl"><div class="row start">${icon("info", "", "color:var(--acc);margin-top:2px")}<div style="flex:1">
      <h3>Só sobrou hoje?</h3><p class="small sub" style="margin-top:4px">${esc(lacking.slice(0, 4).join(", "))} ainda não tiveram 2× nesta semana. O compensatório junta os dois grupos numa sessão — só se você quiser.</p>
      <div class="row wrapx" style="margin-top:10px;gap:8px"><button class="btn pri sm" data-act="mode" data-v="compensatorio">Gerar compensatório</button><button class="btn sm" data-act="mode" data-v="expresso">Expresso (só prioridades)</button></div></div></div></div>`;
  }

  function volumeCard(plan) {
    const t = C.weeklyTargets(S.profile.level, S.profile.priorities);
    const max = Math.max(16, ...Object.values(t));
    return `<div class="card"><div class="row between wrapx"><h2>Volume da semana</h2><span class="badge num">fecha em ${plan.weekClosePct}%</span></div>
      <div class="legend" style="margin:8px 0 14px"><span><i class="sw" style="background:var(--txt)"></i>feito</span><span><i class="sw" style="background:repeating-linear-gradient(45deg,var(--acc) 0 3px,var(--hatch) 3px 6px)"></i>hoje</span><span><i class="sw" style="background:var(--sub);width:2px;height:12px"></i>meta</span></div>
      ${C.MUSCLE_IDS.map((m) => { const d = S.week.done[m] ?? 0, td = plan.perMuscle[m] ?? 0; const pr = S.profile.priorities.includes(m);
        return `<div class="vol num"><span>${esc(mName(m))}${pr ? ' <span style="color:var(--acc)">●</span>' : ""}</span>
        <div class="bar" role="img" aria-label="${esc(mName(m))}: ${d} feitas, ${td} hoje, meta ${t[m]}"><i class="d" style="width:${Math.min(100, d / max * 100)}%"></i><i class="t" style="left:${Math.min(100, d / max * 100)}%;width:${td / max * 100}%"></i><span class="mk" style="left:${t[m] / max * 100}%"></span></div>
        <span class="sub">${d}${td ? "+" + td : ""}/${t[m]} · ${S.week.freq[m] ?? 0}×</span></div>`; }).join("")}
      <p class="tiny sub" style="margin-top:12px">Meta = séries/semana · “2×” = músculo treinado em 2 sessões. Prioridades marcadas com ●.</p></div>`;
  }

  function goalCard() {
    const g = S.profile.goal, ms = S.measures, first = ms[0], last = ms[ms.length - 1];
    const wk = Math.max(1, Math.round((Date.parse(today) - Date.parse(first?.date ?? today)) / 6048e5) + 1);
    const arm = first && last ? last.braco - first.braco : 0, waist = first && last ? last.cintura - first.cintura : 0;
    return `<div class="card"><div class="row start">${icon("target", "", "color:var(--acc);margin-top:3px")}<div style="flex:1;min-width:0">
      <p class="kicker">Objetivo · semana ${Math.min(wk, g.horizonWeeks)} de ${g.horizonWeeks}</p><p style="font-weight:700;margin-top:2px">${esc(g.statement)}</p>
      <div class="grid g3" style="margin-top:10px;gap:8px">
        <div><p class="tiny sub">Braço</p><p class="num"><b>${arm >= 0 ? "+" : ""}${fmt(arm, 1)}</b> / +${fmt(g.metrics.bracoCm, 1)} cm</p><div class="bar" style="margin-top:4px"><i class="d" style="width:${Math.min(100, Math.max(0, arm / g.metrics.bracoCm * 100))}%;background:var(--acc)"></i></div></div>
        <div><p class="tiny sub">Cintura</p><p class="num"><b>${waist >= 0 ? "+" : ""}${fmt(waist, 1)}</b> cm · meta ±1</p><div class="bar" style="margin-top:4px"><i class="d" style="width:${Math.min(100, Math.abs(waist) * 100)}%;background:${Math.abs(waist) > 1 ? "var(--bad)" : "var(--ok)"}"></i></div></div>
        <div><p class="tiny sub">Frequência 2×</p><p class="num"><b>${C.MUSCLE_IDS.filter((m) => (S.week.freq[m] ?? 0) >= 2).length}</b>/${C.MUSCLE_IDS.length} músculos</p></div>
      </div></div></div></div>`;
  }

  function renderHoje() {
    const plan = computePlan();
    const r = $("#v-hoje");
    r.innerHTML = `
      <div class="row between wrapx" style="margin-bottom:14px"><div><p class="kicker">${esc(longDate(today))}${SERVER ? "" : " · demonstração"}</p><h1>Hoje</h1></div></div>
      <div class="grid dash"><div class="stack">${goalCard()}${checkinCard()}${weekCard(plan)}${compensaCard(plan)}${planCard(plan)}${volumeCard(plan)}</div>
      <div class="stack">${claudeCard()}${miniCards()}</div></div>`;
  }

  function miniCards() {
    const ws = dates.map((d) => S.week.checkins[d]?.weightKg).filter(Boolean);
    const kcal = S.profile.diet.kcal, prot = S.profile.diet.protein;
    const todayFood = foodTotals(today);
    return `<div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="card"><p class="kicker">Peso</p><p class="big num" style="margin-top:6px">${ws.length ? fmt(ws[ws.length - 1], 1) : "—"}<span class="small sub"> kg</span></p><p class="small sub">${ws.length} registro(s) na semana</p></div>
      <div class="card"><p class="kicker">Comida hoje</p><p class="big num" style="margin-top:6px">${fmt(todayFood.kcal)}</p><p class="small sub num">kcal · meta ${fmt(kcal)}</p>
        <p class="small num" style="margin-top:6px"><b>${fmt(todayFood.prot)} g</b> <span class="sub">proteína · ${prot}</span></p><div class="bar" style="margin-top:4px"><i class="d" style="width:${Math.min(100, todayFood.prot / prot * 100)}%;background:var(--acc)"></i></div></div></div>`;
  }

  // ---------- Claude (caixa de pedidos) ----------
  const CATS = ["Hoje", "Treino", "Corpo", "Comida", "Plano"];
  function claudeCard() {
    const ps = C.PROMPTS.filter((p) => p.cat === S.ui.promptCat);
    const draft = S.ui.inboxDraft ?? "";
    const cls = draft ? C.classify(draft) : null;
    const tier = S.ui.tierOverride ?? cls?.tier ?? S.profile.tiers[S.ui.promptCat];
    return `<div class="card"><div class="row between"><h2>Pedir ao Claude</h2><span class="badge">connector · sua assinatura</span></div>
      <p class="small sub" style="margin:4px 0 10px">Toque num pedido pronto ou escreva/fale. A resposta volta aqui com a mudança para aplicar.</p>
      <div class="tabs">${CATS.map((c) => `<button class="chip" data-act="pcat" data-v="${c}" aria-pressed="${S.ui.promptCat === c}">${c}</button>`).join("")}</div>
      <div class="chips" style="margin-top:8px">${ps.map((p) => `<button class="chip" data-act="prompt" data-v="${p.id}">${esc(p.label)} <span class="tier ${p.tier}">${C.TIER_INFO[p.tier].nm}</span></button>`).join("")}</div>
      <div class="row start" style="margin-top:10px;gap:8px"><textarea class="input" id="inboxTxt" rows="2" placeholder="ex.: hoje quero treinar ombro e tenho 45 min">${esc(draft)}</textarea>
        <button class="mic" data-act="mic" data-target="inboxTxt" aria-label="Falar o pedido">${icon("mic")}</button></div>
      <div class="row between wrapx" style="margin-top:8px;row-gap:8px"><div class="row small" style="gap:6px">Modelo:
        <div class="seg">${["haiku", "sonnet", "opus"].map((t) => `<button data-act="tier" data-v="${t}" aria-pressed="${tier === t}">${C.TIER_INFO[t].nm}</button>`).join("")}</div></div>
        <button class="btn pri sm" data-act="sendInbox">${icon("send")}Enviar</button></div>
      <p class="tiny sub" style="margin-top:6px">${esc(C.TIER_INFO[tier].why)}${cls ? ` · detectado: ${esc(cls.action.replace(/_/g, " "))}` : ""}</p>
      <hr><div class="thread">${S.inbox.slice(0, 6).map(inboxItem).join("") || '<p class="small sub">Nenhum pedido ainda.</p>'}</div></div>`;
  }
  function inboxItem(m) {
    const diff = m.change?.diff ?? (m.change?.itens ? m.change.itens.map((t) => ({ plus: t })) : null);
    return `<div><div class="msg me small"><b>Você</b> <span class="tier ${esc(m.tier)}">${esc(C.TIER_INFO[m.tier]?.nm ?? m.tier)}</span><br>${esc(m.text)}</div>
      ${m.response ? `<div class="msg small" style="margin-top:6px"><b>Claude:</b> ${esc(m.response)}
        ${diff?.length ? `<div class="diff">${diff.map((d) => `${d.minus ? `<div class="minus">− ${esc(d.minus)}</div>` : ""}${d.plus ? `<div class="plus">+ ${esc(d.plus)}</div>` : ""}`).join("")}</div>` : ""}
        ${m.status === "respondido" && m.change ? `<div class="row" style="margin-top:8px;gap:6px"><button class="btn pri sm" data-act="applyInbox" data-id="${esc(m.id)}">${icon("check")}Aplicar</button><button class="btn sm" data-act="dropInbox" data-id="${esc(m.id)}">Descartar</button></div>` : ""}
        ${m.status === "aplicado" ? `<p class="tiny sub" style="margin-top:6px">${icon("check", "", "width:12px;height:12px")} aplicado</p>` : ""}</div>`
        : `<p class="tiny sub" style="margin-top:4px">${icon("clock", "", "width:12px;height:12px;vertical-align:-2px")} ${SERVER ? "na fila — o Claude responde quando processar a caixa" : "pensando…"}</p>`}</div>`;
  }

  // Respostas ilustrativas (demonstração). No servidor, quem responde é o Claude pelo connector.
  function demoAnswer(m) {
    const t = m.text.toLowerCase();
    const plan = computePlan();
    const firstMuscle = (re) => [["ombro", /ombro/], ["bracos", /braç|brac|bíceps|tríceps/], ["peito", /peito/], ["costas", /costa/], ["pernas", /perna|coxa|glúteo/]].find(([, r]) => r.test(re))?.[0];
    switch (m.action) {
      case "pouco_tempo": { const min = Number(t.match(/(\d+)\s?min/)?.[1] ?? (/dormi/.test(t) ? S.ui.minutes : 40)); const ch = /dormi/.test(t) ? { mode: "expresso" } : { minutes: Math.max(20, Math.min(90, min)) };
        return { response: /dormi/.test(t) ? "Sono curto: mantive só as prioridades com menos séries. Carga normal, sem buscar recorde." : `Cortei para caber em ${ch.minutes} min mantendo ombro e braços.`, change: ch }; }
      case "academia_cheia": return { response: "Troquei o que depende de polia e rack por halteres e máquinas que costumam estar livres.", change: { crowded: true } };
      case "foco_musculo": { const f = firstMuscle(t) ?? "ombro"; return { response: `Hoje abre com ${FOCUS.find((x) => x[0] === f)[1].toLowerCase()} (≥ 4 séries). O resto da semana se reorganiza sozinho.`, change: { focus: f } }; }
      case "compensatorio": return { response: "Montei o corpo inteiro compensatório: prioridades primeiro, pernas com 2 séries cada para garantir a 2ª frequência.", change: { mode: "compensatorio" } };
      case "trocar_academia": { const g = S.gyms.find((x) => x.id !== S.ui.gymId); return { response: `Refeito com os aparelhos de ${g.name}.`, change: { gymId: g.id } }; }
      case "trocar_exercicio": { const it = plan.items.find((i) => i.alts.length); if (!it) return { response: "Não achei troca disponível." };
        return { response: `Troque ${it.nm} por ${EXB[it.alts[0]].nm}: mesmo músculo, aparelho diferente. Vale só hoje.`, change: { swap: { muscle: it.muscle, to: it.alts[0] } } }; }
      case "nao_gostei": return { response: "Virei em superséries (pares de músculos diferentes, 15 s entre eles). Mesmo volume, menos tempo parado.", change: { format: "superserie" } };
      case "dor": { const region = /escápula|escapula/.test(t) ? (/direit/.test(t) ? "escapula_d" : "escapula_e") : /lombar/.test(t) ? "lombar" : /joelho/.test(t) ? "joelho_d" : "ombro_d";
        return { response: `Registrei dor (${C.REGION_BY_ID[region].nm}, média). Saem os exercícios que forçam a região e entra fortalecimento no aquecimento. Se persistir por mais de 1–2 semanas ou for forte, procure um fisioterapeuta.`, change: { pain: { region, intensity: 2 } } }; }
      case "registrar_comida": { const tot = estimateFood(m.text); return { response: tot.kcal ? `Estimativa: ~${fmt(tot.kcal)} kcal e ${fmt(tot.prot)} g de proteína. Faltam ~${fmt(Math.max(0, S.profile.diet.protein - foodTotals(today).prot - tot.prot))} g de proteína hoje.` : "Me diga o que comeu e eu estimo pela tabela TACO.", change: tot.kcal ? { food: m.text } : null }; }
      case "registrar_treino": return { response: "Registrado no treino de hoje.", change: null };
      case "explicar": { const it = plan.items[0]; return { response: `${it.nm}: ${EXB[it.exerciseId]?.stretch ? "trabalha o músculo alongado, o que tende a dar mais hipertrofia; " : ""}é prioridade (${mName(it.muscle)}) e cabe nos aparelhos de hoje.`, change: null }; }
      case "revisao_semana": return { response: `Semana em ${plan.weekClosePct}%: ${C.MUSCLE_IDS.filter((x) => (S.week.freq[x] ?? 0) >= 2).length} músculos com 2×. Sono abaixo de 7 h em ${Object.values(S.week.checkins).filter((c) => c.sleepH < 7).length} dia(s). Sugestões: 1) manter +1 série de tríceps (pouca dor, progrediu); 2) proteína: 1 whey extra nos dias sem almoço com carne.`, change: null };
      default: return { response: "Entendi. Vou considerar isso na revisão de domingo.", change: null };
    }
  }
  function previewDiff(ch) {
    if (!ch) return null;
    const ui = clone(S.ui), extra = [];
    applyChangeTo(ui, ch, extra, true);
    const before = computePlan(), after = C.planDay(dayInput(ui, extra));
    const key = (i) => `${i.nm} ${i.sets}×`;
    const b = new Set(before.items.map(key)), a = new Set(after.items.map(key));
    const out = [];
    before.items.filter((i) => !a.has(key(i))).forEach((i) => out.push({ minus: key(i) }));
    after.items.filter((i) => !b.has(key(i))).forEach((i) => out.push({ plus: key(i) }));
    after.prehab.filter((p) => !before.prehab.some((x) => x.exerciseId === p.exerciseId)).forEach((p) => out.push({ plus: `${p.nm} 2× (aquecimento)` }));
    if (ch.format) out.push({ plus: `formato: ${ch.format === "superserie" ? "superséries" : ch.format}` });
    out.push({ plus: `${before.setsTotal} → ${after.setsTotal} séries · ~${after.estMinutes} min` });
    return out.slice(0, 9);
  }
  function applyChangeTo(ui, ch, extraPains, preview) {
    if (ch.minutes) ui.minutes = ch.minutes;
    if (ch.crowded != null) ui.crowded = ch.crowded;
    if (ch.focus) ui.focus = FOCUS.find((f) => f[0] === ch.focus)?.[2] ?? [];
    if (ch.mode) ui.mode = ch.mode;
    if (ch.gymId) ui.gymId = ch.gymId;
    if (ch.format) ui.format = ch.format;
    if (ch.swap) ui.swapsToday = { ...ui.swapsToday, [ch.swap.muscle]: ch.swap.to };
    if (ch.pain) { if (preview) extraPains.push(ch.pain); else addPain({ ...ch.pain, kind: "muscular", context: "pelo Claude" }); }
    if (ch.food && !preview) addFood(ch.food);
    ui.locked = false;
  }

  async function sendInbox(text, promptId) {
    text = text.trim(); if (!text) return toast("Escreva ou fale o pedido");
    const preset = C.PROMPTS.find((p) => p.id === promptId);
    const cls = C.classify(text);
    const m = { id: uid(), created_at: Date.now(), text, action: preset?.action ?? cls.action, tier: S.ui.tierOverride ?? preset?.tier ?? cls.tier, status: "pendente" };
    S.inbox.unshift(m); S.ui.inboxDraft = ""; S.ui.tierOverride = null; render();
    if (SERVER) { const r = await send("POST", "/api/inbox", { text, promptId, tier: m.tier }); if (r) m.id = r.id; toast(`Na fila · ${C.TIER_INFO[m.tier].nm}`); return; }
    setTimeout(() => { const a = demoAnswer(m); m.response = a.response; m.change = a.change ? { ...a.change, diff: previewDiff(a.change) } : null; m.status = a.change ? "respondido" : "aplicado"; render(); }, 900);
  }

  // ============ TREINO ============
  let wakeLock = null;
  async function keepAwake() { try { if ("wakeLock" in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => (wakeLock = null)); } } catch { /* sem permissão */ } }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.session && !S.session.finishedAt) keepAwake(); });

  async function startSession() {
    if (S.session && !S.session.finishedAt) return;
    const plan = clone(computePlan());
    S.session = { id: uid(), date: today, startedAt: Date.now(), finishedAt: null, plan, logs: {}, skipped: {}, rest: null, gymId: S.ui.gymId, format: S.ui.format };
    S.week.attendance[today] = "fui";
    if (!S.week.sessions.some((s) => s.date === today)) S.week.sessions.push({ date: today, name: plan.name, groups: plan.groups });
    try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch { /* ok */ }
    unlockAudio(); keepAwake();
    toast("Começou · o dia já conta como “fui”");
    location.hash = "#treino"; render();
    await send("POST", "/api/sessions", { id: S.session.id, date: today, gymId: S.ui.gymId, plan, startedAt: S.session.startedAt });
  }

  function ensureLogs(it) {
    const s = S.session; if (!s) return [];
    if (!s.logs[it.exerciseId]) { const sg = suggestFor(it); s.logs[it.exerciseId] = Array.from({ length: it.sets }, () => ({ kg: sg.kg ?? "", reps: sg.reps, done: false })); }
    return s.logs[it.exerciseId];
  }
  function restFor(plan, idx) {
    const it = plan.items[idx], f = S.session?.format ?? S.ui.format;
    if (f === "circuito") return idx === plan.items.length - 1 ? 120 : 30;
    if (f === "superserie" && idx % 2 === 0 && idx + 1 < plan.items.length) return 15;
    return it.rest;
  }

  function mediaBox(it) {
    const md = S.media[it.exerciseId];
    if (md) return `<div class="media has">${md.url ? (md.kind === "video" ? `<video src="${esc(md.url)}" muted playsinline preload="metadata" controls></video>` : `<img class="prev" src="${esc(md.url)}" alt="">`) : `<span class="mbox">${icon(md.kind === "video" ? "play" : "cam")}</span>`}<span><b>Sua academia</b> · ${esc(md.note || "sem anotação")}</span></div>`;
    return `<div class="media"><span class="mbox">${icon("cam")}</span><span style="flex:1">Sem foto/vídeo do seu aparelho</span><label class="btn sm">Gravar<input type="file" accept="video/*,image/*" capture="environment" class="sr" data-act="media" data-ex="${esc(it.exerciseId)}"></label></div>`;
  }

  function exCard(it, idx, plan, running) {
    const ex = EXB[it.exerciseId], sg = suggestFor(it), s = S.session;
    const skipped = s?.skipped?.[it.exerciseId];
    const pair = (s?.format ?? S.ui.format) === "superserie" ? `<span class="badge">${String.fromCharCode(65 + Math.floor(idx / 2))}${(idx % 2) + 1}</span>` : "";
    const logs = running ? ensureLogs(it) : [];
    const last = S.history[it.exerciseId];
    return `<div class="ex ${skipped ? "skipped" : ""}" id="ex-${idx}">
      ${ex ? `<img class="thumb" src="${img(it.exerciseId)}" alt="${esc(it.nm)}" loading="lazy" width="72" height="72">` : `<div class="thumb" style="display:grid;place-items:center">${icon("edit")}</div>`}
      <div><div class="row between start"><h3>${pair} ${esc(it.nm)}</h3><div class="row" style="gap:4px">${ex?.stretch ? '<span class="badge">alongado</span>' : ""}${it.manual ? '<span class="badge warn">seu · em revisão</span>' : ""}</div></div>
        <div class="meta num"><b style="color:var(--txt)">${it.sets} × ${it.reps[0]}–${it.reps[1]}</b><span>${esc(mName(it.muscle))}</span><span>descanso ${restFor(plan, idx)}s</span>${sg.kg ? `<span>sugestão ${fmt(sg.kg, 1)} kg</span>` : ""}</div>
        ${!running && sg.note ? `<p class="tiny sub" style="margin-top:2px">${esc(sg.note)}</p>` : ""}
        ${skipped ? `<p class="small" style="margin-top:6px;color:var(--warn)">Não feito · ${esc(skipped.replace("_", " "))} <button class="btn sm ghost" data-act="unskip" data-ex="${esc(it.exerciseId)}">desfazer</button></p>` : ""}
        ${running && !skipped ? `<div class="sets">${logs.map((l, k) => `<div class="setrow num ${l.done ? "done" : ""}"><span class="sub">${k + 1}</span><span class="prev">${last?.[k] ? `${fmt(last[k].kg, 1)}×${last[k].reps}` : "—"}</span>
          <input class="input" inputmode="decimal" aria-label="kg série ${k + 1}" data-act="setkg" data-i="${idx}" data-k="${k}" value="${l.kg}"><input class="input" inputmode="numeric" aria-label="reps série ${k + 1}" data-act="setreps" data-i="${idx}" data-k="${k}" value="${l.reps}">
          <button class="ck" data-act="setdone" data-i="${idx}" data-k="${k}" aria-label="Concluir série ${k + 1}">${icon("check")}</button></div>`).join("")}
          <button class="btn sm ghost" data-act="addset" data-i="${idx}" style="justify-self:start">${icon("plus")}série</button></div>` : ""}
        ${mediaBox(it)}
        <div class="acts">${it.alts.length ? `<button class="btn sm" data-act="swap" data-i="${idx}">${icon("swap")}Trocar</button>` : ""}<button class="btn sm" data-act="edit" data-i="${idx}">${icon("edit")}Editar</button>
          ${!skipped ? `<button class="btn sm" data-act="skip" data-i="${idx}">${icon("skip")}Não fiz</button>` : ""}</div>
      </div></div>`;
  }

  function renderTreino() {
    const s = S.session, running = s && !s.finishedAt;
    const plan = activePlan();
    const r = $("#v-treino");
    if (s?.finishedAt && s.date === today) {
      const out = plan.items.map((it) => ({ it, o: C.exerciseOutcome(it.sets, (s.logs[it.exerciseId] ?? []).filter((l) => l.done).length, !!s.skipped[it.exerciseId]) }));
      r.innerHTML = `<p class="kicker">Treino de hoje · encerrado ${s.closedBy === "auto" ? "automaticamente (2 h)" : ""}</p><h1>${esc(plan.name)}</h1>
        <div class="grid g3" style="margin-top:14px"><div class="card"><p class="kicker">Duração</p><p class="big num">${C.fmtClock(s.finishedAt - s.startedAt)}</p></div>
        <div class="card"><p class="kicker">Séries feitas</p><p class="big num">${Object.values(s.logs).flat().filter((l) => l.done).length}<span class="small sub">/${plan.setsTotal}</span></p></div>
        <div class="card"><p class="kicker">Revisão</p><p class="small" style="margin-top:6px">${s.feedback ? "Feedback salvo. O Claude usa na revisão de domingo." : "Sem feedback (fechado sozinho)."}</p></div></div>
        <div class="card" style="margin-top:12px">${out.map(({ it, o }) => `<div class="row between" style="padding:6px 0"><span>${esc(it.nm)}</span><span class="badge ${o === "feito" ? "ok" : o === "parcial" ? "warn" : o === "nao_fiz" ? "bad" : ""}">${o.replace("_", " ")}</span></div>`).join("")}</div>
        <button class="btn" style="margin-top:12px" data-act="newsession">Treinar de novo hoje</button>`;
      return;
    }
    const timer = running ? `<div class="timerbar"><div><p class="tiny sub">tempo</p><p class="clock num" id="clock">${C.fmtClock(Date.now() - s.startedAt)}</p></div>
        <div id="restBox" style="flex:1"></div>
        <button class="btn pri" data-act="finish">${icon("check")}Terminar</button></div>` : "";
    r.innerHTML = `${timer}
      <div class="row between wrapx start" style="margin-bottom:12px"><div><p class="kicker">Treino de hoje · ${esc(gymById(s?.gymId ?? S.ui.gymId)?.name)}</p><h1>${esc(plan.name)}</h1>
        <p class="small sub num" style="margin-top:4px">${plan.setsTotal} séries · ~${plan.estMinutes} min · dupla progressão, sobrar 1–2 reps</p></div>
        ${running ? `<p class="tiny sub" id="autoclose"></p>` : `<button class="btn pri lg" data-act="start">${icon("play")}Começar</button>`}</div>
      ${!running ? `<div class="note" style="margin-bottom:12px">${icon("info")}<span>Ao começar, o dia conta como <b>fui</b>. Esqueceu de terminar? Fecha sozinho em <b>2 h</b> com o que foi registrado. O cronômetro de descanso vibra e apita.</span></div>` : ""}
      <div class="grid dash"><div class="stack">
        ${plan.prehab.length ? `<div class="card"><p class="kicker">Aquecimento · fortalecimento pela dor marcada</p>${plan.prehab.map((p) => `<div class="row" style="margin-top:8px"><img class="thumb" style="width:48px;height:48px" src="${img(p.exerciseId)}" alt="" loading="lazy"><div><b>${esc(p.nm)}</b><p class="small sub">2 × ${p.reps[0]}–${p.reps[1]}, leve</p></div></div>`).join("")}</div>` : ""}
        <div class="card">${plan.items.map((it, i) => exCard(it, i, plan, running)).join("") || '<p class="sub">Nada para hoje com esses aparelhos.</p>'}</div></div>
        <div class="stack"><div class="card"><h2>Como foi montado</h2><ul class="small" style="padding-left:18px;margin:10px 0 0;display:grid;gap:6px">${plan.why.map((w) => `<li>${esc(w)}</li>`).join("")}
          <li>Só aparelhos de ${esc(gymById(S.ui.gymId)?.name)}; trocas já vêm calculadas (sem gastar Claude).</li></ul></div>
          <div class="card"><h2>Mídia da sua academia</h2><p class="small sub" style="margin-top:4px">Grave 10–15 s mostrando a regulagem (pino, banco, pegada). Fica ligada ao exercício e ao aparelho; aparece nas próximas vezes e nas trocas.</p></div>
          ${S.edits.filter((e) => e.review === "pendente").length ? `<div class="card"><h2>Edições em revisão</h2>${S.edits.filter((e) => e.review === "pendente").map((e) => `<p class="small" style="margin-top:6px">${esc(e.label)}</p>${e.issues.map((x) => `<p class="tiny" style="color:var(--${x.severity === "erro" ? "bad" : "warn"})">${esc(x.msg)}</p>`).join("")}`).join("")}</div>` : ""}
        </div></div>`;
    if (running) tick();
  }

  // cronômetro: atualiza só os textos (sem re-render)
  let audioCtx = null;
  function unlockAudio() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume?.(); } catch { /* ok */ } }
  function beep() {
    try { unlockAudio(); const t0 = audioCtx.currentTime; [0, .25, .5].forEach((d) => { const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination); g.gain.setValueAtTime(.25, t0 + d); g.gain.exponentialRampToValueAtTime(.001, t0 + d + .2); o.start(t0 + d); o.stop(t0 + d + .21); }); } catch { /* ok */ }
  }
  function fireRest() {
    navigator.vibrate?.([300, 150, 300, 150, 300]); beep();
    try { if (document.hidden && Notification.permission === "granted") navigator.serviceWorker?.ready.then((r) => r.showNotification("Descanso acabou", { body: "Próxima série!", tag: "rest", renotify: true })); } catch { /* ok */ }
  }
  function tick() {
    const s = S.session; if (!s || s.finishedAt) return;
    const now = Date.now(), res = C.resolveSession(s, now);
    if (res.status === "fechado_auto") { autoClose(); return; }
    const c = $("#clock"); if (c) c.textContent = C.fmtClock(now - s.startedAt);
    const ac = $("#autoclose"); if (ac) ac.textContent = `fecha sozinho em ${C.fmtClock(res.remainingMs)}`;
    const rb = $("#restBox");
    if (rb) {
      if (s.rest) {
        const left = Math.ceil((s.rest.until - now) / 1000);
        if (left <= 0 && !s.rest.fired) { s.rest.fired = true; fireRest(); saveLocal(); }
        rb.innerHTML = `<div class="rest ${left <= 0 ? "done" : ""}">${icon("clock")}<span class="num">${left > 0 ? C.fmtClock(left * 1000) : "Vai!"}</span>
          <button class="btn sm" style="min-height:30px" data-act="rest15">+15</button><button class="btn sm" style="min-height:30px" data-act="restskip">ok</button></div>`;
      } else rb.innerHTML = `<p class="tiny sub">descanso começa ao concluir a série</p>`;
    }
  }
  setInterval(() => { if (view === "treino") tick(); else if (S.session && !S.session.finishedAt && C.resolveSession(S.session, Date.now()).status === "fechado_auto") autoClose(); }, 1000);

  function autoClose() {
    const s = S.session; if (!s || s.finishedAt) return;
    s.finishedAt = s.startedAt + C.MAX_SESSION_MS; s.closedBy = "auto"; s.rest = null;
    toast("Treino fechado sozinho (2 h). Presença mantida."); render();
  }

  // ============ COMIDA ============
  const FOOD_TABLE = [ // estimativa rápida offline (porções caseiras, ~TACO). O Claude refina.
    [/ovo/, 70, 6], [/pão|pao/, 140, 4.5], [/arroz/, 200, 4], [/feij/, 140, 9], [/frango/, 250, 45], [/carne|bife|patinho/, 300, 40], [/whey/, 120, 24],
    [/banana/, 90, 1], [/leite/, 120, 6], [/iogurte/, 100, 8], [/queijo/, 100, 7], [/macarr/, 300, 10], [/batata/, 150, 3], [/aveia/, 110, 4], [/peixe|tilápia|atum/, 180, 30], [/salada|alface|tomate/, 25, 1],
  ];
  function estimateFood(text) {
    let kcal = 0, prot = 0;
    for (const part of String(text).toLowerCase().split(/[,;\n+]| e /)) {
      const row = FOOD_TABLE.find(([re]) => re.test(part)); if (!row) continue;
      const q = Number(part.match(/(\d+)/)?.[1] ?? 1); const k = Math.min(q, 6);
      kcal += row[1] * k; prot += row[2] * k;
    }
    return { kcal, prot };
  }
  const foodTotals = (d) => S.food.filter((f) => f.date === d).reduce((a, f) => ({ kcal: a.kcal + f.kcal, prot: a.prot + f.prot }), { kcal: 0, prot: 0 });
  function addFood(text) { const e = estimateFood(text); S.food.push({ id: uid(), date: today, text, ...e }); send("POST", "/api/food", { date: today, text }); }

  function renderComida() {
    const d = S.profile.diet, t = foodTotals(today);
    const days = new Set(S.food.map((f) => f.date)).size;
    $("#v-comida").innerHTML = `<p class="kicker">Dieta flexível · modo ${esc(d.mode)}</p><h1 style="margin-bottom:14px">Comida</h1>
      <div class="grid g3"><div class="card"><p class="kicker">Meta adaptativa</p><p class="big num" style="margin-top:6px">${fmt(d.kcal)}</p><p class="small sub">kcal/dia · ajusta até ±150/sem pelo peso</p></div>
      <div class="card"><p class="kicker">Proteína (fixa)</p><p class="big num" style="margin-top:6px">${d.protein} g</p><p class="small sub">a única meta “rígida”</p></div>
      <div class="card"><p class="kicker">Dias com registro</p><p class="big num" style="margin-top:6px">${days}</p><p class="small sub">tudo bem faltar; média semanal é o que conta</p></div></div>
      <div class="grid g2" style="margin-top:12px"><div class="card"><h2>O que você comeu?</h2>
        <p class="small sub" style="margin:4px 0 12px">Fale como falaria. ${S.features.ai ? "Transcrição com Whisper (servidor)." : "Transcrição pelo navegador; com o servidor ligado, usa Whisper."}</p>
        <div class="row start" style="gap:10px"><button class="mic" data-act="mic" data-target="foodTxt" aria-label="Gravar o que comeu">${icon("mic")}</button>
          <textarea class="input" id="foodTxt" rows="3" placeholder="café: 3 ovos e 2 pães · almoço: arroz, feijão e frango">${esc(S.ui.foodDraft ?? "")}</textarea></div>
        <p class="tiny sub" id="micStatus" style="margin-top:6px"></p>
        <div class="row wrapx" style="margin-top:10px;gap:8px"><button class="btn pri sm" data-act="sendFood">${icon("send")}Registrar</button><button class="btn sm" data-act="foodNormal">Dia normal (igual ao típico)</button></div>
        <hr>${S.food.filter((f) => f.date === today).map((f) => `<div class="row between small" style="padding:4px 0"><span>${esc(f.text)}</span><span class="sub num">~${fmt(f.kcal)} kcal · ${fmt(f.prot)} g</span></div>`).join("") || '<p class="small sub">Nada registrado hoje.</p>'}</div>
      <div class="card"><h2>Hoje até agora</h2>
        <div class="vol num" style="margin-top:12px"><span>Calorias</span><div class="bar"><i class="d" style="width:${Math.min(100, t.kcal / d.kcal * 100)}%"></i></div><span>${fmt(t.kcal)}</span></div>
        <div class="vol num"><span>Proteína</span><div class="bar"><i class="d" style="width:${Math.min(100, t.prot / d.protein * 100)}%;background:var(--acc)"></i></div><span>${fmt(t.prot)} g</span></div><hr>
        <p class="small">${t.prot >= d.protein ? "<b>Proteína batida.</b> O resto é livre." : `<b>Faltam ~${fmt(d.protein - t.prot)} g de proteína.</b> Ex.: 150 g de frango (~45 g) + 1 whey (~24 g).`}</p>
        <p class="tiny sub" style="margin-top:8px">Estimativa rápida no aparelho; o Claude (Haiku) confere com a TACO quando processa.</p></div></div>`;
  }

  // microfone: Whisper no servidor se houver; senão reconhecimento do navegador
  let rec = null;
  async function toggleMic(btn) {
    const target = $("#" + btn.dataset.target), status = $("#micStatus");
    const say = (t) => { if (status) status.textContent = t; else toast(t); };
    if (rec) { rec.stop(); return; }
    if (SERVER && S.features.ai && navigator.mediaDevices?.getUserMedia && window.MediaRecorder) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream), chunks = [];
        rec = mr; btn.classList.add("rec"); say("Gravando… toque de novo para parar (máx. 2 min)");
        const stopT = setTimeout(() => mr.state === "recording" && mr.stop(), 120000);
        mr.ondataavailable = (e) => chunks.push(e.data);
        mr.onstop = async () => {
          clearTimeout(stopT); stream.getTracks().forEach((t) => t.stop()); rec = null; btn.classList.remove("rec"); say("Transcrevendo…");
          try { const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" }); const r = await api("POST", "/api/transcribe", null, blob); target.value = (target.value ? target.value + " " : "") + r.text; target.dispatchEvent(new Event("input", { bubbles: true })); say("Pronto. Revise e envie."); }
          catch { say("Falhou a transcrição. Tente de novo ou digite."); }
        };
        mr.start(); return;
      } catch { say("Sem permissão de microfone."); return; }
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return say("Este navegador não tem reconhecimento de voz. Use o teclado (o microfone do teclado também funciona).");
    const r = new SR(); r.lang = "pt-BR"; r.interimResults = true; r.continuous = true;
    const base = target.value ? target.value + " " : "";
    r.onresult = (e) => { target.value = base + [...e.results].map((x) => x[0].transcript).join(" "); target.dispatchEvent(new Event("input", { bubbles: true })); };
    r.onend = () => { rec = null; btn.classList.remove("rec"); say("Pronto. Revise e envie."); };
    r.onerror = () => say("Não consegui ouvir. Tente de novo.");
    rec = r; btn.classList.add("rec"); say("Ouvindo… fale o que comeu. Toque de novo para parar."); r.start();
  }

  // ============ CORPO (mapa de dor + medidas) ============
  const HOT = { // posições no desenho (frente: esquerda da pessoa aparece à direita)
    frente: { ombro_d: [34, 50], ombro_e: [86, 50], cotovelo_d: [24, 98], cotovelo_e: [96, 98], punho_d: [19, 138], punho_e: [101, 138], quadril_d: [48, 128], quadril_e: [72, 128], joelho_d: [49, 186], joelho_e: [71, 186], tornozelo_d: [49, 238], tornozelo_e: [71, 238] },
    costas: { cervical: [60, 36], escapula_e: [45, 66], escapula_d: [75, 66], lombar: [60, 112] },
  };
  function bodySvg(v) {
    const pains = Object.fromEntries(S.pains.map((p) => [p.region, p.intensity]));
    const sil = `<circle class="sil" cx="60" cy="18" r="12"/><path class="sil" d="M40 38 Q60 32 80 38 L87 50 L82 118 Q60 126 38 118 L33 50 Z"/>
      <path class="sil" d="M33 48 L23 98 L16 140 L23 143 L31 101 L40 60 Z"/><path class="sil" d="M87 48 L97 98 L104 140 L97 143 L89 101 L80 60 Z"/>
      <path class="sil" d="M39 118 L43 196 L44 246 L54 246 L56 196 L60 128 Z"/><path class="sil" d="M81 118 L77 196 L76 246 L66 246 L64 196 L60 128 Z"/>`;
    const hots = Object.entries(HOT[v]).map(([id, [x, y]]) => `<circle class="hot ${pains[id] ? "p" + pains[id] : ""}" cx="${x}" cy="${y}" r="${id === "lombar" ? 11 : 8}" tabindex="0" role="button" aria-label="${esc(C.REGION_BY_ID[id].nm)}" data-act="region" data-v="${id}"/>`).join("");
    const lr = v === "frente" ? `<text x="14" y="30">D</text><text x="106" y="30">E</text>` : `<text x="14" y="30">E</text><text x="106" y="30">D</text>`;
    return `<svg viewBox="0 0 120 256" role="group" aria-label="Corpo ${v}">${sil}${hots}${lr}</svg>`;
  }
  function painEffects(p) {
    const blocked = C.EXERCISES.filter((e) => C.painBlocks(e, [p])).map((e) => e.nm);
    const pre = (C.PREHAB[C.REGION_BY_ID[p.region]?.joint] ?? []).map((id) => EXB[id]?.nm).filter(Boolean);
    return { blocked, pre };
  }
  function renderCorpo() {
    const ms = S.measures, last = ms[ms.length - 1];
    const ws = Object.entries(S.week.checkins).filter(([, c]) => c.weightKg).map(([d, c]) => [d, c.weightKg]);
    $("#v-corpo").innerHTML = `<p class="kicker">Corpo</p><h1 style="margin-bottom:14px">Mapa de dor e medidas</h1>
      <div class="grid dash"><div class="stack"><div class="card"><div class="row between wrapx"><h2>Onde dói?</h2>
        <div class="seg">${["frente", "costas"].map((v) => `<button data-act="bodyview" data-v="${v}" aria-pressed="${S.ui.bodyView === v}">${v === "frente" ? "Frente" : "Costas"}</button>`).join("")}</div></div>
        <p class="small sub" style="margin:4px 0 12px">Toque na região. Ex.: escápula esquerda, ombro direito, lombar. A dor muda o treino na hora: tira o que força a região e coloca fortalecimento no aquecimento.</p>
        <div class="bodymap">${bodySvg(S.ui.bodyView)}</div>
        <div class="legend" style="justify-content:center;margin-top:10px"><span><i class="sw" style="background:rgba(251,191,36,.6)"></i>leve</span><span><i class="sw" style="background:rgba(249,115,22,.7)"></i>média</span><span><i class="sw" style="background:rgba(239,68,68,.8)"></i>forte</span></div></div>
        <div class="note warn">${icon("warn")}<span>O app adapta o treino, não diagnostica. Dor forte, que piora, com formigamento ou por mais de 1–2 semanas: procure um médico ou fisioterapeuta.</span></div></div>
      <div class="stack"><div class="card"><h2>Dores ativas</h2>${S.pains.length ? S.pains.map((p) => { const ef = painEffects(p);
          return `<div style="padding:10px 0;border-top:1px solid var(--borda)"><div class="row between"><b>${esc(C.REGION_BY_ID[p.region]?.nm)}</b><span class="badge ${p.intensity === 3 ? "bad" : "warn"}">${["", "leve", "média", "forte"][p.intensity]}</span></div>
          <p class="tiny sub">${esc([p.kind, p.context].filter(Boolean).join(" · "))}</p>
          <p class="small" style="margin-top:6px"><b>Fortalecimento:</b> ${esc(ef.pre.slice(0, 2).join(", ") || "—")}</p>
          <p class="small sub"><b>Evitando:</b> ${esc(ef.blocked.slice(0, 5).join(", ") || "nada")}${ef.blocked.length > 5 ? ` +${ef.blocked.length - 5}` : ""}</p>
          <div class="row" style="gap:6px;margin-top:8px">${p.intensity > 1 ? `<button class="btn sm" data-act="painless" data-id="${esc(p.id)}">Melhorou</button>` : ""}<button class="btn sm" data-act="painok" data-id="${esc(p.id)}">${icon("check")}Passou</button></div></div>`; }).join("") : '<p class="small sub" style="margin-top:6px">Nenhuma. Bom sinal.</p>'}</div>
        <div class="card"><h2>Medidas (a cada 15 dias)</h2><p class="small sub" style="margin-top:4px">O gráfico que importa para o objetivo: braço sobe, cintura parada.</p>
          <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:10px"><div><label class="f" for="mBraco">Braço contraído (cm)</label><input class="input num" id="mBraco" inputmode="decimal" placeholder="${last ? fmt(last.braco, 1) : "ex.: 33,5"}"></div>
          <div><label class="f" for="mCintura">Cintura no umbigo (cm)</label><input class="input num" id="mCintura" inputmode="decimal" placeholder="${last ? fmt(last.cintura, 1) : "ex.: 79"}"></div></div>
          <button class="btn sm" style="margin-top:10px" data-act="saveMeasure">Salvar medidas</button>
          ${ms.length ? `<hr>${ms.slice(-4).map((m) => `<div class="row between small num" style="padding:3px 0"><span class="sub">${esc(m.date.split("-").reverse().slice(0, 2).join("/"))}</span><span>braço ${fmt(m.braco, 1)} · cintura ${fmt(m.cintura, 1)}</span></div>`).join("")}` : ""}</div>
        <div class="card"><h2>Peso da semana</h2>${ws.length ? `<p class="small num" style="margin-top:6px">${ws.map(([d, w]) => `${DOW_NM[dowIdx(d)]} ${fmt(w, 1)}`).join(" · ")}</p>` : '<p class="small sub" style="margin-top:6px">Pese no check-in (opcional).</p>'}</div></div></div>`;
  }
  function addPain(p) {
    const row = { id: uid(), created_at: Date.now(), ...p };
    S.pains = S.pains.filter((x) => x.region !== p.region).concat(row);
    send("POST", "/api/pains", { region: p.region, intensity: p.intensity, kind: p.kind, context: p.context }).then((r) => { if (r?.id) row.id = r.id; });
    S.ui.locked = false;
  }
  function painSheet(region) {
    const cur = S.pains.find((p) => p.region === region);
    const d = { intensity: cur?.intensity ?? 2, kind: cur?.kind ?? "muscular", when: "durante exercício" };
    const plan = activePlan();
    openSheet(`<div class="row between"><div><p class="kicker">Mapa de dor</p><h2 id="sheetTitle">${esc(C.REGION_BY_ID[region].nm)}</h2></div><button class="iconbtn" data-act="close" aria-label="Fechar">${icon("x")}</button></div>
      <div class="stack" style="margin-top:12px" id="painForm" data-region="${region}">
        <div><span class="f">Intensidade</span><div class="seg" data-group="intensity">${[[1, "leve"], [2, "média"], [3, "forte"]].map(([v, l]) => `<button data-act="pick" data-v="${v}" aria-pressed="${d.intensity === v}">${l}</button>`).join("")}</div></div>
        <div><span class="f">Tipo</span><div class="chips" data-group="kind">${["articular", "muscular", "pontada", "formigamento", "cansaço"].map((k) => `<button class="chip" data-act="pick" data-v="${k}" aria-pressed="${d.kind === k}">${k}</button>`).join("")}</div></div>
        <div><span class="f">Quando</span><div class="chips" data-group="when">${["sempre", "durante exercício", "depois do treino", "ao acordar"].map((k) => `<button class="chip" data-act="pick" data-v="${k}" aria-pressed="${d.when === k}">${k}</button>`).join("")}</div></div>
        <div><label class="f" for="painEx">Em qual exercício? (opcional)</label><select class="input" id="painEx"><option value="">—</option>${plan.items.map((i) => `<option>${esc(i.nm)}</option>`).join("")}</select></div>
        <div><label class="f" for="painNote">Nota</label><input class="input" id="painNote" maxlength="200" placeholder="ex.: pontada ao puxar no remo"></div>
        <button class="btn pri full" data-act="savePain">Salvar e ajustar treino</button></div>`);
  }

  // ============ PERFIL ("Ponto de partida") ============
  const BODY = [["muito_magro", "Muito magro", "difícil ganhar peso"], ["magro", "Magro", "pouca gordura e pouca massa"], ["falso_magro", "Magro com barriga", "braço fino, gordura na cintura"], ["normal", "Normal", "nem magro nem acima"], ["atletico", "Atlético", "massa visível, pouca gordura"], ["forte_gordura", "Forte com gordura", "massa boa, cintura alta"], ["acima", "Acima do peso", "quer perder gordura"], ["bem_acima", "Bem acima do peso", "saúde primeiro"]];
  const GOALS = [
    ["bracos_ombros", "Braços e ombros maiores", "mantendo a cintura", ["ombro", "biceps", "triceps"], "Braços e ombros maiores mantendo a cintura"],
    ["massa_geral", "Ganhar massa no geral", "corpo todo, sem foco", ["costas", "peito", "quad"], "Ganhar massa no corpo todo"],
    ["definir", "Perder gordura", "mantendo o músculo", ["costas", "ombro", "quad"], "Perder gordura mantendo o músculo"],
    ["recompor", "Recompor", "trocar gordura por músculo", ["ombro", "costas", "biceps"], "Recompor: menos cintura, mais braço e ombro"],
    ["forca", "Ficar mais forte", "cargas maiores nos básicos", ["costas", "peito", "quad"], "Ficar mais forte nos básicos"],
    ["constancia", "Constância", "treinar 2×/músculo sem falhar", [], "Treinar toda semana com 2× por músculo"],
  ];
  const ANCHORS = ["Barbell_Bench_Press_-_Medium_Grip", "Wide-Grip_Lat_Pulldown", "Barbell_Curl", "Machine_Shoulder_Military_Press", "Leg_Press", "Barbell_Full_Squat", "Seated_Cable_Rows", "Side_Lateral_Raise"];
  const ANCHOR_DEFAULT = { "Barbell_Bench_Press_-_Medium_Grip": [40, 8], "Wide-Grip_Lat_Pulldown": [40, 10], Barbell_Curl: [20, 10], Machine_Shoulder_Military_Press: [30, 10], Leg_Press: [100, 12], Barbell_Full_Squat: [40, 8], Seated_Cable_Rows: [40, 10], Side_Lateral_Raise: [6, 12] };
  const SECS = [
    ["voce", "Você", () => { const p = S.profile; return `${p.heightCm} cm · ${p.weightKg} kg · ${BODY.find((b) => b[0] === p.bodyType)?.[1] ?? ""}`; }],
    ["objetivo", "Objetivo", () => S.profile.goal.statement],
    ["experiencia", "Experiência e cargas", () => `${["nunca treinou", "menos de 1 ano", "1–3 anos", "3+ anos"][S.profile.level]} · ${S.profile.remembered.length ? S.profile.remembered.length + " carga(s) lembrada(s)" : "calibra no 1º treino"}`],
    ["rotina", "Rotina da semana", () => `${S.profile.daysTarget} dias · ${S.profile.minutes} min · semana ${S.profile.flexWeek ? "flexível" : "fixa"}`],
    ["academias", "Academias", () => S.gyms.map((g) => g.name).join(" · ")],
    ["preferencias", "Preferências por músculo", () => { const n = Object.values(S.profile.prefs).filter((v) => v && v !== "tanto_faz").length; return `${n} músculo(s) com preferência · formato ${S.profile.dynamics}`; }],
    ["corpo", "Corpo e dores", () => `${S.pains.length} dor(es) ativa(s)`],
    ["comida", "Comida", () => `registro ${S.profile.diet.mode} · ${S.profile.diet.kcal} kcal · ${S.profile.diet.protein} g`],
    ["claude", "Claude", () => `${{ so_sugere: "só sugere", carga_sozinho: "carga sozinho, plano com aprovação", tudo: "tudo automático" }[S.profile.autonomy]} · modelo por pedido`],
  ];
  const seg = (k, opts, cur, act = "pset") => `<div class="seg">${opts.map(([v, l]) => `<button data-act="${act}" data-k="${k}" data-v="${esc(JSON.stringify(v))}" aria-pressed="${JSON.stringify(cur) === JSON.stringify(v)}">${l}</button>`).join("")}</div>`;
  const stepper = (k, val, step, unit = "") => `<span class="stepper"><button data-act="step" data-k="${k}" data-d="${-step}" aria-label="menos">−</button><span class="num">${fmt(val, step < 1 ? 1 : 0)}${unit}</span><button data-act="step" data-k="${k}" data-d="${step}" aria-label="mais">+</button></span>`;

  function secBody(id) {
    const p = S.profile;
    switch (id) {
      case "voce": return `<div class="grid g2"><div><span class="f">Sexo</span>${seg("sex", [["m", "masculino"], ["f", "feminino"]], p.sex)}</div>
        <div class="row wrapx" style="gap:16px"><div><span class="f">Idade</span>${stepper("age", p.age, 1)}</div><div><span class="f">Altura</span>${stepper("heightCm", p.heightCm, 1, " cm")}</div><div><span class="f">Peso</span>${stepper("weightKg", p.weightKg, 0.5, " kg")}</div></div></div>
        <div style="margin-top:16px"><span class="f">Como você se vê hoje</span><div class="opts">${BODY.map(([v, l, d]) => `<button class="opt" data-act="pset" data-k="bodyType" data-v="${esc(JSON.stringify(v))}" aria-pressed="${p.bodyType === v}"><b>${l}</b><span>${d}</span></button>`).join("")}</div></div>
        <div style="margin-top:16px"><span class="f">Onde acumula gordura (pode marcar mais de um)</span><div class="chips">${["barriga", "peito", "costas/flancos", "quadril e coxas", "distribuído", "quase não acumulo"].map((v) => `<button class="chip" data-act="ptoggle" data-k="fatWhere" data-v="${v}" aria-pressed="${p.fatWhere.includes(v)}">${v}</button>`).join("")}</div></div>`;
      case "objetivo": { const g = p.goal, mt = g.metrics;
        return `<p class="goal">${esc(g.statement)}</p><p class="small sub" style="margin-top:6px">Em ${g.horizonWeeks} semanas: braço +${fmt(mt.bracoCm, 1)} cm · cintura ${mt.cinturaCm ? (mt.cinturaCm > 0 ? "+" : "") + fmt(mt.cinturaCm, 1) + " cm" : "igual"} · peso ${mt.pesoKg >= 0 ? "+" : ""}${fmt(mt.pesoKg, 1)} kg · 2×/músculo em ${mt.aderenciaPct}% das semanas. Tudo no app serve a isso.</p>
        <div style="margin-top:16px"><span class="f">Um objetivo principal</span><div class="opts">${GOALS.map(([v, l, d]) => `<button class="opt" data-act="goal" data-v="${v}" aria-pressed="${g.id === v}"><b>${l}</b><span>${d}</span></button>`).join("")}</div></div>
        <div style="margin-top:16px"><span class="f">Músculos prioritários (até 3, na ordem)</span><div class="chips">${C.MUSCLE_IDS.map((m) => { const i = p.priorities.indexOf(m); return `<button class="chip" data-act="prio" data-v="${m}" aria-pressed="${i >= 0}">${i >= 0 ? `<b class="num">${i + 1}</b>` : ""}${esc(mName(m))}</button>`; }).join("")}</div></div>
        <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Horizonte</span>${seg("goal.horizonWeeks", [[8, "8 sem"], [12, "12 sem"], [16, "16 sem"]], g.horizonWeeks)}</div>
          <div><span class="f">Braço</span>${stepper("goal.metrics.bracoCm", mt.bracoCm, 0.5, " cm")}</div><div><span class="f">Cintura</span>${stepper("goal.metrics.cinturaCm", mt.cinturaCm, 0.5, " cm")}</div><div><span class="f">Peso</span>${stepper("goal.metrics.pesoKg", mt.pesoKg, 0.5, " kg")}</div></div>`; }
      case "experiencia": { const est = ["Incline_Dumbbell_Press", "Incline_Dumbbell_Curl", "Cable_Seated_Lateral_Raise", "Hack_Squat"].map((id) => ({ id, s: C.startLoad(id, p.remembered, EXB[id].r[1]) }));
        return `<span class="f">Há quanto tempo treina</span>${seg("level", [[0, "nunca"], [1, "< 1 ano"], [2, "1–3 anos"], [3, "3+ anos"]], p.level)}
        <div style="margin-top:16px"><span class="f">Cargas que você lembra (opcional — não precisa ser exato)</span><p class="small sub">Escolha até 4. O app estima o resto pela família do movimento e ajusta depois do 1º treino.</p>
          <div class="chips" style="margin-top:8px">${ANCHORS.map((id) => `<button class="chip" data-act="anchor" data-v="${id}" aria-pressed="${p.remembered.some((r) => r.exerciseId === id)}">${esc(EXB[id].nm)}</button>`).join("")}</div>
          ${p.remembered.map((r, i) => `<div class="row wrapx" style="margin-top:10px;gap:10px"><b style="min-width:150px">${esc(EXB[r.exerciseId].nm)}</b>${stepper(`remembered.${i}.kg`, r.kg, EXB[r.exerciseId].inc || 2.5, " kg")}<span class="sub">×</span>${stepper(`remembered.${i}.reps`, r.reps, 1, " reps")}
            ${seg(`remembered.${i}.confidence`, [["certeza", "certeza"], ["aproximado", "aprox."]], r.confidence)}</div>`).join("")}
          <div class="card" style="margin-top:12px;background:var(--sup-2)"><p class="kicker">Carga inicial estimada</p>${est.map(({ id, s }) => `<div class="row between small" style="padding:4px 0"><span>${esc(EXB[id].nm)}</span><span class="num">${s.kg ? `<b>${fmt(s.kg, 1)} kg</b> × ${EXB[id].r[1]}` : "calibrar (sobrar 3 reps)"}</span></div>`).join("")}</div></div>`; }
      case "rotina": return `<span class="f">Dias que normalmente dá para ir</span><div class="chips">${DOW.map((d, i) => `<button class="chip" data-act="ptoggle" data-k="daysUsual" data-v="${d}" aria-pressed="${p.daysUsual.includes(d)}">${DOW_NM[i]}</button>`).join("")}</div>
        <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Meta por semana</span>${seg("daysTarget", [[2, "2"], [3, "3"], [4, "4"], [5, "5"]], p.daysTarget)}</div><div><span class="f">Duração típica</span>${seg("minutes", [[45, "45"], [60, "60"], [75, "75"], [90, "90"]], p.minutes)}</div></div>
        <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Semana</span>${seg("flexWeek", [[true, "flexível (orçamento)"], [false, "dias fixos"]], p.flexWeek)}</div><div><span class="f">Começa na</span>${seg("weekStart", [["seg", "segunda"], ["dom", "domingo"]], p.weekStart)}</div><div><span class="f">Horário</span>${seg("hour", [["manha", "manhã"], ["almoco", "almoço"], ["tarde", "tarde"], ["noite", "noite"]], p.hour)}</div></div>
        <div class="note" style="margin-top:16px">${icon("info")}<span>Semana flexível: as séries de cada músculo viram um orçamento. Faltou? O app pergunta quantos dias ainda dá e redistribui, sempre buscando 2× por músculo. Compensatório só quando você pedir.</span></div>`;
      case "academias": { const g = gymById(S.ui.gymTab);
        return `<div class="tabs">${S.gyms.map((x) => `<button class="chip" data-act="gymtab" data-v="${esc(x.id)}" aria-pressed="${x.id === g.id}">${esc(x.name)}</button>`).join("")}<button class="chip" data-act="gymnew">${icon("plus")}Nova</button></div>
        <div class="row wrapx" style="margin-top:12px;gap:10px"><input class="input" id="gymName" value="${esc(g.name)}" maxlength="40" style="max-width:220px" aria-label="Nome da academia"><span class="badge num">${g.equipment.length} de ${C.EQUIPMENT.length}</span>
          <button class="btn sm" data-act="gymall">Completa</button><button class="btn sm" data-act="gymnone">Limpar</button></div>
        <div class="chips" style="margin:12px 0">${[["todos", "Todos"], ["livres", "Pesos livres"], ["cabos", "Cabos"], ["maquinas", "Máquinas"], ["corpo", "Peso corporal"]].map(([k, n]) => `<button class="chip" data-act="eqcat" data-v="${k}" aria-pressed="${S.ui.cat === k}">${n}</button>`).join("")}</div>
        <div class="eqgrid">${C.EQUIPMENT.filter((e) => S.ui.cat === "todos" || e.cat === S.ui.cat).map((e) => `<button class="eq" data-act="eq" data-v="${e.id}" aria-pressed="${g.equipment.includes(e.id)}"><img src="${img(e.img)}" alt="" loading="lazy" width="320" height="240"><span class="ckm">${icon("check")}</span><span class="nm">${esc(e.nm)}</span></button>`).join("")}</div>
        <div style="margin-top:16px"><span class="f">Horários em que lota</span><div class="chips">${["6-8", "12-14", "17-18", "18-20", "20-22"].map((h) => `<button class="chip" data-act="busy" data-v="${h}" aria-pressed="${g.busyHours.includes(h)}">${h.replace("-", "–")}h</button>`).join("")}</div></div>
        <div style="margin-top:16px"><span class="f">Academia padrão por dia (dá para trocar no dia)</span><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">${DOW.map((d, i) => `<label class="small">${DOW_NM[i]}<select class="input" data-act="daygym" data-v="${d}">${S.gyms.map((x) => `<option value="${esc(x.id)}" ${p.dayGym[d] === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>`).join("")}</div></div>
        <div class="note" style="margin-top:16px">${icon("cam")}<span>Fotos e vídeos do <b>seu</b> aparelho entram na montagem do treino (botão “Gravar” em cada exercício), não aqui.</span></div>`; }
      case "preferencias": return `<p class="small sub" style="margin-bottom:10px">Por músculo: o que você prefere quando há opção. Com a academia cheia, o app ainda pode desviar para o que estiver livre.</p>
        ${C.MUSCLE_IDS.map((m) => `<div class="prefrow"><span class="small"><b>${esc(mName(m))}</b></span>${seg(`prefs.${m}`, [["livre", "Livre"], ["maquina", "Máquina"], ["cabo", "Cabo"], ["tanto_faz", "Tanto faz"]], p.prefs[m] ?? "tanto_faz")}</div>`).join("")}
        <div style="margin-top:16px"><span class="f">Exercícios que você faz melhor (entram primeiro)</span>${p.priorities.map((m) => `<label class="prefrow small"><span>${esc(mName(m))}</span><select class="input" data-act="pin" data-v="${m}"><option value="">automático</option>${C.EXERCISES.filter((e) => e.m === m).map((e) => `<option value="${e.id}" ${p.pinned[m] === e.id ? "selected" : ""}>${esc(e.nm)}</option>`).join("")}</select></label>`).join("")}</div>
        <div style="margin-top:16px"><span class="f">Evitar</span><div class="chips">${["Barbell_Full_Squat", "Bent_Over_Barbell_Row", "Dips_-_Triceps_Version", "Pullups", "EZ-Bar_Skullcrusher", "Romanian_Deadlift", "Barbell_Bench_Press_-_Medium_Grip"].map((id) => `<button class="chip" data-act="ptoggle" data-k="avoid" data-v="${id}" aria-pressed="${p.avoid.includes(id)}">${esc(EXB[id].nm)}</button>`).join("")}</div></div>
        <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Formato padrão</span>${seg("dynamics", [["tradicional", "normal"], ["superserie", "superséries"], ["circuito", "circuito"]], p.dynamics)}</div>
          <div><span class="f">Academia cheia</span>${seg("crowdedStrategy", [["halteres", "ir de halteres"], ["reordenar", "mudar a ordem"], ["esperar", "esperar"]], p.crowdedStrategy)}</div></div>`;
      case "corpo": return `<p class="small">Dores ativas: <b>${S.pains.length}</b>. <a href="#corpo" class="btn sm">Abrir mapa de dor ${icon("arrow")}</a></p>
        <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Agacha fundo sem dor?</span>${seg("mobility.squat", [[true, "sim"], [false, "não"]], p.mobility.squat)}</div><div><span class="f">Braço acima da cabeça sem dor?</span>${seg("mobility.overhead", [[true, "sim"], [false, "não"]], p.mobility.overhead)}</div></div>`;
      case "comida": return `<span class="f">Um dia típico (fale ou escreva)</span><div class="row start" style="gap:10px"><button class="mic" data-act="mic" data-target="typicalTxt" aria-label="Falar o dia típico">${icon("mic")}</button><textarea class="input" id="typicalTxt" data-act="typical" rows="3" placeholder="café: pão com ovo · almoço: marmita arroz, feijão, frango · janta: o que tiver">${esc(p.diet.typical)}</textarea></div>
        <p class="tiny sub" id="micStatus"></p>
        <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Como registrar</span>${seg("diet.mode", [["zero", "só peso"], ["leve", "leve (falar/escrever)"], ["detalhado", "detalhado"]], p.diet.mode)}</div></div>
        <div style="margin-top:16px"><span class="f">Restrições</span><div class="chips">${["lactose", "glúten", "vegetariano", "não come peixe"].map((v) => `<button class="chip" data-act="ptoggle" data-k="diet.restrictions" data-v="${v}" aria-pressed="${p.diet.restrictions.includes(v)}">${v}</button>`).join("")}</div></div>
        <div style="margin-top:16px"><span class="f">Suplementos</span><div class="chips">${["whey", "creatina", "cafeína"].map((v) => `<button class="chip" data-act="ptoggle" data-k="diet.supplements" data-v="${v}" aria-pressed="${p.diet.supplements.includes(v)}">${v}</button>`).join("")}</div></div>`;
      case "claude": return `<span class="f">Quanto o Claude pode mudar sozinho</span>${seg("autonomy", [["so_sugere", "só sugere"], ["carga_sozinho", "carga sozinho, plano com aprovação"], ["tudo", "tudo"]], p.autonomy)}
        <div style="margin-top:16px"><span class="f">Modelo por tipo de pedido (economia × qualidade)</span>${CATS.map((c) => `<div class="prefrow"><span class="small"><b>${c}</b></span>${seg(`tiers.${c}`, [["haiku", "Haiku"], ["sonnet", "Sonnet"], ["opus", "Opus"]], p.tiers[c])}</div>`).join("")}
          <p class="tiny sub" style="margin-top:8px">Haiku: registro e trocas simples · Sonnet: reorganizar o dia/semana · Opus: dor, revisão e novo bloco. Cada pedido pode trocar o modelo antes de enviar.</p></div>
        <div class="row wrapx" style="gap:16px;margin-top:16px"><div><span class="f">Tom</span>${seg("tone", [["direto", "direto"], ["motivador", "motivador"], ["tecnico", "técnico"]], p.tone)}</div><div><span class="f">Revisão semanal</span>${seg("reviewTime", [["dom20", "dom 20h"], ["seg7", "seg 7h"]], p.reviewTime)}</div></div>
        <div class="note" style="margin-top:16px">${icon("info")}<span>${SERVER ? "Connector: claude.ai → Personalizar → Connectors → URL <code>/mcp</code> + token. Funciona no app do Claude no celular." : "Na versão online, o Claude conversa com este app pelo connector do claude.ai (sem API, na sua assinatura)."}</span></div>`;
    }
    return "";
  }
  function renderPerfil() {
    const sec = S.ui.perfilSec;
    const r = $("#v-perfil");
    if (!sec) {
      r.innerHTML = `<p class="kicker">Perfil · edite quando quiser</p><h1>Ponto de partida</h1>
        <div class="card dark" style="margin:14px 0"><p class="kicker" style="color:#A1A1AA">Objetivo</p><p class="goal" style="margin-top:4px">${esc(S.profile.goal.statement)}</p>
          <p class="small sub" style="margin-top:6px">Prioridades: ${esc(S.profile.priorities.map(mName).join(" › ") || "nenhuma")} · ${S.profile.goal.horizonWeeks} semanas</p></div>
        ${SECS.map(([id, nm, sum], i) => `<button class="sec done" data-act="sec" data-v="${id}"><span class="n num"><b>${i + 1}</b></span><span><b>${nm}</b><br><span class="small sub">${esc(sum())}</span></span>${icon("arrow")}</button>`).join("")}`;
      return;
    }
    const i = SECS.findIndex((s) => s[0] === sec);
    r.innerHTML = `<div class="row between" style="margin-bottom:12px"><button class="btn sm" data-act="sec" data-v="">${icon("back")}Perfil</button><span class="small sub num">${i + 1} de ${SECS.length}</span></div>
      <h1 style="margin-bottom:14px">${SECS[i][1]}</h1><div class="card">${secBody(sec)}</div>
      <div class="row between" style="margin-top:14px">${i > 0 ? `<button class="btn" data-act="sec" data-v="${SECS[i - 1][0]}">${icon("back")}${SECS[i - 1][1]}</button>` : "<span></span>"}
        ${i < SECS.length - 1 ? `<button class="btn pri" data-act="sec" data-v="${SECS[i + 1][0]}">${SECS[i + 1][1]} ${icon("arrow")}</button>` : `<button class="btn pri" data-act="sec" data-v="">Concluir ${icon("check")}</button>`}</div>`;
  }
  const getPath = (o, path) => path.split(".").reduce((a, k) => a?.[k], o);
  function setPath(o, path, v) { const ks = path.split("."); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] ??= {}), o); t[last] = v; }
  let profileTimer = null;
  function profileChanged() { S.ui.locked = false; clearTimeout(profileTimer); profileTimer = setTimeout(() => send("PUT", "/api/profile", { data: S.profile }), 600); }
  let gymTimer = null;
  function gymChanged(g) { S.ui.locked = false; clearTimeout(gymTimer); gymTimer = setTimeout(() => send("PUT", `/api/gyms/${encodeURIComponent(g.id)}`, { name: g.name, equipment: g.equipment, busyHours: g.busyHours }), 600); }

  // ============ VIDA ============
  function renderVida() {
    const mods = [["Treino", "ativo", "semana flexível, cronômetro, cargas, mídia do aparelho", 1], ["Comida", "ativo", "registro por voz, meta adaptativa, proteína", 1], ["Corpo", "ativo", "mapa de dor, medidas, peso", 1],
      ["Sono e energia", "via check-in", "já coletado todo dia; vira gráfico", 1], ["Hábitos", "depois", "água, passos, leitura — sem culpa", 0], ["Agenda", "depois", "Google Calendar: encaixa o treino na semana", 0],
      ["Finanças", "depois", "gastos, metas, alertas", 0], ["Estudos / projetos", "depois", "tarefas e sessões de foco", 0], ["Diário", "depois", "1 linha por dia; o Claude resume o mês", 0]];
    $("#v-vida").innerHTML = `<p class="kicker">Para onde o app cresce</p><h1 style="margin-bottom:6px">Vida em módulos</h1>
      <p class="sub" style="margin-bottom:16px;max-width:640px">Cada área é um módulo com tabelas, ferramentas MCP e um card no “Hoje”. Um único connector; o Claude cruza os dados (ex.: 3 noites ruins → semana de manutenção).</p>
      <div class="modgrid">${mods.map(([n, s, d, on]) => `<div class="mod ${on ? "on" : ""}"><div class="row between"><h3>${n}</h3><span class="badge ${on ? "acc" : ""}">${s}</span></div><p class="small sub">${d}</p></div>`).join("")}</div>`;
  }

  // ---------- folha (sheet) ----------
  let lastFocus = null;
  function openSheet(html) { lastFocus = document.activeElement; const sh = $("#sheet"); sh.innerHTML = html; sh.classList.add("open"); $("#scrim").classList.add("open"); sh.querySelector("button,input,select")?.focus(); }
  function closeSheet() { $("#sheet").classList.remove("open"); $("#scrim").classList.remove("open"); lastFocus?.focus?.(); }
  function swapSheet(idx) {
    const plan = activePlan(), it = plan.items[idx];
    const all = C.candidates(it.muscle, dayInput());
    const gym = gymById(S.session?.gymId ?? S.ui.gymId);
    const unavailable = C.EXERCISES.filter((e) => e.m === it.muscle && e.id !== it.exerciseId && !e.eq.every((q) => gym.equipment.includes(q)));
    openSheet(`<div class="row between"><div><p class="kicker">Trocar · ${esc(mName(it.muscle))}</p><h2 id="sheetTitle" style="margin-top:4px">${esc(it.nm)}</h2></div><button class="iconbtn" data-act="close" aria-label="Fechar">${icon("x")}</button></div>
      <p class="small sub" style="margin:8px 0 6px">Já calculado pelo app (sem gastar Claude): mesmo músculo, aparelho disponível, sua preferência, dor e academia cheia.</p>
      ${all.filter((c) => c.ex.id !== it.exerciseId).map((c) => `<div class="alt" style="${c.blockedByPain ? "opacity:.5" : ""}"><img src="${img(c.ex.id)}" alt="" loading="lazy" width="56" height="56">
        <div><h3>${esc(c.ex.nm)}</h3><p class="tiny sub">${c.ex.r.join("–")} reps · ${c.ex.kind}${c.ex.stretch ? " · alongado" : ""}${S.media[c.ex.id] ? " · você tem vídeo" : ""}${c.blockedByPain ? " · força região com dor" : ""}</p></div>
        ${c.blockedByPain ? '<span class="badge bad">dor</span>' : `<div class="row" style="gap:6px"><button class="btn sm" data-act="pickswap" data-i="${idx}" data-v="${c.ex.id}" data-scope="hoje">Hoje</button><button class="btn sm pri" data-act="pickswap" data-i="${idx}" data-v="${c.ex.id}" data-scope="sempre">Sempre</button></div>`}</div>`).join("")}
      ${unavailable.length ? `<p class="tiny sub" style="margin-top:10px">Sem aparelho em ${esc(gym.name)}: ${esc(unavailable.map((e) => e.nm).join(", "))}</p>` : ""}`);
  }
  function editSheet(idx) {
    const plan = activePlan(), it = plan.items[idx];
    S.ui.editDraft = { index: idx, exerciseId: it.exerciseId, sets: it.sets, reps: it.reps, nm: "" };
    drawEdit();
  }
  function drawEdit() {
    const d = S.ui.editDraft, plan = activePlan(), it = plan.items[d.index];
    const edit = { index: d.index, sets: d.sets, reps: d.reps, ...(d.exerciseId === "__proprio" ? { exerciseId: "proprio_" + (d.nm || "x").toLowerCase().replace(/\W+/g, "_"), nm: d.nm || "Exercício meu" } : { exerciseId: d.exerciseId }) };
    const res = C.applyManualEdit(plan, edit, dayInput());
    openSheet(`<div class="row between"><div><p class="kicker">Editar · ${esc(mName(it.muscle))}</p><h2 id="sheetTitle" style="margin-top:4px">${esc(it.nm)}</h2></div><button class="iconbtn" data-act="close" aria-label="Fechar">${icon("x")}</button></div>
      <p class="small sub" style="margin:8px 0">Você conhece seu corpo: a mudança vale na hora e o Claude revisa depois (só aponta riscos).</p>
      <label class="f" for="edEx">Exercício</label><select class="input" id="edEx" data-act="edfield" data-k="exerciseId">${C.EXERCISES.filter((e) => e.m === it.muscle).map((e) => `<option value="${e.id}" ${d.exerciseId === e.id ? "selected" : ""}>${esc(e.nm)}</option>`).join("")}<option value="__proprio" ${d.exerciseId === "__proprio" ? "selected" : ""}>Outro (meu exercício)…</option></select>
      ${d.exerciseId === "__proprio" ? `<input class="input" style="margin-top:8px" id="edNm" data-act="edfield" data-k="nm" maxlength="60" placeholder="nome do exercício" value="${esc(d.nm)}">` : ""}
      <div class="row wrapx" style="gap:16px;margin-top:12px"><div><span class="f">Séries</span><span class="stepper"><button data-act="edsets" data-d="-1">−</button><span class="num">${d.sets}</span><button data-act="edsets" data-d="1">+</button></span></div>
        <div><span class="f">Repetições</span><div class="seg">${[[6, 10], [8, 12], [10, 15], [12, 20]].map((r) => `<button data-act="edreps" data-v="${r.join("-")}" aria-pressed="${d.reps.join("-") === r.join("-")}">${r.join("–")}</button>`).join("")}</div></div></div>
      <div style="margin-top:12px">${res.issues.length ? res.issues.map((x) => `<div class="list-issue"><b style="color:var(--${x.severity === "erro" ? "bad" : x.severity === "aviso" ? "warn" : "info"})">${x.severity}</b><span>${esc(x.msg)}</span></div>`).join("") : '<p class="small" style="color:var(--ok)">Sem problemas encontrados.</p>'}</div>
      <div class="row" style="gap:8px;margin-top:12px"><button class="btn danger sm" data-act="edremove">Tirar do treino</button><button class="btn pri" style="flex:1" data-act="edsave" ${res.issues.some((x) => x.severity === "erro") ? "disabled" : ""}>Aplicar</button></div>`);
  }
  async function saveEdit(remove) {
    const d = S.ui.editDraft, plan = activePlan(), it = plan.items[d.index];
    const edit = remove ? { index: d.index, remove: true } : { index: d.index, sets: d.sets, reps: d.reps, ...(d.exerciseId === "__proprio" ? { exerciseId: "proprio_" + (d.nm || "x").toLowerCase().replace(/\W+/g, "_"), nm: d.nm || "Exercício meu" } : { exerciseId: d.exerciseId }) };
    const res = C.applyManualEdit(plan, edit, dayInput());
    if (S.session && !S.session.finishedAt) S.session.plan = res.plan; else { S.plan = res.plan; S.ui.locked = true; S.ui.planSource = "manual"; }
    S.edits.push({ id: uid(), date: today, label: remove ? `Tirou ${it.nm}` : `${it.nm} → ${res.plan.items[d.index]?.nm} ${d.sets}×${d.reps.join("–")}`, issues: res.issues, review: "pendente" });
    closeSheet(); render(); toast("Aplicado · o Claude revisa na próxima leitura");
    if (SERVER) { await send("PUT", `/api/day-plan/${today}`, { plan, gymId: S.ui.gymId, source: "core" }); await send("POST", "/api/plan-edits", { date: today, edit, daysLeft: S.ui.daysLeft }); }
  }
  function skipSheet(idx) {
    const it = activePlan().items[idx];
    openSheet(`<div class="row between"><div><p class="kicker">Não fiz</p><h2 id="sheetTitle">${esc(it.nm)}</h2></div><button class="iconbtn" data-act="close" aria-label="Fechar">${icon("x")}</button></div>
      <p class="small sub" style="margin:8px 0 12px">Por quê? Ajuda o Claude a ajustar (ocupado sempre → trocar; dor → mapa de dor).</p>
      <div class="chips">${[["ocupado", "Aparelho ocupado"], ["dor", "Dor"], ["sem_tempo", "Sem tempo"], ["nao_quis", "Não quis"], ["outro", "Outro"]].map(([v, l]) => `<button class="chip" data-act="doskip" data-i="${idx}" data-v="${v}">${l}</button>`).join("")}</div>
      ${it.alts.length ? `<button class="btn full" style="margin-top:14px" data-act="swap" data-i="${idx}">${icon("swap")}Prefiro trocar por outro</button>` : ""}`);
  }
  function finishSheet() {
    const s = S.session, plan = s.plan;
    const ms = [...new Set(plan.items.map((i) => i.muscle))];
    const f = S.ui.fb ?? (S.ui.fb = { pump: {}, effort: 2, joint: false });
    const out = plan.items.map((it) => ({ it, o: C.exerciseOutcome(it.sets, (s.logs[it.exerciseId] ?? []).filter((l) => l.done).length, !!s.skipped[it.exerciseId]) }));
    openSheet(`<div class="row between"><div><p class="kicker">Terminar · ${C.fmtClock(Date.now() - s.startedAt)}</p><h2 id="sheetTitle">Como foi?</h2></div><button class="iconbtn" data-act="close" aria-label="Fechar">${icon("x")}</button></div>
      <p class="small sub" style="margin:6px 0 12px">15 s. É o que decide séries e cargas da próxima semana.</p>
      <span class="f">Pump por músculo</span>${ms.map((m) => `<div class="prefrow"><span class="small">${esc(mName(m))}</span><div class="seg">${[[0, "baixo"], [1, "bom"], [2, "forte"]].map(([v, l]) => `<button data-act="fbpump" data-m="${m}" data-v="${v}" aria-pressed="${f.pump[m] === v}">${l}</button>`).join("")}</div></div>`).join("")}
      <div class="row wrapx" style="gap:16px;margin-top:12px"><div><span class="f">Esforço geral</span><div class="seg">${[[1, "fácil"], [2, "certo"], [3, "pesado"]].map(([v, l]) => `<button data-act="fb" data-k="effort" data-v="${v}" aria-pressed="${f.effort === v}">${l}</button>`).join("")}</div></div>
        <div><span class="f">Dor articular?</span><div class="seg"><button data-act="fb" data-k="joint" data-v="false" aria-pressed="${!f.joint}">não</button><button data-act="fbjoint" aria-pressed="${f.joint}">sim → mapa</button></div></div></div>
      <div style="margin-top:12px"><span class="f">Exercícios</span>${out.map(({ it, o }) => `<div class="row between small" style="padding:4px 0"><span>${esc(it.nm)}</span>${o === "nao_registrado" ? `<span class="row" style="gap:4px"><span class="badge">sem registro</span><button class="btn sm" data-act="doskip" data-i="${plan.items.indexOf(it)}" data-v="outro">não fiz</button></span>` : `<span class="badge ${o === "feito" ? "ok" : o === "parcial" ? "warn" : "bad"}">${o.replace("_", " ")}</span>`}</div>`).join("")}</div>
      <button class="btn pri full" style="margin-top:14px" data-act="dofinish">${icon("check")}Salvar e encerrar</button>`);
  }

  // ---------- eventos (delegação única) ----------
  const ACT = {
    ck: (b) => { const d = S.ui.ckDraft?.date === S.ui.ckDate ? S.ui.ckDraft : { date: S.ui.ckDate, ...(S.week.checkins[S.ui.ckDate] ?? {}) }; d[b.dataset.k] = Number(b.dataset.v); S.ui.ckDraft = d; render(); },
    ckday: (b) => { S.ui.ckDate = b.dataset.d; S.ui.ckDraft = null; render(); },
    cksave: () => {
      const d = S.ui.ckDraft?.date === S.ui.ckDate ? S.ui.ckDraft : { date: S.ui.ckDate, ...(S.week.checkins[S.ui.ckDate] ?? {}) };
      const w = parseFloat(($("#ckWeight")?.value || "").replace(",", "."));
      if (Number.isFinite(w)) d.weightKg = w;
      const miss = Object.keys(CK).filter((k) => d[k] == null);
      if (miss.length) return toast(`Falta: ${miss.map((k) => CK[k].nm.toLowerCase()).join(", ")}`);
      const { date, ...vals } = d; S.week.checkins[date] = vals; S.ui.ckDraft = null;
      const next = C.coverage(Object.keys(S.week.checkins).map((x) => ({ date: x })), dates, today).missing[0];
      if (next) S.ui.ckDate = next;
      render(); toast(next ? `Salvo · falta ${DOW_NM[dowIdx(next)]}` : "Check-in salvo");
      send("PUT", `/api/checkin/${date}`, { sleepH: vals.sleepH, energy: vals.energy, soreness: vals.soreness, stress: vals.stress, food: vals.food, weightKg: vals.weightKg ?? null });
    },
    day: (b) => {
      const d = b.dataset.d; if (d >= today) return toast(d === today ? "Hoje: começar o treino já marca “fui”" : "Futuro: use “Dias que ainda dá”");
      const cyc = { fui: "nao_fui", nao_fui: "folga", folga: "fui" }; const cur = S.week.attendance[d] ?? "folga";
      S.week.attendance[d] = cyc[cur] ?? "fui"; render(); send("PUT", `/api/attendance/${d}`, { status: S.week.attendance[d] });
    },
    ui: (b) => { const k = b.dataset.k, v = b.dataset.v; S.ui[k] = ["daysLeft", "minutes"].includes(k) ? Number(v) : v; S.ui.locked = false; render(); },
    focus: (b) => { S.ui.focus = FOCUS.find((f) => f[0] === b.dataset.v)?.[2] ?? []; if (S.ui.focus.length) S.ui.mode = "normal"; S.ui.locked = false; render(); },
    crowd: () => { S.ui.crowded = !S.ui.crowded; S.ui.locked = false; render(); },
    mode: (b) => { S.ui.mode = b.dataset.v; S.ui.locked = false; render(); toast(b.dataset.v === "normal" ? "Voltou ao normal" : "Gerado a seu pedido"); },
    unlock: () => { S.ui.locked = false; computePlan(true); render(); },
    gostart: () => { /* só navega */ },
    start: () => startSession(),
    newsession: () => { S.session = null; render(); },
    pcat: (b) => { S.ui.promptCat = b.dataset.v; render(); },
    prompt: (b) => { const p = C.PROMPTS.find((x) => x.id === b.dataset.v); S.ui.tierOverride = S.profile.tiers[p.cat] !== p.tier ? null : null; sendInbox(p.text, p.id); },
    tier: (b) => { S.ui.tierOverride = b.dataset.v; S.ui.inboxDraft = $("#inboxTxt").value; render(); },
    sendInbox: () => sendInbox($("#inboxTxt").value),
    applyInbox: (b) => { const m = S.inbox.find((x) => x.id === b.dataset.id); if (!m?.change) return; if (m.change.salvo) { S.ui.locked = false; loadServer().then(render); } else { applyChangeTo(S.ui, m.change, [], false); } m.status = "aplicado"; render(); toast("Aplicado ao treino de hoje"); send("POST", `/api/inbox/${m.id}/status`, { status: "aplicado" }); },
    dropInbox: (b) => { const m = S.inbox.find((x) => x.id === b.dataset.id); if (m) m.status = "descartado"; render(); send("POST", `/api/inbox/${b.dataset.id}/status`, { status: "descartado" }); },
    mic: (b) => toggleMic(b),
    swap: (b) => swapSheet(Number(b.dataset.i)),
    pickswap: (b) => {
      const plan = activePlan(), it = plan.items[Number(b.dataset.i)], to = b.dataset.v;
      if (b.dataset.scope === "sempre") { S.profile.pinned[it.muscle] = to; profileChanged(); }
      if (S.session && !S.session.finishedAt) { const ex = EXB[to]; plan.items[Number(b.dataset.i)] = { ...it, exerciseId: to, nm: ex.nm, kind: ex.kind, reps: ex.r, rest: ex.rest, alts: it.alts.filter((x) => x !== to).concat(it.exerciseId) }; }
      else { S.ui.swapsToday[it.muscle] = to; S.ui.locked = false; }
      closeSheet(); render(); toast(b.dataset.scope === "sempre" ? "Trocado no plano (sempre)" : "Trocado só hoje");
    },
    edit: (b) => editSheet(Number(b.dataset.i)),
    edsets: (b) => { S.ui.editDraft.sets = Math.max(1, Math.min(8, S.ui.editDraft.sets + Number(b.dataset.d))); drawEdit(); },
    edreps: (b) => { S.ui.editDraft.reps = b.dataset.v.split("-").map(Number); drawEdit(); },
    edsave: () => saveEdit(false), edremove: () => saveEdit(true),
    skip: (b) => skipSheet(Number(b.dataset.i)),
    doskip: (b) => {
      const it = activePlan().items[Number(b.dataset.i)]; const reason = b.dataset.v;
      if (!S.session) return toast("Comece o treino para registrar");
      S.session.skipped[it.exerciseId] = reason;
      send("POST", `/api/sessions/${S.session.id}/skip`, { exerciseId: it.exerciseId, reason });
      if (S.ui.fb && $("#sheet").classList.contains("open") && b.closest("#sheet")?.querySelector("[data-act=dofinish]")) { finishSheet(); render(); return; }
      closeSheet(); render(); if (reason === "dor") { location.hash = "#corpo"; toast("Marque onde doeu"); }
    },
    unskip: (b) => { delete S.session.skipped[b.dataset.ex]; render(); },
    setdone: (b) => {
      const i = Number(b.dataset.i), k = Number(b.dataset.k), plan = S.session.plan, it = plan.items[i], logs = ensureLogs(it), l = logs[k];
      l.done = !l.done;
      if (l.done) {
        const kg = parseFloat(String(l.kg).replace(",", ".")), reps = parseInt(l.reps, 10);
        if (!Number.isFinite(reps)) { l.done = false; return toast("Preencha as repetições"); }
        const rest = restFor(plan, i); S.session.rest = { until: Date.now() + rest * 1000, fired: false };
        unlockAudio();
        send("POST", `/api/sessions/${S.session.id}/sets`, { exerciseId: it.exerciseId, muscle: it.muscle, setNo: k + 1, kg: Number.isFinite(kg) ? kg : null, reps, rir: null });
        S.week.done[it.muscle] = (S.week.done[it.muscle] ?? 0); // contagem oficial vem do servidor/revisão
      }
      render();
    },
    addset: (b) => { const it = S.session.plan.items[Number(b.dataset.i)], logs = ensureLogs(it); const lst = logs[logs.length - 1]; logs.push({ kg: lst?.kg ?? "", reps: lst?.reps ?? it.reps[0], done: false }); it.sets = logs.length; render(); },
    rest15: () => { if (S.session.rest) { S.session.rest.until = Math.max(Date.now(), S.session.rest.until) + 15000; S.session.rest.fired = false; } tick(); },
    restskip: () => { S.session.rest = null; tick(); },
    finish: () => finishSheet(),
    fbpump: (b) => { S.ui.fb.pump[b.dataset.m] = Number(b.dataset.v); finishSheet(); },
    fb: (b) => { S.ui.fb[b.dataset.k] = JSON.parse(b.dataset.v); finishSheet(); },
    fbjoint: () => { S.ui.fb.joint = true; finishSheet(); toast("Depois de salvar, marque no mapa de dor"); },
    dofinish: async () => {
      const s = S.session; s.finishedAt = Date.now(); s.closedBy = "usuario"; s.feedback = S.ui.fb; s.rest = null;
      for (const it of s.plan.items) { const done = (s.logs[it.exerciseId] ?? []).filter((l) => l.done); if (done.length) S.history[it.exerciseId] = done.map((l) => ({ kg: Number(String(l.kg).replace(",", ".")) || 0, reps: Number(l.reps) })); }
      const joint = S.ui.fb.joint; S.ui.fb = null; closeSheet();
      await send("POST", `/api/sessions/${s.id}/finish`, { feedback: s.feedback });
      if (joint) location.hash = "#corpo"; render(); toast("Treino salvo");
    },
    media: () => {},
    sendFood: () => { const t = $("#foodTxt").value.trim(); if (!t) return toast("Fale ou escreva o que comeu"); addFood(t); S.ui.foodDraft = ""; render(); toast("Registrado · o Claude confere"); },
    foodNormal: () => { addFood(S.profile.diet.typical || "dia típico"); render(); toast("Dia normal registrado"); },
    bodyview: (b) => { S.ui.bodyView = b.dataset.v; render(); },
    region: (b) => painSheet(b.dataset.v),
    pick: (b) => { const g = b.closest("[data-group]"); $$("[data-act=pick]", g).forEach((x) => x.setAttribute("aria-pressed", x === b)); },
    savePain: () => {
      const f = $("#painForm"); const val = (g) => $(`[data-group=${g}] [aria-pressed=true]`, f)?.dataset.v;
      const ex = $("#painEx").value, note = $("#painNote").value.trim();
      addPain({ region: f.dataset.region, intensity: Number(val("intensity") ?? 2), kind: val("kind"), context: [val("when"), ex, note].filter(Boolean).join(" · ").slice(0, 300) });
      closeSheet(); render(); toast("Dor registrada · treino ajustado");
    },
    painless: (b) => { const p = S.pains.find((x) => x.id === b.dataset.id); p.intensity -= 1; S.ui.locked = false; render(); send("POST", "/api/pains", { region: p.region, intensity: p.intensity, kind: p.kind, context: "melhorou" }); },
    painok: (b) => { S.pains = S.pains.filter((x) => x.id !== b.dataset.id); S.ui.locked = false; render(); send("POST", `/api/pains/${b.dataset.id}/resolve`); },
    saveMeasure: () => {
      const n = (id) => parseFloat(($(id).value || "").replace(",", "."));
      const braco = n("#mBraco"), cintura = n("#mCintura"); if (!Number.isFinite(braco) || !Number.isFinite(cintura)) return toast("Preencha braço e cintura");
      S.measures = S.measures.filter((m) => m.date !== today).concat({ date: today, braco, cintura }); render(); toast("Medidas salvas");
      send("PUT", `/api/measurements/${today}`, { armCm: braco, waistCm: cintura });
    },
    sec: (b) => { S.ui.perfilSec = b.dataset.v || null; render(); scrollTo(0, 0); },
    pset: (b) => { setPath(S.profile, b.dataset.k, JSON.parse(b.dataset.v)); profileChanged(); render(); },
    ptoggle: (b) => { const arr = getPath(S.profile, b.dataset.k); const i = arr.indexOf(b.dataset.v); i >= 0 ? arr.splice(i, 1) : arr.push(b.dataset.v); profileChanged(); render(); },
    step: (b) => { const k = b.dataset.k, cur = Number(getPath(S.profile, k)) || 0; setPath(S.profile, k, Math.round((cur + Number(b.dataset.d)) * 10) / 10); profileChanged(); render(); },
    goal: (b) => { const g = GOALS.find((x) => x[0] === b.dataset.v); Object.assign(S.profile.goal, { id: g[0], statement: g[4] }); if (g[3].length) S.profile.priorities = [...g[3]]; profileChanged(); render(); },
    prio: (b) => { const p = S.profile.priorities, m = b.dataset.v, i = p.indexOf(m); if (i >= 0) p.splice(i, 1); else if (p.length < 3) p.push(m); else return toast("Até 3 prioridades"); profileChanged(); render(); },
    anchor: (b) => { const r = S.profile.remembered, i = r.findIndex((x) => x.exerciseId === b.dataset.v); if (i >= 0) r.splice(i, 1); else if (r.length < 4) { const [kg, reps] = ANCHOR_DEFAULT[b.dataset.v] ?? [20, 10]; r.push({ exerciseId: b.dataset.v, kg, reps, confidence: "aproximado" }); } else return toast("Até 4"); profileChanged(); render(); },
    gymtab: (b) => { S.ui.gymTab = b.dataset.v; render(); },
    gymnew: () => { const id = "acad" + (S.gyms.length + 1) + "_" + Math.random().toString(36).slice(2, 5); S.gyms.push({ id, name: `Academia ${S.gyms.length + 1}`, equipment: ["halteres", "banco"], busyHours: [] }); S.ui.gymTab = id; gymChanged(gymById(id)); render(); },
    gymall: () => { const g = gymById(S.ui.gymTab); g.equipment = C.EQUIPMENT.map((e) => e.id); gymChanged(g); render(); },
    gymnone: () => { const g = gymById(S.ui.gymTab); g.equipment = []; gymChanged(g); render(); },
    eqcat: (b) => { S.ui.cat = b.dataset.v; render(); },
    eq: (b) => { const g = gymById(S.ui.gymTab), id = b.dataset.v, i = g.equipment.indexOf(id); i >= 0 ? g.equipment.splice(i, 1) : g.equipment.push(id); gymChanged(g); render(); },
    busy: (b) => { const g = gymById(S.ui.gymTab), i = g.busyHours.indexOf(b.dataset.v); i >= 0 ? g.busyHours.splice(i, 1) : g.busyHours.push(b.dataset.v); gymChanged(g); render(); },
    close: () => closeSheet(),
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b || b.tagName === "SELECT" || b.tagName === "INPUT" || b.tagName === "TEXTAREA") return;
    const fn = ACT[b.dataset.act]; if (fn) { if (b.tagName !== "A") e.preventDefault(); fn(b, e); }
  });
  document.addEventListener("change", async (e) => {
    const t = e.target, act = t.dataset?.act;
    if (act === "daygym") { S.profile.dayGym[t.dataset.v] = t.value; profileChanged(); if (t.dataset.v === DOW[dowIdx(today)]) S.ui.gymId = t.value; }
    if (act === "pin") { if (t.value) S.profile.pinned[t.dataset.v] = t.value; else delete S.profile.pinned[t.dataset.v]; profileChanged(); }
    if (act === "edfield") { S.ui.editDraft[t.dataset.k] = t.value; drawEdit(); }
    if (t.id === "gymName") { const g = gymById(S.ui.gymTab); g.name = t.value.trim().slice(0, 40) || g.name; gymChanged(g); render(); }
    if (act === "media" && t.files?.[0]) {
      const f = t.files[0], exId = t.dataset.ex; t.value = "";
      if (f.size > 20 * 1024 * 1024) return toast("Até 20 MB — grave 10–15 s em 720p");
      const kind = f.type.startsWith("video") ? "video" : "foto";
      S.media[exId] = { kind, note: "regulagem a anotar", url: URL.createObjectURL(f) }; render();
      if (SERVER) {
        const ex = EXB[exId];
        try { const r = await api("POST", `/api/media?exerciseId=${encodeURIComponent(exId)}&equipmentId=${encodeURIComponent(ex?.eq[0] ?? "")}&gymId=${encodeURIComponent(S.ui.gymId)}`, null, f); S.media[exId].url = `/api/media/${r.id}`; toast("Mídia salva no seu R2"); }
        catch (err) { toast(err.message || "Falhou o envio; tente no Wi-Fi"); }
      } else toast("Demo: mídia só neste navegador");
    }
  });
  document.addEventListener("input", (e) => {
    const t = e.target, act = t.dataset?.act;
    if (t.id === "inboxTxt") S.ui.inboxDraft = t.value;
    if (t.id === "foodTxt") S.ui.foodDraft = t.value;
    if (act === "typical") { S.profile.diet.typical = t.value; profileChanged(); }
    if (act === "edfield" && t.id === "edNm") S.ui.editDraft.nm = t.value;
    if (act === "setkg" || act === "setreps") { const it = S.session.plan.items[Number(t.dataset.i)]; ensureLogs(it)[Number(t.dataset.k)][act === "setkg" ? "kg" : "reps"] = t.value; saveLocal(); }
  });
  $("#scrim").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("circle[data-act]")) { e.preventDefault(); painSheet(e.target.dataset.v); } });

  // tema
  $("#themeBtn").addEventListener("click", () => { const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; r.dataset.theme = dark ? "light" : "dark"; lsSet("ciclo:theme", r.dataset.theme); });
  const th = lsGet("ciclo:theme", null); if (th) document.documentElement.dataset.theme = th;

  // rotas
  function route() {
    const v = (location.hash || "#hoje").slice(1);
    view = ["hoje", "treino", "comida", "corpo", "perfil", "vida"].includes(v) ? v : "hoje";
    $$(".view").forEach((s) => s.classList.toggle("on", s.id === "v-" + view));
    $$("[data-nav]").forEach((a) => (a.dataset.nav === view ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    render();
  }
  addEventListener("hashchange", () => { closeSheet(); route(); scrollTo(0, 0); });

  // ---------- início ----------
  async function boot() {
    if (!SERVER) { seedDemo(); loadLocal(); }
    else {
      loadLocal();
      try { await loadServer(); } catch (e) { toast(e.status === 401 ? "Sessão expirada — recarregue para entrar" : "Sem conexão: usando o que está no aparelho"); }
      if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
      setInterval(() => { if (!document.hidden && !(S.session && !S.session.finishedAt)) loadServer().then(render).catch(() => {}); }, 60000);
    }
    S.ui.gymId = S.ui.gymId && S.gyms.some((g) => g.id === S.ui.gymId) ? S.ui.gymId : defaultGymFor(today);
    if (!S.ui.minutesSet) { S.ui.minutes = S.profile.minutes; S.ui.minutesSet = true; S.ui.format = S.profile.dynamics; }
    if (S.session && !S.session.finishedAt && C.resolveSession(S.session, Date.now()).status === "fechado_auto") autoClose();
    route();
  }
  boot();
})();
