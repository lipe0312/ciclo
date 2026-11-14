// #64 Lazy load das telas que não abrem primeiro: o JS da tela só baixa quando ela é aberta (ou no ócio,
// logo depois da 1ª tela, para o service worker guardar e a tela abrir sem sinal na academia).
import type { FunctionComponent } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Esqueleto, Estado } from "../estado/index.tsx";

type Mod<P> = Promise<{ default: FunctionComponent<P> }>;
export type TelaLenta<P> = FunctionComponent<P> & { preload: () => Promise<unknown> };

export function telaLenta<P extends object>(load: () => Mod<P>): TelaLenta<P> {
  let Comp: FunctionComponent<P> | null = null;
  let p: Promise<unknown> | null = null;
  const preload = () => (p ??= load().then((m) => { Comp = m.default; }).catch((e) => { p = null; throw e; }));
  const Lenta = ((props: P) => {
    const [falhou, setFalhou] = useState(false);
    const [, setOk] = useState(0);
    useEffect(() => { if (!Comp && !falhou) preload().then(() => setOk(1), () => setFalhou(true)); }, [falhou]);
    if (Comp) return <Comp {...props} />;
    if (falhou) return <Estado tipo={navigator.onLine ? "erro" : "offline"} acao={{ label: "Tentar de novo", onClick: () => setFalhou(false) }}>
      {navigator.onLine ? "Não deu para abrir esta tela." : "Esta tela ainda não foi guardada no aparelho. Abra de novo com sinal."}</Estado>;
    return <Esqueleto />;
  }) as TelaLenta<P>;
  Lenta.preload = preload;
  return Lenta;
}

/** Baixa as telas no ócio depois da 1ª pintura (uma por vez, sem disputar a rede com a tela aberta). */
export function preloadNoOcio(telas: { preload: () => Promise<unknown> }[]) {
  const ocio = (f: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 1500));
  const prox = (i: number) => { if (i < telas.length) ocio(() => { telas[i].preload().catch(() => {}).finally(() => prox(i + 1)); }); };
  prox(0);
}
