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

function playDemoVideoFallback(destination: Station, message: string) {
  const videoUrl = process.env.DEMO_VIDEO_URL ?? "/demo/instamart-fallback.mp4";

  setOrderStatus({
    phase: "demo-video",
    message,
    product: metroDemoData.product,
    destination,
    mode: "demo-video",
    startedAt: new Date().toISOString(),
    videoUrl,
  });

  // DEMO STUB — simulates the pre-recorded checkout reaching payment.
  windowlessDelay(7_000).then(() => {
    setOrderStatus({
      phase: "success",
      message: "Demo video reached the payment screen. Payment was not submitted.",
      product: metroDemoData.product,
      destination,
      mode: "demo-video",
      completedAt: new Date().toISOString(),
      videoUrl,
    });
  });
}

function windowlessDelay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    playDemoVideoFallback(destination, "DEMO_MODE is true. Playing the recorded checkout fallback.");
    return NextResponse.json({ ok: true, status: getOrderStatus() });
  }

  const run = (async () => {
    setOrderStatus({
      phase: "arranging",
      message: "Launching headed Playwright and arranging the cart.",
      product: metroDemoData.product,
      destination,
      mode: "live-playwright",
      startedAt: new Date().toISOString(),
    });

    const result = await runInstamartAutomation({
      product: metroDemoData.product,
      destination,
      address: metroDemoData.destinationAddresses[destination],
    });

    if (!result.ok) {
      playDemoVideoFallback(destination, `${result.message} Falling back to recorded demo.`);
      return;
    }

    setOrderStatus({
      phase: "success",
      message: result.message,
      product: metroDemoData.product,
      destination,
      mode: "live-playwright",
      completedAt: new Date().toISOString(),
    });
  })()
    .catch((error: unknown) => {
      playDemoVideoFallback(
        destination,
        `${error instanceof Error ? error.message : "Playwright failed."} Falling back to recorded demo.`,
      );
    })
    .finally(() => {
      setActiveRun(null);
    });

  setActiveRun(run);
  return NextResponse.json({ ok: true, status: getOrderStatus() });
}
