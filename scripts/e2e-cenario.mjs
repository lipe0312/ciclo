// #70 `npm run e2e -- <roteiro>` (ou e2e:primeiro-acesso, e2e:pular): roteiro de tela no Chrome headless, sem túnel, num cenário local.
// Sobe `dev:cenario vazio` sozinho (porta 8793, banco próprio em .wrangler/cenarios/vazio) e o derruba no fim; com CICLO_URL=http://localhost:PORTA
// usa um cenário vazio que você já subiu (e o reseta antes). Falha NO PRIMEIRO passo errado e diz qual.
// Só localhost. Roteiro manual equivalente: docs/11-testar-antes-de-subir.md
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CENARIOS, urlAbertura } from "./cenarios/index.mjs";
import { abrirChrome, sleep } from "./cenarios/cdp.mjs";

const PORTA = Number(process.env.CENARIO_PORTA) || 8793;
const ROTEIROS = { "primeiro-acesso": primeiroAcesso, pular, "treino-atual": treinoAtual, navegacao, chat };
/** Cenário de cada roteiro (padrão: vazio). #74: o "Meu treino atual" roda na conta em uso (semi). */
const CENARIO_DO = { "treino-atual": "semi", navegacao: "semi" };
const CENARIO = CENARIO_DO[process.argv[2]] ?? "vazio";
const nome = process.argv[2];
if (!ROTEIROS[nome]) { console.error(`✖ roteiro: ${Object.keys(ROTEIROS).join(" | ")}`); process.exit(2); }
const BASE = (process.env.CICLO_URL ?? `http://localhost:${PORTA}`).replace(/\/$/, "");
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) { console.error("✖ só roda em localhost"); process.exit(2); }
const CTRL = Number(process.env.CENARIO_CTRL_PORTA) || Number(new URL(BASE).port || 80) + 4; // controle do cenário (reset)

let n = 0;
async function passo(titulo, fn, c) {
  n++;
  try { await fn(); } catch (e) { console.log(`✖ ${n}. ${titulo}\n    ${e.message}`); throw e; }
  const erros = c.consola; // #71: nenhum erro de console é tolerado
  if (erros.length) { const m = `console com erro/aviso: ${erros[0].texto.slice(0, 200)}`; console.log(`✖ ${n}. ${titulo}\n    ${m}`); throw new Error(m); }
  c.consola.length = 0;
  console.log(`✔ ${n}. ${titulo}`);
}
const igual = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: veio ${JSON.stringify(a)}, esperado ${JSON.stringify(b)}`); };
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };

async function subir() {
  if (process.env.CICLO_URL) { // cenário vazio já no ar: reseta
    const r = await fetch(`http://127.0.0.1:${CTRL}/reset`, { method: "POST", headers: { "x-ciclo-cenario": "reset" } }).catch(() => null);
    if (!r?.ok) throw new Error(`não achei o dev:cenario ${CENARIO} no ar (npm run dev:cenario -- ${CENARIO})`);
    return () => {};
  }
  const filho = spawn(process.execPath, [fileURLToPath(new URL("./dev-cenario.mjs", import.meta.url)), CENARIO, "--sem-abrir", "--porta", String(PORTA)], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CENARIO_CTRL_PORTA: String(CTRL) } });
  let log = ""; filho.stdout.on("data", (d) => { log += d; }); filho.stderr.on("data", (d) => { log += d; });
  // #71 espera a porta liberar: no `npm run gate` o próximo roteiro sobe o cenário na mesma porta logo em seguida
  const parar = async () => {
    filho.kill("SIGTERM");
    for (let i = 0; i < 50; i++) { if (!(await fetch(`${BASE}/api/health`).then(() => true, () => false))) return; await sleep(200); }
    filho.kill("SIGKILL");
  };
  const fim = Date.now() + 300_000; // #74 o semi grava 2 semanas de treinos pela API (limite de escritas por minuto)
  while (!log.includes("Resetar:") && Date.now() < fim && filho.exitCode === null) await sleep(300);
  if (!log.includes("Resetar:")) { parar(); throw new Error(`o cenário ${CENARIO} não subiu:\n${log.split("\n").slice(-15).join("\n")}`); }
  return parar;
}

