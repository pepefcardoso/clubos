"use client";

import { cn } from "@/lib/utils";

export const SCORE_LABELS: Record<number, string> = {
    1: "Insatisfatório",
    2: "Abaixo do esperado",
    3: "Dentro do esperado",
    4: "Acima do esperado",
    5: "Excepcional",
};

/**
 * Returns Tailwind classes for a score button.
 * Unselected buttons are always neutral; selected buttons are coloured
 * according to the score range — red (1–2), amber (3), green (4–5).
 */
function getScoreButtonClasses(score: number, isSelected: boolean): string {
    if (!isSelected) {
        return "bg-neutral-100 text-neutral-400 border-neutral-200 hover:bg-neutral-200 hover:text-neutral-600";
    }
    if (score <= 2) {
        return "bg-red-100 text-red-700 border-red-300 ring-1 ring-red-300";
    }
    if (score === 3) {
        return "bg-amber-100 text-amber-700 border-amber-300 ring-1 ring-amber-300";
    }
    return "bg-primary-100 text-primary-700 border-primary-300 ring-1 ring-primary-300";
}

interface EvaluationScoreInputProps {
    /** Unique id used to associate the label with the group via aria-labelledby. */
    id: string;
    /** Human-readable criterion name, e.g. "Técnica". */
    label: string;
    /** Current score value (0 means no score selected yet). */
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
}

/**
 * Five-button score picker (1–5 scale) for a single evaluation criterion.
 *
 * - Each button represents one score level.
 * - Colour-codes selection: red=low, amber=expected, green=above-expected.
 * - Follows ARIA radiogroup pattern for accessibility.
 * - `value === 0` indicates no selection (initial state).
 */
export function EvaluationScoreInput({
    id,
    label,
    value,
    onChange,
    disabled,
}: EvaluationScoreInputProps) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 min-h-[1.25rem]">
                <label
                    id={`${id}-label`}
                    className="text-sm font-medium text-neutral-700 flex-shrink-0"
                >
                    {label}
                </label>

                {value > 0 && (
                    <span className="text-xs text-neutral-500 truncate" aria-live="polite">
                        {SCORE_LABELS[value]}
                    </span>
                )}
            </div>

            <div
                role="radiogroup"
                aria-labelledby={`${id}-label`}
                aria-required="true"
                className="flex gap-1.5"
            >
                {([1, 2, 3, 4, 5] as const).map((score) => {
                    const isSelected = value === score;
                    return (
                        <button
                            key={score}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            aria-label={`${score} — ${SCORE_LABELS[score]}`}
                            disabled={disabled}
                            onClick={() => onChange(score)}
                            className={cn(
                                "flex-1 h-10 rounded border-2 font-mono font-bold text-sm",
                                "transition-all duration-100",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
                                "disabled:cursor-not-allowed disabled:opacity-50",
                                getScoreButtonClasses(score, isSelected),
                            )}
                        >
                            {score}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}