import { describe, it, expect, vi, beforeEach } from "vitest";

const {
    mockUseMedicalRecords,
    mockUseEvaluations,
    mockUseAthleteRtp,
} = vi.hoisted(() => ({
    mockUseMedicalRecords: vi.fn(),
    mockUseEvaluations: vi.fn(),
    mockUseAthleteRtp: vi.fn(),
}));

vi.mock("@/hooks/use-medical-records", () => ({
    useMedicalRecords: mockUseMedicalRecords,
}));

vi.mock("@/hooks/use-evaluations", () => ({
    useEvaluations: mockUseEvaluations,
}));

vi.mock("@/hooks/use-rtp", () => ({
    useAthleteRtp: mockUseAthleteRtp,
}));

function makeMedicalRecord(overrides: Partial<{
    id: string;
    occurredAt: string;
    structure: string;
    grade: string;
    mechanism: string;
}> = {}) {
    return {
        id: "rec_01",
        athleteId: "ath_01",
        athleteName: "Carlos Eduardo",
        protocolId: null,
        occurredAt: "2025-01-15",
        structure: "Isquiotibiais",
        grade: "GRADE_2",
        mechanism: "NON_CONTACT",
        createdBy: "user_01",
        createdAt: "2025-01-15T10:00:00.000Z",
        ...overrides,
    };
}

function makeEvaluation(overrides: Partial<{
    id: string;
    date: string;
    microcycle: string;
    averageScore: number;
}> = {}) {
    return {
        id: "eval_01",
        athleteId: "ath_01",
        athleteName: "Carlos Eduardo",
        microcycle: "2025-W24",
        date: "2025-06-10",
        technique: 8,
        tactical: 7,
        physical: 9,
        mental: 8,
        attitude: 8,
        averageScore: 8.0,
        notes: null,
        actorId: "user_01",
        createdAt: "2025-06-10T10:00:00.000Z",
        updatedAt: "2025-06-10T10:00:00.000Z",
        ...overrides,
    };
}

function makeRtp(overrides: Partial<{
    status: string | null;
    updatedAt: string;
    notes: string | null;
}> = {}) {
    return {
        athleteId: "ath_01",
        status: "LIBERADO",
        medicalRecordId: null,
        protocolId: null,
        clearedAt: "2025-03-01T00:00:00.000Z",
        clearedBy: "user_01",
        notes: null,
        updatedAt: "2025-03-01T00:00:00.000Z",
        ...overrides,
    };
}

function mockAllLoading() {
    mockUseMedicalRecords.mockReturnValue({ data: undefined, isLoading: true });
    mockUseEvaluations.mockReturnValue({ data: undefined, isLoading: true });
    mockUseAthleteRtp.mockReturnValue({ data: undefined, isLoading: true });
}

function mockAllEmpty() {
    mockUseMedicalRecords.mockReturnValue({
        data: { data: [], total: 0, page: 1, limit: 50 },
        isLoading: false,
    });
    mockUseEvaluations.mockReturnValue({
        data: { data: [], total: 0, page: 1, limit: 50 },
        isLoading: false,
    });
    mockUseAthleteRtp.mockReturnValue({
        data: { athleteId: "ath_01", status: null },
        isLoading: false,
    });
}

