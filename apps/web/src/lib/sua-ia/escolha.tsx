// #133 As 2 escolhas de IA (Primeiros passos e Perfil → Sua IA): "Qual IA você usa?" e "Como você usa?".
// Aqui nunca se digita chave: só se declara. Os nomes vêm do core (seletor de IA: a marca pode aparecer).
// Editam S.profile.ia e chamam onMudou (quem chama salva: PATCH por passo no quiz, PATCH na hora no Perfil).
import * as C from "@ciclo/core";
import { S } from "../store/index.ts";
import { ACESSO_INFO, sugerirOutras } from "@ciclo/core/ia-guias";

type Perfil = C.PerfilIa;
const atual = (): Perfil | undefined => S.profile.ia;
const salvar = (ia: Perfil, onMudou: () => void) => { const v = C.validarPerfilIa(ia); if (v.ok) { S.profile.ia = v.valor; onMudou(); } };

const Opt = ({ on, onClick, title, desc }: { on: boolean; onClick: () => void; title: string; desc?: string }) =>
  <button type="button" class="opt big" aria-pressed={on} onClick={onClick}><b>{title}</b>{desc && <span>{desc}</span>}</button>;

const DESC: Record<C.IaId, string> = { claude: "Conversa no app dela", chatgpt: "Conversa no app dela", gemini: "Do Google", deepseek: "Chat e API", outra: "Grok, Kimi, Qwen…" };

/** Tela 1 · "Qual IA você usa?" (pode marcar mais de uma; "Não uso IA" desmarca as outras). */
export function EscolhaIa({ onMudou }: { onMudou: () => void }) {
  const ia = atual(), usa = ia?.usa ?? [];
  const tem = (p: C.IaId) => usa.some((u) => u.provedor === p);
  const semIa = !!ia && !usa.length;
  const toggle = (p: C.IaId) => {
    const novo = tem(p) ? usa.filter((u) => u.provedor !== p) : [...usa, { provedor: p, acesso: [] as C.AcessoIa[] }];
    const principal = ia?.principal && novo.some((u) => u.provedor === ia.principal) ? ia.principal : null;
    salvar({ usa: novo, principal }, onMudou);
  };
  const outra = usa.find((u) => u.provedor === "outra");
  const nomeOutra = (v: string) => {
    const nome = v.replace(/\s+/g, " ").slice(0, 40);
    const novo = usa.map((u) => (u.provedor === "outra" ? { ...u, nome: nome.trim() || undefined } : u));
    salvar({ usa: novo, principal: ia?.principal ?? null }, onMudou);
  };
  return <>
    <div class="opts two" role="group" aria-label="Qual IA você usa (pode marcar mais de uma)">
      {C.IAS_CARD.map((p) => <Opt key={p} on={tem(p)} title={C.PROVEDORES_IA_APP[p].nome} desc={DESC[p]} onClick={() => toggle(p)} />)}
      <Opt on={tem("outra")} title="Outra" desc={DESC.outra} onClick={() => toggle("outra")} />
      <Opt on={semIa} title="Não uso IA" desc="O app funciona sem" onClick={() => salvar({ usa: [], testarGratis: ia?.testarGratis ?? true }, onMudou)} />
    </div>
    {outra && <div class="sia-outra">
      <label class="f" for="sia-outra">Qual?</label>
      <input id="sia-outra" class="input" list="sia-outras" maxLength={40} autocomplete="off" value={outra.nome ?? ""} placeholder="Ex.: Kimi"
        onChange={(e) => nomeOutra((e.currentTarget as HTMLInputElement).value)} />
      <datalist id="sia-outras">{sugerirOutras("", 20).map((n) => <option key={n} value={n} />)}</datalist>
    </div>}
    {semIa && <div class="opts sia-sem" role="group" aria-label="Sem IA">
      <Opt on={!!ia?.testarGratis} title="Quero testar grátis (recomendado)" desc="O caminho grátis mais simples, em 2 min" onClick={() => salvar({ usa: [], testarGratis: true }, onMudou)} />
      <Opt on={!ia?.testarGratis} title="Seguir sem IA" desc="O algoritmo do app gera tudo" onClick={() => salvar({ usa: [], testarGratis: false }, onMudou)} />
    </div>}
    {usa.length > 1 && <div class="sia-principal">
      <span class="f">Qual é a principal? <span class="sub">(a que o Chat usa primeiro)</span></span>
      <div class="chips">{usa.map((u) => <button type="button" key={u.provedor} class="chip tall" aria-pressed={ia?.principal === u.provedor}
        onClick={() => salvar({ ...ia!, principal: u.provedor }, onMudou)}>{C.nomeIa(u)}</button>)}</div>
    </div>}
  </>;
}

/** Tela 2 · "Como você usa?" (para cada IA marcada; pode marcar mais de um acesso). "Não sei" desmarca os outros. */
export function ComoUsa({ onMudou }: { onMudou: () => void }) {
  const ia = atual();
  if (!ia) return <p class="small sub">Volte uma tela e escolha a sua IA (ou "Não uso IA").</p>;
  if (!ia.usa.length) return <p class="small sub">{ia.testarGratis ? "Você vai testar com uma IA grátis: o guia mostra o caminho." : "Sem IA: o algoritmo do app gera a semana e os treinos."}</p>;
  const toggle = (p: C.IaId, a: C.AcessoIa) => {
    const usa = ia.usa.map((u) => {
      if (u.provedor !== p) return u;
      const on = u.acesso.includes(a);
      const acesso = a === "nao_sei" ? (on ? [] : ["nao_sei"] as C.AcessoIa[]) : on ? u.acesso.filter((x) => x !== a) : [...u.acesso.filter((x) => x !== "nao_sei"), a];
      return { ...u, acesso };
    });
    salvar({ ...ia, usa }, onMudou);
  };
  return <div class="sia-como">{ia.usa.map((u) => <fieldset key={u.provedor} class="sia-ia">
    <legend><b>{C.nomeIa(u)}</b></legend>
    <div class="opts two">{C.ACESSOS_IA.map((a) => <Opt key={a} on={u.acesso.includes(a)} title={ACESSO_INFO[a].nm} desc={ACESSO_INFO[a].desc} onClick={() => toggle(u.provedor, a)} />)}</div>
  </fieldset>)}</div>;
}
