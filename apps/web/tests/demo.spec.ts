import { test, expect } from "@playwright/test";

test("market evidence and a recalculated launch work end to end", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".figma-landing")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(".brand")).toBeFocused();
  await expect(page.locator(".brand")).toHaveCSS("outline-style", "solid");
  await expect
    .poll(
      () =>
        page
          .locator(".figma-hero-photo img")
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      { timeout: 10000 },
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: "test-results/landing-desktop.png",
    fullPage: true,
  });
  await page
    .locator(".figma-hero-copy")
    .getByRole("button", { name: "Explore markets" })
    .click();
  await expect(page.locator(".topbar .status-pill")).toHaveText(
    "MOCK DATA · DEMO",
  );
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
  await expect(page.locator(".map-panel h2")).toHaveText("Miami");
  await expect(page.locator(".ranking-expanded")).toContainText(
    "PILLAR BREAKDOWN",
  );
  await expect(page.locator(".assistant-mode")).toHaveText("template");
  await page.getByRole("button", { name: "Why this score?" }).click();
  await page.getByRole("button", { name: "synthetic:12060" }).click();
  await expect(page).toHaveURL(
    /\/methodology\?city=cbsa%3A12060#provenance-synthetic-12060$/,
  );
  await expect(page.locator("#selected-city-title")).toHaveText("Atlanta");
  await expect(page.locator("#provenance-synthetic-12060")).toHaveAttribute(
    "open",
    "",
  );
  await expect(page.locator("#provenance-synthetic-12060")).toContainText(
    "Synthetic fixture generator",
  );
  await expect(page.locator("#selected-city-evidence")).toContainText("mock");
  await expect(page.locator("#selected-city-evidence")).toContainText(
    "GA · unresolved",
  );
  await expect(page.locator("#selected-city-evidence")).toContainText(
    "Stored feature values",
  );
  await page.getByRole("link", { name: "Explorer" }).click();
  await page
    .locator(".figma-hero-copy")
    .getByRole("button", { name: "Explore markets" })
    .click();
  await expect(page.locator(".ranking-row")).toHaveCount(20);
  await page.getByPlaceholder("Find a metro…").fill("Miami");
  await page.locator(".ranking-row").click();
  await expect(page.locator(".map-panel h2")).toHaveText("Miami");
  await page
    .getByRole("button", { name: "Simulate hypothetical launch" })
    .click();
  await expect(page.getByText("SEEDED & REPRODUCIBLE")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator(".sim-map-frame .sim-legend")).toContainText(
    "Picking up",
  );
  await expect(
    page.locator(".scenario-grid > .scenario-controls"),
  ).toBeVisible();
  await expect(
    page.locator(".scenario-grid > .scenario-map-column"),
  ).toBeVisible();
  await expect(page.getByLabel("Selected simulation hour")).toContainText(
    "Gross revenue",
  );
  const fleetVehicles = page.getByTestId("fleet-vehicle");
  await expect(fleetVehicles).toHaveCount(50, { timeout: 30000 });
  await expect(
    page.locator('[data-testid="fleet-vehicle"][data-state="IDLE"]'),
  ).toHaveCount(50);
  const timeline = page.getByRole("slider", {
    name: "Playback minute",
    exact: true,
  });
  await timeline.fill("480");
  await timeline.press("ArrowRight");
  await expect(
    page.getByRole("region", { name: "Engine vehicle playback" }),
  ).toContainText("480.1 min");
  const vehicle = fleetVehicles.first();
  const initialPosition = await vehicle.getAttribute("cx");
  await page.waitForTimeout(500);
  expect(await vehicle.getAttribute("cx")).toBe(initialPosition);
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
  await expect(
    page.getByRole("region", { name: "Compare scenarios" }),
  ).toContainText("PREVIOUS SCENARIO");
  await page.getByRole("button", { name: "Play playback" }).click();
  await expect(
    page.getByRole("button", { name: "Pause playback" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause playback" }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotionPlay = page.getByRole("button", {
    name: "Automatic playback disabled by reduced-motion preference",
  });
  await expect(reducedMotionPlay).toBeDisabled();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.screenshot({
    path: "test-results/scenario-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await expect(page.locator(".topbar .status-pill")).toBeVisible();
  await page.screenshot({
    path: "test-results/scenario-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to markets" }).click();
  await page.getByPlaceholder("Find a metro…").fill("");
  await page.setViewportSize({ width: 1280, height: 900 });
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
  await page
    .locator(".figma-hero-copy")
    .getByRole("button", { name: "Explore markets" })
    .click();
  await expect(page.locator(".ranking-row")).toHaveCount(20);
  await expect(
    page.getByRole("group", { name: "Reference categories" }),
  ).toContainText("commercial");
  await expect(
    page.getByRole("checkbox", { name: "commercial" }),
  ).toBeChecked();
  await expect(page.locator(".ranking-comparison")).toContainText(
    "Default weights:",
  );
  const comparison = page.locator(".ranking-comparison > div p");
  const beforeComparison = await comparison.innerText();
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
  await expect(comparison).not.toHaveText(beforeComparison);
  await expect(comparison).toContainText("Rank change:");
});
