"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import { apiScoutRegister, ScoutAuthApiError } from "@/lib/scout-auth";
import { StepIndicator } from "@/components/onboarding/StepIndicator";

const STEPS = [{ label: "Conta" }, { label: "Perfil" }];

const POSITIONS = [
    "Goleiro",
    "Lateral Direito",
    "Lateral Esquerdo",
    "Zagueiro",
    "Volante",
    "Meia",
    "Atacante",
    "Ponta Direita",
    "Ponta Esquerda",
    "Centroavante",
];

const AGE_RANGES = [
    "Sub-15",
    "Sub-17",
    "Sub-20",
    "Sub-23",
    "Profissional",
    "Veteranos",
];

interface Step1Values {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
}

interface Step2Values {
    specialization: string;
    targetPositions: string[];
    targetAgeRanges: string[];
    crmNumber: string;
}

function Step1({
    defaultValues,
    onNext,
}: {
    defaultValues: Step1Values | null;
    onNext: (values: Step1Values) => void;
}) {
    const nameId = useId();
    const emailId = useId();
    const passwordId = useId();
    const confirmId = useId();

    const [values, setValues] = useState<Step1Values>(
        defaultValues ?? { name: "", email: "", password: "", confirmPassword: "" },
    );
    const [errors, setErrors] = useState<Partial<Step1Values>>({});

    function validate(): boolean {
        const errs: Partial<Step1Values> = {};
        if (values.name.trim().length < 2) errs.name = "Informe seu nome completo.";
        if (!values.email.includes("@")) errs.email = "Informe um e-mail válido.";
        if (values.password.length < 12)
            errs.password = "A senha deve ter ao menos 12 caracteres.";
        if (values.password !== values.confirmPassword)
            errs.confirmPassword = "As senhas não coincidem.";
        setErrors(errs);
        return Object.keys(errs).length === 0;
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (validate()) onNext(values);
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {(
                [
                    { id: nameId, label: "Nome completo", key: "name", type: "text", autoComplete: "name" },
                    { id: emailId, label: "E-mail", key: "email", type: "email", autoComplete: "email" },
                    { id: passwordId, label: "Senha", key: "password", type: "password", autoComplete: "new-password" },
                    { id: confirmId, label: "Confirmar senha", key: "confirmPassword", type: "password", autoComplete: "new-password" },
                ] as const
            ).map(({ id, label, key, type, autoComplete }) => (
                <div key={key} className="space-y-1">
                    <label htmlFor={id} className="block text-sm font-medium text-neutral-700">
                        {label} <span className="text-danger" aria-hidden="true">*</span>
                    </label>
                    <input
                        id={id}
                        type={type}
                        autoComplete={autoComplete}
                        required
                        aria-required="true"
                        aria-invalid={!!errors[key]}
                        value={values[key]}
                        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    />
                    {errors[key] && (
                        <p className="text-sm text-danger">{errors[key]}</p>
                    )}
                </div>
            ))}

            <button
                type="submit"
                className="h-9 w-full rounded bg-primary-500 px-4 text-sm font-medium text-white hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
                Próximo
            </button>
        </form>
    );
}

