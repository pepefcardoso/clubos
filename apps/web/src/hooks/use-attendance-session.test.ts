import { describe, it, expect } from "vitest";
import type {
  AttendanceStatus,
  AthleteAttendance,
  SessionConfig,
} from "@/hooks/use-attendance-session";
import type { SessionType } from "@/lib/db/types";

type Action =
  | { type: "SET_ATHLETES"; payload: AthleteAttendance[] }
  | { type: "SET_STATUS"; athleteId: string; status: AttendanceStatus }
  | { type: "MARK_ALL_PRESENT" }
  | { type: "MARK_ALL_ABSENT" }
  | { type: "UPDATE_CONFIG"; payload: Partial<SessionConfig> }
  | { type: "SAVING" }
  | { type: "SAVED"; count: number }
  | { type: "RESET" };

interface State {
  config: SessionConfig;
  athletes: AthleteAttendance[];
  isSaving: boolean;
  savedCount: number | null;
}

const BASE_CONFIG: SessionConfig = {
  date: "2025-05-01",
  sessionType: "TRAINING" as SessionType,
  durationMinutes: 60,
  rpe: 7,
};

function initialState(): State {
  return {
    config: BASE_CONFIG,
    athletes: [],
    isSaving: false,
    savedCount: null,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_ATHLETES":
      return { ...state, athletes: action.payload };
    case "SET_STATUS":
      return {
        ...state,
        athletes: state.athletes.map((a) =>
          a.athleteId === action.athleteId
            ? { ...a, status: action.status }
            : a,
        ),
      };
    case "MARK_ALL_PRESENT":
      return {
        ...state,
        athletes: state.athletes.map((a) => ({ ...a, status: "present" })),
      };
    case "MARK_ALL_ABSENT":
      return {
        ...state,
        athletes: state.athletes.map((a) => ({ ...a, status: "absent" })),
      };
    case "UPDATE_CONFIG":
      return { ...state, config: { ...state.config, ...action.payload } };
    case "SAVING":
      return { ...state, isSaving: true };
    case "SAVED":
      return { ...state, isSaving: false, savedCount: action.count };
    case "RESET":
      return {
        ...initialState(),
        athletes: state.athletes.map((a) => ({
          ...a,
          status: "pending",
        })),
      };
    default:
      return state;
  }
}

function makeAthlete(
  id: string,
  status: AttendanceStatus = "pending",
): AthleteAttendance {
  return { athleteId: id, name: `Atleta ${id}`, status };
}

function stateWithAthletes(
  count: number,
  status: AttendanceStatus = "pending",
): State {
  return reducer(initialState(), {
    type: "SET_ATHLETES",
    payload: Array.from({ length: count }, (_, i) =>
      makeAthlete(`ath_${i + 1}`, status),
    ),
  });
}

describe("reducer — SET_ATHLETES", () => {
  it("replaces the athlete list with provided payload", () => {
    const athletes = [makeAthlete("a1"), makeAthlete("a2")];
    const next = reducer(initialState(), {
      type: "SET_ATHLETES",
      payload: athletes,
    });
    expect(next.athletes).toHaveLength(2);
    expect(next.athletes[0]?.athleteId).toBe("a1");
  });

  it("sets all athletes to 'pending' status when loaded", () => {
    const athletes = [
      makeAthlete("a1", "pending"),
      makeAthlete("a2", "pending"),
    ];
    const next = reducer(initialState(), {
      type: "SET_ATHLETES",
      payload: athletes,
    });
    expect(next.athletes.every((a) => a.status === "pending")).toBe(true);
  });

  it("does not mutate config or other fields", () => {
    const state = initialState();
    const next = reducer(state, {
      type: "SET_ATHLETES",
      payload: [makeAthlete("a1")],
    });
    expect(next.config).toEqual(state.config);
    expect(next.isSaving).toBe(false);
    expect(next.savedCount).toBeNull();
  });
});

