import { test, expect } from "@playwright/test";
import fs from "node:fs";
test("真实字体、编辑、排版、导出完整流程", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("逐字字体动画", { exact: true }).uncheck();
  await expect(
    page.getByRole("button", { name: "生成字帖", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(page.locator(".font-card")).toHaveCount(9, { timeout: 60000 });
  await expect(
    page.locator(".status").filter({ hasText: "加载中" }),
  ).toHaveCount(0, { timeout: 60000 });
  await page.getByLabel("自动生成", { exact: true }).uncheck();
  await page.getByRole("button", { name: "规整", exact: true }).click();
  const loaded = await page.locator(".status").allTextContents();
  testInfo.annotations.push({
    type: "实际字体加载",
    description: loaded.join("；"),
  });
  expect(loaded.filter((x) => x === "已加载").length).toBeGreaterThan(0);
  await page.getByLabel("上传字体", { exact: true }).setInputFiles([
    {
      name: "损坏字体.ttf",
      mimeType: "font/ttf",
      buffer: Buffer.from("invalid font"),
    },
  ]);
  await expect(
    page.locator(".failed").filter({ hasText: "损坏字体.ttf" }),
  ).toHaveCount(1);
  await expect(
    page
      .locator(".failed")
      .filter({ hasText: "损坏字体.ttf" })
      .locator("input"),
  ).toBeDisabled();
  await page
    .getByLabel("上传字体", { exact: true })
    .setInputFiles(["public/fonts/font-1.ttf", "public/fonts/font-3.ttf"]);
  await expect(page.locator(".font-card")).toHaveCount(12);
  await expect(
    page.locator(".status").filter({ hasText: "加载中" }),
  ).toHaveCount(0);
  await page
    .getByLabel("书写内容", { exact: true })
    .fill("天地玄黃\n宇宙洪荒，。\n𠮷\u{10ffff}");
  await page.getByRole("button", { name: "生成字帖", exact: true }).click();
  await expect(page.locator(".glyph-list button")).toHaveCount(12);
  await expect(page.getByRole("status")).toContainText("缺少可用字形");
  for (const direction of ["ltr", "rtl", "vertical"]) {
    await page.getByLabel("书写方向", { exact: true }).selectOption(direction);
    await expect(page.getByLabel("书写方向", { exact: true })).toHaveValue(
      direction,
    );
  }
  await page.getByRole("button", { name: "选择字符1天", exact: true }).click();
  const fontSelect = page.getByLabel("单字字体", { exact: true });
  const old = await fontSelect.inputValue();
  await page
    .getByRole("button", { name: "随机换一种字体", exact: true })
    .click();
  expect(await fontSelect.inputValue()).not.toBe(old);
  await page.getByLabel("X 偏移", { exact: true }).fill("35");
  await page.getByLabel("默认字号", { exact: true }).fill("100");
  await expect(page.getByLabel("X 偏移", { exact: true })).toHaveValue("35");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.getByLabel("默认字号", { exact: true })).toHaveValue("90");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(page.getByLabel("默认字号", { exact: true })).toHaveValue("100");
  await page.getByLabel("书写内容", { exact: true }).fill("天地");
  await expect(page.locator(".glyph-list button")).toHaveCount(12);
  await page.getByRole("button", { name: "生成字帖", exact: true }).click();
  await page.getByLabel("随机字体", { exact: true }).check();
  await page.getByLabel("预览缩放", { exact: true }).fill("0.35");
  const canvas = page.getByLabel("书法作品画布"),
    rect = (await canvas.boundingBox())!; // vertical first slot: (1035,165), including randomized offsets
  await page.mouse.click(rect.x + 1035 * 0.35, rect.y + 165 * 0.35);
  await expect(page.locator(".glyph-list button.active")).toHaveText("天");
  const dx = +(await page.getByLabel("X 偏移", { exact: true }).inputValue());
  await page.mouse.move(rect.x + 1035 * 0.35, rect.y + 165 * 0.35);
  await page.mouse.down();
  await page.mouse.move(rect.x + 1035 * 0.35 + 14, rect.y + 165 * 0.35 + 7, {
    steps: 4,
  });
  await page.mouse.up();
  expect(
    +(await page.getByLabel("X 偏移", { exact: true }).inputValue()),
  ).toBeCloseTo(dx + 40, 0);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect(
    +(await page.getByLabel("X 偏移", { exact: true }).inputValue()),
  ).toBeCloseTo(dx, 0);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await canvas.click({ position: { x: 1035 * 0.35 + 14, y: 165 * 0.35 + 7 } });
  const before = +(await page
    .getByLabel("X 偏移", { exact: true })
    .inputValue());
  await page.keyboard.press("Shift+ArrowRight");
  expect(
    +(await page.getByLabel("X 偏移", { exact: true }).inputValue()),
  ).toBeCloseTo(before + 10, 0);
  await page.getByLabel("书写内容", { exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  expect(
    +(await page.getByLabel("X 偏移", { exact: true }).inputValue()),
  ).toBeCloseTo(before + 10, 0);
  await page.getByLabel("输出倍率", { exact: true }).selectOption("2");
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 PNG ↗", exact: true }).click();
  const file = await dl;
  const p = testInfo.outputPath("作品2x.png");
  await file.saveAs(p);
  const data = fs.readFileSync(p);
  expect(data.readUInt32BE(16)).toBe(2400);
  expect(data.readUInt32BE(20)).toBe(3200);
  expect(file.suggestedFilename()).toContain("书法字帖");
  await page.getByLabel("背景", { exact: true }).selectOption("transparent");
  await page.getByLabel("辅助线", { exact: true }).selectOption("rice");
  await page.getByLabel("输出倍率", { exact: true }).selectOption("4");
  const dl2 = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 PNG ↗", exact: true }).click();
  const p2 = testInfo.outputPath("透明4x.png");
  await (await dl2).saveAs(p2);
  const d2 = fs.readFileSync(p2);
  expect(d2.readUInt32BE(16)).toBe(4800);
  expect(d2.readUInt32BE(20)).toBe(6400);
  const alpha = await page.evaluate(async (base64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + base64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, 1, 1).data[3];
  }, d2.toString("base64"));
  expect(alpha).toBe(0);
  await page.getByLabel("输出倍率", { exact: true }).selectOption("custom");
  await page.getByLabel("导出宽度", { exact: true }).fill("16384");
  await page.getByLabel("导出高度", { exact: true }).fill("16384");
  await page.getByRole("button", { name: "导出 PNG ↗", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("导出限制");
  await page.getByLabel("输出倍率", { exact: true }).selectOption("2");
  await page.getByLabel("背景", { exact: true }).selectOption("paper");
  await page.getByLabel("辅助线", { exact: true }).selectOption("none");
  await page
    .getByLabel("书写内容", { exact: true })
    .fill("天地有大美而不言\n四时有明法而不议\n万物有成理而不说");
  await page.getByRole("button", { name: "生成字帖", exact: true }).click();
  await page.getByRole("button", { name: "自然", exact: true }).click();
  await page.getByRole("button", { name: "适应窗口", exact: true }).click();
  await page.locator(".right").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: testInfo.outputPath("界面.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