const marcados = (c, raiz = ".pp-body") => c.ev(`[...document.querySelectorAll('${raiz} [aria-pressed="true"]')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim())`);
const passoAtual = async (c) => Number((await c.hash()).split("/")[1]);
const titulo = (c) => c.ev("document.querySelector('.pp-q')?.textContent ?? ''");
async function escrever(c, seletor, valor) {
  const r = await c.ev(`(() => { const el = document.querySelector(${JSON.stringify(seletor)}); if (!el) return false;
    const set = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set; set.call(el, ${JSON.stringify(valor)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  return r;
}
const abrirNoCenario = async (c, tela) => { // #77 até 3 tentativas: a primeira navegação do Chrome recém-aberto às vezes perde o redirecionamento
  for (let t = 0; t < 5; t++) {
    // o `vite build --watch` do cenário esvazia o dist ao reconstruir: "/" dá 404 (chrome-error) por alguns segundos
    for (let i = 0; i < 100 && (await fetch(`${BASE}/`).then((r) => r.status, () => 0)) !== 200; i++) await sleep(200);
    await c.abrir(urlAbertura(CENARIO, tela, new URL(BASE).port));
    if (await c.esperar(`location.hash === '#${tela}' && document.querySelector('.pp, .view.on')`)) return;
  }
};

const OBJETIVO = "Braços e ombros maiores", FOCO = "Ombros largos para o verão (teste)";

async function primeiroAcesso(c) {
  await passo("abre direto em Primeiros passos, já logado na conta do cenário", async () => {
    await abrirNoCenario(c, "primeiros-passos/0");
    igual(await c.hash(), "#primeiros-passos/0", `tela (${await c.ev("location.href")} · ${(await c.texto()).replace(/\s+/g, " ").slice(0, 100)})`);
    ok((await titulo(c)).includes("objetivo"), "não abriu o passo do objetivo");
    const st = await c.ev("fetch('/api/account').then((r) => r.json())");
    ok(st.account?.name === "Ana" && st.onboarding === "pendente", "a conta do cenário não é a logada");
  }, c);
  await passo("1. Objetivo: nada marcado ao abrir", async () => igual(await marcados(c), [], "objetivo pré-marcado"), c);
  await passo("1. escolhe um objetivo; Continuar fica habilitado", async () => {
    await c.clicar(OBJETIVO, ".pp-body");
    ok((await marcados(c)).some((t) => t.includes(OBJETIVO)), "o objetivo não ficou marcado");
    ok(await c.ev("!document.querySelector('.pp-cta .btn.pri').disabled"), "Continuar continua desabilitado");
  }, c);
  await passo("1. escreve o foco (campo de texto do passo Objetivo)", async () => {
    ok(await escrever(c, ".pp-body input[type=text], .pp-body textarea", FOCO), "não há campo para escrever o foco");
  }, c);
  await passo("2. avança e volta: o passo anterior reabre", async () => {
    await c.clicar("Continuar"); igual(await passoAtual(c), 1, "passo"); await c.clicar("Voltar uma pergunta"); igual(await passoAtual(c), 0, "passo");
  }, c);
  await passo("2. objetivo e foco continuam lá depois de voltar", async () => {
    ok((await marcados(c)).some((t) => t.includes(OBJETIVO)), "objetivo se perdeu ao voltar");
    igual(await c.ev("document.querySelector('.pp-body input[type=text], .pp-body textarea')?.value"), FOCO, "foco se perdeu ao voltar");
  }, c);
  await passo("3. recarrega no meio do fluxo: volta no mesmo passo", async () => {
    await c.clicar("Continuar"); await c.recarregar(); await c.esperar("document.querySelector('.pp')");
    igual(await passoAtual(c), 1, "passo depois de recarregar");
  }, c);
  await passo("3. as respostas continuam salvas depois de recarregar", async () => {
    await c.clicar("Voltar uma pergunta");
    ok((await marcados(c)).some((t) => t.includes(OBJETIVO)), "objetivo se perdeu ao recarregar");
    await c.clicar("Continuar");
  }, c);
  await passo("3. se a recarga não guardou o objetivo, responde de novo para o roteiro seguir", async () => {
    if (!(await marcados(c)).length && (await passoAtual(c)) === 1) {
      await c.clicar("Voltar uma pergunta"); await c.clicar(OBJETIVO, ".pp-body"); await c.clicar("Continuar");
    }
    igual(await passoAtual(c), 1, "passo");
  }, c);
  await passo("4. Músculos: nada pré-marcado (a sugestão é só sugestão)", async () => igual(await marcados(c), [], "músculos pré-marcados"), c);
  await passo("4. Músculos: marca 2 e a ordem fica na lista", async () => {
    await c.clicar("Ombro", ".mc-lista"); await c.clicar("Bíceps", ".mc-lista");
    igual(await c.ev("[...document.querySelectorAll('.prio-list .prio-nm')].map((e) => e.textContent)"), ["Ombro", "Bíceps"], "ordem das prioridades");
  }, c);
  await passo("4. a ordem dos músculos continua depois de recarregar", async () => {
    await c.recarregar(); await c.esperar("document.querySelector('.prio-list')");
    igual(await c.ev("[...document.querySelectorAll('.prio-list .prio-nm')].map((e) => e.textContent)"), ["Ombro", "Bíceps"], "ordem depois de recarregar");
  }, c);

  await passo("4. se a recarga não guardou os músculos, marca de novo para o roteiro seguir", async () => {
    const lista = () => c.ev("[...document.querySelectorAll('.prio-list .prio-nm')].map((e) => e.textContent)");
    if ((await lista()).length < 2) { for (const m of ["Ombro", "Bíceps"]) if (!(await lista()).includes(m)) await c.clicar(m, ".mc-lista"); }
    igual(await lista(), ["Ombro", "Bíceps"], "ordem das prioridades");
  }, c);

  // Passos 5 a 9 da tela: cada um responde e segue. Nada pré-marcado é conferido ANTES de responder.
  const etapas = [
    ["Experiência", 2, async () => c.clicar("Menos de 1 ano", ".pp-body"), "Menos de 1 ano"],
    ["Rotina", 3, async () => { for (const d of ["Seg", "Qua", "Sex"]) await c.clicar(d, ".pp-body"); await c.clicar("60 min", ".pp-body"); }, "Seg"],
    ["Onde treina", 4, async () => c.clicar("Academia", ".pp-body"), "Academia"],
    ["Dores", 5, async () => c.clicar("Nenhuma dor", ".pp-body"), "Nenhuma dor"],
    ["Seus dados básicos", 6, async () => c.clicar("feminino", ".pp-body"), "feminino"],
    ["Como você se vê", 7, async () => c.clicar("Normal", ".pp-body"), "Normal"],
  ];
  await passo("5. segue para Experiência", async () => { await c.clicar("Continuar"); igual(await passoAtual(c), 2, "passo"); }, c);
  for (const [nomeEtapa, idx, responder, marca] of etapas) {
    if (idx > 2) await passo(`5. segue para ${nomeEtapa}`, async () => { await c.clicar("Continuar"); igual(await passoAtual(c), idx, "passo"); }, c);
    await passo(`5. ${nomeEtapa}: nada pré-marcado`, async () => igual(await marcados(c), [], `${nomeEtapa} pré-marcado`), c);
    await passo(`5. ${nomeEtapa}: responde`, async () => { await responder(); ok((await marcados(c)).some((t) => t.includes(marca)), `"${marca}" não ficou marcado`); }, c);
  }
  await passo("6. Pular etapa: avança Como você se vê sem responder mais nada e não perde o que já respondeu", async () => {
    await c.clicar("Continuar"); igual(await passoAtual(c), 8, "passo (Comida)");
    await c.clicar("Voltar uma pergunta"); await c.clicar("Voltar uma pergunta"); await c.clicar("Voltar uma pergunta"); await c.clicar("Voltar uma pergunta"); await c.clicar("Voltar uma pergunta");
    igual(await passoAtual(c), 3, "passo (Rotina)");
    ok((await marcados(c)).some((t) => t.includes("Seg")), "a rotina respondida se perdeu");
    for (let i = 0; i < 5; i++) await c.clicar("Continuar");
    igual(await passoAtual(c), 8, "passo (Comida)");
  }, c);
  await passo("5. cada resposta continua depois de voltar e de recarregar (Comida)", async () => {
    await c.clicar("Leve", ".pp-body"); await c.recarregar(); await c.esperar("document.querySelector('.pp')");
    ok((await marcados(c)).some((t) => t.includes("Leve")), "Comida se perdeu ao recarregar");
  }, c);
  await passo("5. Comida: responde", async () => {
    if (!(await marcados(c)).some((t) => t.includes("Leve"))) await c.clicar("Leve", ".pp-body");
    await c.clicar("Continuar"); igual(await passoAtual(c), 9, "passo (Qual IA você usa?)");
  }, c);
  // #133 as 2 telas de IA antes do Resumo: escolhe uma IA, diz como usa e segue
  await passo("5b. Sua IA: nada pré-marcado; escolhe Gemini e segue", async () => {
    igual(await marcados(c), [], "IA pré-marcada");
    await c.clicar("Gemini", ".pp-body"); ok((await marcados(c)).some((t) => t.includes("Gemini")), "Gemini não ficou marcado");
    await c.clicar("Continuar"); igual(await passoAtual(c), 10, "passo (Como você usa?)");
  }, c);
  await passo("5b. Como você usa: Gratuita mostra o caminho e segue para o Resumo", async () => {
    await c.clicar("Gratuita", ".pp-body");
    ok(await c.esperar("(document.querySelector('.pp-body')?.textContent ?? '').includes('Seu caminho')"), "sem o resumo do caminho");
    await c.clicar("Continuar"); igual(await passoAtual(c), 11, "passo (Resumo)");
  }, c);
  await passo("7. Resumo: mostra 'Seu plano em uma frase' e a prévia do primeiro treino", async () => {
    await c.esperar("document.querySelector('#app')?.textContent.includes('Seu plano em uma frase')");
    const t = await c.texto();
    ok(/seu plano em uma frase/i.test(t), `sem a frase do plano (tela: ${t.slice(0, 120).replace(/\s+/g, " ")})`);
    ok(/primeiro treino/i.test(t), "sem a prévia do primeiro treino");
  }, c);
  await passo("7. Resumo: a frase mostra o objetivo escolhido (hoje a Meta sai vazia: 'Meta: .')", async () => {
    const t = await c.texto();
    ok(/braços e ombros maiores/i.test(t), `a frase não mostra o objetivo: ${t.replace(/\s+/g, " ").slice(0, 220)}`);
  }, c);
  await passo("7. Resumo: a frase mostra o foco escrito", async () => ok((await c.texto()).toLowerCase().includes(FOCO.toLowerCase()), "a frase não mostra o foco escrito"), c);
  await passo("8. Gerar semana termina sem erro e o Hoje mostra o treino", async () => {
    await c.clicar("Gerar minha semana e abrir o Hoje");
    ok(await c.esperar("location.hash === '#hoje'", 15000), `não chegou no Hoje (tela: ${(await c.texto()).replace(/\s+/g, " ").slice(-140)} · console: ${c.consola.map((x) => x.texto.slice(0, 140)).join(" | ")})`);
    const st = await c.ev("fetch('/api/state?date=' + new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())).then((r) => r.json())");
    ok(st.onboarding === "concluido", "Primeiros passos não foi concluído");
    ok(st.dayPlan?.plan?.items?.length > 0, "o servidor não tem o treino de hoje");
    // sem recarregar: o Hoje tem de sair do começo vazio sozinho (antes ficava "Seu Hoje está vazio" até o F5)
    ok(await c.esperar("!(document.querySelector('#app')?.innerText ?? '').includes('Seu Hoje está vazio') && (document.querySelector('#app')?.innerText ?? '').includes('O caminho até aqui')", 10000), `o Hoje continua vazio (${(await c.texto()).replace(/\s+/g, " ").slice(0, 160)})`);
  }, c);
  await passo("10. menu ⋯ (Mais): cada item abre a tela que diz", async () => {
    await c.clicar("Mais opções");
    igual(await c.hash(), "#mais", "menu");
    const itens = await c.ev("[...document.querySelectorAll('a.sec')].map((a) => [a.textContent.trim(), a.getAttribute('href')])");
    ok(itens.length >= 4, `só ${itens.length} itens no Mais`);
    for (const [nm, href] of itens) {
      await c.abrir(`${BASE}/${href}`); await c.esperar("document.querySelector('.view.on')");
      igual(await c.hash(), href, `${nm}: destino`);
      ok((await c.esperar("document.querySelector('.view.on')?.innerText.trim().length > 10")), `${nm}: a tela abriu vazia`);
      await c.abrir(`${BASE}/#mais`); await c.esperar("location.hash === '#mais'");
    }
  }, c);
  await boasVindas(c);
}

