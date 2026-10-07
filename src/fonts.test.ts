import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { cmapCoverage, firstCollectionFace } from "./fonts";
const read = (name: string) => {
  const b = readFileSync(new URL("../public/fonts/" + name, import.meta.url));
  return b.buffer.slice(
    b.byteOffset,
    b.byteOffset + b.byteLength,
  ) as ArrayBuffer;
};
it("真实字体 cmap 覆盖中文，排除不存在码位", () => {
  const covers = cmapCoverage(read("font-1.ttf"));
  expect(covers("天地")).toBe(true);
  expect(covers("\u{10ffff}")).toBe(false);
  expect(covers("天\u{10ffff}")).toBe(false);
});
it("TTC 提取保留第一字体字符覆盖与正确整体校验和", () => {
  const raw = read("font-4.ttc"),
    single = firstCollectionFace(raw);
  expect(new DataView(single).getUint32(0)).toBe(0x00010000);
  expect(cmapCoverage(single)("天地")).toBe(cmapCoverage(raw)("天地"));
  const v = new DataView(single);
  let sum = 0;
  for (let i = 0; i < single.byteLength; i += 4)
    sum = (sum + v.getUint32(i)) >>> 0;
  expect(sum).toBe(0xb1b0afba);
});
it("损坏字体明确抛出异常", () =>
  expect(() => cmapCoverage(new ArrayBuffer(4))).toThrow());