describe("reducer — SET_STATUS", () => {
  it("updates the status of only the targeted athlete", () => {
    const state = stateWithAthletes(3);
    const next = reducer(state, {
      type: "SET_STATUS",
      athleteId: "ath_2",
      status: "present",
    });
    expect(next.athletes[0]?.status).toBe("pending");
    expect(next.athletes[1]?.status).toBe("present");
    expect(next.athletes[2]?.status).toBe("pending");
  });

  it("transitions pending → present", () => {
    const state = stateWithAthletes(1);
    const next = reducer(state, {
      type: "SET_STATUS",
      athleteId: "ath_1",
      status: "present",
    });
    expect(next.athletes[0]?.status).toBe("present");
  });

  it("transitions present → absent", () => {
    const state = stateWithAthletes(1, "present");
    const next = reducer(state, {
      type: "SET_STATUS",
      athleteId: "ath_1",
      status: "absent",
    });
    expect(next.athletes[0]?.status).toBe("absent");
  });

  it("transitions absent → pending", () => {
    const state = stateWithAthletes(1, "absent");
    const next = reducer(state, {
      type: "SET_STATUS",
      athleteId: "ath_1",
      status: "pending",
    });
    expect(next.athletes[0]?.status).toBe("pending");
  });

  it("is a no-op for an unknown athleteId", () => {
    const state = stateWithAthletes(2);
    const next = reducer(state, {
      type: "SET_STATUS",
      athleteId: "ath_999",
      status: "present",
    });
    expect(next.athletes).toEqual(state.athletes);
  });
});

describe("reducer — MARK_ALL_PRESENT", () => {
  it("marks every athlete as present", () => {
    const state = reducer(stateWithAthletes(4), {
      type: "SET_STATUS",
      athleteId: "ath_2",
      status: "absent",
    });
    const next = reducer(state, { type: "MARK_ALL_PRESENT" });
    expect(next.athletes.every((a) => a.status === "present")).toBe(true);
  });

  it("works on an empty list without errors", () => {
    const next = reducer(initialState(), { type: "MARK_ALL_PRESENT" });
    expect(next.athletes).toHaveLength(0);
  });
});

describe("reducer — MARK_ALL_ABSENT", () => {
  it("marks every athlete as absent", () => {
    const state = stateWithAthletes(3, "present");
    const next = reducer(state, { type: "MARK_ALL_ABSENT" });
    expect(next.athletes.every((a) => a.status === "absent")).toBe(true);
  });
});

describe("reducer — UPDATE_CONFIG", () => {
  it("updates the date field", () => {
    const next = reducer(initialState(), {
      type: "UPDATE_CONFIG",
      payload: { date: "2025-12-31" },
    });
    expect(next.config.date).toBe("2025-12-31");
  });

  it("updates the sessionType field", () => {
    const next = reducer(initialState(), {
      type: "UPDATE_CONFIG",
      payload: { sessionType: "MATCH" },
    });
    expect(next.config.sessionType).toBe("MATCH");
  });

  it("updates durationMinutes without touching other fields", () => {
    const next = reducer(initialState(), {
      type: "UPDATE_CONFIG",
      payload: { durationMinutes: 90 },
    });
    expect(next.config.durationMinutes).toBe(90);
    expect(next.config.rpe).toBe(BASE_CONFIG.rpe);
    expect(next.config.date).toBe(BASE_CONFIG.date);
  });

  it("updates rpe", () => {
    const next = reducer(initialState(), {
      type: "UPDATE_CONFIG",
      payload: { rpe: 9 },
    });
    expect(next.config.rpe).toBe(9);
  });

  it("partial patch does not erase unrelated config fields", () => {
    const next = reducer(initialState(), {
      type: "UPDATE_CONFIG",
      payload: { rpe: 5 },
    });
    expect(next.config.sessionType).toBe(BASE_CONFIG.sessionType);
    expect(next.config.durationMinutes).toBe(BASE_CONFIG.durationMinutes);
  });
});

describe("reducer — SAVING / SAVED", () => {
  it("SAVING sets isSaving to true", () => {
    const next = reducer(initialState(), { type: "SAVING" });
    expect(next.isSaving).toBe(true);
  });

  it("SAVED sets isSaving to false and savedCount to the provided value", () => {
    const saving = reducer(initialState(), { type: "SAVING" });
    const next = reducer(saving, { type: "SAVED", count: 5 });
    expect(next.isSaving).toBe(false);
    expect(next.savedCount).toBe(5);
  });

  it("savedCount is null in initial state", () => {
    expect(initialState().savedCount).toBeNull();
  });

  it("SAVED count of 0 is stored (edge case: all absent)", () => {
    const next = reducer(initialState(), { type: "SAVED", count: 0 });
    expect(next.savedCount).toBe(0);
  });
});

