import { test, expect } from "@playwright/test";

test("market evidence and a recalculated launch work end to end", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("MOCK DATA · DEMO")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Candidate markets" }),
  ).toBeVisible();
  await expect(page.locator(".ranking-row")).toHaveCount(20);
  await page.getByPlaceholder("Find a metro…").fill("Miami");
  await page.locator(".ranking-row").click();
  await expect(
    page.getByRole("heading", { name: "Miami", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Inspect features & sources" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Synthetic fixture generator", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close details" }).click();
  await page
    .getByRole("button", { name: "Simulate hypothetical launch" })
    .click();
  await expect(page.getByText("SEEDED & REPRODUCIBLE")).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByText("RIDES COMPLETED", { exact: true }),
  ).toBeVisible();
  const before = await page.locator(".metric.accent > strong").innerText();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/simulations") &&
      r.request().method() === "POST",
  );
  await page.getByRole("slider", { name: "Base fare", exact: true }).fill("15");
  await response;
  await expect(page.getByText("SEEDED & REPRODUCIBLE")).toBeVisible();
  await expect(page.locator(".metric.accent > strong")).not.toHaveText(before);
  await page.getByRole("button", { name: "Play playback" }).click();
  await expect(
    page.getByRole("button", { name: "Pause playback" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause playback" }).click();
  await page.screenshot({
    path: "test-results/scenario-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to markets" }).click();
  await page.getByPlaceholder("Find a metro…").fill("");
  await page.screenshot({
    path: "test-results/markets-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({
    path: "test-results/markets-mobile.png",
    fullPage: true,
  });
});

test("superseded ranking responses cannot overwrite newer selection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".ranking-row")).toHaveCount(20);
  await page.route("**/api/v1/rankings", async (route) => {
    const weights = route.request().postDataJSON().weights;
    if (weights.familiarity === 0.1)
      await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  const slider = page.getByRole("slider", { name: /ODD familiarity/ });
  await slider.fill("0.1");
  await page.waitForTimeout(250);
  await slider.fill("0.9");
  await expect(slider).toHaveValue("0.9");
  await expect(page.locator(".ranking-list")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(slider).toHaveValue("0.9");
});
