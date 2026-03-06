"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
    { label: "Preços", href: "/precos" },
    { label: "Contato", href: "/contato" },
];

export function MarketingHeader() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const pathname = usePathname();

    return (
        <header className="sticky top-0 z-40 w-full border-b border-neutral-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 flex h-16 items-center justify-between">
                <Link
                    href="/"
                    className="flex items-center gap-2.5 flex-shrink-0"
                    aria-label="ClubOS — página inicial"
                >
                    <div className="w-7 h-7 rounded-lg bg-primary-500 flex items-center justify-center">
                        <Shield size={14} className="text-white" strokeWidth={2} aria-hidden="true" />
                    </div>
                    <span className="text-[0.9375rem] font-bold text-neutral-900 tracking-tight">
                        ClubOS
                    </span>
                </Link>

                <nav className="hidden md:flex items-center gap-6" aria-label="Navegação principal">
                    {NAV_LINKS.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                                "text-sm font-medium transition-colors",
                                pathname === link.href
                                    ? "text-primary-600"
                                    : "text-neutral-600 hover:text-neutral-900",
                            )}
                            aria-current={pathname === link.href ? "page" : undefined}
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>

                <div className="hidden md:flex items-center gap-3">
                    <Link href="/login">
                        <Button variant="secondary" size="sm">
                            Entrar
                        </Button>
                    </Link>
                    <Link href="/onboarding">
                        <Button size="sm">Começar grátis</Button>
                    </Link>
                </div>

                <button
                    type="button"
                    className="md:hidden p-2 rounded text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                    onClick={() => setMobileOpen((v) => !v)}
                    aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
                    aria-expanded={mobileOpen}
                >
                    {mobileOpen
                        ? <X size={20} aria-hidden="true" />
                        : <Menu size={20} aria-hidden="true" />
                    }
                </button>
            </div>

            {mobileOpen && (
                <div className="md:hidden border-t border-neutral-100 bg-white px-4 py-4 space-y-3">
                    <nav className="flex flex-col gap-1" aria-label="Navegação mobile">
                        {NAV_LINKS.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={() => setMobileOpen(false)}
                                className={cn(
                                    "rounded px-3 py-2 text-sm font-medium transition-colors",
                                    pathname === link.href
                                        ? "bg-primary-50 text-primary-700"
                                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                                )}
                                aria-current={pathname === link.href ? "page" : undefined}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>
                    <div className="flex flex-col gap-2 pt-2 border-t border-neutral-100">
                        <Link href="/login" onClick={() => setMobileOpen(false)}>
                            <Button variant="secondary" size="sm" className="w-full">
                                Entrar
                            </Button>
                        </Link>
                        <Link href="/onboarding" onClick={() => setMobileOpen(false)}>
                            <Button size="sm" className="w-full">
                                Começar grátis
                            </Button>
                        </Link>
                    </div>
                </div>
            )}
        </header>
    );
}