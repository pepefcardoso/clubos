import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { formatBRL } from "@/lib/format";
import type { PurchaseTicketResult } from "@/lib/api/events-public";

interface Props {
    result: PurchaseTicketResult;
}

export function PixPaymentResult({ result }: Props) {
    const [copied, setCopied] = useState(false);
    const { gatewayMeta, sectorName, amountCents } = result;

    function handleCopy() {
        if (!gatewayMeta.pixCopyPaste) return;
        navigator.clipboard.writeText(gatewayMeta.pixCopyPaste).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        });
    }

    return (
        <div className="flex flex-col items-center gap-6 py-4">
            <div className="flex flex-col items-center gap-1 text-center">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 text-primary-700 text-xs font-medium px-2.5 py-0.5">
                    Aguardando pagamento
                </span>
                <p className="text-neutral-500 text-sm mt-2">
                    Setor <span className="font-semibold text-neutral-800">{sectorName}</span>
                    {" · "}
                    <span className="font-mono font-semibold text-neutral-900">
                        {formatBRL(amountCents)}
                    </span>
                </p>
            </div>

            {gatewayMeta.qrCodeBase64 && (
                <div className="border border-neutral-200 rounded-lg p-3 shadow-sm bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={`data:image/png;base64,${gatewayMeta.qrCodeBase64}`}
                        alt="QR Code PIX para pagamento"
                        width={220}
                        height={220}
                        className="block"
                    />
                </div>
            )}

            {gatewayMeta.pixCopyPaste && (
                <div className="w-full">
                    <p className="text-xs font-medium text-neutral-500 mb-1.5">
                        Pix Copia e Cola
                    </p>
                    <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-md px-3 py-2">
                        <code className="flex-1 text-xs text-neutral-700 break-all font-mono">
                            {gatewayMeta.pixCopyPaste}
                        </code>
                        <button
                            type="button"
                            onClick={handleCopy}
                            aria-label="Copiar código PIX"
                            className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded px-2 py-1 transition-colors"
                        >
                            {copied ? (
                                <Check size={14} aria-hidden="true" />
                            ) : (
                                <Copy size={14} aria-hidden="true" />
                            )}
                            {copied ? "Copiado!" : "Copiar"}
                        </button>
                    </div>
                </div>
            )}

            <p className="text-xs text-neutral-400 text-center">
                O código expira em 24 horas. Após o pagamento, você receberá a confirmação por e-mail.
            </p>
        </div>
    );
}