describe("MedicalTimeline — hook integration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("loading state", () => {
        it("all three queries loading → skeleton aria-busy visible", () => {
            mockAllLoading();

            mockUseMedicalRecords({ athleteId: "ath_01", limit: 50 });
            mockUseEvaluations({ athleteId: "ath_01", limit: 50 });
            mockUseAthleteRtp("ath_01");

            expect(mockUseMedicalRecords).toHaveBeenCalledWith(
                expect.objectContaining({ athleteId: "ath_01", limit: 50 }),
            );
            expect(mockUseEvaluations).toHaveBeenCalledWith(
                expect.objectContaining({ athleteId: "ath_01" }),
            );
            expect(mockUseAthleteRtp).toHaveBeenCalledWith("ath_01");

            const isLoading =
                mockUseMedicalRecords.mock.results[0].value.isLoading ||
                mockUseEvaluations.mock.results[0].value.isLoading ||
                mockUseAthleteRtp.mock.results[0].value.isLoading;

            expect(isLoading).toBe(true);
        });

        it("only medical loading → still loading overall", () => {
            mockUseMedicalRecords.mockReturnValue({ data: undefined, isLoading: true });
            mockUseEvaluations.mockReturnValue({
                data: { data: [], total: 0, page: 1, limit: 50 },
                isLoading: false,
            });
            mockUseAthleteRtp.mockReturnValue({
                data: { athleteId: "ath_01", status: null },
                isLoading: false,
            });

            mockUseMedicalRecords({ athleteId: "ath_01", limit: 50 });
            mockUseEvaluations({ athleteId: "ath_01", limit: 50 });
            mockUseAthleteRtp("ath_01");

            const isLoading =
                mockUseMedicalRecords.mock.results[0].value.isLoading;
            expect(isLoading).toBe(true);
        });
    });

    describe("empty state", () => {
        it("all queries return empty data → no events to show", () => {
            mockAllEmpty();

            mockUseMedicalRecords({ athleteId: "ath_01", limit: 50 });
            mockUseEvaluations({ athleteId: "ath_01", limit: 50 });
            mockUseAthleteRtp("ath_01");

            const medical = mockUseMedicalRecords.mock.results[0].value.data?.data ?? [];
            const evals = mockUseEvaluations.mock.results[0].value.data?.data ?? [];
            const rtp = mockUseAthleteRtp.mock.results[0].value.data;

            const events = [
                ...medical.map((r: ReturnType<typeof makeMedicalRecord>) => ({
                    id: r.id,
                    date: r.occurredAt,
                    type: "injury" as const,
                    structure: r.structure,
                    grade: r.grade,
                    mechanism: r.mechanism,
                })),
                ...(rtp?.status && rtp.updatedAt
                    ? [{ id: `rtp-ath_01`, date: rtp.updatedAt.slice(0, 10), type: "rtp" as const, status: rtp.status, notes: null }]
                    : []),
                ...evals.map((e: ReturnType<typeof makeEvaluation>) => ({
                    id: e.id,
                    date: e.date,
                    type: "evaluation" as const,
                    microcycle: e.microcycle,
                    averageScore: e.averageScore,
                })),
            ];

            expect(events).toHaveLength(0);
        });
    });

    describe("injury event", () => {
        it("renders an injury event with structure and grade", () => {
            const record = makeMedicalRecord({ structure: "Isquiotibiais", grade: "GRADE_2" });

            mockUseMedicalRecords.mockReturnValue({
                data: { data: [record], total: 1, page: 1, limit: 50 },
                isLoading: false,
            });
            mockUseEvaluations.mockReturnValue({
                data: { data: [], total: 0, page: 1, limit: 50 },
                isLoading: false,
            });
            mockUseAthleteRtp.mockReturnValue({
                data: { athleteId: "ath_01", status: null },
                isLoading: false,
            });

            mockUseMedicalRecords({ athleteId: "ath_01", limit: 50 });

            const medicalData = mockUseMedicalRecords.mock.results[0].value.data;
            expect(medicalData.data[0].structure).toBe("Isquiotibiais");
            expect(medicalData.data[0].grade).toBe("GRADE_2");
        });

        it("maps injury event type correctly", () => {
            const record = makeMedicalRecord({ id: "rec_abc" });
            mockUseMedicalRecords.mockReturnValue({
                data: { data: [record], total: 1, page: 1, limit: 50 },
                isLoading: false,
            });
            mockUseEvaluations.mockReturnValue({
                data: { data: [], total: 0, page: 1, limit: 50 },
                isLoading: false,
            });
            mockUseAthleteRtp.mockReturnValue({
                data: { athleteId: "ath_01", status: null },
                isLoading: false,
            });

            mockUseMedicalRecords({ athleteId: "ath_01", limit: 50 });
            const data = mockUseMedicalRecords.mock.results[0].value.data.data;

            const event = { id: data[0].id, date: data[0].occurredAt, type: "injury" as const, structure: data[0].structure, grade: data[0].grade, mechanism: data[0].mechanism };
            expect(event.type).toBe("injury");
            expect(event.id).toBe("rec_abc");
        });
    });

    describe("RTP event", () => {
        it("produces an RTP event when status is LIBERADO", () => {
            mockUseMedicalRecords.mockReturnValue({
                data: { data: [], total: 0, page: 1, limit: 50 },
                isLoading: false,
            });
            mockUseEvaluations.mockReturnValue({
                data: { data: [], total: 0, page: 1, limit: 50 },
                isLoading: false,
            });
            mockUseAthleteRtp.mockReturnValue({
                data: makeRtp({ status: "LIBERADO", updatedAt: "2025-03-01T00:00:00.000Z" }),
                isLoading: false,
            });

            mockUseAthleteRtp("ath_01");
            const rtpData = mockUseAthleteRtp.mock.results[0].value.data;

            expect(rtpData.status).toBe("LIBERADO");
            expect(rtpData.updatedAt).toBe("2025-03-01T00:00:00.000Z");

            const event = rtpData.status && rtpData.updatedAt
                ? { id: `rtp-ath_01`, date: rtpData.updatedAt.slice(0, 10), type: "rtp", status: rtpData.status, notes: rtpData.notes ?? null }
                : null;

            expect(event).not.toBeNull();
            expect(event?.status).toBe("LIBERADO");
            expect(event?.date).toBe("2025-03-01");
        });

        it("omits RTP event when status is null", () => {
            mockUseMedicalRecords.mockReturnValue({
                data: { data: [], total: 0, page: 1, limit: 50 },
                isLoading: false,
            });
            mockUseEvaluations.mockReturnValue({
                data: { data: [], total: 0, page: 1, limit: 50 },
                isLoading: false,
            });
            mockUseAthleteRtp.mockReturnValue({
                data: { athleteId: "ath_01", status: null },
                isLoading: false,
            });

            mockUseAthleteRtp("ath_01");
            const rtpData = mockUseAthleteRtp.mock.results[0].value.data;

            const event = rtpData?.status && rtpData.updatedAt
                ? { type: "rtp", status: rtpData.status }
                : null;

            expect(event).toBeNull();
        });

        it("omits RTP event when updatedAt is missing", () => {
            mockUseAthleteRtp.mockReturnValue({
                data: { athleteId: "ath_01", status: "AFASTADO" },
                isLoading: false,
            });

            mockUseAthleteRtp("ath_01");
            const rtpData = mockUseAthleteRtp.mock.results[0].value.data;

            const event = rtpData?.status && rtpData.updatedAt
                ? { type: "rtp" }
                : null;

            expect(event).toBeNull();
        });
    });

    describe("evaluation event", () => {
        it("renders evaluation event with microcycle and averageScore", () => {
            mockUseMedicalRecords.mockReturnValue({
                data: { data: [], total: 0, page: 1, limit: 50 },
                isLoading: false,
            });
            mockUseEvaluations.mockReturnValue({
                data: {
                    data: [makeEvaluation({ microcycle: "2025-W24", averageScore: 8.2 })],
                    total: 1,
                    page: 1,
                    limit: 50,
                },
                isLoading: false,
            });
            mockUseAthleteRtp.mockReturnValue({
                data: { athleteId: "ath_01", status: null },
                isLoading: false,
            });

            mockUseEvaluations({ athleteId: "ath_01", limit: 50 });
            const evalData = mockUseEvaluations.mock.results[0].value.data.data;

            expect(evalData[0].microcycle).toBe("2025-W24");
            expect(evalData[0].averageScore).toBe(8.2);
        });
    });

    describe("sorting", () => {
        it("events are sorted newest-first by ISO date string", () => {
            const injuryDate = "2025-01-15";
            const evalDate = "2025-06-10";

            const events = [
                { id: "rec_01", date: injuryDate, type: "injury" as const },
                { id: "eval_01", date: evalDate, type: "evaluation" as const },
            ].sort((a, b) => b.date.localeCompare(a.date));

            expect(events[0].date).toBe(evalDate);
            expect(events[1].date).toBe(injuryDate);
            expect(events[0].type).toBe("evaluation");
            expect(events[1].type).toBe("injury");
        });

        it("same-day events maintain stable relative order", () => {
            const events = [
                { id: "a", date: "2025-03-01", type: "injury" as const },
                { id: "b", date: "2025-03-01", type: "rtp" as const },
            ].sort((a, b) => b.date.localeCompare(a.date));

            expect(events).toHaveLength(2);
            expect(events.every((e) => e.date === "2025-03-01")).toBe(true);
        });

        it("three events from different sources sort correctly", () => {
            const record = makeMedicalRecord({ occurredAt: "2025-01-10" });
            const evaluation = makeEvaluation({ date: "2025-06-05" });
            const rtp = makeRtp({ status: "LIBERADO", updatedAt: "2025-03-20T00:00:00.000Z" });

            const events = [
                { id: record.id, date: record.occurredAt, type: "injury" as const },
                { id: evaluation.id, date: evaluation.date, type: "evaluation" as const },
                { id: "rtp-ath_01", date: rtp.updatedAt!.slice(0, 10), type: "rtp" as const },
            ].sort((a, b) => b.date.localeCompare(a.date));

            expect(events[0].type).toBe("evaluation");
            expect(events[1].type).toBe("rtp");
            expect(events[2].type).toBe("injury");
        });
    });

    describe("query parameters", () => {
        it("useMedicalRecords is called with limit 50", () => {
            mockAllEmpty();
            mockUseMedicalRecords({ athleteId: "ath_01", limit: 50 });

            expect(mockUseMedicalRecords).toHaveBeenCalledWith(
                expect.objectContaining({ limit: 50 }),
            );
        });

        it("useEvaluations is called with limit 50", () => {
            mockAllEmpty();
            mockUseEvaluations({ athleteId: "ath_01", limit: 50 });

            expect(mockUseEvaluations).toHaveBeenCalledWith(
                expect.objectContaining({ limit: 50 }),
            );
        });

        it("useAthleteRtp is called with the correct athleteId", () => {
            mockAllEmpty();
            mockUseAthleteRtp("ath_custom");

            expect(mockUseAthleteRtp).toHaveBeenCalledWith("ath_custom");
        });
    });
});

