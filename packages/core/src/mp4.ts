// Contêiner MP4 mínimo para H.264 já codificado (saída do VideoEncoder do navegador): sem áudio, "faststart" (moov antes do mdat)
// para o vídeo tocar durante o download. Escala de tempo em microssegundos, igual à do WebCodecs.
export interface Mp4Sample { data: Uint8Array; duration: number; key: boolean }
export interface Mp4Input { width: number; height: number; avcC: Uint8Array; samples: Mp4Sample[] }

const TIMESCALE = 1_000_000;
const enc = new TextEncoder();
const u8 = (...v: number[]) => Uint8Array.from(v);
const u16 = (n: number) => u8((n >>> 8) & 255, n & 255);
const u32 = (n: number) => u8((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((a, b) => a + b.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const zeros = (n: number) => new Uint8Array(n);
const box = (type: string, ...body: Uint8Array[]) => { const b = cat(...body); return cat(u32(8 + b.length), enc.encode(type), b); };
const full = (type: string, version: number, flags: number, ...body: Uint8Array[]) => box(type, u8(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...body);
const MATRIX = cat(u32(0x00010000), zeros(12), u32(0x00010000), zeros(12), u32(0x40000000));

export function muxMp4({ width, height, avcC, samples }: Mp4Input): Uint8Array {
  if (!samples.length) throw new Error("sem amostra de vídeo");
  const total = samples.reduce((a, s) => a + s.duration, 0);
  const ftyp = box("ftyp", enc.encode("isom"), u32(512), enc.encode("isom"), enc.encode("iso2"), enc.encode("avc1"), enc.encode("mp41"));

  // stts: durações iguais seguidas viram uma entrada só
  const runs: [number, number][] = [];
  for (const s of samples) { const l = runs[runs.length - 1]; if (l && l[1] === s.duration) l[0]++; else runs.push([1, s.duration]); }
  const keys = samples.map((s, i) => (s.key ? i + 1 : 0)).filter(Boolean);

  const avc1 = box("avc1", zeros(6), u16(1), zeros(16), u16(width), u16(height), u32(0x00480000), u32(0x00480000), zeros(4), u16(1), zeros(32), u16(0x18), u16(0xffff), box("avcC", avcC));
  const moov = (chunkOffset: number) => box("moov",
    full("mvhd", 0, 0, u32(0), u32(0), u32(TIMESCALE), u32(total), u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(2)),
    box("trak",
      full("tkhd", 0, 3, u32(0), u32(0), u32(1), zeros(4), u32(total), zeros(8), u16(0), u16(0), u16(0), zeros(2), MATRIX, u32(width << 16), u32(height << 16)),
      box("mdia",
        full("mdhd", 0, 0, u32(0), u32(0), u32(TIMESCALE), u32(total), u16(0x55c4), u16(0)),
        full("hdlr", 0, 0, u32(0), enc.encode("vide"), zeros(12), enc.encode("VideoHandler\0")),
        box("minf",
          full("vmhd", 0, 1, zeros(8)),
          box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1))),
          box("stbl",
            full("stsd", 0, 0, u32(1), avc1),
            full("stts", 0, 0, u32(runs.length), ...runs.flatMap(([c, d]) => [u32(c), u32(d)])),
            full("stss", 0, 0, u32(keys.length), ...keys.map(u32)),
            full("stsc", 0, 0, u32(1), u32(1), u32(samples.length), u32(1)),
            full("stsz", 0, 0, u32(0), u32(samples.length), ...samples.map((s) => u32(s.data.length))),
            full("stco", 0, 0, u32(1), u32(chunkOffset)))))));
  const size = moov(0).length; // não depende do valor do offset
  const mdat = box("mdat", ...samples.map((s) => s.data));
  return cat(ftyp, moov(ftyp.length + size + 8), mdat);
}
