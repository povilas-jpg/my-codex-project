import { expect, test, type Page } from "@playwright/test";

/** Read the full xterm buffer (exposed as window.__term for tests). */
async function terminalText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const t = (window as unknown as Record<string, any>).__term;
    if (!t) return "";
    const buf = t.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buf.length; i++) lines.push(buf.getLine(i)?.translateToString(true) ?? "");
    return lines.join("\n");
  });
}

async function expectTerminal(page: Page, text: string) {
  await expect
    .poll(async () => (await terminalText(page)).replace(/\s+/g, " "), { timeout: 10_000 })
    .toContain(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expectTerminal(page, "STUB_CLAUDE");
});

test("boots the stub claude with hook settings wired", async ({ page }) => {
  await expectTerminal(page, "--settings"); // hooks settings file passed to claude
  await expectTerminal(page, "STUB_CWD=");
});

test("macropad keys send the exact sequences", async ({ page }) => {
  await page.locator('[data-key="approve"]').click();
  await expectTerminal(page, "<CR>");

  await page.locator('[data-key="mode"]').click();
  await expectTerminal(page, "<ESC>[Z");

  await page.locator('[data-key="think"]').click();
  await expectTerminal(page, "<TAB>");

  await page.locator('[data-key="compact"]').click();
  await expectTerminal(page, "/compact<CR>");

  await page.locator('[data-key="model"]').click();
  await expectTerminal(page, "/model haiku<CR>");

  await page.getByLabel("arrow up").click();
  await expectTerminal(page, "<ESC>[A");

  await page.locator('[data-key="deny"]').click();
  // A bare ESC renders as "<ESC>" not followed by "[".
  await expect
    .poll(async () => (await terminalText(page)).replace(/\s+/g, " "))
    .toMatch(/<ESC>(?!\[)/);
});

test("status LEDs follow hook events", async ({ page, request }) => {
  const led = page.locator(".led-bar");
  await expect(led).toHaveAttribute("data-status", /starting|idle/);

  await request.post("http://127.0.0.1:7466/api/hook/SessionStart", { data: {} });
  await expect(led).toHaveAttribute("data-status", "idle");

  await request.post("http://127.0.0.1:7466/api/hook/UserPromptSubmit", { data: {} });
  await expect(led).toHaveAttribute("data-status", "working");

  await request.post("http://127.0.0.1:7466/api/hook/PreToolUse", {
    data: { tool_name: "Bash", session_id: "e2e-session-000000001" },
  });
  await expect(led).toHaveAttribute("data-status", "tool");
  await expect(page.locator(".led-detail")).toHaveText("Bash");

  await request.post("http://127.0.0.1:7466/api/hook/Notification", {
    data: { message: "Claude needs your permission to use Bash" },
  });
  await expect(led).toHaveAttribute("data-status", "waiting");

  await request.post("http://127.0.0.1:7466/api/hook/Stop", { data: {} });
  await expect(led).toHaveAttribute("data-status", "done");
});

test("chat browser lists, searches, and resumes a chat", async ({ page }) => {
  await page.locator('[data-key="chats"]').click();
  const items = page.locator(".chat-item");
  await expect(items).toHaveCount(2);
  // Newest first.
  await expect(items.first()).toContainText("Add dark mode toggle");
  await expect(items.nth(1)).toContainText("Fix the login bug");

  await page.locator(".chat-search").fill("login");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Fix the login bug");

  // Highlighted item opens via the Open key -> PTY restarts with --resume.
  await page.locator('[data-key="open"]').click();
  await expect(page.locator(".chat-drawer")).toHaveCount(0);
  await expectTerminal(page, "--resume");
  await expectTerminal(page, "aaaa1111-2222-3333-4444-555566667777");
});

test("prev/next keys move the chat highlight", async ({ page }) => {
  await page.locator('[data-key="chats"]').click();
  const highlighted = page.locator(".chat-item.highlight");
  await expect(highlighted).toContainText("Add dark mode toggle");

  await page.locator('[data-key="next"]').click();
  await expect(highlighted).toContainText("Fix the login bug");

  await page.locator('[data-key="prev"]').click();
  await expect(highlighted).toContainText("Add dark mode toggle");
});

test("reload replays terminal history", async ({ page }) => {
  await page.locator('[data-key="compact"]').click();
  await expectTerminal(page, "/compact<CR>");

  await page.reload();
  await expectTerminal(page, "STUB_CLAUDE");
  await expectTerminal(page, "/compact<CR>"); // came from the replay ring buffer
});

test("new chat restarts the session", async ({ page }) => {
  await page.locator('[data-key="new"]').click();
  // Fresh stub boot means a fresh replay buffer: exactly one banner after restart.
  await expect
    .poll(async () => {
      const text = await terminalText(page);
      return (text.match(/STUB_CWD=/g) ?? []).length;
    })
    .toBe(1);
});

test("phone viewport stacks the pad below the terminal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const direction = await page
    .locator(".pad-zone")
    .evaluate((el) => getComputedStyle(el).flexDirection);
  expect(direction).toBe("column");
  const cols = await page
    .locator(".pad-grid")
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(cols).toBe(4);
});
