"use client";

import { useRef, useState } from "react";
import {
  Upload,
  ArrowLeftRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Loader2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReconciliation } from "@/hooks/use-reconciliation";
import { ReconciliationApiError } from "@/lib/api/reconciliation";
import { MatchTable } from "./MatchTable";

function SummaryBar({
  total,
  matched,
  ambiguous,
  unmatched,
  skippedDebits,
  selectedCount,
}: {
  total: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
  skippedDebits: number;
  selectedCount: number;
}) {
  return (
    <div className="flex flex-wrap gap-3 items-center p-4 bg-neutral-50 rounded-md border border-neutral-200">
      <div className="flex items-center gap-1.5 text-sm">
        <CheckCircle2
          size={15}
          className="text-primary-600"
          aria-hidden="true"
        />
        <span className="font-semibold text-primary-700">{matched}</span>
        <span className="text-neutral-500">
          correspondência{matched !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="w-px h-4 bg-neutral-200" />
      <div className="flex items-center gap-1.5 text-sm">
        <AlertTriangle
          size={15}
          className="text-amber-500"
          aria-hidden="true"
        />
        <span className="font-semibold text-amber-700">{ambiguous}</span>
        <span className="text-neutral-500">
          ambígu{ambiguous !== 1 ? "os" : "o"}
        </span>
      </div>
      <div className="w-px h-4 bg-neutral-200" />
      <div className="flex items-center gap-1.5 text-sm">
        <XCircle size={15} className="text-neutral-400" aria-hidden="true" />
        <span className="font-semibold text-neutral-600">{unmatched}</span>
        <span className="text-neutral-500">sem correspondência</span>
      </div>
      {skippedDebits > 0 && (
        <>
          <div className="w-px h-4 bg-neutral-200" />
          <span className="text-xs text-neutral-400">
            {skippedDebits} débito{skippedDebits !== 1 ? "s" : ""} ignorado
            {skippedDebits !== 1 ? "s" : ""}
          </span>
        </>
      )}
      <div className="ml-auto text-sm text-neutral-600">
        <span className="font-semibold text-neutral-900">{selectedCount}</span>
        {" de "}
        {total} selecionado{selectedCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

function UploadStep({
  onFileSelect,
  isLoading,
  errorMessage,
}: {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  errorMessage: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[360px] px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary-50 border border-primary-100 mb-4">
            <ArrowLeftRight
              size={22}
              className="text-primary-600"
              aria-hidden="true"
            />
          </div>
          <h2 className="text-lg font-semibold text-neutral-900">
            Conciliação Bancária
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Faça upload do extrato OFX para cruzar com as cobranças pendentes.
          </p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !isLoading && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          className={[
            "relative flex flex-col items-center justify-center gap-3",
            "rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer",
            isLoading
              ? "border-neutral-200 bg-neutral-50 cursor-not-allowed"
              : isDragging
                ? "border-primary-400 bg-primary-50"
                : "border-neutral-300 bg-neutral-50 hover:border-primary-400 hover:bg-primary-50",
          ].join(" ")}
          aria-label="Área de upload do arquivo OFX. Clique ou arraste o arquivo."
        >
          <input
            ref={inputRef}
            type="file"
            accept=".ofx"
            className="sr-only"
            onChange={handleFileInput}
            disabled={isLoading}
            aria-hidden="true"
          />

          {isLoading ? (
            <>
              <Loader2
                size={32}
                className="text-primary-500 animate-spin"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-neutral-700">
                Processando extrato…
              </p>
            </>
          ) : (
            <>
              <Upload
                size={32}
                className="text-neutral-400"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium text-neutral-700">
                  Arraste o arquivo aqui ou{" "}
                  <span className="text-primary-600 underline">
                    clique para selecionar
                  </span>
                </p>
                <p className="text-xs text-neutral-400 mt-1">
                  Apenas .ofx · Máximo 2 MB · OFX 1.x e 2.x suportados
                </p>
              </div>
            </>
          )}
        </div>

        {errorMessage && (
          <p className="mt-3 text-sm text-center text-red-600" role="alert">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}

function MatchingStep() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[320px] gap-4">
      <Loader2
        size={36}
        className="text-primary-500 animate-spin"
        aria-hidden="true"
      />
      <p className="text-sm text-neutral-600 font-medium">
        Buscando correspondências com as cobranças abertas…
      </p>
    </div>
  );
}

function DoneStep({
  confirmedCount,
  onReset,
}: {
  confirmedCount: number;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[320px] gap-5">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary-50 border border-primary-100">
        <CheckCircle2
          size={32}
          className="text-primary-600"
          aria-hidden="true"
        />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-neutral-900">
          Conciliação concluída
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          {confirmedCount} pagamento{confirmedCount !== 1 ? "s" : ""} confirmado
          {confirmedCount !== 1 ? "s" : ""} com sucesso.
        </p>
      </div>
      <Button variant="secondary" onClick={onReset}>
        <RotateCcw size={15} aria-hidden="true" />
        Nova conciliação
      </Button>
    </div>
  );
}

export function ReconciliationPage() {
  const rec = useReconciliation();
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileSelect = (file: File) => {
    setUploadError(null);

    if (!file.name.toLowerCase().endsWith(".ofx")) {
      setUploadError("Apenas arquivos com extensão .ofx são aceitos.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError("O arquivo excede o limite de 2 MB.");
      return;
    }

    rec.uploadMutation.mutate(file, {
      onError: (err) => {
        const msg =
          err instanceof ReconciliationApiError
            ? err.message
            : "Não foi possível processar o arquivo. Tente novamente.";
        setUploadError(msg);
        rec.reset();
      },
    });
  };

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            Conciliação Bancária
          </h1>
          <p className="text-neutral-500 mt-1 text-[0.9375rem]">
            Cruze o extrato OFX com as cobranças pendentes do clube.
          </p>
        </div>

        {rec.step === "review" && rec.statement && (
          <div className="text-right">
            <div className="flex items-center gap-1.5 text-sm text-neutral-600">
              <FileText size={14} aria-hidden="true" />
              <span className="font-mono">
                {rec.statement.account.bankId || "—"} /{" "}
                {rec.statement.account.acctId || "—"}
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              {new Intl.DateTimeFormat("pt-BR").format(
                new Date(rec.statement.startDate),
              )}{" "}
              –{" "}
              {new Intl.DateTimeFormat("pt-BR").format(
                new Date(rec.statement.endDate),
              )}
              {" · "}
              {rec.statement.currency}
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 shadow-sm">
        {rec.step === "upload" && (
          <UploadStep
            onFileSelect={handleFileSelect}
            isLoading={rec.uploadMutation.isPending}
            errorMessage={uploadError}
          />
        )}

        {rec.step === "matching" && <MatchingStep />}

        {rec.step === "review" && rec.matchResult && (
          <div className="p-4 space-y-4">
            <SummaryBar
              total={rec.matchResult.summary.total}
              matched={rec.matchResult.summary.matched}
              ambiguous={rec.matchResult.summary.ambiguous}
              unmatched={rec.matchResult.summary.unmatched}
              skippedDebits={rec.matchResult.summary.skippedDebits}
              selectedCount={rec.selected.size}
            />

            <MatchTable
              matches={rec.matchResult.matches}
              selected={rec.selected}
              overrides={rec.overrides}
              getEffectiveChargeId={rec.getEffectiveChargeId}
              getEffectiveMethod={rec.getEffectiveMethod}
              onToggleSelected={rec.toggleSelected}
              onSelectAll={rec.selectAll}
              onDeselectAll={rec.deselectAll}
              onChargeOverride={rec.setChargeOverride}
              onMethodOverride={rec.setMethodOverride}
            />

            <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
              <Button
                variant="secondary"
                onClick={rec.reset}
                disabled={rec.isConfirming}
              >
                <RotateCcw size={14} aria-hidden="true" />
                Cancelar
              </Button>

              <Button
                onClick={rec.confirmAll}
                disabled={rec.selected.size === 0 || rec.isConfirming}
              >
                {rec.isConfirming ? (
                  <span className="flex items-center gap-2">
                    <Loader2
                      size={14}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                    Confirmando…
                  </span>
                ) : (
                  <>
                    <CheckCircle2 size={14} aria-hidden="true" />
                    Confirmar selecionados ({rec.selected.size})
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {rec.step === "done" && (
          <DoneStep confirmedCount={rec.confirmedCount} onReset={rec.reset} />
        )}
      </div>
    </div>
  );
}
