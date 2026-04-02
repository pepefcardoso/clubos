"use client";

import { useCallback } from "react";
import type { EvaluationResponse } from "@/lib/api/evaluations";

const CRITERIA_LABELS: Record<string, string> = {
    technique: "Técnica",
    tactical: "Tática",
    physical: "Físico",
    mental: "Mental",
    attitude: "Atitude",
};

const SCORE_LABELS: Record<number, string> = {
    1: "Insatisfatório",
    2: "Abaixo do esperado",
    3: "Dentro do esperado",
    4: "Acima do esperado",
    5: "Excepcional",
};

type CriterionKey = keyof typeof CRITERIA_LABELS;
const CRITERION_KEYS: CriterionKey[] = ["technique", "tactical", "physical", "mental", "attitude"];

/**
 * Provides an `exportPdf` callback that generates and downloads a PDF
 * evaluation report using @react-pdf/renderer.
 *
 * The PDF library is dynamically imported on first call to avoid:
 *   1. Bundle bloat — the ~300kB library is only downloaded when needed.
 *   2. SSR crashes — @react-pdf/renderer is browser-only.
 *
 * The PDF filename follows the pattern:
 *   avaliacao-{athlete-name-slug}-{microcycle}.pdf
 */
export function useExportEvaluationPdf() {
    const exportPdf = useCallback(
        async (evaluation: EvaluationResponse, clubName: string) => {
            const { pdf, Document, Page, Text, View, StyleSheet } =
                await import("@react-pdf/renderer");

            const styles = StyleSheet.create({
                page: {
                    padding: 40,
                    fontFamily: "Helvetica",
                    fontSize: 11,
                    color: "#27241e",
                },
                header: {
                    marginBottom: 28,
                    paddingBottom: 16,
                    borderBottom: "2px solid #d9edd9",
                },
                clubName: {
                    fontSize: 22,
                    fontWeight: "bold",
                    color: "#1a481a",
                },
                subtitle: {
                    fontSize: 13,
                    color: "#57534a",
                    marginTop: 4,
                },
                section: {
                    marginBottom: 20,
                },
                sectionTitle: {
                    fontSize: 10,
                    fontWeight: "bold",
                    color: "#78746a",
                    textTransform: "uppercase",
                    letterSpacing: 1.2,
                    marginBottom: 8,
                    paddingBottom: 4,
                    borderBottom: "1px solid #e8e6e0",
                },
                row: {
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingVertical: 7,
                    borderBottom: "1px solid #f4f3ef",
                },
                metaLabel: {
                    fontSize: 11,
                    color: "#57534a",
                },
                metaValue: {
                    fontSize: 11,
                    fontWeight: "bold",
                    color: "#27241e",
                },
                criterionLabel: {
                    fontSize: 11,
                    color: "#57534a",
                    flex: 1,
                },
                scoreGroup: {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                },
                scoreNumber: {
                    fontSize: 16,
                    fontWeight: "bold",
                    color: "#2d7d2d",
                    width: 20,
                    textAlign: "center",
                },
                scoreLabel: {
                    fontSize: 9,
                    color: "#78746a",
                },
                averageContainer: {
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 14,
                    padding: 12,
                    backgroundColor: "#f0f7f0",
                    borderRadius: 6,
                    border: "1px solid #b3dab3",
                },
                averageLabel: {
                    fontSize: 13,
                    fontWeight: "bold",
                    color: "#1a481a",
                },
                averageValue: {
                    fontSize: 22,
                    fontWeight: "bold",
                    color: "#2d7d2d",
                },
                notesText: {
                    fontSize: 10,
                    color: "#57534a",
                    lineHeight: 1.6,
                },
                footer: {
                    position: "absolute",
                    bottom: 28,
                    left: 40,
                    right: 40,
                    fontSize: 8,
                    color: "#a8a49a",
                    textAlign: "center",
                    borderTop: "1px solid #e8e6e0",
                    paddingTop: 6,
                },
            });

            const formattedDate = new Intl.DateTimeFormat("pt-BR").format(
                new Date(evaluation.date),
            );

            const doc = (
                <Document
                    title={`Avaliação — ${evaluation.athleteName} — ${evaluation.microcycle}`}
                    author="ClubOS"
                    subject="Avaliação Técnica de Atleta"
                >
                    <Page size="A4" style={styles.page}>
                        <View style={styles.header}>
                            <Text style={styles.clubName}>{clubName}</Text>
                            <Text style={styles.subtitle}>
                                Avaliação Técnica · {evaluation.athleteName} · {evaluation.microcycle}
                            </Text>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Informações</Text>

                            <View style={styles.row}>
                                <Text style={styles.metaLabel}>Atleta</Text>
                                <Text style={styles.metaValue}>{evaluation.athleteName}</Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.metaLabel}>Microciclo</Text>
                                <Text style={styles.metaValue}>{evaluation.microcycle}</Text>
                            </View>
                            <View style={styles.row}>
                                <Text style={styles.metaLabel}>Data da Avaliação</Text>
                                <Text style={styles.metaValue}>{formattedDate}</Text>
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Critérios (escala 1–5)</Text>

                            {CRITERION_KEYS.map((key) => {
                                const score = evaluation[key as keyof EvaluationResponse] as number;
                                return (
                                    <View key={key} style={styles.row}>
                                        <Text style={styles.criterionLabel}>
                                            {CRITERIA_LABELS[key]}
                                        </Text>
                                        <View style={styles.scoreGroup}>
                                            <Text style={styles.scoreNumber}>{score}</Text>
                                            <Text style={styles.scoreLabel}>{SCORE_LABELS[score]}</Text>
                                        </View>
                                    </View>
                                );
                            })}

                            <View style={styles.averageContainer}>
                                <Text style={styles.averageLabel}>Média geral</Text>
                                <Text style={styles.averageValue}>
                                    {evaluation.averageScore.toFixed(1)}
                                </Text>
                            </View>
                        </View>

                        {evaluation.notes && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Observações</Text>
                                <Text style={styles.notesText}>{evaluation.notes}</Text>
                            </View>
                        )}

                        <Text style={styles.footer}>
                            Documento gerado via ClubOS ·{" "}
                            {new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                        </Text>
                    </Page>
                </Document>
            );

            const blob = await pdf(doc).toBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `avaliacao-${evaluation.athleteName
                .toLowerCase()
                .replace(/\s+/g, "-")
                .replace(/[^a-z0-9-]/g, "")}-${evaluation.microcycle}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },
        [],
    );

    return { exportPdf };
}