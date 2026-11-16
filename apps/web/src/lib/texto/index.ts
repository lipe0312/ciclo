// Texto didático dos exercícios (como fazer, dicas, erros): carga sob demanda para não pesar o JS inicial (#96).
import { useEffect, useState } from "preact/hooks";
import type { Texto } from "@ciclo/core/catalog-texto";

let TEXTOS: Record<string, Texto> | null = null;
let pendente: Promise<void> | null = null;
const carregar = () => (pendente ??= import("@ciclo/core/catalog-texto").then((m) => { TEXTOS = m.TEXTO; }));

/** Texto do exercício: `undefined` enquanto carrega; `null` se o exercício não tem texto. */
export function useTexto(id: string): Texto | null | undefined {
  const [, forca] = useState(0);
  useEffect(() => { if (!TEXTOS) carregar().then(() => forca((n) => n + 1)); }, []);
  return TEXTOS ? TEXTOS[id] ?? null : undefined;
}
