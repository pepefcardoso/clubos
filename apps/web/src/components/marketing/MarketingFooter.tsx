import Link from "next/link";
import { Shield } from "lucide-react";

const FOOTER_LINKS = {
    produto: [
        { label: "Preços", href: "/precos" },
        { label: "Contato", href: "/contato" },
        { label: "Começar grátis", href: "/onboarding" },
    ],
    conta: [
        { label: "Entrar", href: "/login" },
    ],
};

export function MarketingFooter() {
    const year = new Date().getFullYear();

    return (
        <footer className="border-t border-neutral-200 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-3">
                        <Link
                            href="/"
                            className="flex items-center gap-2.5"
                            aria-label="ClubOS — página inicial"
                        >
                            <div className="w-7 h-7 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
                                <Shield size={14} className="text-white" strokeWidth={2} aria-hidden="true" />
                            </div>
                            <span className="text-[0.9375rem] font-bold text-neutral-900 tracking-tight">
                                ClubOS
                            </span>
                        </Link>
                        <p className="text-sm text-neutral-500 max-w-[220px] leading-relaxed">
                            Gestão financeira para clubes de futebol. Reduza a inadimplência com cobranças automáticas.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                            Produto
                        </h3>
                        <ul className="space-y-2.5">
                            {FOOTER_LINKS.produto.map((link) => (
                                <li key={link.href}>
                                    <Link
                                        href={link.href}
                                        className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
                                    >
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
                            Conta
                        </h3>
                        <ul className="space-y-2.5">
                            {FOOTER_LINKS.conta.map((link) => (
                                <li key={link.href}>
                                    <Link
                                        href={link.href}
                                        className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
                                    >
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="mt-10 pt-6 border-t border-neutral-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <p className="text-xs text-neutral-400">
                        © {year} ClubOS. Todos os direitos reservados.
                    </p>
                    {/* T-future: add Privacidade / Termos links here */}
                </div>
            </div>
        </footer>
    );
}