// #73 O cartão "Sua semana está pronta" some sozinho e não volta: depois de "Dispensar" e depois de registrar uma série.
const HOJE_JS = "new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())";
const CARTAO = "Sua semana está pronta";
const temCartao = (c) => c.ev(`(document.querySelector('#app')?.innerText ?? '').includes(${JSON.stringify(CARTAO)})`);
const homePronta = (c) => c.esperar("location.hash === '#hoje' && (document.querySelector('#app')?.innerText ?? '').includes('O caminho até aqui')", 10000);
const boasVindasServidor = (c) => c.ev(`fetch('/api/home?date=' + ${HOJE_JS}).then((r) => r.json()).then((j) => j.home.boasVindas)`);

async function boasVindas(c) {
  await passo("11. Hoje: o cartão 'Sua semana está pronta' aparece depois dos Primeiros passos, abaixo do treino de hoje", async () => {
    await c.abrir(`${BASE}/#hoje`);
    ok(await homePronta(c), `o Hoje não carregou (${(await c.texto()).replace(/\s+/g, " ").slice(0, 160)})`);
    ok(await temCartao(c), "sem o cartão de boas-vindas");
    ok(await c.ev(`(() => { const t = document.querySelector('#app').innerText; return t.indexOf('Sua semana') < t.indexOf(${JSON.stringify(CARTAO)}); })()`), "o treino de hoje não está acima do cartão");
  }, c);
  await passo("11. ✕ Dispensar: o cartão some, o servidor grava e ele não volta ao recarregar", async () => {
    await c.clicar("Dispensar o cartão de boas-vindas");
    ok(await c.esperar(`!(document.querySelector('#app')?.innerText ?? '').includes(${JSON.stringify(CARTAO)})`, 3000), "o cartão continua na tela");
    ok(await c.esperar(`fetch('/api/home?date=' + ${HOJE_JS}).then((r) => r.json()).then((j) => j.home.boasVindas === 'oculto')`, 5000), "o servidor não gravou a dispensa");
    await c.recarregar(); ok(await homePronta(c), "o Hoje não recarregou");
    ok(!(await temCartao(c)), "o cartão voltou ao recarregar");
  }, c);
  await passo("11. em outro aparelho (sem o cache do navegador) o cartão também não volta", async () => {
    await c.ev("localStorage.clear()"); await c.recarregar(); ok(await homePronta(c), "o Hoje não recarregou");
    ok(!(await temCartao(c)), "o cartão voltou sem o cache do aparelho");
  }, c);
  await passo("12. outra conta com o checkup feito: o cartão aparece e o servidor diz 'mostrar'", async () => {
    // perfil e academias da 1ª conta (sem academia o servidor responde "sem_academia" e o Hoje fica no começo vazio, que é o certo)
    const { profile: perfil, gyms } = await c.ev(`fetch('/api/state?date=' + ${HOJE_JS}).then((r) => r.json()).then((j) => ({ profile: j.profile, gyms: j.gyms }))`);
    await c.send("Network.setExtraHTTPHeaders", { headers: { "x-dev-user": "cenario-vazio-serie" } });
    const r = await c.ev(`(async () => { const j = async (m, p, b) => { const r = await fetch(p, { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); if (!r.ok) throw new Error(m + ' ' + p + ' → ' + r.status); return r.json(); };
      await j('PUT', '/api/profile', { data: ${JSON.stringify(perfil)} });
      for (const g of ${JSON.stringify(gyms ?? [])}) await j('PUT', '/api/gyms/' + encodeURIComponent(g.id), { name: g.name, kind: g.kind, equipment: g.equipment, busyHours: g.busyHours });
      await j('PATCH', '/api/account', { onboarding: 'concluido' }); return (await fetch('/api/account').then((x) => x.json())).account?.email; })()`);
    ok(String(r).startsWith("cenario-vazio-serie@"), `não trocou de conta (${r})`); ok((gyms ?? []).length > 0, "a 1ª conta não tem academia para copiar");
    await c.ev("localStorage.clear()"); await c.recarregar(); ok(await homePronta(c), `o Hoje da 2ª conta não carregou (${(await c.texto()).replace(/\s+/g, " ").slice(0, 160)})`);
    igual(await boasVindasServidor(c), "mostrar", "boasVindas no servidor");
    ok(await temCartao(c), "sem o cartão na 2ª conta");
  }, c);
  await passo("12. registra uma série: o cartão some e não volta ao recarregar", async () => {
    const st = await c.ev(`(async () => { const j = async (m, p, b) => { const r = await fetch(p, { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); if (!r.ok) throw new Error(m + ' ' + p + ' → ' + r.status); return r.json(); };
      const s = await j('POST', '/api/sessions', { date: ${HOJE_JS}, plan: { name: 'teste e2e', items: [] } });
      await j('POST', '/api/sessions/' + s.id + '/sets', { exerciseId: 'Cable_Seated_Lateral_Raise', setNo: 1, kg: 6, reps: 12 });
      await j('POST', '/api/sessions/' + s.id + '/finish', { feedback: { feel: 'bom' } }); return 'ok'; })()`);
    igual(st, "ok", "série registrada");
    igual(await boasVindasServidor(c), "oculto", "boasVindas no servidor depois da série");
    await c.abrir(`${BASE}/#hoje`); await c.recarregar(); ok(await homePronta(c), "o Hoje não recarregou");
    ok(!(await temCartao(c)), "o cartão continua depois da 1ª série");
  }, c);
}

