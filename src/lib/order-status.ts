import type { Station } from "@/lib/demo-data";

export type OrderPhase = "idle" | "arranging" | "demo-video" | "success" | "failed";

export type OrderStatus = {
  phase: OrderPhase;
  message: string;
  product?: string;
  destination?: Station;
  mode?: "live-playwright" | "demo-video";
  startedAt?: string;
  completedAt?: string;
  videoUrl?: string;
};

const initialStatus: OrderStatus = {
  phase: "idle",
  message: "Waiting for countdown trigger.",
};

// DEMO STATE — intentionally in-memory and reset on server restart.
let orderStatus: OrderStatus = initialStatus;
let activeRun: Promise<void> | null = null;

export function getOrderStatus() {
  return orderStatus;
}

export function setOrderStatus(status: OrderStatus) {
  orderStatus = status;
}

export function resetOrderStatus() {
  orderStatus = initialStatus;
  activeRun = null;
}

export function getActiveRun() {
  return activeRun;
}

export function setActiveRun(run: Promise<void> | null) {
  activeRun = run;
}
