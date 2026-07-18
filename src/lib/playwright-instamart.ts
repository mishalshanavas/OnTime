import { existsSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "playwright";
import type { DestinationAddress, Station } from "@/lib/demo-data";

export type InstamartAutomationInput = {
  product: string;
  destination: Station;
  address: DestinationAddress;
};

export type InstamartAutomationResult = {
  ok: boolean;
  message: string;
};

type Candidate = {
  label: string;
  locator: () => Locator;
};

const shortTimeout = 4_000;
const longTimeout = 25_000;

function envSelector(name: string, page: Page): Candidate[] {
  const selector = process.env[name];
  if (!selector) {
    return [];
  }

  return [
    {
      label: `${name} (${selector})`,
      locator: () => page.locator(selector).first(),
    },
  ];
}

async function visible(candidate: Candidate) {
  const locator = candidate.locator();
  await locator.waitFor({ state: "visible", timeout: shortTimeout });
  return locator;
}

async function clickFirst(candidates: Candidate[], action: string) {
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const locator = await visible(candidate);
      await locator.click();
      return candidate.label;
    } catch (error) {
      errors.push(`${candidate.label}: ${error instanceof Error ? error.message : "not available"}`);
    }
  }

  throw new Error(`Could not ${action}. Tried ${errors.length} selector candidates.`);
}

async function fillFirst(candidates: Candidate[], value: string, action: string) {
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const locator = await visible(candidate);
      await locator.fill(value);
      return candidate.label;
    } catch (error) {
      errors.push(`${candidate.label}: ${error instanceof Error ? error.message : "not available"}`);
    }
  }

  throw new Error(`Could not ${action}. Tried ${errors.length} selector candidates.`);
}

async function dismissDemoBlockers(page: Page) {
  // DEMO HARDENING — these labels cover common location/promo prompts without depending on one DOM shape.
  const labels = [/not now/i, /skip/i, /maybe later/i, /later/i, /continue/i, /allow/i];

  for (const label of labels) {
    try {
      await page.getByRole("button", { name: label }).click({ timeout: 1_000 });
    } catch {
      // Optional prompt was not present.
    }
  }
}

async function searchProduct(page: Page, product: string) {
  await clickFirst(
    [
      ...envSelector("INSTAMART_SEARCH_ENTRY_SELECTOR", page),
      { label: "Search link/button by role", locator: () => page.getByRole("link", { name: /search/i }).first() },
      { label: "Search button by role", locator: () => page.getByRole("button", { name: /search/i }).first() },
      { label: "Visible Search text", locator: () => page.getByText(/search/i).first() },
    ],
    "open Instamart search",
  ).catch(() => undefined);

  const used = await fillFirst(
    [
      ...envSelector("INSTAMART_SEARCH_INPUT_SELECTOR", page),
      { label: "Search textbox by role", locator: () => page.getByRole("textbox", { name: /search/i }).first() },
      { label: "Search placeholder", locator: () => page.getByPlaceholder(/search/i).first() },
      { label: "Search input", locator: () => page.locator('input[type="search"]').first() },
      { label: "Any visible text input", locator: () => page.locator("input").first() },
    ],
    product,
    `type product search "${product}"`,
  );

  await page.keyboard.press("Enter");
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(1_500);
  return used;
}

async function addProductToCart(page: Page, product: string) {
  const productCard = page
    .locator("article, li, div")
    .filter({ hasText: new RegExp(product.split(" ")[0], "i") })
    .first();

  return clickFirst(
    [
      ...envSelector("INSTAMART_ADD_TO_CART_SELECTOR", page),
      {
        label: "Add button inside matching product card",
        locator: () => productCard.getByRole("button", { name: /add|\+/i }).first(),
      },
      { label: "Any Add button", locator: () => page.getByRole("button", { name: /add|\+/i }).first() },
      { label: "Any Add text", locator: () => page.getByText(/^add$/i).first() },
    ],
    `add "${product}" to cart`,
  );
}