async function pular(c) {
  await passo("abre direto em Primeiros passos (passo 1), já logado", async () => {
    await abrirNoCenario(c, "primeiros-passos/0");
    igual(await c.hash(), "#primeiros-passos/0", "tela");
    ok((await c.texto()).includes("Pular por agora"), "não há 'Pular por agora' no passo 1");
  }, c);
  await passo("toca em Pular por agora e o app continua de pé", async () => {
    await c.clicar("Pular por agora"); await sleep(1500);
    ok(await c.ev("!!document.querySelector('#app .app')"), "o app saiu do ar");
  }, c);
  await passo("vai para o Hoje (vazio), sem ficar preso nos Primeiros passos", async () => {
    ok(await c.esperar("location.hash === '#hoje'", 8000), `ficou em ${await c.hash()}`);
    const st = await c.ev("fetch('/api/account').then((r) => r.json())");
    igual(st.onboarding, "concluido", "onboarding");
  }, c);
  await passo("#63 Hoje vazio (sem treino aleatório) com 'Montar meu primeiro treino' e 'Completar Perfil de treino'", async () => {
    ok(await c.esperar("(document.querySelector('#app')?.innerText ?? '').includes('Montar meu primeiro treino')", 8000), "sem o começo guiado");
    const t = await c.texto();
    ok(t.includes("Completar Perfil de treino"), "sem o secundário");
    ok(!(await c.ev("!!document.querySelector('.hm-dia')")), "apareceu um treino no Hoje vazio");
  }, c);
}