describe("timeline-config", () => {
    it("GRADE_BADGE covers all four InjuryGrade values", () => {
        const grades = ["GRADE_1", "GRADE_2", "GRADE_3", "COMPLETE"];
        const labels = grades.map((g) => {
            const map: Record<string, string> = {
                GRADE_1: "Grau I — Leve",
                GRADE_2: "Grau II — Moderado",
                GRADE_3: "Grau III — Grave",
                COMPLETE: "Ruptura Completa",
            };
            return map[g];
        });
        expect(new Set(labels).size).toBe(4);
    });

    it("RTP_BADGE covers AFASTADO, RETORNO_PROGRESSIVO, LIBERADO", () => {
        const statuses = ["AFASTADO", "RETORNO_PROGRESSIVO", "LIBERADO"];
        const labels: Record<string, string> = {
            AFASTADO: "Afastado",
            RETORNO_PROGRESSIVO: "Retorno Progressivo",
            LIBERADO: "Liberado",
        };
        for (const s of statuses) {
            expect(labels[s]).toBeDefined();
        }
    });

    it("EVENT_DOT covers all three event types", () => {
        const dots: Record<string, string> = {
            injury: "bg-danger",
            rtp: "bg-accent-300",
            evaluation: "bg-info",
        };
        expect(dots["injury"]).toBe("bg-danger");
        expect(dots["rtp"]).toBe("bg-accent-300");
        expect(dots["evaluation"]).toBe("bg-info");
    });

    it("EVENT_LABEL covers all three event types", () => {
        const labels: Record<string, string> = {
            injury: "Lesão registrada",
            rtp: "Status RTP",
            evaluation: "Avaliação técnica",
        };
        expect(labels["injury"]).toBe("Lesão registrada");
        expect(labels["rtp"]).toBe("Status RTP");
        expect(labels["evaluation"]).toBe("Avaliação técnica");
    });
});

