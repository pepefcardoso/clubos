import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postWorkloadMetric, WorkloadApiError } from "./workload";

const FAKE_TOKEN = "test-access-token";

const VALID_PAYLOAD = {
  athleteId: "athlete_001",
  date: "2024-06-01",
  rpe: 7,
  durationMinutes: 60,
  sessionType: "TRAINING" as const,
  notes: null,
  idempotencyKey: "aabbccddeeff00112233445566778899",
};

const SERVER_RESPONSE = {
  id: "metric_server_001",
  athleteId: "athlete_001",
  date: "2024-06-01",
  rpe: 7,
  durationMinutes: 60,
  trainingLoadAu: 420,
  sessionType: "TRAINING",
  notes: null,
  createdAt: "2024-06-01T10:00:00.000Z",
};

function mockFetch(status: number, body?: unknown) {
  vi.mocked(fetch).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postWorkloadMetric", () => {
  it("returns parsed response on 201", async () => {
    mockFetch(201, SERVER_RESPONSE);

    const result = await postWorkloadMetric(VALID_PAYLOAD, FAKE_TOKEN);
    expect(result).toEqual(SERVER_RESPONSE);
  });

  it("sends POST to /api/workload/metrics", async () => {
    mockFetch(201, SERVER_RESPONSE);
    await postWorkloadMetric(VALID_PAYLOAD, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/workload/metrics");
  });

  it("sends correct HTTP method", async () => {
    mockFetch(201, SERVER_RESPONSE);
    await postWorkloadMetric(VALID_PAYLOAD, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe("POST");
  });

  it("sends Authorization Bearer header", async () => {
    mockFetch(201, SERVER_RESPONSE);
    await postWorkloadMetric(VALID_PAYLOAD, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("sends Content-Type application/json header", async () => {
    mockFetch(201, SERVER_RESPONSE);
    await postWorkloadMetric(VALID_PAYLOAD, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("sends credentials: include", async () => {
    mockFetch(201, SERVER_RESPONSE);
    await postWorkloadMetric(VALID_PAYLOAD, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
  });

  it("includes idempotencyKey in the request body", async () => {
    mockFetch(201, SERVER_RESPONSE);
    await postWorkloadMetric(VALID_PAYLOAD, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.idempotencyKey).toBe(VALID_PAYLOAD.idempotencyKey);
  });

  it("includes all payload fields in the request body", async () => {
    mockFetch(201, SERVER_RESPONSE);
    await postWorkloadMetric(VALID_PAYLOAD, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body).toMatchObject({
      athleteId: "athlete_001",
      date: "2024-06-01",
      rpe: 7,
      durationMinutes: 60,
      sessionType: "TRAINING",
    });
  });

  it("throws WorkloadApiError with retryable=false for 400", async () => {
    mockFetch(400, { message: "Invalid RPE value" });

    await expect(
      postWorkloadMetric(VALID_PAYLOAD, FAKE_TOKEN),
    ).rejects.toMatchObject({
      status: 400,
      retryable: false,
      message: "Invalid RPE value",
    });
  });

  it("throws WorkloadApiError with retryable=false for 404", async () => {
    mockFetch(404, { message: "Atleta não encontrado" });

    await expect(
      postWorkloadMetric(VALID_PAYLOAD, FAKE_TOKEN),
    ).rejects.toMatchObject({
      status: 404,
      retryable: false,
      message: "Atleta não encontrado",
    });
  });

  it("throws WorkloadApiError with retryable=false for 422", async () => {
    mockFetch(422, { message: "Unprocessable entity" });

    await expect(
      postWorkloadMetric(VALID_PAYLOAD, FAKE_TOKEN),
    ).rejects.toMatchObject({
      status: 422,
      retryable: false,
    });
  });

  it("throws WorkloadApiError with retryable=true for 429", async () => {
    mockFetch(429, { message: "Too Many Requests" });

    await expect(
      postWorkloadMetric(VALID_PAYLOAD, FAKE_TOKEN),
    ).rejects.toMatchObject({
      status: 429,
      retryable: true,
    });
  });

  it("throws WorkloadApiError with retryable=true for 500", async () => {
    mockFetch(500, { message: "Internal Server Error" });

    await expect(
      postWorkloadMetric(VALID_PAYLOAD, FAKE_TOKEN),
    ).rejects.toMatchObject({
      status: 500,
      retryable: true,
    });
  });

  it("throws WorkloadApiError with retryable=true for 503", async () => {
    mockFetch(503, { message: "Service Unavailable" });

    await expect(
      postWorkloadMetric(VALID_PAYLOAD, FAKE_TOKEN),
    ).rejects.toMatchObject({
      status: 503,
      retryable: true,
    });
  });

  it("uses fallback message when error body is not JSON", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(
      postWorkloadMetric(VALID_PAYLOAD, FAKE_TOKEN),
    ).rejects.toMatchObject({
      status: 500,
      message: "HTTP 500",
    });
  });

  it("throws WorkloadApiError — is instanceof WorkloadApiError", async () => {
    mockFetch(401, { message: "Unauthorized" });

    await expect(
      postWorkloadMetric(VALID_PAYLOAD, FAKE_TOKEN),
    ).rejects.toBeInstanceOf(WorkloadApiError);
  });
});

describe("WorkloadApiError", () => {
  it("is an instance of Error", () => {
    const err = new WorkloadApiError("msg", 500, true);
    expect(err).toBeInstanceOf(Error);
  });

  it("has name WorkloadApiError", () => {
    const err = new WorkloadApiError("msg", 422, false);
    expect(err.name).toBe("WorkloadApiError");
  });

  it("exposes status and retryable properties", () => {
    const err = new WorkloadApiError("Rate limited", 429, true);
    expect(err.status).toBe(429);
    expect(err.retryable).toBe(true);
    expect(err.message).toBe("Rate limited");
  });

  it("retryable=false for a 4xx error", () => {
    const err = new WorkloadApiError("Not found", 404, false);
    expect(err.retryable).toBe(false);
  });
});
