import { useEffect, useRef, useState, useCallback } from "react";
import { drawable, type Work } from "./model";
import type { LocalFont } from "./fonts";
import {
  planAnimation,
  animationFrame,
  type AnimationFrame,
} from "./generation-animation";
const idle: AnimationFrame = {
  playing: false,
  completed: 0,
  total: 0,
  activeText: "",
  key: "done",
};
export function useGenerationAnimation(
  work: Work,
  fonts: LocalFont[],
  enabled: boolean,
  milliseconds: number,
  trigger: number,
) {
  const [frame, setFrame] = useState<AnimationFrame>(idle),
    raf = useRef(0),
    previous = useRef<{ trigger: number; ids: Set<string> }>({
      trigger: -1,
      ids: new Set(),
    });
  const latest = useRef({ work, fonts });
  latest.current = { work, fonts };
  const signature = work.source + "#" + work.glyphs.map((g) => g.id).join(",");
  const fontKey = fonts
    .map((f) => `${f.id}:${f.enabled}:${f.status}`)
    .join(",");
  const skip = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setFrame(idle);
  }, []);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const { work, fonts } = latest.current,
      force = previous.current.trigger !== trigger;
    const targets = new Set(
      work.glyphs
        .filter(
          (g) => drawable(g.text) && (force || !previous.current.ids.has(g.id)),
        )
        .map((g) => g.id),
    );
    previous.current = { trigger, ids: new Set(work.glyphs.map((g) => g.id)) };
    if (!enabled || !targets.size) {
      setFrame(idle);
      return;
    }
    const plan = planAnimation(work, fonts, targets, milliseconds),
      start = performance.now();
    let key = "";
    const tick = (now: number) => {
      const next = animationFrame(plan, now - start);
      if (next.key !== key) {
        key = next.key;
        setFrame(next);
      }
      if (next.playing) raf.current = requestAnimationFrame(tick);
    };
    tick(start);
    return () => cancelAnimationFrame(raf.current);
    // Work parameter edits are read by the renderer without starting a new roll.
  }, [signature, fontKey, enabled, trigger]);
  return { ...frame, skip };
}