// #74 "Meu treino atual" (cenário semi): sem cadastro a geração segue igual; cadastrando "A: Ombro" com o crucifixo inverso
// apoiado no banco (que não é o padrão do gerador), a semana passa a usar ele.
const CRUCIFIXO = "Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench";
const hojeSP = "new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())";
/** Treino de hoje da semana com foco em ombro posterior (o dia de hoje está sempre aberto no semi). */
const diaComPosterior = (c) => c.ev(`(async () => { const d = ${hojeSP};
  const r = await fetch('/api/week/day/' + d, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'gerar', today: d, opts: { focus: ['post'], minutes: 90 } }) });
  const w = (await r.json()).week; return (w?.days.find((x) => x.date === d)?.plan?.items ?? []).map((i) => i.exerciseId); })()`);

async function treinoAtual(c) {
  let antes = [];
  await passo("abre o Treino da conta em uso; há o atalho opcional 'Registrar meu treino atual'", async () => {
    await abrirNoCenario(c, "treino");
    ok(await c.esperar("document.querySelector('#app')?.innerText.includes('Registrar meu treino atual')", 10000), `sem o atalho no Treino (${await c.ev("location.href")}: ${(await c.texto()).replace(/\s+/g, " ").slice(0, 300)} · console: ${c.consola.map((x) => x.texto.slice(0, 200)).join(" | ")})`);
  }, c);
  await passo("sem cadastro, a semana continua sendo gerada (e não usa o crucifixo apoiado no banco)", async () => {
    antes = await diaComPosterior(c);
    ok(antes.length >= 3, `treino de hoje vazio: ${JSON.stringify(antes)}`);
    ok(!antes.includes(CRUCIFIXO), "o padrão já era o crucifixo apoiado: o roteiro não prova nada");
  }, c);
  await passo("o atalho abre o Meu treino atual; nada marcado ao abrir", async () => {
    await c.clicar("Registrar meu treino atual");
    ok(await c.esperar("location.hash === '#perfil/treino-atual' && !!document.querySelector('.ta')"), `tela: ${await c.hash()}`);
    igual(await marcados(c, ".ta"), [], "pré-marcado");
  }, c);
  await passo("#93 a conta já passou pelos Primeiros passos: sem 'Você já treina?'; 'Adicionar treino' cria o Treino A; só grupos grandes", async () => {
    ok(!(await c.ev("document.querySelector('.ta')?.innerText.includes('Você já treina?')")), "perguntou de novo o que os Primeiros passos já responderam");
    await c.clicar("Adicionar treino", ".ta");
    const grupos = await c.ev("[...document.querySelectorAll('.ta-grupos .chip')].map((b) => b.textContent.trim())");
    igual(grupos, ["Peito", "Costas", "Ombro", "Bíceps", "Tríceps", "Pernas", "Abdômen"], "grupos");
  }, c);
  await passo("monta 'A: Ombro': nome A e o grupo Ombro, com a lista por popularidade e foto", async () => {
    ok(await escrever(c, "#ta-nome-0", "A"), "sem o campo do nome");
    await c.clicar("Ombro", ".ta-grupos");
    ok(await c.esperar("document.querySelectorAll('#ta-g-ombro .ta-ex img').length >= 4"), "sem a lista do grupo com foto");
  }, c);
  await passo("'Digite você mesmo' acha o crucifixo inverso apoiado (busca em tudo) e Enter adiciona", async () => {
    await c.clicar("Não achou? Digite você mesmo", "#ta-g-ombro");
    ok(await escrever(c, "#ta-0-ombro-in", "crucifixo inverso apoiado"), "sem o campo de busca");
    ok(await c.esperar("document.querySelector('#ta-0-ombro-in')?.getAttribute('aria-expanded') === 'true' && document.querySelectorAll('#ta-0-ombro-lb [role=option]').length > 0"), "sem sugestões");
    await c.ev("document.querySelector('#ta-0-ombro-in').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))");
    ok(await c.esperar("document.querySelector('.ta-sel')?.innerText.includes('Crucifixo inverso apoiado no banco')"), "o exercício não entrou no treino");
  }, c);
  await passo("a cobertura marca Ombro como informado", async () => {
    ok(await c.ev("document.querySelector('.ta-cob-c.on')?.textContent.includes('Ombro')"), "Ombro sem ✓");
  }, c);
  await passo("'Salvar e refazer a semana' grava o perfil e abre a Semana", async () => {
    await c.clicar("Salvar e refazer a semana");
    ok(await c.esperar("location.hash === '#semana'", 15000), `ficou em ${await c.hash()}`);
    const st = await c.ev(`fetch('/api/state?date=' + ${hojeSP}).then((r) => r.json())`);
    igual(st.profile?.treinoAtual, { divisoes: [{ nome: "A", grupos: ["ombro"], exercicios: [{ id: CRUCIFIXO }] }] }, "treinoAtual salvo");
  }, c);
  await passo("a semana gerada usa o crucifixo inverso que ela já faz", async () => {
    const depois = await diaComPosterior(c);
    ok(depois.includes(CRUCIFIXO), `não usou: ${JSON.stringify(depois)}`);
  }, c);
  // #93 o treino atual sobrevive a recarregar, ao sync e a outra tela gravando o perfil
  await passo("recarrega a página: o treino atual continua (não volta ao zero)", async () => {
    await c.abrir(urlAbertura(CENARIO, "perfil/treino-atual", new URL(BASE).port));
    ok(await c.esperar("location.hash === '#perfil/treino-atual' && !!document.querySelector('.ta-sel')", 15000), "a tela voltou sem o treino cadastrado");
    ok(await c.ev("document.querySelector('.ta-sel')?.innerText.includes('Crucifixo inverso apoiado no banco')"), "sumiu o crucifixo");
  }, c);
  await passo("outra tela grava o perfil (PUT sem treinoAtual, como o cache antigo): o servidor mantém o treino", async () => {
    const r = await c.ev(`(async () => { const st = await fetch('/api/state?date=' + ${hojeSP}).then((r) => r.json()); const { treinoAtual, ...resto } = st.profile;
      const put = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: resto }) });
      const dep = await fetch('/api/state?date=' + ${hojeSP}).then((r) => r.json()); return { s: put.status, t: dep.profile?.treinoAtual }; })()`);
    igual(r.s, 200, "PUT"); ok(r.t?.divisoes?.[0]?.exercicios?.length === 1, `treino apagado pelo PUT: ${JSON.stringify(r.t)}`);
  }, c);
  await passo("cadastra o Treino B com 3 exercícios, 'Concluir Treino B' grava e avisa 'Treino B salvo'; recarregar mantém A e B", async () => {
    await c.clicar("Adicionar treino", ".ta-tabs");
    await c.clicar("Costas", ".ta-grupos");
    ok(await c.esperar("document.querySelectorAll('#ta-g-costas .ta-ex').length >= 3"), "sem a lista de costas");
    await c.ev("(() => { document.querySelectorAll('#ta-g-costas .ta-ex')[0].click(); })()");
    await c.ev("(() => { document.querySelectorAll('#ta-g-costas .ta-ex')[1].click(); })()");
    await c.ev("(() => { document.querySelectorAll('#ta-g-costas .ta-ex')[2].click(); })()");
    await c.clicar("Concluir Treino B");
    ok(await c.esperar("document.body.innerText.includes('Treino B salvo')", 8000), "sem o aviso 'Treino B salvo'");
    await sleep(2000); // além do debounce de 600 ms e do sync
    const st = await c.ev(`fetch('/api/state?date=' + ${hojeSP}).then((r) => r.json())`);
    igual(st.profile?.treinoAtual?.divisoes?.map((d) => [d.nome, d.exercicios.length]), [["A", 1], ["Treino B", 3]], "treinos no servidor");
    await c.abrir(urlAbertura(CENARIO, "perfil/treino-atual", new URL(BASE).port));
    ok(await c.esperar("document.querySelectorAll('.ta-tabs [role=tab]').length === 2", 15000), "recarregar perdeu um treino");
  }, c);
}

