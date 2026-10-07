import { describe, it, expect } from "vitest";
import {
  defaults as originalDefaults,
  generate,
  split,
  layout,
  pick,
  commit,
  undo,
  redo,
  type History,
} from "./model";
import { hit, clipped } from "./render";
const defaults = { ...originalDefaults, arrangement: "regular" as const };
const random = { font: false, size: false, offset: false, rotation: false };
describe("字素簇与字体分配", () => {
  it("保留扩展汉字、组合字和 emoji", () =>
    expect(split("𠮷a\u0301👩‍👧\n")).toEqual(["𠮷", "á", "👩‍👧", "\n"]));
  it("缺字不用系统字体且稳定保存随机结果", () => {
    const w = generate(
      "天地𠮷",
      defaults,
      (t) => (t === "𠮷" ? [] : ["a"]),
      random,
    );
    expect(w.glyphs.map((g) => g.edit.fontId)).toEqual(["a", "a", null]);
    expect(new Set(w.glyphs.map((g) => g.id)).size).toBe(3);
    expect(layout(w)[0].glyph.edit).toEqual(w.glyphs[0].edit);
  });
  it("存在其他字体时保证更换", () => {
    for (let i = 0; i < 100; i++) expect(pick(["a", "b"], "a")).toBe("b");
  });
});
describe("基础排版", () => {
  it.each(["ltr", "rtl", "vertical"] as const)(
    "%s 保留换行并自动换行",
    (direction) => {
      const w = generate(
        "天地玄黃\n宇宙",
        {
          ...defaults,
          width: 260,
          height: 260,
          left: 20,
          right: 20,
          top: 20,
          bottom: 20,
          size: 80,
          gap: 10,
          line: 15,
          direction,
        },
        () => ["a"],
        random,
      );
      const p = layout(w);
      expect(p).toHaveLength(6);
      if (direction === "vertical") {
        expect(p[1].y).toBeGreaterThan(p[0].y);
        expect(p[2].x).toBeLessThan(p[1].x);
        expect(p[4].x).toBeLessThan(p[3].x);
      } else {
        expect(p[1].x - p[0].x).toBe(direction === "ltr" ? 90 : -90);
        expect(p[2].y).toBeGreaterThan(p[1].y);
        expect(p[4].y).toBeGreaterThan(p[3].y);
      }
    },
  );
  it("改变全局参数保留单字编辑和 ID", () => {
    const w = generate("天地", defaults, () => ["a"], random);
    w.glyphs[0].edit.dx = 47;
    w.glyphs[0].edit.rotation = 8;
    const next = {
      ...w,
      settings: { ...w.settings, size: 130, direction: "ltr" as const },
    };
    expect(layout(next)[0].glyph).toEqual(w.glyphs[0]);
    expect(layout(next)[0].x).not.toBe(layout(w)[0].x);
  });
});
describe("撤销、重做与命中", () => {
  it("维护完整作品快照与分支", () => {
    const w = generate("天", defaults, () => ["a"], random);
    let h: History = { past: [], present: w, future: [] };
    const moved = {
      ...w,
      glyphs: w.glyphs.map((g) => ({ ...g, edit: { ...g.edit, dx: 22 } })),
    };
    h = commit(h, moved);
    expect(undo(h).present.glyphs[0].edit.dx).toBe(0);
    expect(redo(undo(h)).present.glyphs[0].edit.dx).toBe(22);
    expect(commit(undo(h), w).future).toHaveLength(0);
  });
  it("旋转逆变换和最上层优先", () => {
    const slot = layout(generate("天", defaults, () => ["a"], random))[0];
    const b = {
      slot,
      cx: 100,
      cy: 100,
      w: 80,
      h: 20,
      rotation: 90,
      missing: false,
    };
    expect(hit([b], 100, 135)).toBe(b);
    expect(hit([b], 135, 100)).toBeUndefined();
    const top = { ...b };
    expect(hit([b, top], 100, 100)).toBe(top);
    expect(clipped({ ...b, cx: 0 }, defaults)).toBe(true);
  });
});
