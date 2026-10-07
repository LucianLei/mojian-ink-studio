import { describe, it, expect, vi } from "vitest";
import {
  defaults,
  generate,
  layout,
  updateText,
  processText,
  removePunctuation,
  applySizeVariation,
} from "./model";
import { appearanceFromSamples } from "./appearance";
const random = {
  font: true,
  size: true,
  offset: true,
  rotation: true,
  sizeAmount: 0.22,
};
const fonts = () => ["a", "b"];
describe("自动更新与过滤", () => {
  it("Unicode 标点过滤保留字素与空白", () => {
    expect(removePunctuation("𠮷，á！\n「天地」—…")).toBe("𠮷á\n天地");
    expect(processText("天\r\n地\r玄\n黄", true)).toBe("天地玄黄");
    expect(processText("天\r\n地", false)).toBe("天\n地");
  });
  it("插入、删除文字保留原字符 ID 与精修", () => {
    const w = generate("天地玄黄", defaults, fonts, random);
    w.glyphs[2].edit.dx = 31;
    w.glyphs[2].edit.stroke = 1.3;
    const next = updateText(w, "天地人玄黄", fonts, random);
    expect(next.glyphs[3]).toBe(w.glyphs[2]);
    expect(next.glyphs[0].id).toBe(w.glyphs[0].id);
    const removed = updateText(next, "地人玄", fonts, random);
    expect(removed.glyphs[2]).toBe(w.glyphs[2]);
  });
  it("全局字号变更后插入字符使用相同比例基准", () => {
    const w = generate("天", defaults, fonts, { ...random, size: false });
    w.settings = { ...defaults, size: 180 };
    const next = updateText(w, "天地", fonts, { ...random, size: false });
    expect(next.baseSize).toBe(90);
    expect(next.glyphs[1].edit.size).toBe(90);
  });
  it("新字体可以补上缺字并保留用户偏移", () => {
    const w = generate("天", defaults, () => [], random);
    w.glyphs[0].edit.dx = 48;
    const next = updateText(w, "天", () => ["a"], random);
    expect(next.glyphs[0].id).toBe(w.glyphs[0].id);
    expect(next.glyphs[0].edit.dx).toBe(48);
    expect(next.glyphs[0].edit.fontId).toBe("a");
  });
});
describe("视觉与随机控制", () => {
  it("细字补强，粗字不侵蚀，缩放和粗细保持有限", () => {
    const thin = appearanceFromSamples([
      { extent: 0.6, density: 0.1, edgeRatio: 0.2 },
    ]);
    const bold = appearanceFromSamples([
      { extent: 1.2, density: 0.4, edgeRatio: 0.2 },
    ]);
    expect(thin.stroke).toBeGreaterThan(0);
    expect(bold.stroke).toBe(0);
    expect(thin.scale).toBe(1.24);
    expect(bold.scale).toBe(0.78);
    expect(appearanceFromSamples([])).toEqual({
      scale: 1,
      stroke: 0,
      density: 0,
    });
  });
  it("变化幅度不重新抽样，保留手动大小比例与字体偏移", () => {
    const w = generate("天地", defaults, fonts, random);
    w.glyphs[0].edit.size = w.glyphs[0].initial.size * 1.3;
    w.glyphs[0].edit.dx = 29;
    const next = applySizeVariation(w, true, 0.45);
    expect(next.glyphs[0].edit.size / next.glyphs[0].initial.size).toBeCloseTo(
      1.3,
    );
    expect(next.glyphs[0].sizeRoll).toBe(w.glyphs[0].sizeRoll);
    expect(next.glyphs[0].edit.fontId).toBe(w.glyphs[0].edit.fontId);
    expect(next.glyphs[0].edit.dx).toBe(29);
    const flat = applySizeVariation(next, false, 0.45);
    expect(flat.glyphs[1].edit.size).toBe(90);
  });
  it.each(["ltr", "rtl", "vertical"] as const)(
    "%s 自由章法稳定且能调回规则槽位",
    (direction) => {
      const w = generate(
        "天地玄黄宇宙\n洪荒日月盈昃",
        { ...defaults, direction },
        fonts,
        random,
      );
      const first = layout(w);
      expect(layout(w)).toEqual(first);
      const regular = layout({
        ...w,
        settings: { ...w.settings, arrangement: "regular" },
      });
      expect(first.map((p) => [p.x, p.y])).not.toEqual(
        regular.map((p) => [p.x, p.y]),
      );
      expect(
        regular.every(
          (p) => p.rotation === 0 && p.x === p.baseX && p.y === p.baseY,
        ),
      ).toBe(true);
      const stronger = layout({
        ...w,
        settings: { ...w.settings, looseness: 1 },
      });
      expect(stronger.map((p) => [p.x, p.y])).not.toEqual(
        first.map((p) => [p.x, p.y]),
      );
      expect(w.glyphs[0].edit).toEqual(first[0].glyph.edit);
    },
  );
  it("排版与强度调节不调用随机数", () => {
    const w = generate("天地玄黄", defaults, fonts, random);
    const spy = vi.spyOn(Math, "random");
    layout(w);
    layout({ ...w, settings: { ...w.settings, looseness: 0.9 } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
