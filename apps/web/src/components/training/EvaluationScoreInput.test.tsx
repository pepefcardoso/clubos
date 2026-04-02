import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EvaluationScoreInput, SCORE_LABELS } from "./EvaluationScoreInput";

describe("EvaluationScoreInput", () => {
    const defaultProps = {
        id: "score-technique",
        label: "Técnica",
        value: 0,
        onChange: vi.fn(),
    };

    it("renders all 5 score buttons", () => {
        render(<EvaluationScoreInput {...defaultProps} />);
        for (let i = 1; i <= 5; i++) {
            expect(
                screen.getByRole("radio", { name: new RegExp(`^${i}`) }),
            ).toBeDefined();
        }
    });

    it("renders the label text", () => {
        render(<EvaluationScoreInput {...defaultProps} label="Tática" />);
        expect(screen.getByText("Tática")).toBeDefined();
    });

    it("sets aria-checked=true only on the selected score button", () => {
        render(<EvaluationScoreInput {...defaultProps} value={3} />);
        for (let i = 1; i <= 5; i++) {
            const btn = screen.getByRole("radio", { name: new RegExp(`^${i}`) });
            expect(btn.getAttribute("aria-checked")).toBe(i === 3 ? "true" : "false");
        }
    });

    it("shows SCORE_LABELS text when a score is selected", () => {
        render(<EvaluationScoreInput {...defaultProps} value={4} />);
        expect(screen.getByText(SCORE_LABELS[4]!)).toBeDefined();
    });

    it("does not show score label when value=0 (no selection)", () => {
        render(<EvaluationScoreInput {...defaultProps} value={0} />);
        for (const label of Object.values(SCORE_LABELS)) {
            expect(screen.queryByText(label)).toBeNull();
        }
    });

    it("calls onChange with the correct value when a button is clicked", () => {
        const onChange = vi.fn();
        render(<EvaluationScoreInput {...defaultProps} onChange={onChange} />);

        const btn3 = screen.getByRole("radio", { name: new RegExp(`^3`) });
        fireEvent.click(btn3);
        expect(onChange).toHaveBeenCalledOnce();
        expect(onChange).toHaveBeenCalledWith(3);
    });

    it("calls onChange with 1 when the first button is clicked", () => {
        const onChange = vi.fn();
        render(<EvaluationScoreInput {...defaultProps} onChange={onChange} />);
        fireEvent.click(screen.getByRole("radio", { name: /^1/ }));
        expect(onChange).toHaveBeenCalledWith(1);
    });

    it("calls onChange with 5 when the last button is clicked", () => {
        const onChange = vi.fn();
        render(<EvaluationScoreInput {...defaultProps} onChange={onChange} />);
        fireEvent.click(screen.getByRole("radio", { name: /^5/ }));
        expect(onChange).toHaveBeenCalledWith(5);
    });

    it("does not call onChange when disabled", () => {
        const onChange = vi.fn();
        render(<EvaluationScoreInput {...defaultProps} onChange={onChange} disabled />);
        fireEvent.click(screen.getByRole("radio", { name: /^3/ }));
        expect(onChange).not.toHaveBeenCalled();
    });

    it("all buttons have disabled attribute when disabled=true", () => {
        render(<EvaluationScoreInput {...defaultProps} disabled />);
        for (let i = 1; i <= 5; i++) {
            const btn = screen.getByRole("radio", { name: new RegExp(`^${i}`) });
            expect(btn).toHaveProperty("disabled", true);
        }
    });

    it("uses role=radiogroup on the container", () => {
        render(<EvaluationScoreInput {...defaultProps} />);
        expect(screen.getByRole("radiogroup")).toBeDefined();
    });

    it("associates the radiogroup with the label via aria-labelledby", () => {
        render(<EvaluationScoreInput {...defaultProps} id="score-physical" />);
        const group = screen.getByRole("radiogroup");
        expect(group.getAttribute("aria-labelledby")).toBe("score-physical-label");
    });

    it("SCORE_LABELS covers all values 1–5", () => {
        for (let i = 1; i <= 5; i++) {
            expect(SCORE_LABELS[i]).toBeTruthy();
        }
    });
});