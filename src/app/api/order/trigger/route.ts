import { NextRequest, NextResponse } from "next/server";
import { metroDemoData, type Station } from "@/lib/demo-data";
import {
  getActiveRun,
  getOrderStatus,
  setActiveRun,
  setOrderStatus,
} from "@/lib/order-status";
import { runInstamartAutomation } from "@/lib/playwright-instamart";

type TriggerBody = {
  boarding?: Station;
  destination?: Station;
};

function shouldUseDemoMode() {
  return process.env.DEMO_MODE === "true";
}

const DEMO_CHECKOUT_STEPS = [
  { label: "Opening Instamart…", delay: 800 },
  { label: "Searching for item…", delay: 1200 },
  { label: "Adding to cart…", delay: 1000 },
  { label: "Proceeding to checkout…", delay: 1500 },
  { label: "Confirming delivery address…", delay: 1200 },
  { label: "Reached payment screen ✓", delay: 1300 },
] as const;

function simulateDemoCheckout(destination: Station, message: string) {
  const videoUrl = process.env.DEMO_VIDEO_URL ?? "/demo/instamart-fallback.mp4";

  setOrderStatus({
    phase: "demo-video",
    message,
    product: metroDemoData.product,
    destination,
    mode: "demo-video",
    startedAt: new Date().toISOString(),
    videoUrl,
    checkoutStep: 0,
    checkoutTotalSteps: DEMO_CHECKOUT_STEPS.length,
  } as OrderStatus);

  let stepIndex = 0;
  function advanceStep() {
    if (stepIndex >= DEMO_CHECKOUT_STEPS.length) return;
    const step = DEMO_CHECKOUT_STEPS[stepIndex];
    stepIndex++;

    setOrderStatus({
      phase: "demo-video",
      message: step.label,
      product: metroDemoData.product,
      destination,
      mode: "demo-video",
      startedAt: new Date().toISOString(),
      videoUrl,
      checkoutStep: stepIndex,
      checkoutTotalSteps: DEMO_CHECKOUT_STEPS.length,
    } as OrderStatus);

    if (stepIndex < DEMO_CHECKOUT_STEPS.length) {
      setTimeout(advanceStep, DEMO_CHECKOUT_STEPS[stepIndex].delay);
    } else {
      setTimeout(() => {
        setOrderStatus({
          phase: "success",
          message: "Checkout reached the payment screen. Payment was not submitted.",
          product: metroDemoData.product,
          destination,
          mode: "demo-video",
          completedAt: new Date().toISOString(),
          videoUrl,
          checkoutStep: DEMO_CHECKOUT_STEPS.length,
          checkoutTotalSteps: DEMO_CHECKOUT_STEPS.length,
        } as OrderStatus);
      }, 500);
    }
  }

  setTimeout(advanceStep, DEMO_CHECKOUT_STEPS[0].delay);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as TriggerBody;
  const destination = body.destination;

  if (!destination || !metroDemoData.stations.includes(destination)) {
    return NextResponse.json({ ok: false, message: "Invalid destination station." }, { status: 400 });
  }

  const current = getOrderStatus();
  if (getActiveRun() || current.phase === "arranging" || current.phase === "demo-video") {
    return NextResponse.json({ ok: true, status: current });
  }

  if (shouldUseDemoMode()) {
    simulateDemoCheckout(destination, "DEMO_MODE is true. Simulating Instamart checkout…");
    return NextResponse.json({ ok: true, status: getOrderStatus() });
  }

  const run = (async () => {
    // Map agent steps → frontend checkout step indices
    const STEP_MAP: Record<string, number> = {
      init: 0,
      search: 1,
      "add-to-cart": 2,
      checkout: 3,
      address: 4,
      payment: 5,
      done: 6,
    };
    const TOTAL_STEPS = 6;

    setOrderStatus({
      phase: "arranging",
      message: "Launching Playwright browser…",
      product: metroDemoData.product,
      destination,
      mode: "live-playwright",
      startedAt: new Date().toISOString(),
      checkoutStep: 0,
      checkoutTotalSteps: TOTAL_STEPS,
    } as OrderStatus);

    const result = await runInstamartAutomation({
      product: metroDemoData.product,
      destination,
      address: metroDemoData.destinationAddresses[destination],
      onProgress: (p) => {
        const stepIdx = STEP_MAP[p.step] ?? 0;
        setOrderStatus({
          phase: p.step === "done" ? "success" : "arranging",
          message: p.ok ? p.label : `⚠ ${p.label}`,
          product: metroDemoData.product,
          destination,
          mode: "live-playwright",
          startedAt: new Date().toISOString(),
          checkoutStep: p.ok ? Math.min(stepIdx, TOTAL_STEPS) : stepIdx,
          checkoutTotalSteps: TOTAL_STEPS,
        } as OrderStatus);
      },
    });

    if (!result.ok) {
      simulateDemoCheckout(destination, `${result.message} Falling back to simulated checkout.`);
      return;
    }

    setOrderStatus({
      phase: "success",
      message: result.message,
      product: metroDemoData.product,
      destination,
      mode: "live-playwright",
      completedAt: new Date().toISOString(),
      checkoutStep: TOTAL_STEPS,
      checkoutTotalSteps: TOTAL_STEPS,
    } as OrderStatus);
  })()
    .catch((error: unknown) => {
      simulateDemoCheckout(
        destination,
        `${error instanceof Error ? error.message : "Playwright failed."} Falling back to simulated checkout.`,
      );
    })
    .finally(() => {
      setActiveRun(null);
    });

  setActiveRun(run);
  return NextResponse.json({ ok: true, status: getOrderStatus() });
}
