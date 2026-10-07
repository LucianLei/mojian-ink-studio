import { test, expect } from "@playwright/test";
import fs from "node:fs";
test("逐字字体轮转、定格、跳过、增量输入及导出稳定", async ({ page }, info) => {
  await page.goto("/");
  const toggle = page.getByLabel("逐字字体动画", { exact: true });
  await toggle.uncheck();
  await expect(page.locator(".glyph-list button")).toHaveCount(24, {
    timeout: 60000,
  });
  await page.getByLabel("自动生成", { exact: true }).uncheck();
  await page.getByRole("button", { name: "规整", exact: true }).click();
  await page.getByLabel("书写内容", { exact: true }).fill("天地玄");
  await page.getByLabel("每字动画时长（毫秒）", { exact: true }).fill("600");
  await toggle.check();
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas")!;
    const original = canvas.getContext("2d")!.fillText;
    const ctx = canvas.getContext("2d")!;
    (window as any).inkFrames = [];
    ctx.fillText = function (text: string, ...args: any[]) {
      (window as any).inkFrames.push({ text, font: this.font });
      return Reflect.apply(original, this, [text, ...args]);
    };
  });
  await page.getByRole("button", { name: "生成字帖", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "字体生成动画状态" }),
  ).toContainText("「天」");
  await expect(
    page.getByRole("button", { name: "导出 PNG ↗", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("status", { name: "字体生成动画状态" }),
  ).toContainText("「地」");
  await expect(
    page.getByRole("status", { name: "字体生成动画状态" }),
  ).toContainText("「玄」");
  await expect(
    page.getByRole("status", { name: "字体生成动画状态" }),
  ).toHaveCount(0);
  const painted = await page.evaluate(
    () => (window as any).inkFrames as { text: string; font: string }[],
  );
  const firstAppearance = painted
    .filter((x) => ["天", "地", "玄"].includes(x.text))
    .map((x) => x.text);
  expect(firstAppearance.indexOf("天")).toBeLessThan(
    firstAppearance.indexOf("地"),
  );
  expect(firstAppearance.indexOf("地")).toBeLessThan(
    firstAppearance.indexOf("玄"),
  );
  expect(
    new Set(painted.filter((x) => x.text === "天").map((x) => x.font)).size,
  ).toBeGreaterThan(1);
  await page.getByRole("button", { name: "选择字符1天", exact: true }).click();
  const selected = await page
    .getByLabel("单字字体", { exact: true })
    .inputValue();
  await page.getByLabel("X 偏移", { exact: true }).fill("29");
  await page.getByLabel("自动生成", { exact: true }).check();
  await page.getByLabel("书写内容", { exact: true }).fill("天地玄黄");
  await expect(
    page.getByRole("status", { name: "字体生成动画状态" }),
  ).toContainText("「黄」");
  await expect(page.getByLabel("单字字体", { exact: true })).toHaveValue(
    selected,
  );
  await expect(page.getByLabel("X 偏移", { exact: true })).toHaveValue("29");
  await page.getByRole("button", { name: "跳过动画", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "字体生成动画状态" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "整体重新随机", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "字体生成动画状态" }),
  ).toBeVisible();
  await toggle.uncheck();
  await expect(
    page.getByRole("status", { name: "字体生成动画状态" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "导出 PNG ↗", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("输出倍率", { exact: true }).selectOption("1");
  async function download(name: string) {
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出 PNG ↗", exact: true }).click();
    const p = info.outputPath(name);
    await (await event).saveAs(p);
    return fs.readFileSync(p);
  }
  expect(
    (await download("定格后1.png")).equals(await download("定格后2.png")),
  ).toBe(true);
  await toggle.check();
  await page.getByLabel("每字动画时长（毫秒）", { exact: true }).fill("600");
  await page
    .getByLabel("书写内容", { exact: true })
    .fill("天地有大美而不言\n四时有明法而不议\n万物有成理而不说");
  await expect(
    page.getByRole("status", { name: "字体生成动画状态" }),
  ).toBeVisible();
  await page.locator(".left").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: info.outputPath("逐字字体动画.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "跳过动画", exact: true }).click();
});
