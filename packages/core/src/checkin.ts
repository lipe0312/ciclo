// Check-in diário (≤ 10 s): a fonte nº 1 da revisão de domingo.
// Cinco toques + peso opcional. Dias sem check-in aparecem como buraco e podem ser preenchidos depois.

export interface Checkin {
  date: string;              // YYYY-MM-DD (America/Sao_Paulo)
  sleepH: 5 | 6 | 7 | 8 | 9; // horas (5 = ≤5, 9 = 9+)
  energy: 1 | 2 | 3;         // baixa · ok · alta
  soreness: 0 | 1 | 2;       // zero · leve · alta
  stress: 1 | 2 | 3;         // baixo · médio · alto
  food: -1 | 0 | 1;          // comi menos · normal · mais que o típico
  weightKg?: number;
  note?: string;
}

export interface Readiness { score: number; label: "pronto" | "ok" | "segurar"; advice: string }
export function readiness(c: Pick<Checkin, "sleepH" | "energy" | "soreness" | "stress">): Readiness {
  const score = Math.round(
    ((c.sleepH - 5) / 4) * 35 + ((c.energy - 1) / 2) * 30 + ((2 - c.soreness) / 2) * 20 + ((3 - c.stress) / 2) * 15,
  );
  if (score >= 65) return { score, label: "pronto", advice: "Dia bom para tentar subir carga." };
  if (score >= 40) return { score, label: "ok", advice: "Treino normal, sem forçar recorde." };
  return { score, label: "segurar", advice: "Sugestão: −1 série por exercício ou expresso. Contar presença já vale." };
}

export function weekDates(mondayIso: string): string[] {
  const d = new Date(mondayIso + "T12:00:00Z");
  return Array.from({ length: 7 }, (_, i) => new Date(d.getTime() + i * 864e5).toISOString().slice(0, 10));
}
export function mondayOf(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * 864e5).toISOString().slice(0, 10);
}
export function coverage(checkins: Pick<Checkin, "date">[], dates: string[], todayIso: string): { filled: number; due: number; missing: string[] } {
  const have = new Set(checkins.map((c) => c.date));
  const due = dates.filter((d) => d <= todayIso);
  const missing = due.filter((d) => !have.has(d));
  return { filled: due.length - missing.length, due: due.length, missing };
}
