// #64 Estado: um componente só para vazio, erro e offline (mesmo visual em toda tela), e o esqueleto de carregamento.
import type { ComponentChildren } from "preact";
import { Icon } from "../ui/index.tsx";

export type TipoEstado = "vazio" | "erro" | "offline";
const ICONE: Record<TipoEstado, string> = { vazio: "info", erro: "warn", offline: "warn" };
const TITULO: Record<TipoEstado, string> = { vazio: "Nada por aqui ainda", erro: "Algo deu errado", offline: "Sem conexão" };

/** Ação opcional: link (href) ou botão (onClick). Um CTA por estado. */
export interface AcaoEstado { label: string; href?: string; onClick?: () => void }

export function Estado({ tipo, titulo, children, acao }: { tipo: TipoEstado; titulo?: string; children?: ComponentChildren; acao?: AcaoEstado }) {
  return <div class={`estado estado-${tipo}`} role={tipo === "vazio" ? undefined : "status"}>
    <span class="estado-ic"><Icon id={ICONE[tipo]} /></span>
    <p class="estado-t">{titulo ?? TITULO[tipo]}</p>
    {children && <p class="small sub estado-x">{children}</p>}
    {acao && (acao.href ? <a class="btn pri" href={acao.href}>{acao.label}</a>
      : <button type="button" class="btn pri" onClick={acao.onClick}>{acao.label}</button>)}
  </div>;
}

/** Esqueleto no lugar de spinner: blocos com a forma da tela que vem (estático com movimento reduzido). */
export const Esqueleto = ({ linhas = 3 }: { linhas?: number }) =>
  <div class="esq" aria-busy="true" aria-label="Carregando">
    <i class="esq-t" />{Array.from({ length: linhas }, (_, i) => <i key={i} class="esq-c" />)}
  </div>;