// #77 Treino ↔ Semana: as abas só trocam de tela (nunca abrem folha), a atual fica marcada e o voltar da Semana respeita a origem.
const abaMarcada = (c) => c.ev("[...document.querySelectorAll('nav.subnav a[aria-current=\"page\"]')].map((a) => a.textContent.trim())");
const temFolha = (c) => c.ev("!!document.querySelector('.sheet.open, dialog[open]')");
async function naTela(c, hash, aba) {
  ok(await c.esperar(`location.hash === ${JSON.stringify(hash)} && !!document.querySelector('nav.subnav')`, 10000), `URL: veio ${await c.hash()}, esperado ${hash}`);
  igual(await abaMarcada(c), [aba], `aba marcada em ${hash}`);
  ok(!(await temFolha(c)), `abriu uma folha em ${hash}`);
}
async function navegacao(c) {
  await passo("abre o Treino: aba Hoje marcada, sem voltar no topo", async () => {
    await abrirNoCenario(c, "treino");
    await naTela(c, "#treino", "Hoje");
    ok(!(await c.ev("!!document.querySelector('.top .voltar')")), "o Treino (raiz) não tem voltar");
  }, c);
  await passo("toca na aba Semana: abre #semana com a mesma barra e Semana marcada", async () => {
    await c.clicar("Semana", "nav.subnav"); await naTela(c, "#semana", "Semana");
    igual(await c.ev("document.querySelector('.top .voltar')?.getAttribute('aria-label')"), "Voltar para Treino", "voltar da Semana");
  }, c);
  await passo("da Semana, toca na aba Exercícios: #treino/exercicios com Exercícios marcada", async () => {
    await c.clicar("Exercícios", "nav.subnav"); await naTela(c, "#treino/exercicios", "Exercícios");
  }, c);
  await passo("voltar (topo) de Exercícios: Treino com a aba Hoje marcada", async () => {
    await c.clicar("Voltar para Treino", ".top"); await naTela(c, "#treino", "Hoje");
  }, c);
  await passo("Treino → Semana → voltar: volta para o Treino (não para a Hoje da barra inferior)", async () => {
    await c.clicar("Semana", "nav.subnav"); await naTela(c, "#semana", "Semana");
    await c.clicar("Voltar para Treino", ".top"); await naTela(c, "#treino", "Hoje");
  }, c);
  await passo("caminho direto (Hoje → Ver semana inteira) abre a mesma Semana e o voltar leva de volta ao Hoje", async () => {
    await c.abrir(`${BASE}/#hoje`); ok(await c.esperar("location.hash === '#hoje' && (document.querySelector('#app')?.innerText ?? '').includes('Ver semana inteira')", 10000), "o Hoje não carregou");
    await c.clicar("Ver semana inteira"); await naTela(c, "#semana", "Semana");
    await c.clicar("Voltar para Hoje", ".top");
    ok(await c.esperar("location.hash === '#hoje'"), `voltou para ${await c.hash()}`);
  }, c);
  await passo("Semana aberta direto (sem origem no app): o voltar leva ao Treino", async () => {
    await c.abrir(urlAbertura(CENARIO, "semana", new URL(BASE).port));
    await naTela(c, "#semana", "Semana");
    await c.ev("sessionStorage.clear()"); await c.recarregar(); await naTela(c, "#semana", "Semana");
    await c.clicar("Voltar para Treino", ".top"); await naTela(c, "#treino", "Hoje");
  }, c);
}