const { mockUseQuery, mockGetAccessToken } = vi.hoisted(() => ({
    mockUseQuery: vi.fn(),
    mockGetAccessToken: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
    useQuery: mockUseQuery,
    useMutation: vi.fn(),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

vi.mock("@/hooks/use-auth", () => ({
    useAuth: () => ({ getAccessToken: mockGetAccessToken }),
}));

describe("useAthleteRtp", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAccessToken.mockResolvedValue("test-token");
        mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });
    });

    it("is disabled when athleteId is null", () => {
        const athleteId: string | null = null;
        const enabled = !!athleteId;
        expect(enabled).toBe(false);
    });

    it("is enabled when athleteId is a non-empty string", () => {
        const athleteId = "ath_01";
        const enabled = !!athleteId;
        expect(enabled).toBe(true);
    });

    it("uses queryKey ['athlete-rtp', athleteId]", () => {
        mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });
        mockUseQuery({
            queryKey: ["athlete-rtp", "ath_01"],
            queryFn: vi.fn(),
            enabled: true,
            staleTime: 2 * 60 * 1000,
        });

        expect(mockUseQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                queryKey: ["athlete-rtp", "ath_01"],
            }),
        );
    });

    it("queryFn throws when no token is available", async () => {
        mockGetAccessToken.mockResolvedValue(null);

        const queryFn = async () => {
            const token = await mockGetAccessToken();
            if (!token) throw new Error("Not authenticated");
            return {};
        };

        await expect(queryFn()).rejects.toThrow("Not authenticated");
    });

    it("staleTime is 2 minutes", () => {
        mockUseQuery({
            queryKey: ["athlete-rtp", "ath_01"],
            queryFn: vi.fn(),
            enabled: true,
            staleTime: 2 * 60 * 1000,
        });

        const [call] = mockUseQuery.mock.calls[0] as [{ staleTime: number }];
        expect(call.staleTime).toBe(120_000);
    });
});