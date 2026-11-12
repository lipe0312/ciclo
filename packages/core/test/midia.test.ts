import { test } from "node:test";
import assert from "node:assert/strict";
import { MEDIA_MAX_BYTES, MEDIA_TARGET_BYTES, decideUpload, formatMB, muxMp4, planVideo } from "../src/index.ts";

test("formatMB: pt-BR com uma casa", () => {
  assert.equal(formatMB(6 * 1024 * 1024), "6,0 MB");
  assert.equal(formatMB(1536 * 1024), "1,5 MB");
});

test("plano de vídeo: 1080p de 15 s vira 720p com orçamento < 6 MB", () => {
  const p = planVideo({ width: 1920, height: 1080, durationS: 15, canEncode: true });
  assert.equal(p.action, "compress");
  if (p.action !== "compress") return;
  assert.equal(p.width, 1280); assert.equal(p.height, 720);
  // bits/s × s / 8 + 6% de container tem de caber na meta
  assert.ok((p.videoBps * 15) / 8 * 1.06 < MEDIA_TARGET_BYTES, `estimado ${(p.videoBps * 15) / 8}`);
  assert.ok(p.videoBps >= 1_000_000, "qualidade mínima aceitável");
});

test("plano de vídeo: retrato 1080x1920 vira 720x1280 (lados pares)", () => {
  const p = planVideo({ width: 1080, height: 1920, durationS: 12, canEncode: true });
  assert.equal(p.action, "compress");
  if (p.action === "compress") { assert.equal(p.width, 720); assert.equal(p.height, 1280); }
});

test("plano de vídeo: já pequeno não é ampliado e dimensões saem pares", () => {
  const p = planVideo({ width: 641, height: 359, durationS: 10, canEncode: true });
  assert.equal(p.action, "compress");
  if (p.action === "compress") { assert.equal(p.width % 2, 0); assert.equal(p.height % 2, 0); assert.ok(p.width <= 642 && p.height <= 360); }
});

test("plano de vídeo: clipe mais longo reduz a taxa para caber na meta", () => {
  const a = planVideo({ width: 1280, height: 720, durationS: 10, canEncode: true });
  const b = planVideo({ width: 1280, height: 720, durationS: 30, canEncode: true });
  assert.equal(a.action, "compress"); assert.equal(b.action, "compress");
  if (a.action === "compress" && b.action === "compress") assert.ok(b.videoBps < a.videoBps);
});

test("plano de vídeo: acima de 30 s é recusado com mensagem clara", () => {
  const p = planVideo({ width: 1280, height: 720, durationS: 45, canEncode: true });
  assert.equal(p.action, "reject");
  if (p.action === "reject") assert.match(p.message, /30 s/);
});

test("plano de vídeo: sem WebCodecs envia como está (limite de 20 MB) e avisa", () => {
  const p = planVideo({ width: 1920, height: 1080, durationS: 15, canEncode: false });
  assert.equal(p.action, "as-is");
  if (p.action === "as-is") assert.match(p.message, /compress/i);
});

test("plano de vídeo: duração ou dimensão inválida cai no envio direto", () => {
  assert.equal(planVideo({ width: 0, height: 0, durationS: NaN, canEncode: true }).action, "as-is");
  assert.equal(planVideo({ width: 1280, height: 720, durationS: Infinity, canEncode: true }).action, "as-is");
});

