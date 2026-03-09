"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, Menu, X, ArrowRight } from "lucide-react";
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
        <header className="sticky top-0 z-50 w-full border-b border-neutral-200/80 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/60 transition-all duration-300">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 flex h-16 items-center justify-between">

                <Link
                    href="/"
                    className="flex items-center gap-2.5 flex-shrink-0 group"
                    aria-label="ClubOS — página inicial"
                >
                    <div className="w-8 h-8 rounded-xl bg-primary-600 flex items-center justify-center shadow-inner transition-transform duration-300 group-hover:scale-105">
                        <Shield size={16} className="text-white" strokeWidth={2.5} aria-hidden="true" />
                    </div>
                    <span className="text-[1.0625rem] font-bold text-neutral-900 tracking-tight">
                        ClubOS
                    </span>
                </Link>

                <nav className="hidden md:flex items-center gap-8" aria-label="Navegação principal">
                    {NAV_LINKS.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                                "text-sm font-semibold transition-colors",
                                pathname === link.href
                                    ? "text-primary-600"
                                    : "text-neutral-500 hover:text-neutral-900",
                            )}
                            aria-current={pathname === link.href ? "page" : undefined}
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>

                <div className="hidden md:flex items-center gap-4">
                    <Link href="/login" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900 transition-colors">
                        Entrar
                    </Link>
                    <Link href="/onboarding">
                        <Button
                            size="sm"
                            className="bg-accent-500 hover:bg-accent-600 text-white border-none shadow-md shadow-accent-500/20 px-5 font-bold group"
                        >
                            Começar grátis
                            <ArrowRight size={14} className="ml-1.5 transition-transform group-hover:translate-x-0.5" />
                        </Button>
                    </Link>
                </div>

                <button
                    type="button"
                    className="md:hidden p-2 -mr-2 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                    onClick={() => setMobileOpen((v) => !v)}
                    aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
                    aria-expanded={mobileOpen}
                >
                    {mobileOpen
                        ? <X size={24} aria-hidden="true" />
                        : <Menu size={24} aria-hidden="true" />
                    }
                </button>
            </div>

            {mobileOpen && (
                <div className="md:hidden absolute top-16 left-0 w-full border-b border-neutral-200 bg-white shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-4 py-6 space-y-6">
                        <nav className="flex flex-col gap-4" aria-label="Navegação mobile">
                            {NAV_LINKS.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    onClick={() => setMobileOpen(false)}
                                    className={cn(
                                        "text-base font-semibold transition-colors",
                                        pathname === link.href
                                            ? "text-primary-600"
                                            : "text-neutral-600",
                                    )}
                                    aria-current={pathname === link.href ? "page" : undefined}
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </nav>
                        <div className="flex flex-col gap-3 pt-6 border-t border-neutral-100">
                            <Link href="/login" onClick={() => setMobileOpen(false)}>
                                <Button variant="secondary" className="w-full h-11 font-semibold">
                                    Entrar
                                </Button>
                            </Link>
                            <Link href="/onboarding" onClick={() => setMobileOpen(false)}>
                                <Button className="w-full h-11 bg-accent-500 hover:bg-accent-600 text-white border-none shadow-md font-bold">
                                    Começar grátis
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}