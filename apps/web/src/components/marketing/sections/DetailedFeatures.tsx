import {
    Database,
    CheckCircle2,
    Lock,
    WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MODULES = [
    {
        version: "v1.0 — v1.5",
        title: "O Cofre & O Campo",
        description: "Gestão financeira resiliente e monitoramento de performance em tempo real, mesmo sem internet.",
        features: [
            "Cobrança Recorrente Pix com Multi-Acquiring (Resiliência total)",
            "Régua de Cobrança via WhatsApp (D-3, D-0, D+3)",
            "Arquitetura Offline-First para registro de treinos no campo",
            "Cálculo automático de ACWR (Carga Aguda vs. Crônica)",
            "Carteirinha Digital PWA com assinatura digital"
        ],
        highlight: "Inadimplência -25%",
        color: "bg-primary-50 border-primary-100",
        iconColor: "text-primary-600"
    },
    {
        version: "v2.0",
        title: "O Vestiário (Atual)",
        description: "Segurança de dados clínicos (LGPD) e conformidade total com a Lei das SAF.",
        features: [
            "FisioBase: Prontuário com criptografia AES-256",
            "Status RTP (Retorno ao Jogo) integrado à escalação",
            "Publicação de Balanços com integridade SHA-256",
            "Controle de Acesso via QR Code assinado",
            "Portal de Transparência para Acionistas"
        ],
        highlight: "Lei 14.193/2021",
        color: "bg-neutral-900 border-neutral-800 text-white",
        iconColor: "text-accent-400"
    },
    {
        version: "v2.5 — v3.5",
        title: "Próximos Passos",
        description: "Expansão para bilheteria digital, marketplace de atletas e gestão de ligas.",
        features: [
            "ArenaPass: Bilheteria Digital e PDV Mobile",
            "ScoutLink: Showcase de atletas com dados verificados",
            "CampeonatOS: Gestão de súmulas e tabelas ao vivo",
            "CRM de Torcedor e Funil de Conversão",
            "Verificação de Elegibilidade via CPF"
        ],
        highlight: "Ecossistema Completo",
        color: "bg-white border-neutral-200",
        iconColor: "text-neutral-400"
    }
];

export function DetailedFeatures() {
    return (
        <section className="bg-neutral-50 py-24 border-t border-neutral-200" aria-labelledby="detailed-features-heading">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="mb-16">
                    <h2 id="detailed-features-heading" className="text-3xl font-bold text-neutral-900 tracking-tight mb-4">
                        Uma plataforma, <span className="text-primary-600">todas as dimensões</span> do seu clube.
                    </h2>
                    <p className="text-neutral-500 max-w-2xl leading-relaxed">
                        Do financeiro ao departamento médico, unificamos os dados para que a gestão seja baseada em fatos, não em intuição.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {MODULES.map((module, i) => (
                        <div
                            key={i}
                            className={cn(
                                "relative rounded-3xl border p-8 flex flex-col h-full shadow-sm transition-transform hover:-translate-y-1 duration-300",
                                module.color
                            )}
                        >
                            <div className="mb-6 flex justify-between items-start">
                                <span className="text-[0.625rem] font-bold uppercase tracking-widest opacity-60">
                                    {module.version}
                                </span>
                                <span className="font-mono text-[0.625rem] font-bold px-2 py-1 rounded bg-black/5">
                                    {module.highlight}
                                </span>
                            </div>

                            <h3 className="text-xl font-bold mb-3">{module.title}</h3>
                            <p className={cn("text-sm mb-8 leading-relaxed opacity-80")}>
                                {module.description}
                            </p>

                            <ul className="space-y-4 mb-8 flex-1">
                                {module.features.map((feature, j) => (
                                    <li key={j} className="flex items-start gap-3 text-sm">
                                        <CheckCircle2 size={16} className={cn("mt-0.5 shrink-0", module.iconColor)} aria-hidden="true" />
                                        <span className="opacity-90">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 pt-12 border-t border-neutral-200">
                    <div className="flex gap-4">
                        <Lock size={20} className="text-primary-500 shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-neutral-900">Segurança Bancária</p>
                            <p className="text-xs text-neutral-500 mt-1">Criptografia AES-256 e isolamento de dados por clube (Multi-tenant).</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <WifiOff size={20} className="text-primary-500 shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-neutral-900">Resiliência Total</p>
                            <p className="text-xs text-neutral-500 mt-1">Tecnologia PWA com sincronização em background para áreas sem sinal.</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <Database size={20} className="text-primary-500 shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-neutral-900">Imutabilidade</p>
                            <p className="text-xs text-neutral-500 mt-1">Audit Log completo e hashes SHA-256 para documentos oficiais.</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}