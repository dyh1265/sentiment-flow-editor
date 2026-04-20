import { expect, test } from "@playwright/test";

test("happy path: paste text, see chart, pick arc, toggle before/after, copy", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Sentiment Flow Editor" })).toBeVisible();

  // Empty state is visible until text is loaded.
  await expect(page.getByText("No text yet")).toBeVisible();

  // Click once to load sample and wait for the analyze round-trip to complete.
  const analyzeResponse = page.waitForResponse(
    (res) => res.url().endsWith("/api/analyze") && res.status() === 200,
  );
  await page.getByRole("button", { name: "Load sample text" }).click();
  await analyzeResponse;

  // Recharts renders an SVG once sentences are populated.
  const chart = page.locator(".recharts-responsive-container").first();
  await expect(chart).toBeVisible();
  await expect(chart.locator("svg")).toBeVisible();

  // Switch arcs and expect another analyze request isn't triggered but the
  // target dashed line updates. We simply ensure the buttons toggle state.
  await page.getByRole("button", { name: "Persuasive arc" }).click();
  await expect(page.getByRole("button", { name: "Persuasive arc" })).toHaveClass(/bg-purple-50/);
  await page.getByRole("button", { name: "Story arc" }).click();

  // Edit the text so dirty becomes true and Before/After becomes meaningful.
  const editor = page.getByRole("textbox");
  await editor.focus();
  await editor.press("End");
  await editor.pressSequentially(" Truly.");

  // After the typing debounce fires the chart still renders.
  await page.waitForResponse(
    (res) => res.url().endsWith("/api/analyze") && res.status() === 200,
  );

  // Before/After swaps the editable state.
  await page.getByRole("button", { name: "Before" }).click();
  await expect(editor).toBeDisabled();
  await page.getByRole("button", { name: "After" }).click();
  await expect(editor).toBeEnabled();

  // Copy the current (after) text to the clipboard and verify.
  await page.getByRole("button", { name: "Copy text" }).click();
  await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toContain("Truly.");
});