function Step2({
    defaultValues,
    onBack,
    onSubmit,
    isLoading,
    submitError,
}: {
    defaultValues: Step2Values | null;
    onBack: () => void;
    onSubmit: (values: Step2Values) => void;
    isLoading: boolean;
    submitError: string | null;
}) {
    const specializationId = useId();
    const crmId = useId();

    const [values, setValues] = useState<Step2Values>(
        defaultValues ?? {
            specialization: "",
            targetPositions: [],
            targetAgeRanges: [],
            crmNumber: "",
        },
    );

    function togglePosition(pos: string) {
        setValues((v) => ({
            ...v,
            targetPositions: v.targetPositions.includes(pos)
                ? v.targetPositions.filter((p) => p !== pos)
                : v.targetPositions.length < 10
                    ? [...v.targetPositions, pos]
                    : v.targetPositions,
        }));
    }

    function toggleAgeRange(range: string) {
        setValues((v) => ({
            ...v,
            targetAgeRanges: v.targetAgeRanges.includes(range)
                ? v.targetAgeRanges.filter((r) => r !== range)
                : v.targetAgeRanges.length < 5
                    ? [...v.targetAgeRanges, range]
                    : v.targetAgeRanges,
        }));
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        onSubmit(values);
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <div className="space-y-1">
                <label htmlFor={specializationId} className="block text-sm font-medium text-neutral-700">
                    Especialização
                </label>
                <input
                    id={specializationId}
                    type="text"
                    maxLength={100}
                    value={values.specialization}
                    onChange={(e) => setValues((v) => ({ ...v, specialization: e.target.value }))}
                    className="w-full rounded border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                />
            </div>

            <fieldset>
                <legend className="mb-2 text-sm font-medium text-neutral-700">
                    Posições de interesse <span className="text-neutral-400">(máx. 10)</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                    {POSITIONS.map((pos) => {
                        const selected = values.targetPositions.includes(pos);
                        return (
                            <button
                                key={pos}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => togglePosition(pos)}
                                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${selected
                                        ? "bg-primary-500 text-white"
                                        : "border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
                                    }`}
                            >
                                {pos}
                            </button>
                        );
                    })}
                </div>
            </fieldset>

            <fieldset>
                <legend className="mb-2 text-sm font-medium text-neutral-700">
                    Faixas etárias <span className="text-neutral-400">(máx. 5)</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                    {AGE_RANGES.map((range) => {
                        const selected = values.targetAgeRanges.includes(range);
                        const rangeId = `age-${range}`;
                        return (
                            <label
                                key={range}
                                htmlFor={rangeId}
                                className="flex cursor-pointer items-center gap-1.5 text-sm text-neutral-700"
                            >
                                <input
                                    id={rangeId}
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => toggleAgeRange(range)}
                                    className="rounded border-neutral-300 text-primary-500 focus-visible:ring-primary-500"
                                />
                                {range}
                            </label>
                        );
                    })}
                </div>
            </fieldset>

            <div className="space-y-1">
                <label htmlFor={crmId} className="block text-sm font-medium text-neutral-700">
                    Número de credencial / CRM <span className="text-neutral-400">(opcional)</span>
                </label>
                <input
                    id={crmId}
                    type="text"
                    maxLength={30}
                    value={values.crmNumber}
                    onChange={(e) => setValues((v) => ({ ...v, crmNumber: e.target.value }))}
                    className="w-full max-w-xs rounded border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                />
            </div>

            {submitError && (
                <p role="alert" className="text-sm text-danger">{submitError}</p>
            )}

            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    disabled={isLoading}
                    className="h-9 flex-1 rounded border border-neutral-300 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                    Voltar
                </button>
                <button
                    type="submit"
                    disabled={isLoading}
                    className="h-9 flex-1 rounded bg-primary-500 px-4 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                    {isLoading ? "Criando conta…" : "Criar conta"}
                </button>
            </div>
        </form>
    );
}

export function ScoutOnboardingWizard() {
    const router = useRouter();
    const [step, setStep] = useState<1 | 2>(1);
    const [step1Data, setStep1Data] = useState<Step1Values | null>(null);
    const [step2Data, setStep2Data] = useState<Step2Values | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    function handleStep1Next(values: Step1Values) {
        setStep1Data(values);
        setStep(2);
    }

    async function handleStep2Submit(values: Step2Values) {
        if (!step1Data) return;

        setStep2Data(values);
        setIsLoading(true);
        setSubmitError(null);

        try {
            await apiScoutRegister({
                name: step1Data.name,
                email: step1Data.email,
                password: step1Data.password,
                specialization: values.specialization || undefined,
                targetPositions: values.targetPositions,
                targetAgeRanges: values.targetAgeRanges,
                crmNumber: values.crmNumber || undefined,
            });
            router.push("/scout-login?registered=1");
        } catch (err) {
            setSubmitError(
                err instanceof ScoutAuthApiError
                    ? err.message
                    : "Não foi possível criar a conta. Tente novamente.",
            );
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="w-full max-w-lg">
            <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow">
                <div className="mb-8 text-center">
                    <span className="text-2xl font-bold text-primary-600">ClubOS</span>
                    <p className="mt-1 text-sm text-neutral-500">Criar conta de olheiro</p>
                </div>

                <StepIndicator currentStep={step} steps={STEPS} />

                <div className="mt-8">
                    {step === 1 && (
                        <Step1 defaultValues={step1Data} onNext={handleStep1Next} />
                    )}
                    {step === 2 && (
                        <Step2
                            defaultValues={step2Data}
                            onBack={() => setStep(1)}
                            onSubmit={handleStep2Submit}
                            isLoading={isLoading}
                            submitError={submitError}
                        />
                    )}
                </div>
            </div>

            <p className="mt-4 text-center text-sm text-neutral-500">
                Já tem conta?{" "}
                <a href="/scout-login" className="text-primary-600 hover:underline">
                    Fazer login
                </a>
            </p>
        </div>
    );
}