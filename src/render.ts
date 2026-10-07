import type { Presentation } from "./generation-animation";
import { drawable, layout, type Work, type Slot } from "./model";
import { fontCanRender, type LocalFont } from "./fonts";
export type Box = {
  slot: Slot;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
  missing: boolean;
};
const verticalPunctuation: Record<string, string> = {
  "，": "︐",
  "。": "︒",
  "、": "︑",
  "：": "︓",
  "；": "︔",
  "！": "︕",
  "？": "︖",
  "（": "︵",
  "）": "︶",
  "《": "︽",
  "》": "︾",
  "「": "﹁",
  "」": "﹂",
  "『": "﹃",
  "』": "﹄",
  "…": "︙",
};
export function draw(
  canvas: HTMLCanvasElement,
  work: Work,
  fonts: LocalFont[],
  width: number,
  height: number,
  grid = true,
  selected?: string,
  presentation?: Presentation,
): Box[] {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const s = work.settings;
  ctx.scale(width / s.width, height / s.height);
  if (s.background !== "transparent") {
    ctx.fillStyle = s.paper;
    ctx.fillRect(0, 0, s.width, s.height);
    if (s.background === "paper") {
      let seed = 731;
      const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      ctx.fillStyle = "rgba(102,78,39,.035)";
      for (let i = 0; i < Math.min((s.width * s.height) / 90, 45000); i++) {
        const x = random() * s.width,
          y = random() * s.height;
        ctx.fillRect(x, y, 0.5 + random() * 1.5, 0.5 + random() * 2);
      }
    }
  }
  const boxes: Box[] = [];
  for (const slot of layout(work)) {
    const { glyph, x, y, cell } = slot;
    const override = presentation?.fontOverrides.get(glyph.id);
    const e =
      override !== undefined ? { ...glyph.edit, fontId: override } : glyph.edit;
    if (grid && s.grid !== "none") {
      ctx.save();
      ctx.strokeStyle = "rgba(158,96,79,.18)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - cell / 2, y - cell / 2, cell, cell);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x - cell / 2, y);
      ctx.lineTo(x + cell / 2, y);
      ctx.moveTo(x, y - cell / 2);
      ctx.lineTo(x, y + cell / 2);
      if (s.grid === "rice") {
        ctx.moveTo(x - cell / 2, y - cell / 2);
        ctx.lineTo(x + cell / 2, y + cell / 2);
        ctx.moveTo(x + cell / 2, y - cell / 2);
        ctx.lineTo(x - cell / 2, y + cell / 2);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (!drawable(glyph.text) || presentation?.hiddenIds.has(glyph.id))
      continue;
    const font = fonts.find((f) => f.id === e.fontId && f.status === "ready");
    const missing = !font || !fontCanRender(font, glyph.text);
    const size = (e.size * s.size) / work.baseSize; // global size changes preserve the per-glyph size ratio
    const normalized =
      s.balance && font?.appearance
        ? 1 + (font.appearance.scale - 1) * s.balanceStrength
        : 1;
    const actualSize = (Number.isFinite(size) ? size : s.size) * normalized;
    const stroke = missing
      ? 0
      : (((s.balance
          ? (font?.appearance?.stroke ?? 0) * s.balanceStrength
          : 0) +
          e.stroke) *
          actualSize) /
        100;
    const factor = e.scale * s.scale;
    let px = x + e.dx,
      py = y + e.dy;
    if (!missing && /^[，。、,.]$/u.test(glyph.text)) {
      px +=
        s.direction === "vertical"
          ? cell * 0.24
          : /^[，。、]$/u.test(glyph.text)
            ? -cell * 0.22
            : 0;
      py += s.direction === "vertical" ? -cell * 0.24 : cell * 0.28;
    }
    const rotation = e.rotation + slot.rotation;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(factor * e.sx, factor * e.sy);
    ctx.font = `${actualSize}px "${font?.family ?? "sans-serif"}"`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    let text = glyph.text;
    if (
      s.direction === "vertical" &&
      verticalPunctuation[text] &&
      font &&
      fontCanRender(font, verticalPunctuation[text])
    )
      text = verticalPunctuation[text];
    const m = ctx.measureText(text);
    const left = m.actualBoundingBoxLeft,
      right = m.actualBoundingBoxRight,
      asc = m.actualBoundingBoxAscent,
      desc = m.actualBoundingBoxDescent;
    const w = missing ? actualSize : Math.max(1, left + right),
      h = missing ? actualSize : Math.max(1, asc + desc);
    ctx.fillStyle = s.ink;
    if (missing) {
      ctx.strokeStyle = "#b34e3f";
      ctx.lineWidth = 2;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.font = `${Math.max(10, actualSize * 0.16)}px sans-serif`;
      ctx.fillStyle = "#b34e3f";
      ctx.textAlign = "center";
      ctx.fillText(
        `U+${glyph.text.codePointAt(0)!.toString(16).toUpperCase()}`,
        0,
        0,
      );
    } else {
      if (stroke > 0) {
        ctx.strokeStyle = s.ink;
        ctx.lineWidth = stroke;
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.strokeText(text, (left - right) / 2, (asc - desc) / 2);
      }
      ctx.fillText(text, (left - right) / 2, (asc - desc) / 2);
    }
    ctx.restore();
    const box: Box = {
      slot,
      cx: px,
      cy: py,
      w: (w + stroke) * factor * e.sx,
      h: (h + stroke) * factor * e.sy,
      rotation,
      missing,
    };
    boxes.push(box);
    if (selected === glyph.id) {
      ctx.save();
      ctx.translate(box.cx, box.cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.strokeStyle = "#a94732";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(-box.w / 2 - 7, -box.h / 2 - 7, box.w + 14, box.h + 14);
      ctx.restore();
    }
  }
  return boxes;
}
export function hit(boxes: Box[], x: number, y: number) {
  return [...boxes].reverse().find((b) => {
    const a = (-b.rotation * Math.PI) / 180,
      dx = x - b.cx,
      dy = y - b.cy;
    return (
      Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) <= b.w / 2 + 8 &&
      Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) <= b.h / 2 + 8
    );
  });
}
export function clipped(box: Box, s: Work["settings"]) {
  const a = (box.rotation * Math.PI) / 180,
    w = Math.abs(Math.cos(a) * box.w) + Math.abs(Math.sin(a) * box.h),
    h = Math.abs(Math.sin(a) * box.w) + Math.abs(Math.cos(a) * box.h);
  return (
    box.cx - w / 2 < 0 ||
    box.cy - h / 2 < 0 ||
    box.cx + w / 2 > s.width ||
    box.cy + h / 2 > s.height
  );
}
export async function exportPNG(
  work: Work,
  fonts: LocalFont[],
  width: number,
  height: number,
  grid: boolean,
) {
  if (
    width > 16384 ||
    height > 16384 ||
    width * height > 32_000_000 ||
    width < 1 ||
    height < 1
  )
    throw Error("导出限制：单边不超过 16384 像素，总像素不超过 3200 万");
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  draw(canvas, work, fonts, width, height, grid);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(Error("浏览器无法编码该图片，请降低尺寸")),
      "image/png",
    ),
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `书法字帖-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
