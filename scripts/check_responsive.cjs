/* Browser-only fixtures exercise layouts without accessing real student data. */
const { chromium } = require("../deployment/ui-tools/node_modules/playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.UI_TEST_URL || "http://127.0.0.1:3000";
const output = path.resolve(__dirname, "../deployment/ui-checks");
fs.mkdirSync(output, { recursive: true });
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "layout-test@example.test",
  aud: "authenticated",
  role: "authenticated",
};
const paper = {
  id: "22222222-2222-4222-8222-222222222222",
  file_name: "A_very_long_handwritten_test_paper_filename_".repeat(4) + ".pdf",
  file_path: "layout-test.pdf",
  subject: "Mathematics",
  status: "done",
  preview_url: base + "/ui-test-preview.pdf",
  total: 4.5,
  out_of: 10,
  created_at: "2026-10-13T08:00:00Z",
  checked_at: "2026-10-13T08:01:00Z",
  error_message: null,
  results: [
    {
      q: 1,
      question: "Explain this expression: " + "longexpression".repeat(30),
      student_answer: "answer".repeat(90),
      correct_answer: "solution".repeat(80),
      marks: 4.5,
      out_of: 10,
      reason: "A partly correct answer with unclear handwriting.",
      confidence: "low",
    },
  ],
};
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    for (const width of [320, 375, 600, 768, 900, 1024, 1280, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      await page.route("**/ui-test-preview.pdf", (route) =>
        route.fulfill({
          contentType: "application/pdf",
          body: fs.readFileSync(
            path.resolve(
              __dirname,
              "../sample-papers/typed-addition-with-solutions.pdf",
            ),
          ),
        }),
      );
      await page.route("**/auth/v1/**", (route) =>
        route.fulfill({ json: { ...user, external: { google: true } } }),
      );
      await page.route("**/papers**", (route) => {
        if (route.request().resourceType() === "document")
          return route.continue();
        return route.fulfill({
          json: route.request().url().includes(paper.id)
            ? paper
            : { papers: [paper], has_more: true, has_pending: false },
        });
      });
      await page.goto(base + "/login");
      await page.getByLabel("Show password").click();
      assert.equal(
        await page.locator("#password").getAttribute("type"),
        "text",
      );
      await page.getByLabel("Hide password").click();
      for (const screen of ["login", "dashboard", "detail"]) {
        if (screen === "dashboard") {
          await page.evaluate(
            ({ user }) => {
              localStorage.setItem(
                "sb-lzzyjkksxwzdxjhytsqb-auth-token",
                JSON.stringify({
                  access_token: "layout-test-token",
                  refresh_token: "layout-test-refresh",
                  expires_at: Math.floor(Date.now() / 1000) + 3600,
                  expires_in: 3600,
                  token_type: "bearer",
                  user,
                }),
              );
            },
            { user },
          );
          await page.goto(base);
          await page
            .getByRole("heading", { name: "Your paper history" })
            .waitFor();
        }
        if (screen === "detail") {
          await page.goto(base + "/papers/" + paper.id);
          await page
            .getByRole("heading", { name: "Question by question" })
            .waitFor();
          await page
            .getByRole("button", { name: "Delete", exact: true })
            .click();
        }
        for (const theme of ["light", "dark"]) {
          await page.evaluate((theme) => {
            localStorage.setItem("theme", theme);
            window.dispatchEvent(new Event("autocheck-theme"));
          }, theme);
          await page.waitForTimeout(80);
          const sizes = await page.evaluate(() => ({
            viewport: innerWidth,
            page: document.documentElement.scrollWidth,
            offenders: [...document.querySelectorAll("body *")]
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
              })
              .slice(0, 8)
              .map((el) => el.tagName + "." + el.className),
          }));
          assert(
            sizes.page <= sizes.viewport + 1,
            `${screen} ${width}px ${theme}: ${JSON.stringify(sizes)}`,
          );
          await page.screenshot({
            path: path.join(output, `${screen}-${width}-${theme}.png`),
            fullPage: true,
          });
        }
      }
      console.log(`PASS ${width}px: login, dashboard, detail; light and dark`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
