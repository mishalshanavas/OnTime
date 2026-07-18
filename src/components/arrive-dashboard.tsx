"use client";

import { ArrowRight, Check, Circle, Loader2, MapPin, Play, RotateCcw, ShoppingBag, TrainFront } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MetroDemoData, Station } from "@/lib/demo-data";

type Props = { demoData: MetroDemoData };
type Step = "route" | "countdown" | "checkout" | "done";

type ServerOrderStatus = {
  phase: "idle" | "arranging" | "demo-video" | "success" | "failed";
  message: string; product?: string; destination?: Station;
  mode?: "live-playwright" | "demo-video"; checkoutStep?: number; checkoutTotalSteps?: number;
};

const STATIONS: Station[] = ["Aluva", "Edapally", "Palarivattom", "Kaloor", "Ernakulam South", "Kadavanthra", "Vyttila", "MG Road"];

const CHECKOUT_LABELS = ["Opening Instamart…", "Searching for item…", "Adding to cart…", "Proceeding to checkout…", "Confirming address…", "Payment screen ✓"];

function fmtTime(s: number) { const m = Math.floor(s / 60); return `${m}:${(s % 60).toString().padStart(2, "0")}`; }

// ── GitLab-style step badge ──
function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  if (done) return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#217645]/20 text-[#2f8a55]"><Check className="h-3 w-3" /></span>;
  if (active) return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#428fdc] text-[11px] font-semibold text-white">{n}</span>;
  return <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#444] text-[11px] text-[#666]">{n}</span>;
}

