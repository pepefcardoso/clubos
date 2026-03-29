import type { Metadata } from "next";
import { ReconciliationPage } from "@/components/reconciliation/ReconciliationPage";

export const metadata: Metadata = {
  title: "Conciliação Bancária — ClubOS",
};

export default function Page() {
  return <ReconciliationPage />;
}
