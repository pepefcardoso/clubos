import type { Metadata } from "next";
import { FileText, ShieldCheck, ExternalLink } from "lucide-react";
import { fetchPublicBalanceSheets } from "@/lib/api/balance-sheets";

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const displaySlug = slug.replace(/-/g, " ");

    return {
        title: `Transparência SAF — ${displaySlug} — ClubOS`,
        description:
            "Balanços financeiros publicados em conformidade com a Lei 14.193/2021 (Lei das SAF).",
        robots: { index: true, follow: true },
        openGraph: {
            title: `Transparência SAF — ${displaySlug}`,
            description:
                "Documentos financeiros publicados pelo clube em conformidade com a Lei das SAF.",
            type: "website",
        },
    };
}

function formatDate(iso: string): string {
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
    }).format(new Date(iso));
}

function EmptyState() {
    return (
        <div className="text-center py-20 bg-white rounded-lg border border-neutral-200">
            <FileText
                size={48}
                className="mx-auto text-neutral-300 mb-3"
                aria-hidden="true"
            />
            <p className="text-neutral-600 font-medium text-[0.9375rem]">
                Nenhum balanço publicado
            </p>
            <p className="text-neutral-400 text-sm mt-1">
                Os documentos aparecerão aqui assim que forem publicados pelo clube.
            </p>
        </div>
    );
}

export default async function TransparencyPage({ params }: Props) {
    const { slug } = await params;

    let result = { data: [] as Awaited<ReturnType<typeof fetchPublicBalanceSheets>>["data"], total: 0 };
    try {
        result = await fetchPublicBalanceSheets(slug);
    } catch {
        // Network error or unknown slug — fall through to empty state
    }

    return (
        <section
            aria-labelledby="transparency-heading"
            className="min-h-[calc(100vh-4rem)] bg-neutral-50 py-16 px-4"
        >
            <div className="max-w-3xl mx-auto">

                <div className="mb-10">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary-600 mb-3">
                        <ShieldCheck size={14} aria-hidden="true" />
                        Transparência SAF · Lei 14.193/2021
                    </div>

                    <h1
                        id="transparency-heading"
                        className="text-3xl font-bold text-neutral-900 tracking-tight"
                    >
                        Balanços Financeiros
                    </h1>

                    <p className="mt-2 text-neutral-500 text-sm leading-relaxed max-w-xl">
                        Documentos publicados em conformidade com a{" "}
                        <a
                            href="https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14193.htm"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-neutral-700 transition-colors"
                        >
                            Lei das Sociedades Anônimas do Futebol
                        </a>
                        . Os arquivos são imutáveis após publicação. Verifique a
                        integridade pelo hash SHA-256 listado em cada documento.
                    </p>
                </div>

                {result.data.length === 0 ? (
                    <EmptyState />
                ) : (
                    <ul
                        className="space-y-3"
                        aria-label={`${result.total} balanço${result.total !== 1 ? "s" : ""} publicado${result.total !== 1 ? "s" : ""}`}
                    >
                        {result.data.map((sheet) => (
                            <li
                                key={sheet.id}
                                className="flex items-start justify-between gap-4 bg-white rounded-lg
                           border border-neutral-200 px-5 py-4
                           hover:shadow-sm hover:border-neutral-300 transition-all"
                            >
                                <div className="flex items-start gap-3 min-w-0">
                                    <FileText
                                        size={20}
                                        className="text-primary-500 flex-shrink-0 mt-0.5"
                                        aria-hidden="true"
                                    />
                                    <div className="min-w-0">
                                        <p className="font-semibold text-neutral-900 text-sm">
                                            {sheet.title}
                                        </p>
                                        <p className="text-xs text-neutral-500 mt-0.5">
                                            Período:{" "}
                                            <span className="font-medium text-neutral-700">
                                                {sheet.period}
                                            </span>{" "}
                                            · Publicado em {formatDate(sheet.publishedAt)}
                                        </p>
                                        <p
                                            className="text-[0.625rem] font-mono text-neutral-400 mt-1.5 truncate"
                                            title={`SHA-256: ${sheet.fileHash}`}
                                        >
                                            <span className="text-neutral-300 select-none">
                                                SHA-256:{" "}
                                            </span>
                                            {sheet.fileHash}
                                        </p>
                                    </div>
                                </div>

                                <a
                                    href={sheet.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold
                             text-primary-600 hover:text-primary-700 hover:bg-primary-50
                             rounded px-3 py-1.5 border border-primary-200 transition-colors
                             whitespace-nowrap focus-visible:outline-none
                             focus-visible:ring-2 focus-visible:ring-primary-500"
                                    aria-label={`Baixar ${sheet.title} (PDF)`}
                                >
                                    <ExternalLink size={12} aria-hidden="true" />
                                    Baixar PDF
                                </a>
                            </li>
                        ))}
                    </ul>
                )}

                <p className="mt-10 text-xs text-neutral-400 text-center">
                    Documentos publicados via{" "}
                    <a
                        href="https://clubos.com.br"
                        className="underline hover:text-neutral-600 transition-colors"
                    >
                        ClubOS
                    </a>{" "}
                    · Plataforma de gestão para clubes de futebol
                </p>
            </div>
        </section>
    );
}