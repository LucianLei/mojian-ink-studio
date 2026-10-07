import { it, expect, vi } from "vitest";
import { defaults, generate } from "./model";
import { planAnimation, animationFrame } from "./generation-animation";
import type { LocalFont } from "./fonts";
const font = (id: string, visible = true): LocalFont => ({
  id,
  name: id,
  family: id,
  status: "ready",
  enabled: true,
  covers: () => true,
  renders: () => visible,
});
it("一次只轮转当前字，下一字等待，最后保存的字体定格", () => {
  const w = generate("天地\n玄", defaults, () => ["b"], {
    font: false,
    size: false,
    rotation: false,
    offset: false,
  });
  const plan = planAnimation(
    w,
    [font("a"), font("b"), font("empty", false)],
    new Set(w.glyphs.map((g) => g.id)),
    200,
  );
  expect(plan.ids).toHaveLength(3);
  expect(plan.pools[0]).toEqual(["a", "b"]);
  const first = animationFrame(plan, 0);
  expect(first.presentation?.hiddenIds.size).toBe(2);
  expect(first.presentation?.fontOverrides.get(plan.ids[0])).toBe("a");
  expect(
    animationFrame(plan, 40).presentation?.fontOverrides.get(plan.ids[0]),
  ).toBe("b");
  expect(
    animationFrame(plan, 170).presentation?.fontOverrides.get(plan.ids[0]),
  ).toBe("b");
  const second = animationFrame(plan, 200);
  expect(second.activeText).toBe("地");
  expect(second.completed).toBe(1);
  expect(second.presentation?.hiddenIds.has(plan.ids[0])).toBe(false);
  expect(second.presentation?.hiddenIds.has(plan.ids[2])).toBe(true);
  expect(animationFrame(plan, 600)).toMatchObject({
    playing: false,
    completed: 3,
    total: 3,
  });
  expect(animationFrame(plan, 600).presentation).toBeUndefined();
});
it("动画时间变化不重新随机、不修改精修和最终状态", () => {
  const w = generate("天", defaults, () => ["b"], {
    font: false,
    size: true,
    rotation: true,
    offset: true,
  });
  w.glyphs[0].edit.dx = 38;
  const before = structuredClone(w);
  const plan = planAnimation(
    w,
    [font("a"), font("b")],
    new Set(w.glyphs.map((g) => g.id)),
    220,
  );
  const spy = vi.spyOn(Math, "random");
  for (let i = 0; i < 500; i += 20) animationFrame(plan, i);
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
  expect(w).toEqual(before);
});
it("空内容、没有可用字体、仅新增字符都可正常结束", () => {
  const w = generate("天𠮷", defaults, (t) => (t === "天" ? ["a"] : []), {
    font: false,
    size: false,
    rotation: false,
    offset: false,
  });
  const plan = planAnimation(
    w,
    [{ ...font("a"), covers: (text) => text === "天" }],
    new Set([w.glyphs[1].id]),
    80,
  );
  expect(
    animationFrame(plan, 0).presentation?.fontOverrides.get(w.glyphs[1].id),
  ).toBeNull();
  expect(animationFrame(plan, 80).playing).toBe(false);
  expect(animationFrame(planAnimation(w, [], new Set(), 220), 0).playing).toBe(
    false,
  );
});