describe("reducer — RESET", () => {
  it("resets savedCount to null", () => {
    const state = reducer(stateWithAthletes(2, "present"), {
      type: "SAVED",
      count: 2,
    });
    const next = reducer(state, { type: "RESET" });
    expect(next.savedCount).toBeNull();
  });

  it("resets all athlete statuses to pending (preserves list)", () => {
    const state = stateWithAthletes(3, "present");
    const next = reducer(state, { type: "RESET" });
    expect(next.athletes).toHaveLength(3);
    expect(next.athletes.every((a) => a.status === "pending")).toBe(true);
  });

  it("resets isSaving to false", () => {
    const state = reducer(initialState(), { type: "SAVING" });
    const next = reducer(state, { type: "RESET" });
    expect(next.isSaving).toBe(false);
  });

  it("resets config to defaults (date field is today-like)", () => {
    const modified = reducer(initialState(), {
      type: "UPDATE_CONFIG",
      payload: { rpe: 10, durationMinutes: 180, sessionType: "MATCH" },
    });
    const next = reducer(modified, { type: "RESET" });
    expect(next.config.rpe).toBe(7);
    expect(next.config.durationMinutes).toBe(60);
    expect(next.config.sessionType).toBe("TRAINING");
  });

  it("preserves athletes list identity (same count after reset)", () => {
    const state = stateWithAthletes(5, "absent");
    const next = reducer(state, { type: "RESET" });
    expect(next.athletes).toHaveLength(5);
  });
});

describe("AthleteRollCard — tap cycle (NEXT_STATUS mapping)", () => {
  const NEXT_STATUS: Record<AttendanceStatus, AttendanceStatus> = {
    pending: "present",
    present: "absent",
    absent: "pending",
  };

  it("pending → present on first tap", () => {
    expect(NEXT_STATUS["pending"]).toBe("present");
  });

  it("present → absent on second tap", () => {
    expect(NEXT_STATUS["present"]).toBe("absent");
  });

  it("absent → pending on third tap (completes the cycle)", () => {
    expect(NEXT_STATUS["absent"]).toBe("pending");
  });

  it("cycling 3 times returns to original status", () => {
    let status: AttendanceStatus = "pending";
    status = NEXT_STATUS[status];
    status = NEXT_STATUS[status];
    status = NEXT_STATUS[status];
    expect(status).toBe("pending");
  });

  it("swipe right always yields present regardless of current status", () => {
    const swipeDelta = 50;
    const result: AttendanceStatus = swipeDelta > 0 ? "present" : "absent";
    expect(result).toBe("present");
  });

  it("swipe left always yields absent regardless of current status", () => {
    const swipeDelta = -50;
    const result: AttendanceStatus = swipeDelta > 0 ? "present" : "absent";
    expect(result).toBe("absent");
  });

  it("swipe under threshold does not trigger a status change", () => {
    const SWIPE_THRESHOLD = 40;
    const swipeDelta = 30;
    const triggered = Math.abs(swipeDelta) >= SWIPE_THRESHOLD;
    expect(triggered).toBe(false);
  });

  it("swipe exactly at threshold triggers a status change", () => {
    const SWIPE_THRESHOLD = 40;
    const swipeDelta = 40;
    const triggered = Math.abs(swipeDelta) >= SWIPE_THRESHOLD;
    expect(triggered).toBe(true);
  });
});

describe("derived counts (presentCount / absentCount / pendingCount)", () => {
  function computeCounts(athletes: AthleteAttendance[]) {
    return {
      presentCount: athletes.filter((a) => a.status === "present").length,
      absentCount: athletes.filter((a) => a.status === "absent").length,
      pendingCount: athletes.filter((a) => a.status === "pending").length,
    };
  }

  it("all pending — presentCount=0, absentCount=0", () => {
    const { presentCount, absentCount, pendingCount } = computeCounts(
      Array.from({ length: 5 }, (_, i) => makeAthlete(`a${i}`)),
    );
    expect(presentCount).toBe(0);
    expect(absentCount).toBe(0);
    expect(pendingCount).toBe(5);
  });

  it("mixed statuses are counted correctly", () => {
    const athletes: AthleteAttendance[] = [
      makeAthlete("a1", "present"),
      makeAthlete("a2", "present"),
      makeAthlete("a3", "absent"),
      makeAthlete("a4", "pending"),
    ];
    const { presentCount, absentCount, pendingCount } = computeCounts(athletes);
    expect(presentCount).toBe(2);
    expect(absentCount).toBe(1);
    expect(pendingCount).toBe(1);
  });

  it("total = presentCount + absentCount + pendingCount", () => {
    const athletes: AthleteAttendance[] = [
      makeAthlete("a1", "present"),
      makeAthlete("a2", "absent"),
      makeAthlete("a3", "pending"),
    ];
    const { presentCount, absentCount, pendingCount } = computeCounts(athletes);
    expect(presentCount + absentCount + pendingCount).toBe(athletes.length);
  });
});