test("upload: foto até 20 MB passa; acima recusa com o tamanho na mensagem", () => {
  assert.deepEqual(decideUpload({ kind: "foto", bytes: 3 * 1024 * 1024 }), { ok: true, warn: null });
  const r = decideUpload({ kind: "foto", bytes: MEDIA_MAX_BYTES + 1 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /20 MB/);
});

test("upload: vídeo dentro da meta passa sem aviso; entre 6 e 20 MB passa com aviso; acima de 20 MB recusa", () => {
  assert.deepEqual(decideUpload({ kind: "video", bytes: 5 * 1024 * 1024 }), { ok: true, warn: null });
  const w = decideUpload({ kind: "video", bytes: 9 * 1024 * 1024 });
  assert.ok(w.ok && w.warn && /9,0 MB/.test(w.warn));
  const r = decideUpload({ kind: "video", bytes: 25 * 1024 * 1024 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /25,0 MB/);
});

test("upload: arquivo vazio é recusado", () => {
  assert.equal(decideUpload({ kind: "video", bytes: 0 }).ok, false);
});

// ---- MP4 ----
const u32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset).getUint32(o);
const tag = (b: Uint8Array, o: number) => String.fromCharCode(...b.subarray(o, o + 4));
/** Lê a árvore de caixas (só as que são contêiner) para conferir a estrutura. */
function boxes(b: Uint8Array, start = 0, end = b.length, out: Record<string, { o: number; size: number }> = {}) {
  const CONT = new Set(["moov", "trak", "mdia", "minf", "stbl", "dinf"]);
  for (let o = start; o + 8 <= end;) {
    const size = u32(b, o), t = tag(b, o + 4);
    out[t] = { o, size };
    if (CONT.has(t)) boxes(b, o + 8, o + size, out);
    o += size;
  }
  return out;
}
const sample = (n: number, key: boolean, dur = 33_333) => ({ data: new Uint8Array(n).fill(7), duration: dur, key });
const avcC = new Uint8Array([1, 0x42, 0xe0, 0x1f, 0xff, 0xe1, 0, 4, 0x67, 1, 2, 3, 1, 0, 2, 0x68, 9]);

test("mp4: ftyp + moov antes do mdat (faststart) e todas as caixas obrigatórias", () => {
  const m = muxMp4({ width: 1280, height: 720, avcC, samples: [sample(100, true), sample(40, false), sample(60, false)] });
  assert.equal(tag(m, 4), "ftyp");
  const b = boxes(m);
  for (const t of ["moov", "mvhd", "trak", "tkhd", "mdia", "mdhd", "hdlr", "minf", "vmhd", "dinf", "stbl", "stsd", "stts", "stss", "stsc", "stsz", "stco", "mdat"]) assert.ok(b[t], `falta ${t}`);
  assert.ok(b.moov.o < b.mdat.o, "moov deve vir antes do mdat");
  assert.equal(b.mdat.size, 8 + 200);
  assert.equal(b.mdat.o + b.mdat.size, m.length);
});

test("mp4: stco aponta para o início real dos dados e stsz lista os tamanhos", () => {
  const m = muxMp4({ width: 640, height: 360, avcC, samples: [sample(10, true), sample(20, false)] });
  const b = boxes(m);
  // stco: versão/flags(4) + count(4) + offset(4)
  assert.equal(u32(m, b.stco.o + 12), 1);
  assert.equal(u32(m, b.stco.o + 16), b.mdat.o + 8);
  // stsz: versão/flags(4) + sample_size(4) + count(4) + entradas
  assert.equal(u32(m, b.stsz.o + 16), 2);
  assert.equal(u32(m, b.stsz.o + 20), 10); assert.equal(u32(m, b.stsz.o + 24), 20);
});

test("mp4: stss marca só os quadros-chave (1-based); duração do mvhd = soma das amostras", () => {
  const m = muxMp4({ width: 640, height: 360, avcC, samples: [sample(10, true, 1000), sample(10, false, 1000), sample(10, true, 2000)] });
  const b = boxes(m);
  assert.equal(u32(m, b.stss.o + 12), 2);
  assert.equal(u32(m, b.stss.o + 16), 1); assert.equal(u32(m, b.stss.o + 20), 3);
  // mvhd v0: ver/flags(4) criação(4) modif(4) timescale(4) duração(4)
  const ts = u32(m, b.mvhd.o + 20), dur = u32(m, b.mvhd.o + 24);
  assert.equal(ts, 1_000_000); assert.equal(dur, 4000);
});

test("mp4: avcC entra no avc1 e largura/altura no tkhd (16.16)", () => {
  const m = muxMp4({ width: 1280, height: 720, avcC, samples: [sample(10, true)] });
  const s = Buffer.from(m).toString("latin1");
  assert.ok(s.includes("avcC"));
  assert.ok(Buffer.from(m).includes(Buffer.from(avcC)));
  const b = boxes(m);
  assert.equal(u32(m, b.tkhd.o + b.tkhd.size - 8), 1280 << 16);
  assert.equal(u32(m, b.tkhd.o + b.tkhd.size - 4), 720 << 16);
});

test("mp4: sem amostras é erro (não gera arquivo vazio)", () => {
  assert.throws(() => muxMp4({ width: 640, height: 360, avcC, samples: [] }), /amostra/);
});
