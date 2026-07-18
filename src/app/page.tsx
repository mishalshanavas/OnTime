import { ArriveDashboard } from "@/components/arrive-dashboard";
import { metroDemoData } from "@/lib/demo-data";

export default function Home() {
  return <ArriveDashboard demoData={metroDemoData} />;
}
