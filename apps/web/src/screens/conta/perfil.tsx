// #62 Conta → Perfil: nome, sobrenome, sexo, nascimento, altura e peso, todos editáveis (direito de correção, LGPD art. 18).
import { useEffect, useState } from "preact/hooks";
import * as C from "@ciclo/core";
import { HttpError, api } from "../../lib/api/index.ts";
import { Icon, toast } from "../../lib/ui/index.tsx";
import type { Account } from "./comum.tsx";

const hoje = () => new Date().toISOString().slice(0, 10);

export function Perfil({ acc, onSalvo }: { acc: Account | null; onSalvo: (a: Account) => void }) {
  const [f, setF] = useState({ nome: "", sobrenome: "", sexo: "" as C.Sexo | "", nascimento: "", alturaCm: "", pesoKg: "" });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (acc) setF({ nome: acc.name ?? "", sobrenome: acc.sobrenome ?? "", sexo: acc.sexo ?? "", nascimento: acc.nascimento ?? "", alturaCm: acc.alturaCm ? String(acc.alturaCm) : "", pesoKg: acc.pesoKg ? String(acc.pesoKg) : "" });
  }, [acc]);
  if (!acc) return <p class="small sub" aria-busy="true">Carregando…</p>;

  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const corpo = { nome: f.nome, sobrenome: f.sobrenome, sexo: f.sexo, nascimento: f.nascimento || null, alturaCm: num(f.alturaCm), pesoKg: num(f.pesoKg) };
  const v = C.validarPerfilConta(corpo, hoje());
  const set = (k: keyof typeof f) => (e: Event) => setF((x) => ({ ...x, [k]: (e.currentTarget as HTMLInputElement).value }));

  const salvar = async () => {
    if (!v.ok) { setErro(v.erros.join("; ")); return; }
    setErro(""); setBusy(true);
    try {
      const r = await api<{ perfil: { nome: string; sobrenome: string | null; sexo: C.Sexo | null; nascimento: string | null; alturaCm: number | null; pesoKg: number | null } }>("PATCH", "/api/account/perfil", corpo);
      onSalvo({ ...acc, name: r.perfil.nome, sobrenome: r.perfil.sobrenome, sexo: r.perfil.sexo, nascimento: r.perfil.nascimento, alturaCm: r.perfil.alturaCm, pesoKg: r.perfil.pesoKg });
      toast("Perfil salvo");
    } catch (e) { setErro(e instanceof HttpError ? e.message : "Sem conexão: nada foi salvo. Tente de novo."); } finally { setBusy(false); }
  };

  return <form class="card conta-sec conta-form" onSubmit={(e) => { e.preventDefault(); void salvar(); }} noValidate>
    <label class="f" for="pf-nome">Nome</label>
    <input id="pf-nome" class="input" value={f.nome} onInput={set("nome")} autocomplete="given-name" maxLength={40} required />
    <label class="f" for="pf-sobre">Sobrenome</label>
    <input id="pf-sobre" class="input" value={f.sobrenome} onInput={set("sobrenome")} autocomplete="family-name" maxLength={60} required />
    <span class="f" id="pf-sexo">Sexo</span>
    <div class="chips" role="group" aria-labelledby="pf-sexo">{C.SEXOS.map((s) =>
      <button type="button" key={s} class="chip tall" aria-pressed={f.sexo === s} onClick={() => setF((x) => ({ ...x, sexo: s }))}>{C.SEXO_TEXTO[s]}</button>)}</div>
    <label class="f" for="pf-nasc">Nascimento (opcional)</label>
    <input id="pf-nasc" class="input" type="date" value={f.nascimento} onInput={set("nascimento")} autocomplete="bday" max={hoje()} />
    <div class="conta-duas">
      <div><label class="f" for="pf-alt">Altura (cm, opcional)</label>
        <input id="pf-alt" class="input num" inputMode="numeric" value={f.alturaCm} onInput={set("alturaCm")} maxLength={3} /></div>
      <div><label class="f" for="pf-peso">Peso (kg, opcional)</label>
        <input id="pf-peso" class="input num" inputMode="decimal" value={f.pesoKg} onInput={set("pesoKg")} maxLength={5} /></div>
    </div>
    {acc.email && <p class="tiny sub">E-mail: {acc.email} (é o do convite; não muda aqui).</p>}
    {erro && <div class="note entrar-erro" role="alert"><Icon id="warn" />{erro}</div>}
    <button type="submit" class="btn pri full" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
  </form>;
}
