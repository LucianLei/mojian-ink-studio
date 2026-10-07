import { test, expect } from "@playwright/test";
import fs from "node:fs";
// Disposable in-memory fixture: a valid loaded font maps 天 to its blank space glyph.
// This reproduces a cmap false positive rather than only mocking a failed API call.
function blankGlyphFixture() {
  const data = fs.readFileSync("public/fonts/font-1.ttf");
  const tables = [];
  let cmap = 0,
    head = 0;
  for (let i = 0; i < data.readUInt16BE(4); i++) {
    const p = 12 + i * 16,
      tag = data.toString("ascii", p, p + 4),
      offset = data.readUInt32BE(p + 8),
      length = data.readUInt32BE(p + 12);
    tables.push({ p, offset, length });
    if (tag === "cmap") cmap = offset;
    if (tag === "head") head = offset;
  }
  const seen = new Set<number>();
  for (let i = 0; i < data.readUInt16BE(cmap + 2); i++) {
    const p = cmap + data.readUInt32BE(cmap + 8 + i * 8);
    if (seen.has(p) || data.readUInt16BE(p) !== 4) continue;
    seen.add(p);
    const n = data.readUInt16BE(p + 6) / 2,
      end = p + 14,
      start = end + n * 2 + 2,
      delta = start + n * 2,
      range = delta + n * 2;
    for (let j = 0; j < n; j++) {
      const lo = data.readUInt16BE(start + j * 2),
        hi = data.readUInt16BE(end + j * 2);
      if (lo <= 0x5929 && 0x5929 <= hi) {
        const r = data.readUInt16BE(range + j * 2);
        if (r)
          data.writeUInt16BE(
            (3 - data.readInt16BE(delta + j * 2)) & 65535,
            range + j * 2 + r + (0x5929 - lo) * 2,
          );
        else data.writeUInt16BE((3 - 0x5929) & 65535, delta + j * 2);
        break;
      }
    }
  }
  data.writeUInt32BE(0, head + 8);
  for (const { p, offset, length } of tables) {
    let sum = 0;
    for (let j = 0; j < length; j += 4) {
      let word = 0;
      for (let k = 0; k < 4; k++)
        word = (word * 256 + (j + k < length ? data[offset + j + k] : 0)) >>> 0;
      sum = (sum + word) >>> 0;
    }
    data.writeUInt32BE(sum, p + 4);
  }
  let sum = 0;
  for (let i = 0; i < data.length; i += 4)
    sum = (sum + data.readUInt32BE(i)) >>> 0;
  data.writeUInt32BE((0xb1b0afba - sum) >>> 0, head + 8);
  return data;
}
test("真实加载但空字形检测，以及界面自动替换和全部失败提示", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel("逐字字体动画", { exact: true }).uncheck();
  await expect(page.locator(".glyph-list button")).toHaveCount(24, {
    timeout: 60000,
  });
  const buffer = blankGlyphFixture();
  const result = await page.evaluate(async (base64) => {
    const { loadFont, fontCanRender } = await import("/src/fonts.ts");
    const { generate, defaults } = await import("/src/model.ts");
    const { repairFonts } = await import("/src/font-fallback.ts");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    let font: any;
    await loadFont(new File([bytes], "空字形测试.ttf"), (f) => (font = f));
    const supported = font.covers("天"),
      visible = fontCanRender(font, "天");
    const old = generate("天", defaults, () => [font.id], {
      font: false,
      size: false,
      rotation: false,
      offset: false,
    });
    const good = { ...font, id: "good", renders: () => true };
    const next = repairFonts(old, [font, good]);
    if (font.face) document.fonts.delete(font.face);
    return {
      status: font.status,
      supported,
      visible,
      replacement: next.work.glyphs[0].edit.fontId,
    };
  }, buffer.toString("base64"));
  expect(result).toEqual({
    status: "ready",
    supported: true,
    visible: false,
    replacement: "good",
  });
  await page
    .getByLabel("上传字体", { exact: true })
    .setInputFiles({ name: "空字形测试.ttf", mimeType: "font/ttf", buffer });
  await expect(
    page
      .locator(".font-card")
      .filter({ hasText: "空字形测试.ttf" })
      .locator(".status"),
  ).toHaveText("已加载");
  await page.getByLabel("书写内容", { exact: true }).fill("天");
  await expect(page.locator(".glyph-list button")).toHaveCount(1);
  await page.getByRole("button", { name: "选择字符1天", exact: true }).click();
  const select = page.getByLabel("单字字体", { exact: true });
  await expect(
    select.locator("option").filter({ hasText: "空字形测试.ttf" }),
  ).toHaveCount(0);
  await page.getByLabel("X 偏移", { exact: true }).fill("38");
  await page.getByLabel("单字加粗", { exact: true }).fill("1.4");
  const original = await select.inputValue(),
    name = (await select.locator("option:checked").textContent())!;
  await page.getByRole("button", { name: `删除${name}`, exact: true }).click();
  await expect(select).not.toHaveValue(original);
  await expect(page.getByRole("status")).toContainText("已自动换用");
  await expect(page.getByLabel("X 偏移", { exact: true })).toHaveValue("38");
  await expect(page.getByLabel("单字加粗", { exact: true })).toHaveValue("1.4");
  const names = await page
    .locator(".font-card")
    .filter({ has: page.locator(".status").filter({ hasText: "已加载" }) })
    .locator("b")
    .allTextContents();
  for (const n of names)
    if (n !== "空字形测试.ttf")
      await page.getByRole("button", { name: `删除${n}`, exact: true }).click();
  await expect(select).toHaveValue("");
  await expect(page.getByRole("status")).toContainText("缺少可用字形");
  await page.screenshot({
    path: info.outputPath("全部字体无法显示提示.png"),
    fullPage: true,
  });
});
