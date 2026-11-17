// #107 Exercício personalizado (id cus_, criado pela IA quando o catálogo não tinha): selo, descrição e "Ver demonstração"
// no treino; página própria para editar ou apagar. Nome e descrição são dado do usuário: só entram como texto (JSX escapa).
// O vídeo é link externo do YouTube (nunca iframe: a CSP não muda), conferido de novo aqui pelo core.
import { useState } from "preact/hooks";
import * as C from "@ciclo/core";
import { S, commit } from "../../lib/store/index.ts";
import { SERVER, api } from "../../lib/api/index.ts";
import { Card, Icon, toast } from "../../lib/ui/index.tsx";
import { go, href } from "../../lib/roteador/index.ts";
import { Estado } from "../../lib/estado/index.tsx";

export const SeloPersonalizado = () => <span class="badge info">personalizado</span>;

function LinkVideo({ url, cls = "btn sm" }: { url: string | null; cls?: string }) {
  const v = C.normalizarYoutube(url);
  return v ? <a class={cls} href={v} target="_blank" rel="noopener noreferrer"><Icon id="play" />Ver demonstração</a> : null;
}

/** No card do treino: a descrição, o vídeo (se houver) e o atalho para editar. */
export function InfoPersonalizado({ id }: { id: string }) {
  const p = S.personalizados[id];
  if (!p) return null;
  return <div class="pers">
    <p class="small pers-desc">{p.descricao}</p>
    <div class="row wrapx" style="gap:8px;margin-top:8px"><LinkVideo url={p.videoUrl} />
      <a class="btn sm ghost" href={href("treino", ["exercicio", id])}><Icon id="edit" />Editar exercício</a></div></div>;
}

/** #treino/exercicio/cus_…: ver, editar (nome, descrição, vídeo) e apagar. */
export function DetalhePersonalizado({ id }: { id: string }) {
  const p = S.personalizados[id];
  const [f, setF] = useState(() => ({ nome: p?.nome ?? "", descricao: p?.descricao ?? "", videoUrl: p?.videoUrl ?? "" }));
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmando, setConfirmando] = useState(false); // apagar pede um 2º toque (nunca confirm() do navegador)
  if (!p) return <Estado tipo="vazio" titulo="Exercício não encontrado" acao={{ label: "Ver exercícios", href: "#treino/exercicios" }} />;
  const ap = p.aparelho ? C.EQUIPMENT_BY_ID[p.aparelho]?.nm ?? p.aparelho : "peso do corpo";
  const salvar = async (e: Event) => {
    e.preventDefault();
    const v = C.validarExercicioPersonalizado(f, true);
    if (!v.ok) return setErro(v.errors[0]);
    setErro(""); setBusy(true);
    try {
      const r = SERVER ? (await api<{ exercicio: C.ExercicioPersonalizado }>("PATCH", `/api/exercicios-personalizados/${encodeURIComponent(id)}`, f)).exercicio : { ...p, ...v.value };
      S.personalizados[id] = r; commit(); toast("Exercício salvo");
    } catch (x) { setErro(x instanceof Error ? x.message : "Não deu para salvar"); } finally { setBusy(false); }
  };
  const apagar = async () => {
    if (!confirmando) return setConfirmando(true);
    setBusy(true);
    try {
      if (SERVER) await api("DELETE", `/api/exercicios-personalizados/${encodeURIComponent(id)}`);
      delete S.personalizados[id]; commit(); toast("Exercício apagado"); go("#treino");
    } catch (x) { setErro(x instanceof Error ? x.message : "Não deu para apagar"); setBusy(false); }
  };
  return <>
    <p class="kicker">{C.MUSCLES[p.musculo]?.nm ?? p.musculo} · {ap}</p>
    <div class="row wrapx" style="gap:8px;margin:2px 0 14px"><h1>{p.nome}</h1><SeloPersonalizado /></div>
    <div class="grid dash"><div class="stack">
      <Card><h2>Como fazer</h2><p class="small pers-desc">{p.descricao}</p>
        <div class="row wrapx" style="gap:8px;margin-top:10px"><LinkVideo url={p.videoUrl} cls="btn" /></div>
        <p class="tiny sub" style="margin-top:10px">{p.criadoPor === "ia" ? "Criado pela IA porque o catálogo não tinha este movimento." : "Criado por você."}</p></Card>
    </div><div class="stack">
      <Card><h2>Editar</h2>
        <form class="stack" style="gap:12px;margin-top:8px" onSubmit={salvar}>
          <div><label class="f" for="pers-nome">Nome</label>
            <input id="pers-nome" class="input" maxLength={C.NOME_PERSONALIZADO_MAX} value={f.nome} onInput={(e) => setF({ ...f, nome: e.currentTarget.value })} /></div>
          <div><label class="f" for="pers-desc">Como fazer</label>
            <textarea id="pers-desc" class="input" maxLength={C.DESCRICAO_PERSONALIZADO_MAX} value={f.descricao} onInput={(e) => setF({ ...f, descricao: e.currentTarget.value })} /></div>
          <div><label class="f" for="pers-video">Vídeo do YouTube (opcional)</label>
            <input id="pers-video" class="input" type="url" inputMode="url" placeholder="https://youtu.be/…" value={f.videoUrl} onInput={(e) => setF({ ...f, videoUrl: e.currentTarget.value })} /></div>
          {erro && <p class="small" role="alert" style="color:var(--bad)">{erro}</p>}
          <div><button type="submit" class="btn pri" disabled={busy}>Salvar</button></div>
        </form>
        <div class="pers-perigo">
          {confirmando && <p class="small" role="alert" style="margin-bottom:8px">Apagar de vez? O que você já registrou dele continua no histórico.</p>}
          <div class="row wrapx" style="gap:8px"><button type="button" class="btn danger" disabled={busy} onClick={apagar}>{confirmando ? "Confirmar apagar" : "Apagar exercício"}</button>
            {confirmando && <button type="button" class="btn ghost" disabled={busy} onClick={() => setConfirmando(false)}>Cancelar</button>}</div>
        </div></Card>
    </div></div></>;
}
