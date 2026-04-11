import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RtpStatusBadge } from "./RtpStatusBadge";

describe("RtpStatusBadge", () => {
  it("renders 'Afastado' pill for AFASTADO status", () => {
    render(<RtpStatusBadge status="AFASTADO" />);
    expect(screen.getByText("Afastado")).toBeDefined();
  });

  it("renders 'Ret. Progressivo' pill for RETORNO_PROGRESSIVO", () => {
    render(<RtpStatusBadge status="RETORNO_PROGRESSIVO" />);
    expect(screen.getByText("Ret. Progressivo")).toBeDefined();
  });

  it("renders 'Liberado' pill for LIBERADO status", () => {
    render(<RtpStatusBadge status="LIBERADO" />);
    expect(screen.getByText("Liberado")).toBeDefined();
  });

  it("renders '—' when status is null", () => {
    render(<RtpStatusBadge status={null} />);
    expect(screen.getByText("—")).toBeDefined();
  });

  it("applies correct aria-label for AFASTADO", () => {
    render(<RtpStatusBadge status="AFASTADO" />);
    expect(
      screen.getByLabelText("Atleta afastado — não apto para jogo"),
    ).toBeDefined();
  });

  it("applies correct aria-label for RETORNO_PROGRESSIVO", () => {
    render(<RtpStatusBadge status="RETORNO_PROGRESSIVO" />);
    expect(
      screen.getByLabelText("Atleta em retorno progressivo ao jogo"),
    ).toBeDefined();
  });

  it("applies correct aria-label for LIBERADO", () => {
    render(<RtpStatusBadge status="LIBERADO" />);
    expect(screen.getByLabelText("Atleta liberado para jogo")).toBeDefined();
  });

  it("applies correct aria-label when status is null", () => {
    render(<RtpStatusBadge status={null} />);
    expect(screen.getByLabelText("Sem status RTP registrado")).toBeDefined();
  });

  it("renders sm size by default", () => {
    const { container } = render(<RtpStatusBadge status="LIBERADO" />);
    const badge = container.querySelector("span[aria-label]");
    expect(badge?.className).toContain("px-2");
    expect(badge?.className).toContain("py-0.5");
  });

  it("renders md size when size='md'", () => {
    const { container } = render(
      <RtpStatusBadge status="LIBERADO" size="md" />,
    );
    const badge = container.querySelector("span[aria-label]");
    expect(badge?.className).toContain("px-2.5");
    expect(badge?.className).toContain("py-1");
  });

  it("renders coloured dot for each status", () => {
    const { container: c1 } = render(<RtpStatusBadge status="AFASTADO" />);
    expect(c1.querySelector(".bg-red-500")).toBeDefined();

    const { container: c2 } = render(
      <RtpStatusBadge status="RETORNO_PROGRESSIVO" />,
    );
    expect(c2.querySelector(".bg-amber-400")).toBeDefined();

    const { container: c3 } = render(<RtpStatusBadge status="LIBERADO" />);
    expect(c3.querySelector(".bg-primary-500")).toBeDefined();
  });
});
