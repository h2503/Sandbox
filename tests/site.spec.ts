import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";

const routes = [
  ["/", "Good ideas."],
  ["/about/", "Small by design."],
  ["/services/", "Good thinking."],
  ["/contact/", "Hello, there."],
];
for (const [route, heading] of routes) {
  test(`${route} renders accessibly without overflow or failed assets`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push(`${response.status()}: ${response.url()}`);
    });
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("h1")).toContainText(heading);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("navigation works, including mobile menu and Escape", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  const menu = page.getByRole("button", { name: /navigation/ });
  if (isMobile) {
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
  }
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Services", exact: true })
    .click();
  await expect(page).toHaveURL(/\/services\/$/);
  await page.getByRole("link", { name: "Shape your website" }).click();
  await expect(page.getByLabel("I’m interested in")).toHaveValue("digital");
});

test("contact validates input and creates an accurate downloadable email brief", async ({
  page,
}) => {
  await page.goto("/contact/");
  await page
    .getByRole("button", { name: "Prepare email draft", exact: true })
    .click();
  await expect(page.locator("#contact-result")).toBeHidden();
  await page.getByLabel("Your name").fill("Alex & Co");
  await page.getByLabel("Email address").fill("alex@example.com");
  await page.getByLabel("Company or project").fill("A considered brand");
  await page.getByLabel("I’m interested in").selectOption("brand");
  await page
    .getByLabel("A little about your project")
    .fill("We need a brand & website with a clear point of view.");
  await page
    .getByRole("button", { name: "Prepare email draft", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Your brief is ready");
  const href = await page
    .getByRole("link", { name: "Open in email app" })
    .getAttribute("href");
  expect(href).toContain("mailto:hafiizhamid@gmail.com?");
  const draft = new URL(href!);
  expect(draft.searchParams.get("subject")).toBe("Project inquiry — Alex & Co");
  expect(draft.searchParams.get("body")).toContain(
    "Interested in: Brand identity",
  );
  expect(draft.searchParams.get("body")).toContain("brand & website");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download brief" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("hah-project-brief.txt");
  expect(await readFile((await download.path())!, "utf8")).toBe(
    draft.searchParams.get("body"),
  );
});

test("FAQ expands and project links reach the correct services", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Form & feeling/ }).click();
  await expect(page).toHaveURL(/\/services\/#brand$/);
  const question = page.getByText("How much does a project cost?", {
    exact: true,
  });
  await question.click();
  await expect(
    page.getByText("Every project has its own scope.", { exact: false }),
  ).toBeVisible();
});

test("all internal page and fragment links resolve", async ({
  page,
  request,
}) => {
  const seen = new Set<string>();
  for (const [route] of routes) {
    await page.goto(route);
    const links = await page
      .locator("a[href]")
      .evaluateAll((anchors) =>
        anchors.map((anchor) => (anchor as HTMLAnchorElement).href),
      );
    for (const href of links) {
      const url = new URL(href);
      if (url.origin !== "http://127.0.0.1:4321" || seen.has(href)) continue;
      seen.add(href);
      const response = await request.get(url.pathname + url.search);
      expect(response.ok(), href).toBe(true);
      if (url.hash)
        expect(await response.text(), href).toContain(
          `id="${url.hash.slice(1)}"`,
        );
    }
  }
});
