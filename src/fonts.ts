import { createGlyphProbe } from "./glyph-probe";
import { measureAppearance, type FontAppearance } from "./appearance";
export type LocalFont = {
  id: string;
  name: string;
  family: string;
  enabled: boolean;
  status: "loading" | "ready" | "error";
  error?: string;
  covers: (text: string) => boolean;
  face?: FontFace;
  appearance?: FontAppearance;
  renders?: (text: string) => boolean;
};
// Read cmap directly: coverage must never be inferred from system-font fallback.
export function cmapCoverage(buffer: ArrayBuffer) {
  const v = new DataView(buffer);
  const tag = (p: number) =>
    String.fromCharCode(...new Uint8Array(buffer, p, 4));
  const base = tag(0) === "ttcf" ? v.getUint32(12) : 0;
  const count = v.getUint16(base + 4);
  let cmap = 0;
  for (let i = 0; i < count; i++) {
    const p = base + 12 + i * 16;
    if (tag(p) === "cmap") cmap = v.getUint32(p + 8);
  }
  if (!cmap) throw Error("字体缺少 cmap 字符映射表");
  const maps: number[] = [];
  for (let i = 0; i < v.getUint16(cmap + 2); i++) {
    const p = cmap + 4 + i * 8;
    const platform = v.getUint16(p),
      encoding = v.getUint16(p + 2);
    if (
      platform === 0 ||
      (platform === 3 && (encoding === 1 || encoding === 10))
    )
      maps.push(cmap + v.getUint32(p + 4));
  }
  if (!maps.some((p) => [4, 12, 13].includes(v.getUint16(p))))
    throw Error("不支持此字体的字符映射格式（需要 cmap 4、12 或 13）");
  return (text: string) =>
    Array.from(text).every((c) => {
      const cp = c.codePointAt(0)!;
      if (
        cp === 0x200d ||
        (cp >= 0xfe00 && cp <= 0xfe0f) ||
        (cp >= 0xe0100 && cp <= 0xe01ef)
      )
        return true;
      return maps.some((p) => {
        const format = v.getUint16(p);
        if (format === 12 || format === 13) {
          let lo = 0,
            hi = v.getUint32(p + 12) - 1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1,
              q = p + 16 + mid * 12,
              start = v.getUint32(q),
              end = v.getUint32(q + 4);
            if (cp < start) hi = mid - 1;
            else if (cp > end) lo = mid + 1;
            else
              return (
                v.getUint32(q + 8) + (format === 12 ? cp - start : 0) !== 0
              );
          }
          return false;
        }
        if (format !== 4 || cp > 0xffff) return false;
        const n = v.getUint16(p + 6) / 2,
          end = p + 14,
          start = end + n * 2 + 2,
          delta = start + n * 2,
          range = delta + n * 2;
        for (let i = 0; i < n; i++) {
          if (
            cp >= v.getUint16(start + i * 2) &&
            cp <= v.getUint16(end + i * 2)
          ) {
            const d = v.getInt16(delta + i * 2),
              r = v.getUint16(range + i * 2);
            const glyph = r
              ? v.getUint16(
                  range + i * 2 + r + (cp - v.getUint16(start + i * 2)) * 2,
                )
              : cp;
            return (glyph === 0 && r ? 0 : (glyph + d) & 65535) !== 0;
          }
        }
        return false;
      });
    });
}
// Browser FontFace implementations may reject collections. Extract the first face
// into a standalone sfnt in memory, without altering outlines or uploading data.
export function firstCollectionFace(data: ArrayBuffer): ArrayBuffer {
  const v = new DataView(data);
  if (v.getUint32(0) !== 0x74746366) return data;
  const base = v.getUint32(12),
    n = v.getUint16(base + 4);
  let length = 12 + n * 16;
  const tables = Array.from({ length: n }, (_, i) => {
    const p = base + 12 + i * 16;
    const size = v.getUint32(p + 12),
      offset = v.getUint32(p + 8);
    if (offset + size > data.byteLength)
      throw Error("TTC 表越界：字体文件不完整");
    const target = length;
    length += Math.ceil(size / 4) * 4;
    return { p, size, offset, target };
  });
  const output = new ArrayBuffer(length),
    bytes = new Uint8Array(output),
    out = new DataView(output);
  bytes.set(new Uint8Array(data, base, 12));
  let head = 0;
  tables.forEach((t, i) => {
    const p = 12 + i * 16;
    bytes.set(new Uint8Array(data, t.p, 16), p);
    out.setUint32(p + 8, t.target);
    bytes.set(new Uint8Array(data, t.offset, t.size), t.target);
    if (v.getUint32(t.p) === 0x68656164) {
      head = t.target;
      out.setUint32(head + 8, 0);
    }
  });
  if (head) {
    let sum = 0;
    for (let i = 0; i < length; i += 4) sum = (sum + out.getUint32(i)) >>> 0;
    out.setUint32(head + 8, (0xb1b0afba - sum) >>> 0);
  }
  return output;
}
export async function loadFont(file: File, update: (font: LocalFont) => void) {
  const id = crypto.randomUUID(),
    font: LocalFont = {
      id,
      name: file.name,
      family: `Ink_${id.replaceAll("-", "")}`,
      status: "loading",
      enabled: true,
      covers: () => false,
    };
  update(font);
  try {
    if (!/\.(ttf|otf|ttc)$/i.test(file.name))
      throw Error("仅支持 TTF、OTF、TTC 文件");
    const data = firstCollectionFace(await file.arrayBuffer());
    const covers = cmapCoverage(data);
    const face = new FontFace(font.family, data);
    await face.load();
    document.fonts.add(face);
    const appearance = measureAppearance(font.family, covers);
    const renders = createGlyphProbe(font.family, covers);
    update({ ...font, status: "ready", covers, face, appearance, renders });
  } catch (e) {
    update({
      ...font,
      status: "error",
      enabled: false,
      error:
        e instanceof RangeError
          ? "字体结构不完整或表数据越界"
          : e instanceof Error
            ? e.message.includes("Invalid font")
              ? "浏览器字体校验未通过：文件包含损坏或不受支持的字体表"
              : e.message
            : String(e),
    });
  }
}

const legacyProbes = new WeakMap<LocalFont, (text: string) => boolean>();
export function fontCanRender(font: LocalFont, text: string) {
  if (
    font.status !== "ready" ||
    !font.covers(text) ||
    (font.face && font.face.status !== "loaded")
  )
    return false;
  let probe = font.renders ?? legacyProbes.get(font);
  if (!probe) {
    probe = createGlyphProbe(font.family, font.covers);
    legacyProbes.set(font, probe);
  }
  return probe(text);
}
