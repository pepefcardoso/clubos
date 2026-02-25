"use client";

import { useState } from "react";
import { StepIndicator } from "./StepIndicator";
import { StepClubData } from "./StepClubData";
import { StepLogo } from "./StepLogo";
import { StepConfirmation } from "./StepConfirmation";
import type { Step, WizardState, ClubDataValues } from "./wizard.types";

const STEPS = [
    { label: "Dados do Clube" },
    { label: "Logo" },
    { label: "Confirmação" },
];

export function OnboardingWizard() {
    const [step, setStep] = useState<Step>(1);
    const [state, setState] = useState<WizardState>({
        clubData: null,
        logoFile: null,
        logoPreviewUrl: null,
    });

    function handleClubDataNext(data: ClubDataValues) {
        setState((s) => ({ ...s, clubData: data }));
        setStep(2);
    }

    function handleLogoNext(file: File | null) {
        const previewUrl =
            file !== null
                ? file !== state.logoFile
                    ? URL.createObjectURL(file)
                    : state.logoPreviewUrl
                : null;

        if (
            state.logoPreviewUrl &&
            previewUrl !== state.logoPreviewUrl
        ) {
            URL.revokeObjectURL(state.logoPreviewUrl);
        }

        setState((s) => ({ ...s, logoFile: file, logoPreviewUrl: previewUrl }));
        setStep(3);
    }

    function handleBackToLogo() {
        setStep(2);
    }

    function handleBackToClubData() {
        setStep(1);
    }

    return (
        <div className="w-full max-w-lg">
            <div className="bg-white border border-neutral-200 rounded-lg shadow p-8">
                <div className="text-center mb-8">
                    <span className="text-2xl font-bold text-primary-600">ClubOS</span>
                    <p className="text-neutral-500 text-sm mt-1">Configuração do clube</p>
                </div>

                <StepIndicator currentStep={step} steps={STEPS} />

                <div className="mt-8">
                    {step === 1 && (
                        <StepClubData
                            defaultValues={state.clubData}
                            onNext={handleClubDataNext}
                        />
                    )}

                    {step === 2 && (
                        <StepLogo
                            currentFile={state.logoFile}
                            previewUrl={state.logoPreviewUrl}
                            onNext={handleLogoNext}
                            onBack={handleBackToClubData}
                        />
                    )}

                    {step === 3 && state.clubData !== null && (
                        <StepConfirmation
                            clubData={state.clubData}
                            logoPreviewUrl={state.logoPreviewUrl}
                            onBack={handleBackToLogo}
                        />
                    )}
                </div>
            </div>

            <p className="text-center text-neutral-500 text-sm mt-4">
                Já tem uma conta?{" "}
                <a href="/login" className="text-primary-600 hover:underline">
                    Faça login
                </a>
            </p>
        </div>
    );
}