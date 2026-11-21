// Relógio do treino em andamento (Hoje, mini-barra e modo treino). Fica fora do timeline.tsx, que baixa só no modo treino (#122).
import { useEffect, useState } from "preact/hooks";
import { C, S } from "../../lib/store/index.ts";
import { onTick } from "./sessao.ts";

export function useTick() { const [, set] = useState(0); useEffect(() => onTick(() => set((x) => x + 1)), []); }
export function Relogio() { useTick(); return <span class="clock num" role="timer" aria-label="Tempo de treino">{C.fmtClock(Date.now() - S.session.startedAt)}</span>; }
