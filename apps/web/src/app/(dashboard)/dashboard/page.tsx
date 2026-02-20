import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Dashboard — ClubOS",
};

export default function DashboardPage() {
    return (
        <div style={{ padding: "32px 24px" }}>
            <h1
                style={{
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    color: "#171410",
                    letterSpacing: "-0.02em",
                }}
            >
                Dashboard
            </h1>
            <p style={{ color: "#78746a", marginTop: "8px", fontSize: "0.9375rem" }}>
                Bem-vindo ao ClubOS. Em breve: visão geral de sócios e cobranças.
            </p>
        </div>
    );
}