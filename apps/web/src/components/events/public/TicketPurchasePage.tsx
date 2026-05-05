"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Calendar, AlertTriangle, Ticket } from "lucide-react";
import {
  fetchPublicEventDetails,
  purchaseTicketPublic,
  type PublicEventDetails,
  type PurchaseTicketResult,
} from "@/lib/api/events-public";
import { formatBRL } from "@/lib/format";
import { PixPaymentResult } from "./PixPaymentResult";

interface Props {
  initialEvent: PublicEventDetails;
  clubSlug: string;
  eventId: string;
}

type PurchaseState = "form" | "submitting" | "success";

const POLL_INTERVAL_MS = 10_000;

function formatEventDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function stripNonDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function TicketPurchasePage({ initialEvent, clubSlug, eventId }: Props) {
  const [event, setEvent] = useState<PublicEventDetails>(initialEvent);
  const [purchaseState, setPurchaseState] = useState<PurchaseState>("form");
  const [purchaseResult, setPurchaseResult] = useState<PurchaseTicketResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [sectorId, setSectorId] = useState("");
  const [fanName, setFanName] = useState("");
  const [fanEmail, setFanEmail] = useState("");
  const [fanPhone, setFanPhone] = useState("");
  const [fanCpf, setFanCpf] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (purchaseState !== "form") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const fresh = await fetchPublicEventDetails(clubSlug, eventId);
        setEvent(fresh);
      } catch {
        // silent — stale availability is acceptable
      }
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [purchaseState, clubSlug, eventId]);

  const isScheduled = event.status === "SCHEDULED";
  const selectedSector = event.sectors.find((s) => s.id === sectorId) ?? null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    if (!sectorId) { setFormError("Selecione um setor."); return; }
    if (!selectedSector || selectedSector.available === 0) {
      setFormError("Setor sem disponibilidade."); return;
    }

    setPurchaseState("submitting");

    try {
      const result = await purchaseTicketPublic(clubSlug, eventId, {
        sectorId,
        fanName: fanName.trim(),
        fanEmail: fanEmail.trim(),
        fanPhone: stripNonDigits(fanPhone),
        fanCpf: stripNonDigits(fanCpf),
      });
      setPurchaseResult(result);
      setPurchaseState("success");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao realizar compra.");
      setPurchaseState("form");
    }
  }

  return (
    <section
      aria-labelledby="ticket-heading"
      className="bg-neutral-50 py-16 px-4 min-h-[calc(100vh-4rem)]"
    >
      <div className="max-w-lg mx-auto">
        <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary-600 mb-4">
            <Ticket size={13} aria-hidden="true" />
            Compra de Ingresso
          </div>
          <h1
            id="ticket-heading"
            className="text-3xl font-bold text-neutral-900 tracking-tight"
          >
            {event.opponent}
          </h1>
          <div className="mt-3 flex flex-col gap-1.5 text-sm text-neutral-500">
            <div className="flex items-center gap-2">
              <Calendar size={14} aria-hidden="true" />
              <span>{formatEventDate(event.eventDate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin size={14} aria-hidden="true" />
              <span>{event.venue}</span>
            </div>
          </div>
          {event.description && (
            <p className="mt-3 text-sm text-neutral-500 leading-relaxed">{event.description}</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 fill-mode-both">
          {purchaseState === "success" && purchaseResult ? (
            <PixPaymentResult result={purchaseResult} />
          ) : !isScheduled ? (
            <div className="flex items-start gap-3 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p>
                As vendas para este evento estão encerradas.
                O evento está com status{" "}
                <strong className="font-semibold">{event.status}</strong>.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <fieldset disabled={purchaseState === "submitting"} className="flex flex-col gap-5">
                <legend className="text-base font-semibold text-neutral-900 mb-1">
                  Seus dados
                </legend>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="sectorId"
                    className="text-sm font-medium text-neutral-700"
                  >
                    Setor <span className="text-danger" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="sectorId"
                    value={sectorId}
                    onChange={(e) => setSectorId(e.target.value)}
                    required
                    className="h-9 rounded border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  >
                    <option value="">Selecione um setor</option>
                    {event.sectors.map((s) => (
                      <option key={s.id} value={s.id} disabled={s.available === 0}>
                        {s.name} — {formatBRL(s.priceCents)}
                        {s.available === 0 ? " (Esgotado)" : ` (${s.available} disponíveis)`}
                      </option>
                    ))}
                  </select>
                  {selectedSector && selectedSector.available > 0 && (
                    <p className="text-xs text-neutral-500">
                      Valor:{" "}
                      <span className="font-mono font-semibold text-neutral-800">
                        {formatBRL(selectedSector.priceCents)}
                      </span>
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="fanName" className="text-sm font-medium text-neutral-700">
                    Nome completo <span className="text-danger" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="fanName"
                    type="text"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={120}
                    value={fanName}
                    onChange={(e) => setFanName(e.target.value)}
                    className="h-9 rounded border border-neutral-300 px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="fanEmail" className="text-sm font-medium text-neutral-700">
                    E-mail <span className="text-danger" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="fanEmail"
                    type="email"
                    autoComplete="email"
                    required
                    value={fanEmail}
                    onChange={(e) => setFanEmail(e.target.value)}
                    className="h-9 rounded border border-neutral-300 px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="fanPhone" className="text-sm font-medium text-neutral-700">
                    Telefone <span className="text-danger" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="fanPhone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="numeric"
                    required
                    placeholder="(11) 99999-9999"
                    value={fanPhone}
                    onChange={(e) => setFanPhone(e.target.value)}
                    className="h-9 rounded border border-neutral-300 px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="fanCpf" className="text-sm font-medium text-neutral-700">
                    CPF <span className="text-danger" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="fanCpf"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    maxLength={14}
                    placeholder="000.000.000-00"
                    value={fanCpf}
                    onChange={(e) => setFanCpf(e.target.value)}
                    className="h-9 rounded border border-neutral-300 px-3 font-mono text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  />
                  <p className="text-xs text-neutral-400">
                    Usado apenas para emissão da cobrança PIX — não armazenado.
                  </p>
                </div>

                {formError && (
                  <p role="alert" className="text-sm text-danger">
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={purchaseState === "submitting"}
                  className="h-9 px-4 text-sm font-semibold bg-primary-500 text-white rounded hover:bg-primary-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                  {purchaseState === "submitting" ? "Processando…" : "Gerar cobrança PIX"}
                </button>
              </fieldset>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}