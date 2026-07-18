import { NextResponse } from "next/server";
import { resetOrderStatus } from "@/lib/order-status";

export async function POST() {
  resetOrderStatus();
  return NextResponse.json({ ok: true });
}
