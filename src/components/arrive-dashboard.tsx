"use client";

import { CheckCircle2, CircleDot, Play, RotateCcw, ShoppingBasket, TrainFront, Video } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { MetroDemoData, Station } from "@/lib/demo-data";

type Props = {
  demoData: MetroDemoData;
};

type ServerOrderStatus = {
  phase: "idle" | "arranging" | "demo-video" | "success" | "failed";
  message: string;
  product?: string;
  destination?: Station;
  mode?: "live-playwright" | "demo-video";
  videoUrl?: string;
};

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function routeKey(boarding: Station, destination: Station) {
  return `${boarding}:${destination}` as const;
}

export function ArriveDashboard({ demoData }: Props) {
  const [boarding, setBoarding] = useState<Station>("Vyttila");
  const [destination, setDestination] = useState<Station>("MG Road");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [status, setStatus] = useState<ServerOrderStatus>({
    phase: "idle",
    message: "Waiting for countdown trigger.",
  });
  const triggerStarted = useRef(false);

  const selectedSeconds = useMemo(
    () => demoData.countdownSecondsByRoute[routeKey(boarding, destination)],
    [boarding, demoData.countdownSecondsByRoute, destination],
  );
  const progress = countdown === null || selectedSeconds === 0 ? 0 : 100 - (countdown / selectedSeconds) * 100;
  const address = demoData.destinationAddresses[destination];

  useEffect(() => {
    if (countdown === null || countdown <= 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setCountdown((current) => (current === null ? current : Math.max(0, current - 1)));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [countdown]);

  useEffect(() => {
    if (
      countdown === null ||
      triggerStarted.current ||
      countdown > demoData.triggerThresholdSeconds ||
      boarding === destination
    ) {
      return;
    }

    triggerStarted.current = true;
    setStatus({
      phase: "arranging",
      message: "Arranging your order...",
      product: demoData.product,
      destination,
    });

    fetch("/api/order/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boarding, destination }),
    }).catch(() => {
      setStatus({
        phase: "failed",
        message: "Could not reach the local trigger route.",
        product: demoData.product,
        destination,
      });
    });
  }, [boarding, countdown, demoData.product, demoData.triggerThresholdSeconds, destination]);

  useEffect(() => {
    if (status.phase !== "arranging" && status.phase !== "demo-video") {
      return;
    }

    const interval = window.setInterval(async () => {
      const response = await fetch("/api/order/status");
      const nextStatus = (await response.json()) as ServerOrderStatus;
      setStatus(nextStatus);
    }, 1200);

    return () => window.clearInterval(interval);
  }, [status.phase]);

  async function startTrip() {
    await fetch("/api/order/reset", { method: "POST" });
    triggerStarted.current = false;
    setCountdown(selectedSeconds);
    setStatus({
      phase: "idle",
      message: `Order trigger armed for the last ${demoData.triggerThresholdSeconds} seconds.`,
      product: demoData.product,
      destination,
    });
  }

  async function resetTrip() {
    await fetch("/api/order/reset", { method: "POST" });
    triggerStarted.current = false;
    setCountdown(null);
    setStatus({
      phase: "idle",
      message: "Waiting for countdown trigger.",
    });
  }

  const isComplete = status.phase === "success";
  const isRunning = countdown !== null;
  const hasRoute = boarding !== destination;

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl gap-4 p-4 lg:grid-cols-[1.4fr_0.9fr]">
      <section className="grid gap-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h1 className="text-lg font-semibold tracking-normal">ArriveOnTime</h1>
            <p className="text-xs text-muted-foreground">Metro ETA trigger · Instamart checkout demo</p>
          </div>
          <Badge variant={isComplete ? "success" : "secondary"}>{isComplete ? "ready" : "demo"}</Badge>
        </div>

        <Card>
          <CardHeader className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="boarding">Boarding Station</Label>
              <Select
                id="boarding"
                value={boarding}
                onChange={(event) => setBoarding(event.target.value as Station)}
                disabled={isRunning}
              >
                {demoData.stations.map((station) => (
                  <option key={station} value={station}>
                    {station}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="destination">Destination Station</Label>
              <Select
                id="destination"
                value={destination}
                onChange={(event) => setDestination(event.target.value as Station)}
                disabled={isRunning}
              >
                {demoData.stations.map((station) => (
                  <option key={station} value={station}>
                    {station}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={startTrip} disabled={!hasRoute || isRunning} className="gap-2">
                <Play className="h-4 w-4" />
                Start
              </Button>
              <Button onClick={resetTrip} variant="outline" size="icon" aria-label="Reset demo">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!hasRoute ? (
              <p className="text-sm text-destructive">Choose two different stations.</p>
            ) : (
              <div className="grid gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TrainFront className="h-4 w-4" />
                  <span>
                    {boarding} → {destination} · trigger at {demoData.triggerThresholdSeconds}s
                  </span>
                </div>
                <div className="rounded-md border bg-background p-4">
                  <div className="font-mono text-7xl font-semibold leading-none tracking-normal">
                    {formatTime(countdown ?? selectedSeconds)}
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-sm bg-muted">
                    <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Instamart</CardTitle>
              <CardDescription>Auto-triggered at final minute. Payment is never submitted.</CardDescription>
            </div>
            {isComplete ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
            ) : status.phase === "demo-video" ? (
              <Video className="h-5 w-5 text-primary" />
            ) : (
              <ShoppingBasket className="h-5 w-5 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex items-center gap-2">
              <CircleDot className="h-3 w-3 text-primary" />
              <span className="text-sm">{isComplete ? "Order ready — arriving with you." : status.message}</span>
            </div>
            <div className="grid gap-2 rounded-md border bg-background p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Item</span>
                <span>{demoData.product}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Drop</span>
                <span className="text-right">{address.label}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Mode</span>
                <span>{status.mode ?? "armed"}</span>
              </div>
            </div>
            {status.phase === "demo-video" && status.videoUrl ? (
              <video className="aspect-video w-full rounded-md border bg-black" src={status.videoUrl} autoPlay muted controls />
            ) : null}
          </CardContent>
        </Card>
      </section>

      <aside className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Route Data</CardTitle>
            <CardDescription>DEMO DATA — replace with live KMRL feed in production.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Board</span>
              <span>{boarding}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Arrive</span>
              <span>{destination}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Timer</span>
              <span className="font-mono">{selectedSeconds}s</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Uber</CardTitle>
            <CardDescription>same pattern applies to ride-hailing.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Driver</span>
              <span>{demoData.uber.driver}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Car</span>
              <span className="text-right">{demoData.uber.car}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">ETA</span>
              <span>{demoData.uber.eta}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Pickup</span>
              <span>{demoData.uber.pickup}</span>
            </div>
          </CardContent>
        </Card>
      </aside>
    </main>
  );
}
