import { describe, it, expect, vi } from "vitest";
import { defaults, generate } from "./model";
import { repairFonts } from "./font-fallback";
import { fontCanRender, type LocalFont } from "./fonts";
import { createGlyphProbe } from "./glyph-probe";
const make = (id: string, renders: boolean, enabled = true): LocalFont => ({
  id,
  name: id,
  family: id,
  status: "ready",
  enabled,
  covers: () => true,
  renders: () => renders,
});
const random = { font: false, size: false, offset: false, rotation: false };
describe("失败字形自动切换", () => {
  it("cmap 宣称支持但绘制失败时跳过，按顺序尝试下一款", () => {
    const fonts = [make("a", false), make("b", false), make("c", true)];
    const w = generate("天", defaults, () => ["a"], random);
    w.glyphs[0].edit.dx = 36;
    w.glyphs[0].edit.stroke = 1.2;
    const fixed = repairFonts(w, fonts);
    expect(fixed.replacements).toBe(1);
    expect(fixed.work.glyphs[0].edit).toEqual({
      ...w.glyphs[0].edit,
      fontId: "c",
    });
    expect(fixed.work.glyphs[0].id).toBe(w.glyphs[0].id);
    expect(fixed.work.glyphs[0].flow).toBe(w.glyphs[0].flow);
    expect(fixed.work.glyphs[0].initial.fontId).toBe("c");
    expect(repairFonts(fixed.work, fonts).work).toBe(fixed.work);
  });
  it("顺序回绕且不使用已停用或加载失败字体", () => {
    const fonts = [
      make("a", true),
      make("b", true, false),
      { ...make("c", true), status: "error" as const },
      make("d", false),
    ];
    const w = generate("天", defaults, () => ["d"], random);
    expect(repairFonts(w, fonts).work.glyphs[0].edit.fontId).toBe("a");
  });
  it("全部绘制失败时标记缺字，不静默使用系统字体", () => {
    const w = generate("天", defaults, () => ["a"], random);
    const fixed = repairFonts(w, [make("a", false)]);
    expect(fixed.work.glyphs[0].edit.fontId).toBeNull();
    expect(fixed.replacements).toBe(0);
    expect(repairFonts(fixed.work, [make("a", false)]).work).toBe(fixed.work);
  });
  it("已停用但正常显示的历史字体不改变，新上传字体可补字", () => {
    const w = generate("天", defaults, () => ["a"], random);
    expect(repairFonts(w, [make("a", true, false)]).work).toBe(w);
    const missing = generate("天", defaults, () => [], random);
    expect(
      repairFonts(missing, [make("b", true)]).work.glyphs[0].edit.fontId,
    ).toBe("b");
  });
  it("未检测字体不可当作显示成功", () =>
    expect(
      fontCanRender({ ...make("a", true), renders: undefined }, "天"),
    ).toBe(false));
});
it("实际像素探测区分空字形并缓存结果，缺字不触发绘制", () => {
  const fillText = vi.fn();
  let pixels = new Uint8ClampedArray(16);
  const ctx = {
    font: "",
    textBaseline: "",
    fillStyle: "",
    measureText: () => ({
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: 80,
      actualBoundingBoxAscent: 80,
      actualBoundingBoxDescent: 0,
    }),
    translate: () => {},
    scale: () => {},
    fillText,
    getImageData: () => ({ data: pixels }),
  };
  vi.stubGlobal("document", {
    createElement: () => ({ getContext: () => ctx }),
  });
  try {
    const probe = createGlyphProbe("test", (text) => text !== "缺");
    expect(probe("天")).toBe(false);
    expect(probe("天")).toBe(false);
    expect(fillText).toHaveBeenCalledTimes(1);
    pixels[3] = 128;
    expect(probe("地")).toBe(true);
    expect(probe("缺")).toBe(false);
    expect(fillText).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
  }
});
