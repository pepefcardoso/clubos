import type { Metadata } from "next";
import { ExpensesPage } from "@/components/expenses/ExpensesPage";

export const metadata: Metadata = {
    title: "Despesas — ClubOS",
};

export default function Page() {
    return <ExpensesPage />;
}