/**
 * Sample data used exclusively for the in-editor live preview.
 * These values are never sent to the API.
 */
export const PREVIEW_VARS = {
    nome: "João da Silva",
    valor: "R$ 99,00",
    pix_link: "00020126580014br.gov.bcb.pix0136a629532e-7693-4846-b028-f142082f9a9e5204000053039865802BR5913Clube Futebol6009SAO PAULO62070503***6304B14A",
    vencimento: "15/04/2025",
} as const;

/**
 * Substitutes known placeholders in a template body with preview sample values.
 *
 * Mirrors the backend `renderTemplate` logic exactly:
 * - Uses global regex for multiple occurrences of the same placeholder.
 * - Unknown `{...}` sequences are left untouched.
 */
export function renderPreview(body: string): string {
    return body
        .replace(/\{nome\}/g, PREVIEW_VARS.nome)
        .replace(/\{valor\}/g, PREVIEW_VARS.valor)
        .replace(/\{pix_link\}/g, PREVIEW_VARS.pix_link)
        .replace(/\{vencimento\}/g, PREVIEW_VARS.vencimento);
}

interface TemplatePreviewProps {
    body: string;
    channel: "WHATSAPP" | "EMAIL";
}

/**
 * Renders the interpolated template body as a channel-appropriate UI bubble.
 *
 * WHATSAPP → dark-green chat bubble (right-aligned, WhatsApp style)
 * EMAIL    → white card with a light border (email card style)
 */
export function TemplatePreview({ body, channel }: TemplatePreviewProps) {
    const rendered = renderPreview(body);

    if (channel === "EMAIL") {
        return (
            <div className="rounded-md border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 border-b border-neutral-100 pb-3">
                    <div className="h-3 w-3 rounded-full bg-neutral-300" aria-hidden="true" />
                    <div className="h-2.5 w-32 rounded bg-neutral-200" aria-hidden="true" />
                </div>
                <p
                    className="text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed break-words"
                    aria-label="Pré-visualização do e-mail"
                >
                    {rendered}
                </p>
            </div>
        );
    }

    return (
        <div className="flex justify-end" aria-label="Pré-visualização da mensagem WhatsApp">
            <div
                className="relative max-w-[85%] rounded-lg rounded-tr-none bg-[#075e54] px-3.5 py-2.5 shadow-sm"
                style={{ backgroundColor: "#075e54" }}
            >
                <div
                    className="absolute right-0 top-0 h-0 w-0 translate-x-full"
                    style={{
                        borderLeft: "8px solid #075e54",
                        borderTop: "8px solid transparent",
                    }}
                    aria-hidden="true"
                />
                <p className="text-sm text-white whitespace-pre-wrap leading-relaxed break-words">
                    {rendered}
                </p>
                <p className="mt-1 text-right text-[10px] text-emerald-200 select-none">
                    {new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date())}
                </p>
            </div>
        </div>
    );
}