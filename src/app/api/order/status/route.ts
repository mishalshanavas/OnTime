import { NextResponse } from "next/server";
import { getOrderStatus } from "@/lib/order-status";

export async function GET() {
  return NextResponse.json(getOrderStatus());
}