// #134 Chat no ?demo com cada estado de IA simulado (2 IAs por estado), em 390 px: composer com +, microfone e enviar
// de 44 px, acima da barra inferior, sem rolagem lateral e visível com o "teclado" aberto (viewport encolhida).
async function chat(c) {
  const abrirChat = async (q) => {
    for (let i = 0; i < 100 && (await fetch(`${BASE}/`).then((r) => r.status, () => 0)) !== 200; i++) await sleep(200);
    await c.abrir(`${BASE}/?demo&${q}#chat`);
    ok(await c.esperar("!!document.querySelector('.ch-composer textarea')", 10000), `o Chat não abriu (${q})`);
  };
  const enviarTexto = async (t) => {
    await escrever(c, ".ch-composer textarea", t);
    await c.ev("document.querySelector('.ch-composer').requestSubmit()"); await sleep(300);
  };
  const medidas = () => c.ev(`(() => { const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    const bs = ['[aria-label="Anexar foto ou PDF"]', '[aria-label="Falar a mensagem"]', '[aria-label="Enviar"]'].map((s) => { const b = r('.ch-composer ' + s); return b ? [Math.round(b.width), Math.round(b.height)] : null; });
    const comp = r('.ch-composer'), barra = r('nav.bottom, .bottom');
    return { bs, compTopo: comp.top, compFim: comp.bottom, altura: innerHeight, barraTopo: barra && getComputedStyle(document.querySelector('.bottom')).display !== 'none' ? barra.top : null,
      lateral: document.documentElement.scrollWidth > innerWidth + 1 }; })()`);
  await passo("390: composer com +, microfone e enviar de 44 px, acima da barra inferior, sem rolagem lateral", async () => {
    await abrirChat("ia=chave&chave=gemini");
    const m = await medidas();
    for (const b of m.bs) ok(b && b[0] >= 44 && b[1] >= 44, `toque menor que 44 px: ${JSON.stringify(m.bs)}`);
    ok(m.compFim <= m.altura + 1, `composer passa da tela: ${JSON.stringify(m)}`);
    ok(m.barraTopo == null || m.compFim <= m.barraTopo + 1, `a barra inferior cobre o composer: ${JSON.stringify(m)}`);
    ok(!m.lateral, "rolagem lateral em 390 px");
  }, c);
  await passo("teclado aberto (viewport de 390×420): o composer continua inteiro na tela e o campo com foco", async () => {
    await c.ev("document.querySelector('.ch-composer textarea').focus()");
    await c.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 420, deviceScaleFactor: 1, mobile: true }); await sleep(300);
    const m = await medidas();
    ok(m.compTopo >= 0 && m.compFim <= m.altura + 1, `o composer saiu da tela com o teclado: ${JSON.stringify(m)}`);
    igual(await c.ev("document.activeElement?.classList.contains('ch-campo')"), true, "o campo perdeu o foco");
    await c.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await sleep(200);
  }, c);
  for (const [rotina, nome] of [["claude", "Claude"], ["gemini", "Gemini"]]) {
    await passo(`estado nenhum (${nome}): pensando, mensagem fixa e o rascunho fica no composer`, async () => {
      await abrirChat(`ia=nenhum&rotina=${rotina}`);
      await enviarTexto("o que treino hoje?");
      ok(await c.esperar("(document.querySelector('.ch-thread')?.innerText ?? '').includes('ainda não conectou nenhuma IA')", 4000), "sem a mensagem fixa");
      ok((await c.texto()).includes(`Configurar o ${nome}`), "sem o botão para Perfil → Sua IA");
      igual(await c.ev("document.querySelector('.ch-composer textarea').value"), "o que treino hoje?", "rascunho");
    }, c);
  }
  for (const [rotina, nome, link] of [["claude", "Claude", true], ["chatgpt", "ChatGPT", false]]) {
    await passo(`estado só conector (${nome}): vira pedido na faixa e o mini prompt ${link ? "abre com o texto" : "vem para copiar"}`, async () => {
      await abrirChat(`ia=conector&rotina=${rotina}`);
      await enviarTexto("quero treinar ombro hoje");
      // o demo guarda os pedidos do passo anterior no aparelho: a faixa conta todos
      ok(await c.esperar("/\\d+ pedidos? na rotina/.test(document.querySelector('.ch-faixa')?.innerText ?? '') && (document.querySelector('.ch-thread')?.innerText ?? '').includes('Virou um pedido')", 4000), "sem a faixa de pedidos");
      const externos = await c.ev("[...document.querySelectorAll('.ch-thread a[href^=\"http\"]')].map((a) => a.textContent.trim())");
      if (link) igual(externos, [`Abrir no ${nome}`], "link do mini prompt");
      else { igual(externos, [], "IA sem prompt na URL não ganha link"); ok((await c.texto()).includes("Copiar"), "sem o Copiar"); }
    }, c);
  }
  for (const [ia, nome] of [["gemini", "Gemini"], ["deepseek", "DeepSeek"]]) {
    await passo(`estado só chave (${nome}): a IA no topo e nada vai para a rotina`, async () => {
      await abrirChat(`ia=chave&chave=${ia}`);
      ok((await c.texto()).includes(`${nome} · modelo padrão`), "sem a IA no topo");
      await enviarTexto("como foi minha semana?");
      ok(await c.esperar("(document.querySelector('.ch-thread')?.innerText ?? '').includes('chave do " + nome + "')", 4000), "não foi pela chave");
      ok(!(await c.texto()).includes("Virou um pedido"), "virou pedido");
    }, c);
  }
  await passo("estado ambos (rotina do Claude + chave do Gemini): o padrão é a chave, o toggle manda para a rotina", async () => {
    await abrirChat("ia=ambos&rotina=claude&chave=gemini");
    await enviarTexto("primeira");
    ok((await c.texto()).includes("Guardei na conversa"), "o padrão não foi a chave");
    await c.ev("document.querySelector('.ch-rotina input').click()");
    await enviarTexto("segunda");
    ok(await c.esperar("(document.querySelector('.ch-thread')?.innerText ?? '').includes('Virou um pedido na rotina do Claude')", 4000), "o toggle não mandou para a rotina");
    ok(/\d+ pedidos? na rotina/.test(await c.ev("document.querySelector('.ch-faixa')?.innerText ?? ''")), "sem a faixa");
  }, c);
}

const parar = await subir();
const chrome = await abrirChrome({ usuario: CENARIOS[CENARIO].slug });
let falhou = false;
try { await ROTEIROS[nome](chrome); }
catch { falhou = true; }
finally { await chrome.fechar(); await parar(); }
console.log(falhou ? `\n✖ ${nome}: falhou no passo ${n}` : `\n✔ ${nome}: ${n} passos ok`);
process.exit(falhou ? 1 : 0);
