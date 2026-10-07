export type Settings = {
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  size: number;
  scale: number;
  gap: number;
  line: number;
  direction: "ltr" | "rtl" | "vertical";
  columns: "rtl" | "ltr";
  ink: string;
  paper: string;
  background: "solid" | "paper" | "transparent";
  grid: "none" | "square" | "rice";
  balance: boolean;
  balanceStrength: number;
  arrangement: "regular" | "free";
  looseness: number;
  sizeVariation: number;
  sizeVariationEnabled: boolean;
};
export type Edit = {
  fontId: string | null;
  size: number;
  scale: number;
  sx: number;
  sy: number;
  rotation: number;
  dx: number;
  dy: number;
  stroke: number;
};
export type Glyph = {
  id: string;
  text: string;
  edit: Edit;
  initial: Edit;
  sizeRoll: number;
  flow: {
    cross: number;
    along: number;
    gap: number;
    start: number;
    lean: number;
    phase: number;
    columnGap: number;
    rotation: number;
  };
};
export type Work = {
  glyphs: Glyph[];
  settings: Settings;
  source: string;
  baseSize: number;
};
export const defaults: Settings = {
  width: 1200,
  height: 1600,
  top: 120,
  right: 120,
  bottom: 120,
  left: 120,
  size: 90,
  scale: 1,
  gap: 18,
  line: 36,
  direction: "vertical",
  columns: "rtl",
  ink: "#242522",
  paper: "#f6f0e4",
  background: "paper",
  grid: "none",
  balance: true,
  balanceStrength: 0.75,
  arrangement: "free",
  looseness: 0.65,
  sizeVariation: 0.22,
  sizeVariationEnabled: true,
};
export function split(text: string) {
  return Array.from(
    new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(
      text.replace(/\r\n?/g, "\n"),
    ),
    (s) => s.segment,
  );
}
export const drawable = (s: string) => !/^\s+$/u.test(s);
export function pick<T>(items: T[], old?: T): T | undefined {
  const alternatives = items.filter((x) => x !== old);
  const pool = alternatives.length ? alternatives : items;
  return pool[Math.floor(Math.random() * pool.length)];
}
export type Slot = {
  glyph: Glyph;
  x: number;
  y: number;
  cell: number;
  baseX: number;
  baseY: number;
  rotation: number;
};
export function layout(work: Work): Slot[] {
  const s = work.settings,
    cell = s.size * s.scale,
    step = Math.max(1, cell + s.gap),
    cross = Math.max(1, cell + s.line);
  const strength = s.arrangement === "free" ? s.looseness : 0;
  const vertical = s.direction === "vertical",
    forward = vertical ? s.columns === "ltr" : s.direction === "ltr";
  const min = vertical ? s.top : s.left,
    max = vertical ? s.height - s.bottom : s.width - s.right;
  let along = min + cell / 2,
    across = vertical
      ? forward
        ? s.left + cell / 2
        : s.width - s.right - cell / 2
      : s.top + cell / 2;
  let lead: Glyph | undefined,
    index = 0;
  const slots: Slot[] = [];
  const newline = () => {
    along = min + cell / 2;
    across +=
      (vertical && !forward ? -1 : 1) *
      cross *
      (1 + (lead?.flow.columnGap ?? 0) * strength * 0.22);
    lead = undefined;
    index = 0;
  };
  for (const glyph of work.glyphs) {
    if (glyph.text === "\n") {
      newline();
      continue;
    }
    if (along + cell / 2 > max && index > 0) newline();
    if (!lead) {
      lead = glyph;
      along += lead.flow.start * cell * 0.42 * strength;
    }
    const baseAlong =
      vertical || forward ? along : s.width - s.right - (along - s.left);
    const drift =
      (glyph.flow.cross * 0.33 +
        lead.flow.cross * 0.15 +
        lead.flow.lean * index * 0.025 +
        Math.sin(index * 0.7 + lead.flow.phase) * 0.11) *
      cell *
      strength;
    const offset = glyph.flow.along * cell * 0.18 * strength;
    const baseX = vertical ? across : baseAlong,
      baseY = vertical ? baseAlong : across;
    slots.push({
      glyph,
      baseX,
      baseY,
      x: baseX + (vertical ? drift : offset),
      y: baseY + (vertical ? offset : drift),
      cell,
      rotation: glyph.flow.rotation * 12 * strength,
    });
    along += Math.max(
      1,
      step * (1 + glyph.flow.gap * strength * 0.36) +
        (glyph.initial.size / work.baseSize - 1) * cell * 0.16 * strength,
    );
    index++;
  }
  return slots;
}
export function generate(
  text: string,
  s: Settings,
  candidates: (text: string) => string[],
  random: RandomSettings,
): Work {
  return {
    source: text,
    baseSize: s.size,
    settings: s,
    glyphs: split(text).map((text) => {
      const roll = () => Math.random() * 2 - 1;
      const sizeRoll = roll();
      const flow = {
        cross: roll(),
        along: roll(),
        gap: roll(),
        start: roll(),
        lean: roll(),
        phase: Math.random() * Math.PI * 2,
        columnGap: roll(),
        rotation: random.rotation ? roll() : 0,
      };
      const edit: Edit = {
        fontId: drawable(text)
          ? ((random.font ? pick(candidates(text)) : candidates(text)[0]) ??
            null)
          : null,
        size:
          s.size *
          (random.size ? 1 + sizeRoll * (random.sizeAmount ?? 0.22) : 1),
        scale: 1,
        sx: 1,
        sy: 1,
        stroke: 0,
        rotation: random.rotation ? (Math.random() - 0.5) * 5 : 0,
        dx: random.offset ? (Math.random() - 0.5) * 8 : 0,
        dy: random.offset ? (Math.random() - 0.5) * 8 : 0,
      };
      return {
        id: crypto.randomUUID(),
        text,
        edit,
        initial: { ...edit },
        sizeRoll,
        flow,
      };
    }),
  };
}
export type History = { past: Work[]; present: Work; future: Work[] };
export function commit(h: History, next: Work): History {
  return { past: [...h.past.slice(-79), h.present], present: next, future: [] };
}
export function undo(h: History): History {
  return h.past.length
    ? {
        past: h.past.slice(0, -1),
        present: h.past.at(-1)!,
        future: [h.present, ...h.future],
      }
    : h;
}
export function redo(h: History): History {
  return h.future.length
    ? {
        past: [...h.past, h.present],
        present: h.future[0],
        future: h.future.slice(1),
      }
    : h;
}

