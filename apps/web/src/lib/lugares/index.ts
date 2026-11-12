// Lugares (academia, casa, hotel): gravar, apagar e mídia do aparelho. Estado em S.gyms / S.gymMedia / S.profile.dayGym.
// A regra de negócio vive no core (validatePlace, assignWeekdays, reassignDays, planVideo, decideUpload); aqui só ligamos ao estado e à API.
import { C, S, commit } from "../store/index.ts";
import type { Gym, GymMedia } from "../store/index.ts";
import { profileChanged } from "../store/regras.ts";
import { SERVER, api, send } from "../api/index.ts";
import { comprimirVideo, lerVideo, podeComprimir } from "../video/index.ts";

export interface LugarRascunho {
  name: string; kind: C.PlaceKind; address: string | null; lat: number | null; lng: number | null;
  equipment: string[]; busyHours: string[]; weekdays: C.Dow[];
}
export const kindNm = (k?: string) => C.PLACE_KIND_NM[(k as C.PlaceKind) ?? "academia"] ?? "Academia";

/** Dias em que o lugar é o padrão (a fonte é o perfil: é o que o planejador lê). */
export const diasDoLugar = (id: string): C.Dow[] => C.daysOfPlace(S.profile.dayGym ?? {}, id);
/** Quem já usa o dia (outro lugar), para avisar antes de tirar dele. */
export const lugarDoDia = (d: string, exceto?: string) => { const id = S.profile.dayGym?.[d]; return id && id !== exceto ? S.gyms.find((g) => g.id === id) ?? null : null; };

export function rascunhoDe(g?: Gym): LugarRascunho {
  if (g) return { name: g.name, kind: g.kind ?? "academia", address: g.address ?? null, lat: g.lat ?? null, lng: g.lng ?? null, equipment: [...g.equipment], busyHours: [...g.busyHours], weekdays: diasDoLugar(g.id) };
  return { name: "", kind: "academia", address: null, lat: null, lng: null, equipment: [], busyHours: [], weekdays: [] };
}

/** Cria (id=null) ou edita. Atualiza o estado já e grava no servidor (fila offline). Devolve o lugar salvo. */
export async function salvarLugar(id: string | null, d: LugarRascunho): Promise<Gym> {
  const v = C.validatePlace({ ...d, name: d.name.trim() });
  if (!v.ok) throw new Error(v.errors[0]);
  const gid = id ?? C.placeIdFor(v.value.name!, S.gyms.map((g) => g.id));
  const g: Gym = { id: gid, name: v.value.name!, kind: v.value.kind, address: v.value.address ?? null, lat: v.value.lat ?? null, lng: v.value.lng ?? null, equipment: v.value.equipment ?? [], busyHours: v.value.busyHours ?? [] };
  const i = S.gyms.findIndex((x) => x.id === gid);
  if (i >= 0) S.gyms[i] = g; else S.gyms.push(g);
  const ch = C.assignWeekdays(S.profile.dayGym ?? {}, gid, v.value.weekdays ?? []);
  const mudouDias = Object.keys(ch.patch).length > 0;
  S.profile.dayGym = ch.dayGym;
  S.ui.locked = false; // o lugar mudou: o treino de hoje pode mudar (aparelhos)
  if (mudouDias) profileChanged(false); // o servidor aplica os dias junto com o lugar (abaixo)
  commit();
  if (SERVER) await send("PUT", `/api/gyms/${encodeURIComponent(gid)}`, { name: g.name, kind: g.kind, address: g.address, lat: g.lat, lng: g.lng, equipment: g.equipment, busyHours: g.busyHours, weekdays: v.value.weekdays ?? [] });
  return g;
}

/** Apaga o lugar. `para`: lugar que herda os dias da semana (ou null: ficam sem padrão). Mídia vai para a lixeira por 30 dias. */
export async function apagarLugar(id: string, para: string | null): Promise<void> {
  const ch = C.reassignDays(S.profile.dayGym ?? {}, id, para);
  S.gyms = S.gyms.filter((g) => g.id !== id);
  S.gymMedia = S.gymMedia.filter((m) => m.gymId !== id);
  S.profile.dayGym = ch.dayGym;
  if (S.ui.gymId === id) S.ui.gymId = para ?? S.gyms[0]?.id ?? null;
  if (S.ui.gymTab === id) S.ui.gymTab = S.gyms[0]?.id ?? "";
  S.ui.locked = false;
  if (Object.keys(ch.patch).length) profileChanged(false);
  commit();
  if (SERVER) await send("DELETE", `/api/gyms/${encodeURIComponent(id)}`, para ? { reassignTo: para } : undefined);
}