async function openCartAndCheckout(page: Page) {
  await clickFirst(
    [
      ...envSelector("INSTAMART_CART_SELECTOR", page),
      { label: "View cart button", locator: () => page.getByRole("button", { name: /view cart|cart|basket/i }).first() },
      { label: "View cart link", locator: () => page.getByRole("link", { name: /view cart|cart|basket/i }).first() },
      { label: "View cart text", locator: () => page.getByText(/view cart|go to cart|cart/i).first() },
    ],
    "open cart",
  );

  await page.waitForTimeout(1_000);

  return clickFirst(
    [
      ...envSelector("INSTAMART_CHECKOUT_SELECTOR", page),
      {
        label: "Checkout/proceed button",
        locator: () => page.getByRole("button", { name: /checkout|proceed|continue|place order/i }).first(),
      },
      { label: "Checkout/proceed text", locator: () => page.getByText(/checkout|proceed|continue|place order/i).first() },
    ],
    "continue from cart toward checkout",
  );
}

async function fillDeliveryAddress(page: Page, address: DestinationAddress) {
  const query = `${address.line1}, ${address.line2}`;

  await fillFirst(
    [
      ...envSelector("INSTAMART_ADDRESS_INPUT_SELECTOR", page),
      { label: "Address/location textbox", locator: () => page.getByRole("textbox", { name: /address|location|house|flat/i }).first() },
      { label: "Address/location placeholder", locator: () => page.getByPlaceholder(/address|location|house|flat|area/i).first() },
      { label: "Any visible text input", locator: () => page.locator("input").first() },
      { label: "Any visible textarea", locator: () => page.locator("textarea").first() },
    ],
    query,
    `fill delivery address "${query}"`,
  );

  await page.keyboard.press("Enter").catch(() => undefined);
  await page.waitForTimeout(1_500);

  await clickFirst(
    [
      ...envSelector("INSTAMART_ADDRESS_CONFIRM_SELECTOR", page),
      { label: "Save/confirm address button", locator: () => page.getByRole("button", { name: /save|confirm|deliver|use this|select/i }).first() },
      { label: "Save/confirm address text", locator: () => page.getByText(/save|confirm|deliver|use this|select/i).first() },
    ],
    "confirm delivery address",
  ).catch(() => undefined);
}

async function stopAtPaymentScreen(page: Page) {
  await page.waitForTimeout(2_000);

  const paymentIndicator = page
    .getByText(/payment|pay using|upi|card|cash|wallet|pay now/i)
    .first();

  await paymentIndicator.waitFor({ state: "visible", timeout: longTimeout });

  // ABSOLUTE SAFETY GUARD — do not click anything that could submit or authorize payment.
  const forbiddenPaymentAction = page.getByRole("button", { name: /pay|place order|confirm order|submit/i }).first();
  if (await forbiddenPaymentAction.isVisible().catch(() => false)) {
    await forbiddenPaymentAction.evaluate((element) => {
      element.setAttribute("data-arrive-on-time-payment-guard", "blocked");
      element.setAttribute("disabled", "true");
    });
  }
}

export async function runInstamartAutomation({
  product,
  destination,
  address,
}: InstamartAutomationInput): Promise<InstamartAutomationResult> {
  const configuredStorageState = process.env.INSTAMART_STORAGE_STATE;
  const storageStatePath = configuredStorageState
    ? path.resolve(/* turbopackIgnore: true */ process.cwd(), configuredStorageState)
    : path.join(process.cwd(), "storageState.json");

  if (!existsSync(storageStatePath)) {
    return {
      ok: false,
      message: `Missing ${path.basename(storageStatePath)}. Log in manually, export Playwright storage state, and place it at ${storageStatePath}.`,
    };
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: false,
    slowMo: 250,
    args: ["--start-maximized"],
  });

  try {
    const context = await browser.newContext({
      storageState: storageStatePath,
      viewport: null,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(longTimeout);

    await page.goto(process.env.INSTAMART_URL ?? "https://www.swiggy.com/instamart", {
      waitUntil: "domcontentloaded",
    });
    await dismissDemoBlockers(page);

    if (await page.getByText(/log in|login|sign in/i).first().isVisible().catch(() => false)) {
      return {
        ok: false,
        message: "Saved Instamart session is expired. Run npm run instamart:login, log in, then trigger again.",
      };
    }

    await searchProduct(page, product);
    await addProductToCart(page, product);
    await openCartAndCheckout(page);
    await fillDeliveryAddress(page, address);
    await stopAtPaymentScreen(page);

    await page.screenshot({
      path: path.join(process.cwd(), "public", "demo", "last-payment-screen.png"),
      fullPage: true,
    });

    return {
      ok: true,
      message: `Reached payment screen for ${product} near ${destination}. Payment was not submitted.`,
    };
  } finally {
    if (process.env.INSTAMART_KEEP_BROWSER_OPEN !== "true") {
      await browser.close();
    }
  }
}
