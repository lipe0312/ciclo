// #133 O aviso de IA (como o do checkout): o texto vem do estadoIA do core, leva a Perfil → Sua IA, some por 7 dias ao
// dispensar e volta na hora quando o perfil de IA muda. Cada tela com "Fale com a IA" põe no máximo UM destes.
import * as C from "@ciclo/core";
import { Icon } from "../ui/index.tsx";
import { dispensaAviso, dispensarAviso, useEstadoIa } from "./estado.ts";
import "./aviso.css";

export function AvisoIa() {
  const e = useEstadoIa();
  const a = e?.estado.aviso ?? null;
  if (!C.mostrarAvisoIa(a, dispensaAviso(), Date.now()) || !a) return null;
  return <div class="note aviso-ia" role="status">
    <Icon id={a.id === "expirou" ? "warn" : "chat"} />
    <a class="link44 aviso-ia-txt" href={a.href}>{a.texto}</a>
    <button type="button" class="btn ghost sm aviso-ia-x" aria-label="Dispensar o aviso por 7 dias" onClick={() => dispensarAviso(a)}><Icon id="x" /></button>
  </div>;
}