// ── Metro route sidebar ──
function RouteSidebar({ boarding, destination, onSelect, disabled }: { boarding: Station; destination: Station; onSelect: (s: Station) => void; disabled: boolean }) {
  const bI = STATIONS.indexOf(boarding), dI = STATIONS.indexOf(destination);
  const lo = Math.min(bI, dI), hi = Math.max(bI, dI);
  const active = bI !== dI;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-[#666]">Kochi Metro</div>
      {STATIONS.map((s, i) => {
        const isBoard = s === boarding, isDest = s === destination && active, onRoute = active && i >= lo && i <= hi;
        return (
          <button
            key={s}
            disabled={disabled}
            onClick={() => onSelect(s)}
            className={`group flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors ${
              isBoard ? "bg-[#c2252c]/15 text-[#e88c8c] font-medium" :
              isDest  ? "bg-[#217645]/15 text-[#5bb87a] font-medium" :
              onRoute ? "bg-[#428fdc]/10 text-[#8ab8e8]" :
              "text-[#86868b] hover:bg-[#2a2a30] hover:text-[#dcdcde]"
            }`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${
              isBoard ? "bg-[#c2252c]" : isDest ? "bg-[#2f8a55]" : onRoute ? "bg-[#428fdc]" : "bg-[#444]"
            }`} />
            <span className="truncate">{s}</span>
            {isBoard && <span className="ml-auto text-[10px] text-[#c2252c] font-semibold">ON</span>}
            {isDest && <span className="ml-auto text-[10px] text-[#2f8a55] font-semibold">OFF</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Main ──
export function ArriveDashboard({ demoData }: Props) {
  const [step, setStep] = useState<Step>("route");
  const [boarding, setBoarding] = useState<Station>("Vyttila");
  const [destination, setDestination] = useState<Station>("MG Road");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [status, setStatus] = useState<ServerOrderStatus>({ phase: "idle", message: "" });
  const triggeredRef = useRef(false);

  const hasRoute = boarding !== destination;
  const totalSeconds = useMemo(() => demoData.countdownSecondsByRoute[`${boarding}:${destination}` as const], [boarding, destination, demoData]);
  const stepIndex = step === "route" ? 0 : step === "countdown" ? 1 : step === "checkout" ? 2 : 3;
  const triggerAt = demoData.triggerThresholdSeconds;

  // Countdown
  useEffect(() => {
    if (!countdown || countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => (c && c > 1 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  // Trigger
  useEffect(() => {
    if (step !== "countdown" || countdown === null || triggeredRef.current || countdown > triggerAt) return;
    triggeredRef.current = true;
    fetch("/api/order/trigger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boarding, destination }) }).catch(() => {});
    setStatus({ phase: "arranging", message: "Launching…", product: demoData.product, destination });
    setStep("checkout");
  }, [step, countdown, boarding, destination, triggerAt, demoData.product]);

  // Poll
  useEffect(() => {
    if (step !== "checkout") return;
    const t = setInterval(async () => {
      try {
        const r = await fetch("/api/order/status");
        const next = (await r.json()) as ServerOrderStatus;
        setStatus(next);
        if (next.phase === "success") { setStep("done"); clearInterval(t); }
      } catch { /* retry */ }
    }, 1200);
    return () => clearInterval(t);
  }, [step]);

  const handleStationClick = useCallback((s: Station) => {
    if (s === boarding && s === destination) return;
    if (s === boarding) setDestination(boarding);
    setBoarding(s);
    if (s === destination) setDestination(boarding);
  }, [boarding, destination]);

  const handleStart = async () => {
    if (!hasRoute) return;
    await fetch("/api/order/reset", { method: "POST" });
    triggeredRef.current = false;
    setCountdown(totalSeconds);
    setStatus({ phase: "idle", message: "" });
    setStep("countdown");
  };

  const handleReset = async () => {
    await fetch("/api/order/reset", { method: "POST" });
    triggeredRef.current = false;
    setCountdown(null); setStatus({ phase: "idle", message: "" }); setStep("route");
  };

  const pct = countdown && totalSeconds ? 100 - (countdown / totalSeconds) * 100 : 0;

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ── */}
      <aside className="hidden w-52 shrink-0 border-r border-[#333] bg-[#1c1c20] p-3 md:flex md:flex-col md:gap-4">
        <div className="flex items-center gap-2 border-b border-[#333] pb-3">
          <TrainFront className="h-4 w-4 text-[#428fdc]" />
          <span className="text-[13px] font-semibold text-[#dcdcde]">OnTime</span>
        </div>
        <RouteSidebar boarding={boarding} destination={destination} onSelect={handleStationClick} disabled={step !== "route"} />
        {hasRoute && step === "route" && (
          <div className="mt-auto border-t border-[#333] pt-3">
            <div className="text-[10px] uppercase tracking-widest text-[#666] mb-1">Route info</div>
            <div className="text-[11px] text-[#86868b] space-y-0.5">
              <div className="flex justify-between"><span>{boarding} → {destination}</span></div>
              <div className="flex justify-between"><span>{totalSeconds}s trip</span><span className="text-[#428fdc]">trigger {triggerAt}s</span></div>
            </div>
          </div>
        )}
        {step !== "route" && (
          <button onClick={handleReset} className="mt-auto flex items-center gap-1.5 rounded border border-[#444] px-2 py-1.5 text-[11px] text-[#86868b] hover:bg-[#2a2a30] hover:text-[#dcdcde] transition-colors">
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </aside>

      {/* ── Main ── */}
      <main className="flex flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center gap-3 border-b border-[#333] px-4 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">ArriveOnTime</span>
          <div className="ml-auto flex items-center gap-0.5">
            {["Route", "Timer", "Checkout", "Done"].map((l, i) => (
              <div key={l} className="flex items-center gap-0.5">
                <StepBadge n={i + 1} active={i === stepIndex} done={i < stepIndex} />
                <span className={`text-[10px] ${i <= stepIndex ? "text-[#dcdcde]" : "text-[#555]"}`}>{l}</span>
                {i < 3 && <span className={`mx-0.5 h-px w-3 ${i < stepIndex ? "bg-[#2f8a55]/40" : "bg-[#333]"}`} />}
              </div>
            ))}
          </div>
        </header>

        {/* Content */}
        <div className="flex flex-1 items-center justify-center p-4">
          {/* Step: Route */}
          {step === "route" && (
            <div className="flex w-full max-w-sm flex-col gap-4">
              {/* Mobile station picker */}
              <div className="flex items-center gap-2 md:hidden">
                <select value={boarding} onChange={e => setBoarding(e.target.value as Station)} className="h-8 flex-1 rounded border border-[#333] bg-[#222228] px-2 text-[12px] text-[#dcdcde]">
                  {STATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ArrowRight className="h-4 w-4 shrink-0 text-[#666]" />
                <select value={destination} onChange={e => setDestination(e.target.value as Station)} className="h-8 flex-1 rounded border border-[#333] bg-[#222228] px-2 text-[12px] text-[#dcdcde]">
                  {STATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Route card */}
              {hasRoute ? (
                <div className="rounded border border-[#333] bg-[#222228] p-6 text-center">
                  <div className="mb-1 text-[10px] uppercase tracking-widest text-[#666]">Selected route</div>
                  <div className="mb-4 flex items-center justify-center gap-2 text-[15px] font-medium">
                    <span className="text-[#e88c8c]">{boarding}</span>
                    <ArrowRight className="h-4 w-4 text-[#666]" />
                    <span className="text-[#5bb87a]">{destination}</span>
                  </div>
                  <div className="mb-5 font-mono text-6xl font-bold tracking-tight">{fmtTime(totalSeconds)}</div>
                  <div className="mb-1 text-[11px] text-[#86868b]">
                    Order <span className="text-[#dcdcde]">{demoData.product}</span> triggers at{" "}
                    <span className="text-[#428fdc] font-medium">{triggerAt}s</span>
                  </div>
                  <button onClick={handleStart} className="mt-4 inline-flex items-center gap-1.5 rounded bg-[#428fdc] px-5 py-2 text-[13px] font-medium text-white hover:bg-[#559de3] transition-colors">
                    <Play className="h-3.5 w-3.5" /> Start trip
                  </button>
                </div>
              ) : (
                <div className="rounded border border-[#333] bg-[#222228] p-6 text-center text-[12px] text-[#86868b]">
                  Select two different stations in the sidebar to begin.
                </div>
              )}
            </div>
          )}

          {/* Step: Countdown */}
          {step === "countdown" && countdown !== null && (
            <div className="w-full max-w-sm rounded border border-[#333] bg-[#222228] p-8 text-center">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-[#666]">En route</div>
              <div className="mb-1 flex items-center justify-center gap-2 text-[13px] text-[#86868b]">
                <span>{boarding}</span><ArrowRight className="h-3 w-3" /><span>{destination}</span>
              </div>
              <div className="mb-3 font-mono text-7xl font-bold tracking-tight">{fmtTime(countdown)}</div>
              <div className="mx-auto mb-3 h-1 w-full max-w-[200px] overflow-hidden rounded-full bg-[#333]">
                <div className="h-full rounded-full transition-all duration-1000 ease-linear" style={{ width: `${pct}%`, background: countdown <= triggerAt ? "#c2252c" : "#428fdc" }} />
              </div>
              <p className="text-[11px] text-[#86868b]">
                {countdown <= triggerAt ? "⏳ Triggering order…" : `Instamart triggers at ${triggerAt}s`}
              </p>
              <div className="mt-4 rounded border border-[#333] bg-[#1a1a1e] px-3 py-2 text-[11px] text-[#86868b]">
                <ShoppingBag className="mr-1 inline h-3 w-3 text-[#428fdc]" />
                {demoData.product} → {destination}
              </div>
            </div>
          )}

          {/* Step: Checkout + Done */}
          {(step === "checkout" || step === "done") && (
            <div className="w-full max-w-sm rounded border border-[#333] bg-[#222228]">
              <div className="flex items-center gap-2 border-b border-[#333] px-4 py-3">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full ${step === "done" ? "bg-[#217645]/20 text-[#2f8a55]" : "bg-[#428fdc]/20 text-[#428fdc]"}`}>
                  {step === "done" ? <Check className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                </div>
                <div>
                  <div className="text-[13px] font-medium">{step === "done" ? "Order ready" : "Instamart checkout"}</div>
                  <div className="text-[11px] text-[#86868b]">{demoData.product} · {destination}</div>
                </div>
                <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${step === "done" ? "bg-[#217645]/20 text-[#2f8a55]" : "bg-[#428fdc]/20 text-[#428fdc]"}`}>
                  {step === "done" ? "done" : "running"}
                </span>
              </div>
              <div className="px-4 py-3 space-y-1">
                {CHECKOUT_LABELS.map((label, i) => {
                  const cStep = status.checkoutStep ?? 0;
                  const done = cStep > i, current = cStep === i;
                  return (
                    <div key={i} className={`flex items-center gap-2 rounded px-2 py-1.5 text-[11px] transition-colors ${done ? "text-[#5bb87a]" : current ? "bg-[#428fdc]/10 text-[#8ab8e8]" : "text-[#444]"}`}>
                      {done ? <Check className="h-3 w-3 shrink-0" /> : current ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <Circle className="h-3 w-3 shrink-0" />}
                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>
              {step === "done" && (
                <div className="border-t border-[#333] px-4 py-4 text-center">
                  <div className="mb-1 text-[13px] font-medium text-[#5bb87a]">Arriving with you!</div>
                  <div className="text-[11px] text-[#86868b]">Payment was not submitted.</div>
                  <button onClick={handleReset} className="mt-3 inline-flex items-center gap-1.5 rounded border border-[#444] px-4 py-1.5 text-[12px] text-[#86868b] hover:bg-[#2a2a30] hover:text-[#dcdcde] transition-colors">
                    <RotateCcw className="h-3 w-3" /> New trip
                  </button>
                </div>
              )}
              {step === "checkout" && (
                <div className="border-t border-[#333] px-4 py-2 text-center text-[10px] text-[#666]">{status.message}</div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
