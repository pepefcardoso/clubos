"use client";

import { Check } from "lucide-react";
import type { Step } from "./wizard.types";

interface StepIndicatorProps {
    currentStep: Step;
    steps: { label: string }[];
}

export function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
    return (
        <div className="flex items-center w-full">
            {steps.map((step, index) => {
                const stepNumber = (index + 1) as Step;
                const isCompleted = stepNumber < currentStep;
                const isActive = stepNumber === currentStep;

                return (
                    <div key={step.label} className="flex items-center flex-1 last:flex-none">
                        <div className="flex flex-col items-center gap-1.5">
                            <div
                                className={[
                                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors duration-200",
                                    isCompleted
                                        ? "bg-primary-500 text-white"
                                        : isActive
                                            ? "bg-primary-500 text-white ring-4 ring-primary-100"
                                            : "bg-neutral-200 text-neutral-500",
                                ].join(" ")}
                            >
                                {isCompleted ? (
                                    <Check className="w-4 h-4" strokeWidth={2.5} />
                                ) : (
                                    <span>{stepNumber}</span>
                                )}
                            </div>
                            <span
                                className={[
                                    "text-xs font-medium whitespace-nowrap",
                                    isActive ? "text-primary-600" : "text-neutral-400",
                                ].join(" ")}
                            >
                                {step.label}
                            </span>
                        </div>

                        {index < steps.length - 1 && (
                            <div
                                className={[
                                    "flex-1 h-0.5 mx-2 mb-5 transition-colors duration-200",
                                    isCompleted ? "bg-primary-300" : "bg-neutral-200",
                                ].join(" ")}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}