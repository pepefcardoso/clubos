"use client";

import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import {
    clubDataSchema,
    generateSlug,
    formatCnpjDisplay,
    stripCnpjMask,
    type ClubDataValues,
} from "./wizard.types";

interface StepClubDataProps {
    defaultValues: ClubDataValues | null;
    onNext: (data: ClubDataValues) => void;
}

export function StepClubData({ defaultValues, onNext }: StepClubDataProps) {
    const slugManuallyEdited = useRef(false);

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        formState: { errors },
    } = useForm<ClubDataValues>({
        resolver: zodResolver(clubDataSchema),
        defaultValues: defaultValues ?? { name: "", slug: "", cnpj: "" },
    });

    const nameValue = watch("name");
    const slugValue = watch("slug");

    useEffect(() => {
        if (!slugManuallyEdited.current) {
            const generated = generateSlug(nameValue ?? "");
            setValue("slug", generated, { shouldValidate: false });
        }
    }, [nameValue, setValue]);

    const onSubmit = (data: ClubDataValues) => {
        onNext(data);
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold text-neutral-900">Dados do clube</h2>
                <p className="text-sm text-neutral-500">
                    Essas informações identificam seu clube na plataforma.
                </p>
            </div>

            <div className="space-y-1.5">
                <label htmlFor="name" className="block text-sm font-medium text-neutral-700">
                    Nome do clube <span className="text-danger">*</span>
                </label>
                <input
                    id="name"
                    type="text"
                    autoComplete="organization"
                    placeholder="Ex: Grêmio Esportivo Vila Nova"
                    className={[
                        "w-full max-w-lg h-9 px-3 text-sm rounded border bg-white text-neutral-900 placeholder:text-neutral-400 outline-none transition-colors",
                        "focus:ring-2 focus:ring-primary-300 focus:border-primary-400",
                        errors.name
                            ? "border-danger focus:ring-red-200 focus:border-danger"
                            : "border-neutral-300",
                    ].join(" ")}
                    {...register("name")}
                />
                {errors.name && (
                    <p className="text-danger text-sm">{errors.name.message}</p>
                )}
            </div>

            <div className="space-y-1.5">
                <label htmlFor="slug" className="block text-sm font-medium text-neutral-700">
                    Identificador (slug) <span className="text-danger">*</span>
                </label>
                <input
                    id="slug"
                    type="text"
                    autoComplete="off"
                    placeholder="gremio-esportivo-vila-nova"
                    className={[
                        "w-full max-w-sm h-9 px-3 text-sm rounded border bg-white text-neutral-900 placeholder:text-neutral-400 outline-none font-mono transition-colors",
                        "focus:ring-2 focus:ring-primary-300 focus:border-primary-400",
                        errors.slug
                            ? "border-danger focus:ring-red-200 focus:border-danger"
                            : "border-neutral-300",
                    ].join(" ")}
                    {...register("slug", {
                        onChange: () => {
                            slugManuallyEdited.current = true;
                        },
                    })}
                />
                {slugValue && !errors.slug && (
                    <p className="text-xs text-neutral-400">
                        Seu clube estará em:{" "}
                        <span className="font-mono text-primary-600">clubos.com.br/{slugValue}</span>
                    </p>
                )}
                {errors.slug && (
                    <p className="text-danger text-sm">{errors.slug.message}</p>
                )}
            </div>

            <div className="space-y-1.5">
                <label htmlFor="cnpj" className="block text-sm font-medium text-neutral-700">
                    CNPJ{" "}
                    <span className="text-neutral-400 font-normal text-xs">(opcional)</span>
                </label>
                <input
                    id="cnpj"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                    className={[
                        "w-full max-w-sm h-9 px-3 text-sm rounded border bg-white text-neutral-900 placeholder:text-neutral-400 outline-none font-mono transition-colors",
                        "focus:ring-2 focus:ring-primary-300 focus:border-primary-400",
                        errors.cnpj
                            ? "border-danger focus:ring-red-200 focus:border-danger"
                            : "border-neutral-300",
                    ].join(" ")}
                    {...register("cnpj", {
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                            const stripped = stripCnpjMask(e.target.value);
                            const masked = formatCnpjDisplay(stripped);
                            e.target.value = masked;
                            setValue("cnpj", stripped, { shouldValidate: true });
                        },
                    })}
                    onBlur={(e) => {
                        const stripped = stripCnpjMask(e.target.value);
                        e.target.value = stripped.length > 0 ? formatCnpjDisplay(stripped) : "";
                    }}
                />
                {errors.cnpj && (
                    <p className="text-danger text-sm">{errors.cnpj.message}</p>
                )}
            </div>

            <div className="pt-2">
                <button
                    type="submit"
                    className="h-9 px-5 text-sm font-medium rounded bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 transition-colors flex items-center gap-2"
                >
                    Próximo
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </form>
    );
}