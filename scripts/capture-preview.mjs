import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {},
);
try {
  await mkdir("docs/previews", { recursive: true });
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    for (const route of ["", "about/", "services/", "contact/"]) {
      await page.goto(`http://127.0.0.1:4321/${route}`);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `docs/previews/${route.replace("/", "") || "home"}-${name}.png`,
        fullPage: true,
      });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