export type RandomSettings = {
  font: boolean;
  size: boolean;
  offset: boolean;
  rotation: boolean;
  sizeAmount?: number;
};
export function processText(text: string, removeNewlines: boolean) {
  const normalized = text.replace(/\r\n?/g, "\n");
  return removeNewlines ? normalized.replace(/\n/g, "") : normalized;
}
export function removePunctuation(text: string) {
  return text.replace(/\p{P}/gu, "");
}
/** Reuse unchanged graphemes and their edits while typing; only new characters roll. */
export function updateText(
  previous: Work,
  text: string,
  candidates: (t: string) => string[],
  random: RandomSettings,
): Work {
  const fresh = generate(text, previous.settings, candidates, random);
  const old = previous.glyphs,
    next = fresh.glyphs;
  const matches = new Map<number, number>();
  let start = 0;
  while (
    start < old.length &&
    start < next.length &&
    old[start].text === next[start].text
  ) {
    matches.set(start, start);
    start++;
  }
  let a = old.length - 1,
    b = next.length - 1;
  while (a >= start && b >= start && old[a].text === next[b].text) {
    matches.set(b, a);
    a--;
    b--;
  }
  const n = a - start + 1,
    m = b - start + 1;
  if (n > 0 && m > 0 && n * m <= 1_000_000) {
    const cols = m + 1,
      dp = new Uint32Array((n + 1) * cols);
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i * cols + j] =
          old[start + i].text === next[start + j].text
            ? dp[(i + 1) * cols + j + 1] + 1
            : Math.max(dp[(i + 1) * cols + j], dp[i * cols + j + 1]);
    let i = 0,
      j = 0;
    while (i < n && j < m) {
      if (old[start + i].text === next[start + j].text) {
        matches.set(start + j, start + i);
        i++;
        j++;
      } else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) i++;
      else j++;
    }
  }
  return {
    ...fresh,
    baseSize: previous.baseSize,
    glyphs: next.map((g, i) => {
      const index = matches.get(i);
      if (index !== undefined) {
        const existing = old[index];
        if (drawable(existing.text) && !existing.edit.fontId && g.edit.fontId)
          return {
            ...existing,
            edit: { ...existing.edit, fontId: g.edit.fontId },
            initial: { ...existing.initial, fontId: g.edit.fontId },
          };
        return existing;
      }
      const edit = {
        ...g.edit,
        size: (g.edit.size * previous.baseSize) / fresh.baseSize,
      };
      return { ...g, edit, initial: { ...edit } };
    }),
  };
}

export function applySizeVariation(
  work: Work,
  enabled: boolean,
  amount: number,
): Work {
  return {
    ...work,
    settings: {
      ...work.settings,
      sizeVariation: amount,
      sizeVariationEnabled: enabled,
    },
    glyphs: work.glyphs.map((g) => {
      const size = work.baseSize * (enabled ? 1 + g.sizeRoll * amount : 1);
      return {
        ...g,
        initial: { ...g.initial, size },
        edit: { ...g.edit, size: (size * g.edit.size) / g.initial.size },
      };
    }),
  };
}
