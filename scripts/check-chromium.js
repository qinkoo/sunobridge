#!/usr/bin/env node
// ============================================================
// SunoBridge — Chromium Pre-Check
//
// Checks if Chromium is already installed for Playwright.
// If not, guides the user to install it (or skip for cookie-only).
//
// Usage: node scripts/check-chromium.js
// ============================================================

const { execSync } = require("child_process");
const fs = require("fs");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

console.log(`\n${CYAN}🔍 SunoBridge — Checking Chromium for Playwright...${RESET}\n`);

// Check 1: CHROME_PATH environment variable
const chromePath = process.env.CHROME_PATH;
if (chromePath && fs.existsSync(chromePath)) {
  console.log(`${GREEN}✅ Chrome found at CHROME_PATH: ${chromePath}${RESET}`);
  console.log("   (Captcha automation can use this browser)\n");
  process.exit(0);
} else if (chromePath) {
  console.log(
    `${YELLOW}⚠️  CHROME_PATH is set but file not found: ${chromePath}${RESET}`
  );
}

// Check 2: Playwright Chromium (check if package resolves)
try {
  const resolved = require.resolve("@playwright/browser-chromium");
  if (resolved) {
    console.log(`${GREEN}✅ @playwright/browser-chromium package found${RESET}`);
  }
} catch {
  console.log(
    `${YELLOW}⚠️  @playwright/browser-chromium NOT installed${RESET}`
  );
  console.log("   Install: npx playwright install chromium  (≈150 MB)\n");
}

// Check 3: System Chrome/Chromium
const commonPaths = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
];

let foundSystem = false;
for (const p of commonPaths) {
  if (fs.existsSync(p)) {
    console.log(`${GREEN}✅ System browser found: ${p}${RESET}`);
    foundSystem = true;
    break;
  }
}

if (!foundSystem) {
  console.log(`${YELLOW}⚠️  No system Chrome/Chromium detected${RESET}`);
}

console.log();
if (!chromePath && !foundSystem) {
  console.log(
    `${YELLOW}💡 Chromium is optional — only needed for captcha automation.${RESET}`
  );
  console.log(
    `   Cookie-mode + Bridge-mode work without it.${RESET}`
  );
  console.log(
    `   If you hit captcha blocks, run:  npx playwright install chromium${RESET}\n`
  );
} else {
  console.log(`${GREEN}✅ Chromium check passed. Captcha automation ready.${RESET}\n`);
}
