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
  await expect(page.locator(".weight-controls strong")).toHaveText([
    "40%",
    "20%",
    "40%",
  ]);
  await page.getByPlaceholder("Find a metro…").fill("Miami");
  await page.locator(".ranking-row").click();
  await expect(
    page.getByRole("heading", { name: "Miami", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("MODE: TEMPLATE")).toBeVisible();
  await page.getByRole("button", { name: "synthetic:12060" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#provenance-synthetic-12060")).toBeVisible();
  await expect(
    page.getByText("Synthetic fixture generator", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("FL · unresolved")).toBeVisible();
  await expect(page.getByText(/Normalized value:/).first()).toBeVisible();
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
  await expect(
    page.getByText("PASSENGER UTILIZATION", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("EMPTY-MILE SHARE", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("CHARGING VEHICLE-HOURS", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("REVENUE PER VEHICLE", { exact: true }),
  ).toBeVisible();
  const revenue = page
    .locator(".metric")
    .filter({ hasText: "SIMULATED GROSS REVENUE" })
    .locator("strong");
  const before = await revenue.innerText();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/simulations") &&
      r.request().method() === "POST",
  );
  await page.getByRole("slider", { name: "Base fare", exact: true }).fill("15");
  await response;
  await expect(page.getByText("SEEDED & REPRODUCIBLE")).toBeVisible();
  await expect(revenue).not.toHaveText(before);
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
  await expect(page.locator(".weight-controls strong")).toHaveText([
    "60%",
    "13%",
    "27%",
  ]);
  await expect(slider).toHaveValue("0.9");
});
