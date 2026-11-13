// Ilustrações simples em SVG para os cartões do quiz e do Perfil (sem imagem externa; herdam a cor do tema).
import type { JSX } from "preact";

const G: Record<string, JSX.Element> = {
  // ombros largos + cintura fina
  bracos_ombros: <><circle cx="24" cy="10" r="5" /><path d="M6 24c0-5 8-8 18-8s18 3 18 8" /><path d="M16 22l3 22M32 22l-3 22" /><circle cx="7" cy="27" r="3.5" /><circle cx="41" cy="27" r="3.5" /></>,
  // corpo todo
  massa_geral: <><circle cx="24" cy="8" r="4.5" /><path d="M13 20c0-3 5-5 11-5s11 2 11 5l-2 11h-18z" /><path d="M18 31l-2 14M30 31l2 14M13 20l-5 12M35 20l5 12" /></>,
  // gota (gordura) saindo
  definir: <><path d="M24 6c6 8 11 13 11 20a11 11 0 0 1-22 0c0-7 5-12 11-20z" /><path d="M18 30c1 3 3 4 6 4" /></>,
  // setas de troca
  recompor: <><path d="M8 18h28M30 11l7 7-7 7" /><path d="M40 32H12M18 25l-7 7 7 7" /></>,
  // halter
  forca: <><path d="M14 14v20M34 14v20M7 19v10M41 19v10M14 24h20" /></>,
  // calendário com visto
  constancia: <><rect x="8" y="10" width="32" height="30" rx="4" /><path d="M8 19h32M16 6v8M32 6v8M17 29l5 5 9-10" /></>,
  // tronco em V: ombro largo, cintura fina
  shape_v: <><circle cx="24" cy="7" r="4.5" /><path d="M5 15h38l-9 15-4 14h-12l-4-14z" /><path d="M19 30h10" /></>,
  // fita métrica em volta da cintura
  perder_barriga: <><path d="M12 14c0 4 24 4 24 0M12 14v8c0 4 24 4 24 0v-8" /><path d="M12 30c0 4 24 4 24 0v6c0 4-24 4-24 0z" /><path d="M20 34v3M24 34.5v2M28 34v3" /></>,
  // coração com batimento
  saude: <><path d="M24 40C10 30 7 22 7 16a8.5 8.5 0 0 1 17-2 8.5 8.5 0 0 1 17 2c0 6-3 14-17 24z" /><path d="M13 24h6l3-6 4 11 3-5h6" /></>,
  // seta circular: recomeço
  retorno: <><path d="M38 24a14 14 0 1 1-4.5-10.3" /><path d="M36 6v8h-8" /><path d="M20 18l10 6-10 6z" /></>,
};
export const IlustObjetivo = ({ id }: { id: string }) =>
  <svg class="ilu" viewBox="0 0 48 48" aria-hidden="true">{G[id] ?? G.constancia}</svg>;

/** Silhueta parametrizada: ombro, cintura e barriga (em unidades do desenho). */
const BODY: Record<string, [number, number, number]> = {
  muito_magro: [15, 9, 0], magro: [17, 11, 0], falso_magro: [16, 13, 5], normal: [19, 14, 1], atletico: [24, 12, 0], forte_gordura: [24, 18, 5], acima: [20, 19, 8], bem_acima: [22, 24, 12],
};
export function IlustCorpo({ id }: { id: string }) {
  const [sh, wa, belly] = BODY[id] ?? BODY.normal;
  const cx = 24, top = 17, mid = 30, bot = 44;
  const d = `M${cx - sh} ${top + 2} Q${cx} ${top - 2} ${cx + sh} ${top + 2} L${cx + wa + belly} ${mid} Q${cx + wa + belly + 1} ${mid + 4} ${cx + wa - 2} ${bot} L${cx - wa + 2} ${bot} Q${cx - wa - belly - 1} ${mid + 4} ${cx - wa - belly} ${mid} Z`;
  return <svg class="ilu" viewBox="0 0 48 48" aria-hidden="true"><circle cx={cx} cy="9" r="5" /><path d={d} /></svg>;
}
