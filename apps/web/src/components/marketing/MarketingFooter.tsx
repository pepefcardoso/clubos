import Link from "next/link";
import { Shield } from "lucide-react";

const FOOTER_LINKS = {
  produto: [
    { label: "Preços", href: "/precos" },
    { label: "Contato", href: "/contato" },
    { label: "Começar grátis", href: "/onboarding" },
  ],
  conta: [{ label: "Entrar", href: "/login" }],
  legal: [
    { label: "Termos de Uso", href: "/termos" },
    { label: "Privacidade", href: "/privacidade" },
  ],
};

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-neutral-800 bg-neutral-900 text-neutral-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
          <div className="space-y-5 md:col-span-2">
            <Link
              href="/"
              className="flex items-center gap-2.5 group w-fit"
              aria-label="ClubOS — página inicial"
            >
              <div className="w-8 h-8 rounded-xl bg-primary-600 flex items-center justify-center flex-shrink-0 shadow-inner transition-transform duration-300 group-hover:scale-105">
                <Shield
                  size={16}
                  className="text-white"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
              </div>
              <span className="text-[1.0625rem] font-bold text-white tracking-tight">
                ClubOS
              </span>
            </Link>
            <p className="text-sm text-neutral-400 max-w-sm leading-relaxed">
              A plataforma definitiva de gestão financeira para clubes de
              futebol. Esqueça as planilhas e reduza a inadimplência com
              automação inteligente.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-5">
              Produto
            </h3>
            <ul className="space-y-3.5">
              {FOOTER_LINKS.produto.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-neutral-400 hover:text-primary-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-5">
              Conta
            </h3>
            <ul className="space-y-3.5">
              {FOOTER_LINKS.conta.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-neutral-400 hover:text-primary-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-neutral-500">
            © {year} ClubOS. Todos os direitos reservados.
          </p>

          <nav aria-label="Links legais" className="flex items-center gap-6">
            {FOOTER_LINKS.legal.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
