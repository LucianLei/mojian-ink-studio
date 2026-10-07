/** Estimate a font once after loading; rendering stays vector-based and sharp. */
export type FontAppearance = { scale: number; stroke: number; density: number };
const median = (values: number[]) =>
  values.length
    ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
    : 0;
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export function appearanceFromSamples(
  samples: { extent: number; density: number; edgeRatio: number }[],
): FontAppearance {
  if (!samples.length) return { scale: 1, stroke: 0, density: 0 };
  const extent = median(samples.map((s) => s.extent)),
    density = median(samples.map((s) => s.density));
  // A small contour stroke helps lighter fonts. Never erode an original outline.
  const stroke = median(
    samples.map((s) =>
      clamp((2 * (0.23 - s.density)) / Math.max(0.01, s.edgeRatio), 0, 1.8),
    ),
  );
  return { scale: clamp(0.86 / extent, 0.78, 1.24), stroke, density };
}
export function measureAppearance(
  family: string,
  covers: (t: string) => boolean,
): FontAppearance {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 180;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const samples = [];
  for (const char of Array.from("天地山水永月清风人心明和")) {
    if (!covers(char)) continue;
    ctx.clearRect(0, 0, 180, 180);
    ctx.font = `100px "${family}"`;
    ctx.textBaseline = "alphabetic";
    const m = ctx.measureText(char),
      w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
      h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    if (w < 8 || h < 8) continue;
    ctx.fillText(
      char,
      90 + (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2,
      90 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2,
    );
    const data = ctx.getImageData(0, 0, 180, 180).data;
    let ink = 0,
      edges = 0;
    const filled = (x: number, y: number) => data[(y * 180 + x) * 4 + 3] > 80;
    for (let y = 1; y < 179; y++)
      for (let x = 1; x < 179; x++) {
        ink += data[(y * 180 + x) * 4 + 3] / 255;
        if (filled(x, y))
          edges +=
            Number(!filled(x - 1, y)) +
            Number(!filled(x + 1, y)) +
            Number(!filled(x, y - 1)) +
            Number(!filled(x, y + 1));
      }
    samples.push({
      extent: Math.max(w, h) / 100,
      density: ink / (w * h),
      edgeRatio: edges / (w * h),
    });
  }
  return appearanceFromSamples(samples);
}
