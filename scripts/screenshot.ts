/** Captures UI screenshots against the e2e stub server. */
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const OUT = process.env.SHOT_DIR ?? ".";
const server = spawn("npx", ["tsx", "scripts/e2e-server.ts"], { stdio: ["ignore", "pipe", "pipe"] });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(3000);
  const browser = await chromium.launch({
    executablePath: process.env.CLAUDE_PAD_CHROMIUM || undefined,
  });

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await desktop.goto("http://127.0.0.1:7466/");
  await sleep(1500);
  // Give the LEDs something to show.
  await desktop.request.post("http://127.0.0.1:7466/api/hook/PreToolUse", { data: { tool_name: "Bash" } });
  await sleep(400);
  await desktop.screenshot({ path: `${OUT}/claude-pad-desktop.png` });

  await desktop.locator('[data-key="chats"]').click();
  await sleep(600);
  await desktop.screenshot({ path: `${OUT}/claude-pad-chats.png` });

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto("http://127.0.0.1:7466/");
  await sleep(1500);
  await phone.screenshot({ path: `${OUT}/claude-pad-phone.png` });

  await browser.close();
  server.kill("SIGTERM");
  process.exit(0);
})();
