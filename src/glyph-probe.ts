/** cmap coverage alone does not guarantee that an outline actually paints pixels. */
export function createGlyphProbe(
  family: string,
  covers: (text: string) => boolean,
) {
  const cache = new Map<string, boolean>();
  let canvas: HTMLCanvasElement | undefined;
  return (text: string): boolean => {
    if (!covers(text)) return false;
    const saved = cache.get(text);
    if (saved !== undefined) return saved;
    let visible = false;
    try {
      canvas ??= document.createElement("canvas");
      canvas.width = canvas.height = 160;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw Error("Canvas unavailable");
      ctx.font = `100px "${family}"`;
      ctx.textBaseline = "alphabetic";
      const m = ctx.measureText(text),
        w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
        h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      if (Number.isFinite(w + h) && w > 0 && h > 0) {
        const scale = Math.min(1, 136 / Math.max(w, h));
        ctx.translate(80, 80);
        ctx.scale(scale, scale);
        ctx.fillStyle = "#000";
        ctx.fillText(
          text,
          (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2,
          (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2,
        );
        const pixels = ctx.getImageData(0, 0, 160, 160).data;
        for (let i = 3; i < pixels.length; i += 4) {
          if (pixels[i] > 0) {
            visible = true;
            break;
          }
        }
      }
    } catch {
      visible = false;
    }
    if (cache.size >= 4096) cache.clear();
    cache.set(text, visible);
    return visible;
  };
}
