import type { Metadata } from "next";
import { MedicalDashboardPage } from "@/components/medical/MedicalDashboardPage";

export const metadata: Metadata = {
  title: "Saúde dos Atletas — ClubOS",
};

export default function Page() {
  return <MedicalDashboardPage />;
}