// ---------- mídia do aparelho ----------
export const midiaDoAparelho = (gymId: string, equipmentId: string): GymMedia[] => S.gymMedia.filter((m) => m.gymId === gymId && m.equipmentId === equipmentId);
/** Lugar "de agora": o do treino em andamento, o escolhido no Hoje ou o primeiro. */
export const lugarAtual = () => S.gyms.find((g) => g.id === (S.session?.gymId ?? S.ui.gymId)) ?? S.gyms[0];
/** Mídia dos aparelhos que o exercício usa, no lugar de agora (aparece no detalhe e na timeline do treino). */
export function midiaDoExercicio(exId: string, gymId?: string): GymMedia[] {
  const eq = C.EXERCISE_BY_ID[exId]?.eq ?? [], g = gymId ?? lugarAtual()?.id;
  return g ? S.gymMedia.filter((m) => m.gymId === g && eq.includes(m.equipmentId)) : [];
}

const MIME_OK = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"];
export interface EnvioResultado { media: GymMedia; aviso: string | null }
/** Escolhe o que fazer com o arquivo (comprimir vídeo, recusar, enviar como está), sobe e registra. Erros viram Error com mensagem clara. */
export async function enviarMidia(file: File, gymId: string, equipmentId: string, note: string, status: (t: string) => void): Promise<EnvioResultado> {
  const type = file.type || (/\.(mp4|m4v)$/i.test(file.name) ? "video/mp4" : /\.mov$/i.test(file.name) ? "video/quicktime" : /\.png$/i.test(file.name) ? "image/png" : "image/jpeg");
  if (!MIME_OK.includes(type)) throw new Error("Tipo de arquivo não aceito. Use foto (jpeg, png, webp) ou vídeo (mp4, mov, webm).");
  const kind = type.startsWith("video") ? "video" : "foto";
  let blob: Blob = file, aviso: string | null = null;
  if (kind === "video") {
    const meta = await lerVideo(file);
    const plan = C.planVideo({ width: meta?.width ?? 0, height: meta?.height ?? 0, durationS: meta?.durationS ?? NaN, canEncode: podeComprimir() });
    if (plan.action === "reject") throw new Error(plan.message);
    if (plan.action === "as-is") aviso = plan.message;
    else {
      try {
        status("Comprimindo o vídeo… 0%");
        const out = await comprimirVideo(file, plan, (p) => status(`Comprimindo o vídeo… ${p}%`));
        if (out.size < file.size) blob = out; else aviso = "O vídeo já era pequeno; enviei como estava.";
      } catch { aviso = "Não consegui comprimir neste aparelho; o vídeo vai como está (limite de 20 MB)."; }
    }
  }
  const d = C.decideUpload({ kind, bytes: blob.size });
  if (!d.ok) throw new Error(d.message);
  if (d.warn) aviso = d.warn;
  if (blob.size !== file.size) aviso = `${kind === "video" ? "Vídeo" : "Foto"} comprimido: ${C.formatMB(file.size)} → ${C.formatMB(blob.size)}.` + (d.warn ? " " + d.warn : "");
  const typed = blob.type === (blob === file ? type : "video/mp4") && blob.type ? blob : new Blob([blob], { type: blob === file ? type : "video/mp4" });
  status("Enviando…");
  const nota = note.trim().slice(0, 300);
  let id: string;
  if (SERVER) {
    const q = new URLSearchParams({ gymId, equipmentId, ...(nota ? { note: nota } : {}) });
    id = (await api<{ id: string }>("POST", `/api/media?${q}`, null, typed)).id;
  } else id = "demo-" + Date.now();
  const media: GymMedia = { id, kind, equipmentId, gymId, note: nota || null, url: SERVER ? `/api/media/${id}` : URL.createObjectURL(typed) };
  S.gymMedia = [media, ...S.gymMedia];
  commit();
  return { media, aviso };
}
