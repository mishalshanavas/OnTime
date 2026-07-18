import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";

const storageStatePath = path.resolve(process.cwd(), process.env.INSTAMART_STORAGE_STATE ?? "storageState.json");
const instamartUrl = process.env.INSTAMART_URL ?? "https://www.swiggy.com/instamart";

const browser = await chromium.launch({
  headless: false,
  slowMo: 150,
  args: ["--start-maximized"],
});

const context = await browser.newContext({
  viewport: null,
  ...(existsSync(storageStatePath) ? { storageState: storageStatePath } : {}),
});

const page = await context.newPage();
await page.goto(instamartUrl, { waitUntil: "domcontentloaded" });

console.log("");
console.log("Instamart login helper is open in a visible Playwright browser.");
console.log("1. Log in manually.");
console.log("2. Confirm Instamart shows your logged-in account/session.");
console.log("3. Come back here and press Enter to save storageState.json.");
console.log("");

const rl = readline.createInterface({ input, output });
await rl.question("Press Enter after login is complete...");
rl.close();

await context.storageState({ path: storageStatePath });
console.log(`Saved Playwright storage state to ${storageStatePath}`);
await browser.close();
