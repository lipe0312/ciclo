// #62 Cadastro por convite e dados da conta: nome, sobrenome, sexo (obrigatório, com "prefiro não dizer"), nascimento
// opcional, aceite LGPD versionado, Face ID de novo (ausência longa e ações sensíveis), conta nova vazia e iniciais
// do avatar. Regras puras: o Worker valida com elas e o app mostra com elas.
import { DEFAULT_PROFILE } from "./perfil.ts";
import type { ProfileData } from "./perfil.ts";
import { nomeValido } from "./conta.ts";

const DIA = 86_400_000;

// ---- sexo (decisão A da #62) ----
export const SEXOS = ["feminino", "masculino", "nao_informado"] as const;
export type Sexo = (typeof SEXOS)[number];
export const SEXO_TEXTO: Record<Sexo, string> = { feminino: "Feminino", masculino: "Masculino", nao_informado: "Prefiro não dizer" };
export const sexoValido = (v: unknown): Sexo | null => (typeof v === "string" && (SEXOS as readonly string[]).includes(v) ? (v as Sexo) : null);

/** Sobrenome: 1–60 caracteres, sem controle, espaços normalizados. null = inválido. */
export function sobrenomeValido(v: unknown): string | null {
  if (typeof v !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const n = v.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
  return n.length >= 1 && n.length <= 60 ? n : null;
}

/** E-mail normalizado (minúsculo, sem espaço nas pontas) ou null. */
export function emailValido(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return e.length >= 3 && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}
/** Mesmo e-mail (o do convite e o informado; o do dono e o do secret OWNER_EMAIL)? Vazio nunca confere. */
export function mesmoEmail(a: unknown, b: unknown): boolean {
  const x = emailValido(a), y = emailValido(b);
  return !!x && x === y;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Idade em anos completos em `hoje` (AAAA-MM-DD). */
export function idade(nascimento: string, hoje: string): number {
  const [a, m, d] = nascimento.split("-").map(Number), [ha, hm, hd] = hoje.split("-").map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}
export type Campo<T> = { ok: true; valor: T } | { ok: false; erro: string };
/** Nascimento opcional: vazio = não informado; senão AAAA-MM-DD de verdade e idade de 13 a 110 anos. */
export function nascimentoValido(v: unknown, hoje: string): Campo<string | null> {
  if (v == null || v === "") return { ok: true, valor: null };
  const m = typeof v === "string" ? ISO.exec(v) : null;
  const dt = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!m || !dt || dt.getUTCFullYear() !== +m[1] || dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) return { ok: false, erro: "nascimento deve ser uma data AAAA-MM-DD" };
  const anos = idade(v as string, hoje);
  return anos >= 13 && anos <= 110 ? { ok: true, valor: v as string } : { ok: false, erro: "nascimento: idade de 13 a 110 anos" };
}

export interface Cadastro { nome: string; sobrenome: string; sexo: Sexo; nascimento: string | null }
/** Etapas 2–4 do "Crie sua conta no Ciclo" (o mesmo vale para o setup do dono). */
export function validarCadastro(b: Record<string, unknown>, hoje: string): { ok: boolean; valor: Cadastro | null; erros: string[] } {
  const erros: string[] = [];
  const nome = nomeValido(b.nome); if (!nome) erros.push("nome de 1 a 40 letras");
  const sobrenome = sobrenomeValido(b.sobrenome); if (!sobrenome) erros.push("sobrenome de 1 a 60 letras");
  const sexo = sexoValido(b.sexo); if (!sexo) erros.push("sexo: feminino, masculino ou prefiro não dizer");
  const nasc = nascimentoValido(b.nascimento, hoje); if (!nasc.ok) erros.push(nasc.erro);
  return erros.length ? { ok: false, valor: null, erros } : { ok: true, valor: { nome: nome!, sobrenome: sobrenome!, sexo: sexo!, nascimento: nasc.ok ? nasc.valor : null }, erros };
}

export interface PerfilConta { nome?: string; sobrenome?: string; sexo?: Sexo; nascimento?: string | null; alturaCm?: number | null; pesoKg?: number | null }
/** Conta → Perfil: patch parcial. Nome, sobrenome e sexo não podem ficar vazios; nascimento, altura e peso aceitam null (apagar). */
export function validarPerfilConta(b: Record<string, unknown>, hoje: string): { ok: boolean; valor: PerfilConta; erros: string[] } {
  const erros: string[] = [], valor: PerfilConta = {};
  const tem = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
  if (tem("nome")) { const v = nomeValido(b.nome); if (v) valor.nome = v; else erros.push("nome de 1 a 40 letras"); }
  if (tem("sobrenome")) { const v = sobrenomeValido(b.sobrenome); if (v) valor.sobrenome = v; else erros.push("sobrenome de 1 a 60 letras"); }
  if (tem("sexo")) { const v = sexoValido(b.sexo); if (v) valor.sexo = v; else erros.push("sexo: feminino, masculino ou prefiro não dizer"); }
  if (tem("nascimento")) { const v = nascimentoValido(b.nascimento, hoje); if (v.ok) valor.nascimento = v.valor; else erros.push(v.erro); }
  const numero = (k: "alturaCm" | "pesoKg", lo: number, hi: number, inteiro: boolean) => {
    if (!tem(k)) return;
    const v = b[k];
    if (v === null) { valor[k] = null; return; }
    if (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi && (!inteiro || Number.isInteger(v))) valor[k] = inteiro ? v : Math.round(v * 10) / 10;
    else erros.push(`${k === "alturaCm" ? "altura" : "peso"} fora de ${lo}..${hi}`);
  };
  numero("alturaCm", 100, 250, true);
  numero("pesoKg", 25, 350, false);
  return { ok: !erros.length, valor, erros };
}

// ---- aceite LGPD (consent versionado) ----
export const CONSENT_DOCS = ["termos", "privacidade"] as const;
export type DocLegal = (typeof CONSENT_DOCS)[number];
/** Versão vigente de cada documento. Mudou o texto de forma relevante = nova data aqui → todos aceitam de novo antes de usar. */
export const CONSENT_VERSAO: Record<DocLegal, string> = { termos: "2026-11-14", privacidade: "2026-11-14" };
/** Documentos cuja versão vigente a pessoa ainda não aceitou. */
export function consentPendente(aceitos: { doc: string; versao: string }[], atual: Record<DocLegal, string> = CONSENT_VERSAO): DocLegal[] {
  return CONSENT_DOCS.filter((d) => !aceitos.some((a) => a.doc === d && a.versao === atual[d]));
}

// ---- Face ID de novo ----
/** App fechado por mais de 7 dias: pede o Face ID de novo, sem deslogar. */
export const REAUTH_AUSENCIA_MS = 7 * DIA;
/** Ação sensível (chave do Chat, convidar, apagar conta, códigos de recuperação, sair de todos): Face ID nos últimos 5 min. */
export const REAUTH_SENSIVEL_MS = 5 * 60_000;
export const precisaFaceId = (s: { lastSeenAt: number | null; createdAt: number }, now: number) => now - (s.lastSeenAt ?? s.createdAt) > REAUTH_AUSENCIA_MS;
export const faceIdRecente = (reauthAt: number | null | undefined, now: number) => reauthAt != null && reauthAt <= now + 60_000 && now - reauthAt <= REAUTH_SENSIVEL_MS;

// ---- conta nova = vazia ----
/** O que uma conta recém-criada pode ter além da linha em `user`: credenciais, a sessão do cadastro e o aceite. Nada de seed. */
export const TABELAS_CONTA_NOVA = ["passkeys", "sessions", "recovery_codes", "consent"] as const;
/** Tabelas (por contagem de linhas da conta) que deveriam estar vazias e não estão. */
export function contaNovaVazia(contagem: Record<string, number>, permitidas: readonly string[] = TABELAS_CONTA_NOVA): string[] {
  return Object.keys(contagem).filter((t) => contagem[t] > 0 && !permitidas.includes(t)).sort();
}

/** Ponto de partida do perfil de treino de uma conta nova: nada marcado (objetivo, prioridades, dias, lugares e academia
 *  por dia em branco). Sexo, idade, altura e peso vêm do cadastro quando a pessoa informou; o resto é o formato do core. */
export function perfilContaNova(conta: { sexo?: string | null; nascimento?: string | null; alturaCm?: number | null; pesoKg?: number | null }, hoje: string): ProfileData {
  const p: ProfileData = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  p.goal = { ...p.goal, id: "", statement: "" };
  p.priorities = []; p.subPriorities = []; p.daysUsual = []; p.places = []; p.dayGym = {};
  if (conta.sexo === "feminino") p.sex = "f"; else if (conta.sexo === "masculino") p.sex = "m";
  if (conta.nascimento && nascimentoValido(conta.nascimento, hoje).ok) p.age = idade(conta.nascimento, hoje);
  if (conta.alturaCm) p.heightCm = conta.alturaCm;
  if (conta.pesoKg) p.weightKg = conta.pesoKg;
  return p;
}

/** Iniciais do avatar: primeira letra do nome e do sobrenome (ou das duas primeiras palavras do nome). */
export function iniciais(nome: string | null | undefined, sobrenome?: string | null): string {
  const partes = [...(nome ?? "").trim().split(/\s+/), ...(sobrenome ?? "").trim().split(/\s+/)].filter(Boolean);
  const pega = sobrenome?.trim() ? [partes[0], (sobrenome ?? "").trim()] : partes.slice(0, 2);
  const s = pega.filter(Boolean).map((p) => [...p][0].toUpperCase()).join("");
  return s || "?";
}
