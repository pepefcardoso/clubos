"use client";

import { useState, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    CheckCircle2,
    Loader2,
    Upload,
    AlertTriangle,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    tryoutFormSchema,
    type TryoutFormValues,
    getAgeFromBirthDate,
} from "@/lib/schemas/tryout.schema";

interface TryoutFormProps {
    clubSlug: string;
    clubName: string;
}

const GUARDIAN_RELATIONSHIP_OPTIONS = [
    { value: "mae", label: "Mãe" },
    { value: "pai", label: "Pai" },
    { value: "avo", label: "Avó / Avô" },
    { value: "tio", label: "Tio / Tia" },
    { value: "outro", label: "Outro responsável legal" },
] as const;

const POSITION_SUGGESTIONS = [
    "Goleiro",
    "Zagueiro",
    "Lateral Direito",
    "Lateral Esquerdo",
    "Volante",
    "Meia",
    "Atacante",
    "Ponta",
    "Centroavante",
];

export function TryoutForm({ clubSlug, clubName }: TryoutFormProps) {
    const [serverError, setServerError] = useState<string | null>(null);
    const [submitted, setSubmitted] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const {
        register,
        handleSubmit,
        control,
        formState: { errors, isSubmitting },
    } = useForm<TryoutFormValues>({
        resolver: zodResolver(tryoutFormSchema),
        defaultValues: { clubSlug },
    });

    const birthDateValue = useWatch({
        control,
        name: "birthDate",
    });

    const age = birthDateValue ? getAgeFromBirthDate(birthDateValue) : null;
    const isMinor = age !== null && age < 18;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        setSelectedFile(file);
    };

    const clearFile = () => {
        setSelectedFile(null);
        if (fileRef.current) fileRef.current.value = "";
    };

    const onSubmit = async (data: TryoutFormValues) => {
        setServerError(null);

        const formData = new FormData();

        (Object.keys(data) as (keyof TryoutFormValues)[]).forEach((key) => {
            const value = data[key];
            if (value !== undefined && value !== "") {
                formData.append(key, value as string);
            }
        });

        if (selectedFile) {
            formData.append("document", selectedFile);
        }

        try {
            const res = await fetch("/api/peneiras", {
                method: "POST",
                headers: { "X-Requested-With": "XMLHttpRequest" },
                body: formData,
            });

            if (!res.ok) {
                const json = (await res.json()) as { error?: string };
                setServerError(
                    json.error ?? "Erro ao enviar inscrição. Tente novamente.",
                );
                return;
            }

            setSubmitted(true);
        } catch {
            setServerError(
                "Erro de conexão. Verifique sua internet e tente novamente.",
            );
        }
    };

    if (submitted) {
        return (
            <div
                role="status"
                aria-live="polite"
                className="flex flex-col items-center justify-center gap-5 py-12 text-center animate-in fade-in zoom-in-95 duration-500"
            >
                <div className="w-20 h-20 rounded-full bg-primary-50 border-4 border-white shadow-xl flex items-center justify-center relative">
                    <div className="absolute inset-0 rounded-full bg-primary-100 animate-ping opacity-20" />
                    <CheckCircle2
                        size={40}
                        className="text-primary-600 relative z-10"
                        aria-hidden="true"
                    />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-neutral-900 tracking-tight mb-2">
                        Inscrição enviada!
                    </h2>
                    <p className="text-neutral-500 text-sm max-w-xs mx-auto leading-relaxed">
                        O{" "}
                        <span className="font-semibold text-neutral-700">{clubName}</span>{" "}
                        receberá os seus dados e entrará em contacto em breve.
                    </p>
                    {isMinor && (
                        <p className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 max-w-xs mx-auto leading-relaxed">
                            Como o atleta é menor de idade, o responsável poderá ser
                            contactado para assinar o termo de consentimento.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-6"
            noValidate
            encType="multipart/form-data"
        >
            <input type="hidden" {...register("clubSlug")} />

            {serverError && (
                <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium flex items-center gap-2 animate-in fade-in duration-300"
                >
                    <AlertTriangle size={16} className="flex-shrink-0" aria-hidden="true" />
                    {serverError}
                </div>
            )}

            <fieldset className="flex flex-col gap-4">
                <legend className="text-[0.6875rem] font-bold uppercase tracking-widest text-neutral-400 mb-1 select-none">
                    Dados do Atleta
                </legend>

                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="athleteName" className="font-semibold text-neutral-700">
                        Nome completo{" "}
                        <span className="text-danger" aria-hidden="true">
                            *
                        </span>
                    </Label>
                    <Input
                        id="athleteName"
                        type="text"
                        autoComplete="name"
                        placeholder="Nome completo do atleta"
                        aria-invalid={!!errors.athleteName}
                        aria-describedby={
                            errors.athleteName ? "athleteName-error" : undefined
                        }
                        className={cn(
                            "h-11",
                            errors.athleteName
                                ? "border-danger focus-visible:ring-danger/20"
                                : "hover:border-primary-300",
                        )}
                        {...register("athleteName")}
                    />
                    {errors.athleteName && (
                        <p
                            id="athleteName-error"
                            role="alert"
                            className="text-xs font-medium text-danger"
                        >
                            {errors.athleteName.message}
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="birthDate" className="font-semibold text-neutral-700">
                            Data de nascimento{" "}
                            <span className="text-danger" aria-hidden="true">
                                *
                            </span>
                        </Label>
                        <Input
                            id="birthDate"
                            type="date"
                            aria-invalid={!!errors.birthDate}
                            aria-describedby={
                                errors.birthDate ? "birthDate-error" : undefined
                            }
                            className={cn(
                                "h-11",
                                errors.birthDate
                                    ? "border-danger focus-visible:ring-danger/20"
                                    : "hover:border-primary-300",
                            )}
                            {...register("birthDate")}
                        />
                        {errors.birthDate && (
                            <p id="birthDate-error" role="alert" className="text-xs font-medium text-danger">
                                {errors.birthDate.message}
                            </p>
                        )}
                        {isMinor && (
                            <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
                                <AlertTriangle size={11} aria-hidden="true" />
                                Menor de idade — dados do responsável são obrigatórios
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="position" className="font-semibold text-neutral-700">
                            Posição
                        </Label>
                        <Input
                            id="position"
                            type="text"
                            list="position-suggestions"
                            placeholder="Ex: Atacante, Goleiro"
                            className="h-11 hover:border-primary-300"
                            {...register("position")}
                        />
                        <datalist id="position-suggestions">
                            {POSITION_SUGGESTIONS.map((p) => (
                                <option key={p} value={p} />
                            ))}
                        </datalist>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="phone" className="font-semibold text-neutral-700">
                            Telefone{" "}
                            <span className="text-danger" aria-hidden="true">
                                *
                            </span>
                        </Label>
                        <Input
                            id="phone"
                            type="tel"
                            autoComplete="tel"
                            placeholder="11999990000"
                            aria-invalid={!!errors.phone}
                            aria-describedby={errors.phone ? "phone-error" : undefined}
                            className={cn(
                                "h-11",
                                errors.phone
                                    ? "border-danger focus-visible:ring-danger/20"
                                    : "hover:border-primary-300",
                            )}
                            {...register("phone")}
                        />
                        {errors.phone && (
                            <p id="phone-error" role="alert" className="text-xs font-medium text-danger">
                                {errors.phone.message}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="email" className="font-semibold text-neutral-700">
                            E-mail{" "}
                            <span className="text-neutral-400 font-normal text-xs">
                                (opcional)
                            </span>
                        </Label>
                        <Input
                            id="email"
                            type="email"
                            autoComplete="email"
                            placeholder="atleta@email.com"
                            aria-invalid={!!errors.email}
                            className="h-11 hover:border-primary-300"
                            {...register("email")}
                        />
                        {errors.email && (
                            <p role="alert" className="text-xs font-medium text-danger">
                                {errors.email.message}
                            </p>
                        )}
                    </div>
                </div>
            </fieldset>

            {isMinor && (
                <fieldset
                    className="flex flex-col gap-4 border border-amber-200 bg-amber-50/60 rounded-xl p-5 animate-in fade-in slide-in-from-top-2 duration-300"
                    aria-live="polite"
                >
                    <legend className="text-[0.6875rem] font-bold uppercase tracking-widest text-amber-700 flex items-center gap-1.5 select-none">
                        <AlertTriangle size={11} aria-hidden="true" />
                        Responsável Legal — Obrigatório para menores de 18 anos
                    </legend>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="guardianName" className="font-semibold text-neutral-700">
                            Nome do responsável{" "}
                            <span className="text-danger" aria-hidden="true">
                                *
                            </span>
                        </Label>
                        <Input
                            id="guardianName"
                            type="text"
                            autoComplete="name"
                            placeholder="Nome completo do responsável legal"
                            aria-required="true"
                            aria-invalid={!!errors.guardianName}
                            aria-describedby={
                                errors.guardianName ? "guardianName-error" : undefined
                            }
                            className={cn(
                                "h-11",
                                errors.guardianName
                                    ? "border-danger focus-visible:ring-danger/20"
                                    : "hover:border-amber-300 focus-visible:border-amber-500",
                            )}
                            {...register("guardianName")}
                        />
                        {errors.guardianName && (
                            <p id="guardianName-error" role="alert" className="text-xs font-medium text-danger">
                                {errors.guardianName.message}
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="guardianPhone" className="font-semibold text-neutral-700">
                                Telefone do responsável{" "}
                                <span className="text-danger" aria-hidden="true">
                                    *
                                </span>
                            </Label>
                            <Input
                                id="guardianPhone"
                                type="tel"
                                autoComplete="tel"
                                placeholder="11999990000"
                                aria-required="true"
                                aria-invalid={!!errors.guardianPhone}
                                aria-describedby={
                                    errors.guardianPhone ? "guardianPhone-error" : undefined
                                }
                                className={cn(
                                    "h-11",
                                    errors.guardianPhone
                                        ? "border-danger focus-visible:ring-danger/20"
                                        : "hover:border-amber-300 focus-visible:border-amber-500",
                                )}
                                {...register("guardianPhone")}
                            />
                            {errors.guardianPhone && (
                                <p id="guardianPhone-error" role="alert" className="text-xs font-medium text-danger">
                                    {errors.guardianPhone.message}
                                </p>
                            )}
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="guardianRelationship" className="font-semibold text-neutral-700">
                                Parentesco{" "}
                                <span className="text-danger" aria-hidden="true">
                                    *
                                </span>
                            </Label>
                            <select
                                id="guardianRelationship"
                                aria-required="true"
                                aria-invalid={!!errors.guardianRelationship}
                                aria-describedby={
                                    errors.guardianRelationship
                                        ? "guardianRelationship-error"
                                        : undefined
                                }
                                className={cn(
                                    "h-11 w-full rounded border bg-white px-3 text-[0.9375rem] text-neutral-900 transition-colors",
                                    "focus-visible:outline-none focus-visible:ring-2",
                                    errors.guardianRelationship
                                        ? "border-danger focus-visible:border-danger focus-visible:ring-danger/20"
                                        : "border-neutral-300 hover:border-amber-300 focus-visible:border-amber-500 focus-visible:ring-amber-500/20",
                                )}
                                {...register("guardianRelationship")}
                            >
                                <option value="">Selecione o parentesco…</option>
                                {GUARDIAN_RELATIONSHIP_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            {errors.guardianRelationship && (
                                <p
                                    id="guardianRelationship-error"
                                    role="alert"
                                    className="text-xs font-medium text-danger"
                                >
                                    {errors.guardianRelationship.message}
                                </p>
                            )}
                        </div>
                    </div>
                </fieldset>
            )}

            <div className="flex flex-col gap-1.5">
                <Label htmlFor="document" className="font-semibold text-neutral-700">
                    Documento{" "}
                    <span className="text-neutral-400 font-normal text-xs">
                        (opcional · RG, Certidão de Nascimento ou foto · JPG, PNG, PDF ·
                        máx 5 MB)
                    </span>
                </Label>

                {selectedFile ? (
                    <div className="flex items-center gap-3 h-11 px-3 rounded border border-primary-200 bg-primary-50 text-sm text-primary-700">
                        <Upload size={15} className="flex-shrink-0 text-primary-500" aria-hidden="true" />
                        <span className="flex-1 truncate font-medium">
                            {selectedFile.name}
                        </span>
                        <span className="text-xs text-primary-400 flex-shrink-0">
                            {Math.round(selectedFile.size / 1024)} KB
                        </span>
                        <button
                            type="button"
                            onClick={clearFile}
                            aria-label="Remover arquivo"
                            className="flex-shrink-0 text-primary-400 hover:text-danger transition-colors"
                        >
                            <X size={15} aria-hidden="true" />
                        </button>
                    </div>
                ) : (
                    <label
                        htmlFor="document"
                        className={cn(
                            "flex items-center gap-3 w-full h-11 px-3 rounded border border-dashed border-neutral-300",
                            "cursor-pointer bg-neutral-50 hover:bg-neutral-100 hover:border-primary-300 transition-colors",
                            "text-sm text-neutral-500 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20",
                        )}
                    >
                        <Upload size={15} className="flex-shrink-0 text-neutral-400" aria-hidden="true" />
                        <span>Selecionar arquivo…</span>
                        <input
                            ref={fileRef}
                            id="document"
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.pdf"
                            onChange={handleFileChange}
                            className="sr-only"
                        />
                    </label>
                )}
            </div>

            <div className="flex flex-col gap-1.5">
                <Label htmlFor="notes" className="font-semibold text-neutral-700">
                    Observações{" "}
                    <span className="text-neutral-400 font-normal text-xs">
                        (opcional)
                    </span>
                </Label>
                <textarea
                    id="notes"
                    rows={3}
                    maxLength={500}
                    placeholder="Informações adicionais sobre o atleta, horários disponíveis, etc."
                    className={cn(
                        "flex w-full rounded border border-neutral-300 bg-white px-3 py-2.5 text-[0.9375rem] text-neutral-900",
                        "placeholder:text-neutral-400 resize-none transition-colors",
                        "focus-visible:outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/20",
                        "hover:border-primary-300",
                    )}
                    {...register("notes")}
                />
            </div>

            <div className="flex flex-col gap-3 pt-1">
                <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto h-11 px-8 rounded-lg bg-accent-500 hover:bg-accent-600 text-white font-bold shadow-md shadow-accent-500/20 border-none transition-all"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 size={18} className="animate-spin mr-2" aria-hidden="true" />
                            Enviando…
                        </>
                    ) : (
                        "Enviar inscrição"
                    )}
                </Button>

                <p className="text-xs text-neutral-400 leading-relaxed">
                    Ao enviar, você concorda que os dados fornecidos serão usados
                    exclusivamente para fins de contacto e organização da peneira. Para
                    menores de idade, será necessário o consentimento formal do
                    responsável legal antes de qualquer participação.
                </p>
            </div>
        </form>
    );
}