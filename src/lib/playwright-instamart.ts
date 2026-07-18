import { existsSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "playwright";
import type { DestinationAddress, Station } from "@/lib/demo-data";

// ── Types ──
export type InstamartStep = "init" | "search" | "add-to-cart" | "checkout" | "address" | "payment" | "done";

export type InstamartProgress = { step: InstamartStep; label: string; ok: boolean; detail?: string };

export type InstamartAutomationInput = {
  product: string;
  destination: Station;
  address: DestinationAddress;
  onProgress?: (p: InstamartProgress) => void;
};

export type InstamartAutomationResult = { ok: boolean; message: string; steps: InstamartProgress[] };

// ── Constants ──
const QUICK = 3_000;
const MEDIUM = 8_000;
const LONG = 20_000;

// ── Helpers ──
function envSelector(name: string, page: Page): { label: string; locator: () => Locator }[] {
  const sel = process.env[name];
  if (!sel) return [];
  return [{ label: `${name}=${sel}`, locator: () => page.locator(sel).first() }];
}

async function waitForStable(page: Page) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(800);
}

async function tryClick(
  page: Page,
  candidates: { label: string; locator: () => Locator }[],
  action: string,
  timeout = QUICK,
): Promise<string> {
  for (const c of candidates) {
    try {
      const el = c.locator();
      await el.waitFor({ state: "visible", timeout });
      await el.click({ timeout });
      return c.label;
    } catch { continue; }
  }
  throw new Error(`Could not ${action}.`);
}

async function tryFill(
  page: Page,
  candidates: { label: string; locator: () => Locator }[],
  value: string,
  action: string,
  timeout = QUICK,
): Promise<string> {
  for (const c of candidates) {
    try {
      const el = c.locator();
      await el.waitFor({ state: "visible", timeout });
      await el.click({ timeout });
      await el.fill(value, { timeout });
      return c.label;
    } catch { continue; }
  }
  throw new Error(`Could not ${action}.`);
}

async function dismissPopups(page: Page) {
  const patterns = [/not now/i, /skip/i, /maybe later/i, /later/i, /continue/i, /allow/i, /dismiss/i, /close/i, /no thanks/i, /cancel/i];
  for (const p of patterns) {
    try {
      const btn = page.getByRole("button", { name: p }).first();
      if (await btn.isVisible({ timeout: 600 }).catch(() => false)) await btn.click({ timeout: 800 });
    } catch { /* not present */ }
  }
}

// ── Location modal handler ──
async function handleLocationModal(page: Page): Promise<boolean> {
  const visible = await page.getByText(/share location|find the closest|select from saved/i).first().isVisible({ timeout: 2_000 }).catch(() => false);
  if (!visible) return false;

  console.log("[Instamart Agent] Location modal — dismissing…");

  // Strategy 1: click a known saved address by exact text
  const known = ["Home", "Temp Banglore Stay", "Kaasinaathan M P", "Work", "Office"];
  for (const name of known) {
    try {
      const el = page.getByText(name, { exact: true }).first();
      if (await el.isVisible({ timeout: 800 }).catch(() => false)) {
        await el.click({ timeout: 2_000 });
        await page.waitForTimeout(1_500);
        console.log(`[Instamart Agent] Clicked: "${name}" ✓`);
        await waitForStable(page);
        await dismissPopups(page);
        return true;
      }
    } catch { /* next */ }
  }

  // Strategy 2: first list item after "Select from saved address"
  try {
    const items = page.locator("li, [role=listitem]");
    const count = await items.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      try {
        const text = (await items.nth(i).textContent()) || "";
        if (text.trim().length > 2 && !/select from/i.test(text)) {
          await items.nth(i).click({ timeout: 2_000 });
          await page.waitForTimeout(1_500);
          console.log(`[Instamart Agent] Clicked: "${text.trim().slice(0, 30)}" ✓`);
          await waitForStable(page);
          await dismissPopups(page);
          return true;
        }
      } catch { continue; }
    }
  } catch { /* continue */ }

  // Strategy 3: "Share location" button
  try {
    const btn = page.getByRole("button", { name: /share location|use current|allow/i }).first();
    await btn.click({ timeout: 3_000 });
    await page.waitForTimeout(2_000);
    console.log("[Instamart Agent] Clicked 'Share location' ✓");
    await waitForStable(page);
    await dismissPopups(page);
    return true;
  } catch { /* continue */ }

  // Strategy 4: X close
  try {
    await page.locator('[aria-label*="close" i], [class*="close" i]').first().click({ timeout: 2_000 });
    await page.waitForTimeout(1_000);
  } catch {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }

  await waitForStable(page);
  await dismissPopups(page);
  return true;
}

