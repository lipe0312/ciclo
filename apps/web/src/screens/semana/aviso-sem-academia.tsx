// #79 Faixa discreta (não bloqueia) enquanto não há academia: o treino saiu com peso corporal.
// Aparece na Semana, no Treino e no Hoje; some quando existe uma academia; "Dispensar" esconde por 7 dias (regra no core).
// A data da dispensa fica no perfil (meta.avisos, vale em qualquer aparelho) e no aparelho (cache otimista, como na #73).
import { C, S, commit, today } from "../../lib/store/index.ts";
import { SERVER } from "../../lib/api/index.ts";
import { profileChanged } from "../../lib/store/regras.ts";
import { href } from "../../lib/roteador/index.ts";
import { Icon } from "../../lib/ui/index.tsx";
import { lsGet, lsSet } from "../../lib/util.ts";
import { regenerar } from "./estado.ts";
import "./semana.css";

const KEY = () => `ciclo:sem-academia-dispensada:${SERVER ? S.account?.email ?? "?" : "demo"}`;
const dispensadaEm = (): string | null => {
  const s = S.profile.meta?.avisos?.semAcademia ?? null, l = lsGet<string | null>(KEY(), null);
  return l && (!s || l > s) ? l : s;
};
const visivel = () => C.faixaSemAcademia({ academias: S.gyms.length, dispensadaEm: dispensadaEm(), hoje: today }) === "mostrar";

/** `fixa`: a tela de pronto dos Primeiros passos repete o aviso uma vez, sem "Dispensar" nem "Refazer". */
export function AvisoSemAcademia({ fixa }: { fixa?: boolean }) {
  if (fixa ? S.gyms.length > 0 : !visivel()) return null;
  const dispensar = () => {
    lsSet(KEY(), today);
    S.profile.meta = { ...S.profile.meta, avisos: { ...S.profile.meta?.avisos, semAcademia: today } };
    profileChanged(); commit();
  };
  return <div class="note sem-academia" role="status">
    <Icon id="gym" /><div class="sem-academia-t">
      <p class="small">Treino montado com peso corporal. Falta algum aparelho? <b>Cadastre sua academia</b> e <b>refaça o treino</b>.</p>
      {!fixa && <div class="sem-academia-a">
        <a class="btn sm" href={href("academias", ["novo"])}><Icon id="plus" />Cadastrar academia</a>
        <button type="button" class="btn sm ghost" onClick={() => void regenerar(false)}><Icon id="cycle" />Refazer a semana</button></div>}</div>
    {!fixa && <button type="button" class="iconbtn" aria-label="Dispensar o aviso por 7 dias" onClick={dispensar}><Icon id="x" /></button>}
  </div>;
}
