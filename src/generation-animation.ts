import { drawable, type Work } from "./model";
import { fontCanRender, type LocalFont } from "./fonts";
export type Presentation = {
  hiddenIds: Set<string>;
  fontOverrides: Map<string, string | null>;
};
export type AnimationPlan = {
  ids: string[];
  texts: string[];
  pools: string[][];
  finalFonts: (string | null)[];
  milliseconds: number;
};
export type AnimationFrame = {
  presentation?: Presentation;
  playing: boolean;
  completed: number;
  total: number;
  activeText: string;
  key: string;
};
export function planAnimation(
  work: Work,
  fonts: LocalFont[],
  ids: Set<string>,
  milliseconds: number,
): AnimationPlan {
  const glyphs = work.glyphs.filter((g) => drawable(g.text) && ids.has(g.id));
  return {
    ids: glyphs.map((g) => g.id),
    texts: glyphs.map((g) => g.text),
    finalFonts: glyphs.map((g) => g.edit.fontId),
    pools: glyphs.map((g) =>
      fonts
        .filter((f) => f.enabled && fontCanRender(f, g.text))
        .map((f) => f.id),
    ),
    milliseconds: Math.max(80, milliseconds),
  };
}
export function animationFrame(
  plan: AnimationPlan,
  elapsed: number,
): AnimationFrame {
  const total = plan.ids.length,
    index = Math.max(0, Math.floor(elapsed / plan.milliseconds));
  if (index >= total)
    return {
      playing: false,
      completed: total,
      total,
      activeText: "",
      key: "done",
    };
  const local = Math.max(0, elapsed) % plan.milliseconds,
    pool = plan.pools[index];
  const font =
    local >= plan.milliseconds - 40 || !pool.length
      ? plan.finalFonts[index]
      : pool[(index + Math.floor(local / 40)) % pool.length];
  return {
    playing: true,
    completed: index,
    total,
    activeText: plan.texts[index],
    key: `${index}:${font}`,
    presentation: {
      hiddenIds: new Set(plan.ids.slice(index + 1)),
      fontOverrides: new Map([[plan.ids[index], font]]),
    },
  };
}