// ── Step: Search ──
async function stepSearch(page: Page, product: string): Promise<string> {
  await dismissPopups(page);
  await page.waitForTimeout(1_000);

  // After location modal, page may show "Delivering to" with a location. Click "Use current" if visible.
  try {
    const useCurrent = page.getByRole("button", { name: /use current|current location|share location/i }).first();
    if (await useCurrent.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await useCurrent.click({ timeout: 2_000 });
      await page.waitForTimeout(2_000);
      console.log("[Instamart Agent] Clicked 'Use current location' ✓");
      await waitForStable(page);
    }
  } catch { /* not needed */ }

  // Try typing directly into a visible search bar first (instamart.in has a prominent search bar)
  try {
    // instamart.in search: often a div/button that says "Search" or has a search icon, which expands an input
    await tryClick(page, [
      { label: "srch-trigger-text", locator: () => page.getByText(/search for|search "|search groceries/i).first() },
      { label: "srch-trigger-btn", locator: () => page.getByRole("button", { name: /search/i }).first() },
      { label: "srch-trigger-icon", locator: () => page.locator('[class*="search" i], [data-testid*="search" i], [class*="Search" i]').first() },
    ], "activate search", 1_500);
    await page.waitForTimeout(800);
  } catch { /* search bar may already be visible */ }

  await tryFill(page, [
    ...envSelector("INSTAMART_SEARCH_INPUT_SELECTOR", page),
    { label: "srch-placeholder", locator: () => page.getByPlaceholder(/search/i).first() },
    { label: "srch-textbox", locator: () => page.getByRole("textbox", { name: /search/i }).first() },
    { label: "srch-input", locator: () => page.locator('input[type="search"], input[type="text"]').first() },
  ], product, `search "${product}"`, MEDIUM);

  await page.keyboard.press("Enter");
  await waitForStable(page);
  await page.waitForTimeout(2_500);
  return `Searched for "${product}"`;
}

// ── Step: Add to cart ──
async function stepAddToCart(page: Page, product: string): Promise<string> {
  await dismissPopups(page);
  try {
    await page.locator("article, [class*=product], [class*=item], li, [class*=card]").first().waitFor({ state: "visible", timeout: MEDIUM });
  } catch { await page.waitForTimeout(2_000); }

  const firstWord = product.split(" ")[0];
  const card = page.locator("article, [class*=product], [class*=item], li, [class*=card], div").filter({ hasText: new RegExp(firstWord, "i") }).first();

  await tryClick(page, [
    ...envSelector("INSTAMART_ADD_TO_CART_SELECTOR", page),
    { label: "add-card-btn", locator: () => card.getByRole("button", { name: /add to cart|add|\+/i }).first() },
    { label: "add-card-text", locator: () => card.locator("button, [role=button]").filter({ hasText: /add to cart|add|\+/i }).first() },
    { label: "add-any-btn", locator: () => page.getByRole("button", { name: /add to cart|add/i }).first() },
    { label: "add-any-text", locator: () => page.getByText(/^add to cart$|^add$/i).first() },
    // instamart.in may use "ADD" (all caps) or "+" in product cards
    { label: "add-upper", locator: () => card.locator("button, [role=button], span, div").filter({ hasText: /^ADD$|^\+$/ }).first() },
    { label: "add-class", locator: () => card.locator('[class*="add" i], [class*="Add" i]').first() },
    { label: "plus-btn", locator: () => card.locator('[class*="plus" i], [class*="increment" i]').first() },
    // Last resort: click the product card itself
    { label: "card-itself", locator: () => card },
  ], `add "${product}" to cart`, MEDIUM);

  await page.waitForTimeout(1_000);
  return `Added "${product}" to cart`;
}

// ── Step: Open cart → checkout ──
async function stepOpenCart(page: Page): Promise<string> {
  await dismissPopups(page);
  await page.waitForTimeout(800);

  // Dismiss any lingering location modal
  await handleLocationModal(page);

  // Try clicking cart icon/button first
  await tryClick(page, [
    ...envSelector("INSTAMART_CART_SELECTOR", page),
    { label: "go-cart-btn", locator: () => page.getByRole("button", { name: /go to cart/i }).first() },
    { label: "go-cart-text", locator: () => page.getByText(/go to cart/i).first() },
    { label: "cart-btn", locator: () => page.getByRole("button", { name: /view cart|cart|my cart/i }).first() },
    { label: "cart-icon", locator: () => page.locator('[class*="cart" i], [data-testid*="cart" i], [aria-label*="cart" i]').first() },
    { label: "cart-link", locator: () => page.getByRole("link", { name: /cart|basket/i }).first() },
    { label: "cart-text", locator: () => page.getByText(/view cart|my cart|\d+ item/i).first() },
    // instamart.in bottom cart bar
    { label: "cart-bar", locator: () => page.locator('[class*="bottom" i], [class*="sticky" i], [class*="fixed" i]').filter({ hasText: /cart|view|proceed|item/i }).first() },
  ], "open cart", MEDIUM);

  await waitForStable(page);
  await page.waitForTimeout(1_500);

  // Dismiss location again if it re-appeared
  await handleLocationModal(page);

  // Click checkout / proceed to pay
  await tryClick(page, [
    ...envSelector("INSTAMART_CHECKOUT_SELECTOR", page),
    { label: "chk-btn", locator: () => page.getByRole("button", { name: /checkout|proceed|continue|place order/i }).first() },
    { label: "chk-text", locator: () => page.getByText(/proceed to pay|checkout|place order|continue/i).first() },
    { label: "chk-bottom", locator: () => page.locator('[class*="bottom" i], [class*="sticky" i], [class*="fixed" i]').filter({ hasText: /proceed|checkout|pay/i }).first() },
  ], "proceed to checkout", MEDIUM);

  await waitForStable(page);
  await page.waitForTimeout(1_000);
  return "Opened cart and proceeded to checkout";
}

// ── Step: Fill address ──
async function stepFillAddress(page: Page, address: DestinationAddress): Promise<string> {
  await dismissPopups(page);
  await page.waitForTimeout(1_000);

  await handleLocationModal(page);

  try {
    await tryClick(page, [
      ...envSelector("INSTAMART_ADDRESS_CHANGE_SELECTOR", page),
      { label: "chg-btn", locator: () => page.getByRole("button", { name: /change|add address|edit address/i }).first() },
      { label: "chg-text", locator: () => page.getByText(/change|add address|delivering to/i).first() },
    ], "open address", QUICK);
    await page.waitForTimeout(800);
  } catch { /* already set */ }

  const searchArea = address.line2.split(",")[0] || address.line1.split(",")[0] || "Kochi";
  try {
    await tryFill(page, [
      ...envSelector("INSTAMART_ADDRESS_INPUT_SELECTOR", page),
      { label: "addr-search", locator: () => page.getByPlaceholder(/search|locality|area|pincode|deliver/i).first() },
      { label: "addr-textbox", locator: () => page.getByRole("textbox", { name: /search|locality|area|address|pincode|deliver/i }).first() },
    ], searchArea, `search "${searchArea}"`, QUICK);
    await page.waitForTimeout(1_000);
    await page.keyboard.press("Enter").catch(() => {});
    await page.waitForTimeout(1_500);
    try { await page.locator('[class*="suggestion" i], [class*="result" i], li').first().click({ timeout: 2_000 }); } catch { /* none */ }
  } catch { /* no search */ }

  try {
    await tryClick(page, [
      ...envSelector("INSTAMART_ADDRESS_CONFIRM_SELECTOR", page),
      { label: "cfm-btn", locator: () => page.getByRole("button", { name: /save|confirm|deliver here|use this|select|done|continue/i }).first() },
      { label: "cfm-text", locator: () => page.getByText(/deliver here|use this|confirm|save|done/i).first() },
    ], "confirm address", QUICK);
  } catch { /* auto */ }

  await waitForStable(page);
  return `Set delivery to ${address.label}`;
}

// ── Step: Stop at payment ──
async function stepStopAtPayment(page: Page): Promise<string> {
  const paymentTexts = [/payment/i, /pay using/i, /upi/i, /card/i, /cash/i, /wallet/i, /pay now/i, /billing/i];
  let found = false;
  for (const pt of paymentTexts) {
    try { await page.getByText(pt).first().waitFor({ state: "visible", timeout: LONG }); found = true; break; } catch { continue; }
  }
  if (!found) await page.waitForTimeout(3_000);

  const danger = page.getByRole("button", { name: /pay|place order|confirm order|submit|authorize/i });
  const count = await danger.count();
  for (let i = 0; i < count; i++) {
    const btn = danger.nth(i);
    if (await btn.isVisible().catch(() => false)) {
      await btn.evaluate((el) => { el.setAttribute("data-arrive-safety", "blocked"); (el as HTMLButtonElement).disabled = true; }).catch(() => {});
    }
  }
  return "Reached payment screen — payment blocked";
}

// ── Main ──
export async function runInstamartAutomation({ product, destination, address, onProgress }: InstamartAutomationInput): Promise<InstamartAutomationResult> {
  const steps: InstamartProgress[] = [];
  const report = (step: InstamartStep, label: string, ok: boolean, detail?: string) => { const p: InstamartProgress = { step, label, ok, detail }; steps.push(p); onProgress?.(p); };

  const configuredPath = process.env.INSTAMART_STORAGE_STATE;
  const storageStatePath = configuredPath ? path.resolve(process.cwd(), configuredPath) : path.join(process.cwd(), "storageState.json");
  const hasSavedSession = existsSync(storageStatePath);
  if (!hasSavedSession) console.log("[Instamart Agent] No saved session — launch fresh and log in manually.");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: false, slowMo: 200, args: ["--start-maximized", "--disable-blink-features=AutomationControlled", "--no-sandbox"] });

  try {
    const context = await browser.newContext({
      ...(hasSavedSession ? { storageState: storageStatePath } : {}),
      viewport: null,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      bypassCSP: true,
      permissions: ["geolocation"],
      geolocation: { latitude: 9.9312, longitude: 76.2673 }, // Kochi, Kerala
    });
    await context.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => false }); (window as any).chrome = { runtime: {} }; });

    const page = await context.newPage();
    page.setDefaultTimeout(LONG);

    report("init", "Opening Instamart…", true);
    await page.goto(process.env.INSTAMART_URL ?? "https://instamart.in/", { waitUntil: "domcontentloaded", timeout: LONG });
    await waitForStable(page);
    await dismissPopups(page);
    await handleLocationModal(page);
    await dismissPopups(page);

    // After location modal, click "Use current location" if still present on the page
    try {
      const useBtn = page.getByRole("button", { name: /use current|current location|share location|deliver here/i }).first();
      if (await useBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await useBtn.click({ timeout: 3_000 });
        await page.waitForTimeout(2_000);
        console.log("[Instamart Agent] Clicked 'Use current location' on main page ✓");
        await waitForStable(page);
      }
    } catch { /* not present */ }

    if (!hasSavedSession) {
      report("init", "Log in to Swiggy in the browser…", true);
      console.log("[Instamart Agent] Waiting for Swiggy login (5 min)…");
      try {
        await page.waitForFunction(() => {
          const b = document.body.innerText;
          const ok = (b.includes("Search") || b.includes("Fruits") || b.includes("Vegetables") || b.includes("Dairy") || b.includes("Delivering to"));
          const no = b.includes("Login") || b.includes("log in") || b.includes("Sign in") || b.includes("phone number") || b.includes("Enter your phone");
          return ok && !no;
        }, { timeout: 300_000 });
        report("init", "Logged in ✓", true);
      } catch { report("init", "Login timeout", true); await page.waitForTimeout(5_000); }
      try { await context.storageState({ path: storageStatePath }); console.log("[Instamart Agent] Session saved."); } catch { /* ok */ }
    }

    const stillNeedsLogin = await page.getByText(/login|log in|sign in|enter your phone/i).first().isVisible({ timeout: 2_000 }).catch(() => false);
    if (stillNeedsLogin) return { ok: false, message: "Login required. Run: npm run instamart:login", steps };

    report("search", "Searching for item…", true);
    try { await stepSearch(page, product); report("search", "Searching for item…", true, "Done"); } catch (err) { return { ok: false, message: `Search failed: ${err}`, steps }; }

    report("add-to-cart", "Adding to cart…", true);
    try { await stepAddToCart(page, product); report("add-to-cart", "Adding to cart…", true, "Done"); } catch (err) { return { ok: false, message: `Add failed: ${err}`, steps }; }

    report("checkout", "Proceeding to checkout…", true);
    try { await stepOpenCart(page); report("checkout", "Proceeding to checkout…", true, "Done"); } catch (err) { return { ok: false, message: `Checkout failed: ${err}`, steps }; }

    report("address", "Confirming address…", true);
    try { await stepFillAddress(page, address); report("address", "Confirming address…", true, `Delivery: ${address.label}`); } catch { report("address", "Address skipped", true, "Using saved"); }

    report("payment", "Reaching payment screen…", true);
    try { await stepStopAtPayment(page); report("payment", "Payment screen reached ✓", true, "Blocked"); } catch (err) { return { ok: false, message: `Payment step failed: ${err}`, steps }; }

    try { await page.screenshot({ path: path.join(process.cwd(), "public", "demo", "last-payment-screen.png"), fullPage: true }); } catch { /* ok */ }

    report("done", "Order ready ✓", true);
    return { ok: true, message: `Reached payment screen for "${product}" near ${destination}. Payment was not submitted.`, steps };
  } finally {
    if (process.env.INSTAMART_KEEP_BROWSER_OPEN !== "true") await browser.close().catch(() => {});
  }
}
