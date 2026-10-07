import { test, expect } from "@playwright/test";
import fs from "node:fs";
test("自动生成、精修保留、格式过滤、视觉协调与自由章法", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("逐字字体动画", { exact: true }).uncheck();
  await expect(page.locator(".glyph-list button")).toHaveCount(24, {
    timeout: 60000,
  });
  await page.getByRole("button", { name: "规整", exact: true }).click();
  const input = page.getByLabel("书写内容", { exact: true });
  await input.fill("天地，\n玄黄！");
  await expect(page.locator(".glyph-list button")).toHaveCount(6);
  const canvas = page.getByLabel("书法作品画布");
  async function clickLogical(x: number, y: number) {
    const r = (await canvas.boundingBox())!;
    await page.mouse.click(
      r.x + (x * r.width) / 1200,
      r.y + (y * r.height) / 1600,
    );
  }
  await clickLogical(909, 165);
  await expect(page.locator(".glyph-list .active")).toHaveText("玄", {
    timeout: 200,
  });
  await page.getByRole("button", { name: "选择字符1天", exact: true }).click();
  await page.getByLabel("X 偏移", { exact: true }).fill("33");
  await page.getByLabel("单字加粗", { exact: true }).fill("1.5");
  await input.fill("天地人，\n玄黄！");
  await expect(page.locator(".glyph-list button")).toHaveCount(7);
  await expect(page.getByLabel("X 偏移", { exact: true })).toHaveValue("33");
  await expect(page.getByLabel("单字加粗", { exact: true })).toHaveValue("1.5");
  await page.getByLabel("删除换行", { exact: true }).check();
  await expect(page.getByRole("status")).toContainText("已自动更新");
  await expect(input).toHaveValue("天地人，\n玄黄！");
  // The removed newline moves 玄 into the same column, preserving reading order.
  await expect(async () => {
    await clickLogical(1035, 597);
    await expect(page.locator(".glyph-list .active")).toHaveText("玄", {
      timeout: 200,
    });
  }).toPass({ timeout: 6000 });
  await page.getByRole("button", { name: "删除标点符号", exact: true }).click();
  await expect(input).toHaveValue("天地人\n玄黄");
  await expect(page.locator(".glyph-list button")).toHaveCount(5);
  await page.getByLabel("删除换行", { exact: true }).uncheck();
  await expect(async () => {
    await clickLogical(909, 165);
    await expect(page.locator(".glyph-list .active")).toHaveText("玄", {
      timeout: 200,
    });
  }).toPass({ timeout: 6000 });
  // Composition text must not regenerate until the IME has committed.
  await input.dispatchEvent("compositionstart");
  await input.fill("山水清音");
  await page.waitForTimeout(500);
  await expect(page.locator(".glyph-list button")).toHaveCount(5);
  await input.dispatchEvent("compositionend");
  await expect(page.locator(".glyph-list button")).toHaveCount(4);
  await page.getByRole("button", { name: "选择字符1山", exact: true }).click();
  await page.getByLabel("X 偏移", { exact: true }).fill("17");
  await page.getByLabel("大小变化幅度（%）", { exact: true }).fill("40");
  await expect(page.getByLabel("X 偏移", { exact: true })).toHaveValue("17");
  await page.getByRole("button", { name: "自然", exact: true }).click();
  await expect(page.getByLabel("错落强度（%）", { exact: true })).toHaveValue(
    "65",
  );
  await page.getByRole("button", { name: "奔放", exact: true }).click();
  await expect(page.getByLabel("错落强度（%）", { exact: true })).toHaveValue(
    "100",
  );
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.getByLabel("错落强度（%）", { exact: true })).toHaveValue(
    "65",
  );
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(page.getByLabel("错落强度（%）", { exact: true })).toHaveValue(
    "100",
  );
  await expect(page.getByLabel("X 偏移", { exact: true })).toHaveValue("17");
  await page.getByLabel("视觉协调强度（%）", { exact: true }).fill("100");
  await page.getByLabel("视觉协调", { exact: true }).uncheck();
  await page.getByLabel("视觉协调", { exact: true }).check();
  // Repeated exports of the same state must have exactly the same pixels.
  async function download(name: string) {
    const d = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出 PNG ↗", exact: true }).click();
    const p = info.outputPath(name);
    await (await d).saveAs(p);
    return fs.readFileSync(p);
  }
  await page.getByLabel("输出倍率", { exact: true }).selectOption("1");
  const a = await download("自由章法1.png"),
    b = await download("自由章法2.png");
  expect(a.equals(b)).toBe(true);
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.getByRole("button", { name: "适应窗口", exact: true }).click();
  const c = await download("缩放后.png");
  expect(c.equals(a)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await input.fill(
    "夫君子之行静以修身俭以养德\n非淡泊无以明志非宁静无以致远\n夫学须静也才须学也\n非学无以广才非志无以成学\n淫慢则不能励精险躁则不能治性\n年与时驰意与日去遂成枯落\n多不接世悲守穷庐将复何及",
  );
  await expect(page.locator(".glyph-list button")).toHaveCount(86);
  await page.getByLabel("默认字号", { exact: true }).fill("73");
  await page.getByLabel("字间距", { exact: true }).fill("0");
  await page.getByLabel("行 / 列间距", { exact: true }).fill("25");
  await page.getByLabel("大小变化幅度（%）", { exact: true }).fill("32");
  await page.getByLabel("错落强度（%）", { exact: true }).fill("85");
  await page.getByRole("button", { name: "适应窗口", exact: true }).click();
  await page.locator(".right").evaluate((el) => (el.scrollTop = 0));
  await page.locator(".left").evaluate((el) => (el.scrollTop = 0));
  await input.evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: info.outputPath("自由章法界面.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
