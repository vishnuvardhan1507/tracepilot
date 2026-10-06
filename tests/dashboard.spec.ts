import { test, expect } from "@playwright/test";
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
  throw new Error("Set ADMIN_PASSWORD to the password used during bootstrap before running browser tests.");
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email address").fill("admin@tracepilot.local");
  await page
    .getByLabel("Password", { exact: true })
    .fill(adminPassword);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
});
test("overview, filters and trace inspection", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(
    page.getByText("Total executions", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "All traces" }).click();
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("error");
  await expect(page).toHaveURL(/status=error/);
  await expect(page.locator("tbody tr")).not.toHaveCount(0);
  await page.locator("tbody tr").first().getByRole("link").first().click();
  await expect(
    page.getByRole("heading", { name: "Execution waterfall" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Inspect Synthesize response" })
    .click();
  await expect(page.getByText("Redacted attributes")).toBeVisible();
  await expect(page).toHaveURL(/span=/);
  await expect(page.locator(".span-detail")).toContainText("local/research-v1");
  expect(errors).toEqual([]);
});
test("alert creation persists", async ({ page }) => {
  const ruleName = `Browser QA latency ${Date.now()}`;
  await page.getByRole("link", { name: "Alerts", exact: true }).click();
  await page.getByRole("button", { name: "Create rule" }).click();
  await page.getByLabel("Rule name").fill(ruleName);
  await page
    .getByRole("combobox", { name: "Metric", exact: true })
    .selectOption("p95_latency");
  await page.getByLabel("Threshold", { exact: true }).fill("10000");
  await page.getByRole("button", { name: "Save rule" }).click();
  await expect(page.getByText("Alert rule saved")).toBeVisible();
  await page.reload();
  await expect(page.getByText(ruleName, { exact: true })).toBeVisible();
});
test("recoverable API error", async ({ page }) => {
  await page.route("**/api/projects/research/agents?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"detail":"Temporarily unavailable"}',
    }),
  );
  await page.getByRole("link", { name: "Agents", exact: true }).click();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await page.unroute("**/api/projects/research/agents?**");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "research-agent", exact: true }),
  ).toBeVisible();
});
test("desktop and mobile screenshots", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 1100 });
  await expect(page.locator(".main-chart svg.recharts-surface")).toBeVisible();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
    timeout: 10000,
  });
  await page.screenshot({
    path: "artifacts/overview-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "artifacts/overview-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).toBeHidden();
  await page.screenshot({
    path: "artifacts/overview-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("link", { name: "Traces", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Traces", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".nav-backdrop")).toHaveCount(0);
});

test("viewer permissions are enforced in the UI and API", async ({ page }) => {
  const email = `viewer-qa-${Date.now()}@test.local`;
  const response = await page.request.post("/api/projects/research/members", {
    data: { email, password: "Viewer-test-password-123", role: "Viewer" },
  });
  expect(response.ok()).toBeTruthy();
  await page.request.post("/api/logout");
  await page.request.post("/api/login", {
    data: { email, password: "Viewer-test-password-123" },
  });
  await page.goto("/alerts?source=sample");
  await expect(
    page.getByRole("heading", { name: "Alert rules" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create rule" })).toHaveCount(
    0,
  );
  expect(
    (await page.request.post("/api/projects/research/keys")).status(),
  ).toBe(403);
  await page.goto("/settings?source=sample");
  await expect(page.getByLabel("Project name")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Create key" })).toHaveCount(0);
});

test("API key creation and revocation", async ({ page }) => {
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Create key" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Your ingestion key" }),
  ).toBeVisible();
  const raw = await dialog.locator(".key-output").textContent();
  expect(raw).toMatch(/^tp_/);
  const prefix = raw!.slice(0, 9);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  const row = page.locator("tr").filter({ hasText: prefix });
  await row.getByRole("button", { name: "Revoke", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Revoke key", exact: true })
    .click();
  await expect(row.getByText("revoked", { exact: true })).toBeVisible();
});

test('cost grouping and deterministic evaluation inspection', async ({page}) => {
  await page.getByRole('link',{name:'Costs',exact:true}).click();
  await page.getByRole('combobox',{name:'Group costs by'}).selectOption('agent');
  await expect(page.locator('tbody').first()).toContainText('research-agent');
  await page.getByRole('link',{name:'Evaluations',exact:true}).click();
  await page.getByRole('button',{name:'Run evaluation',exact:true}).click();
  await expect(page.getByText(/Evaluated \d+ trace cases/)).toBeVisible();
  await page.getByRole('button',{name:'Inspect',exact:true}).first().click();
  await expect(page.getByRole('dialog')).toContainText('Required citations');
  await expect(page.getByRole('dialog')).toContainText('Output schema');
});
