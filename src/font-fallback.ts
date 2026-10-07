import { drawable, type Work } from "./model";
import { fontCanRender, type LocalFont } from "./fonts";
/** Resolve font failures once in state, without rerolling size, layout or edits. */
export function repairFonts(work: Work, fonts: LocalFont[]) {
  let replacements = 0,
    changed = false;
  const pool = fonts.filter((f) => f.enabled && f.status === "ready");
  const glyphs = work.glyphs.map((g) => {
    if (!drawable(g.text)) return g;
    const current = fonts.find((f) => f.id === g.edit.fontId);
    if (current && fontCanRender(current, g.text)) return g;
    // Try the next font in management order and wrap around, skipping failures.
    const index = pool.findIndex((f) => f.id === g.edit.fontId);
    const ordered =
      index < 0
        ? pool
        : [...pool.slice(index + 1), ...pool.slice(0, index + 1)];
    const replacement = ordered.find((f) => fontCanRender(f, g.text));
    const fontId = replacement?.id ?? null;
    if (fontId === g.edit.fontId) return g;
    changed = true;
    if (replacement) replacements++;
    return {
      ...g,
      edit: { ...g.edit, fontId },
      initial:
        g.initial.fontId === g.edit.fontId
          ? { ...g.initial, fontId }
          : g.initial,
    };
  });
  return { work: changed ? { ...work, glyphs } : work, replacements };
}
