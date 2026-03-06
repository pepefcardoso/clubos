import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuth } from "./use-auth";

// vi.hoisted ensures these variables are initialized before the hoisted vi.mock factories run
const { mockUseAuthContext } = vi.hoisted(() => ({
  mockUseAuthContext: vi.fn(),
}));

vi.mock("@/contexts/auth.context", () => ({
  useAuthContext: mockUseAuthContext,
}));

const fakeAuthContext = {
  user: {
    id: "user_1",
    email: "admin@clube.com",
    role: "ADMIN" as const,
    clubId: "club_1",
  },
  isAuthenticated: true,
  isLoading: false,
  accessToken: "token-abc",
  getAccessToken: vi.fn().mockResolvedValue("token-abc"),
  login: vi.fn(),
  logout: vi.fn(),
};

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthContext.mockReturnValue(fakeAuthContext);
  });

  it("is a function (exported hook)", () => {
    expect(typeof useAuth).toBe("function");
  });

  it("delegates entirely to useAuthContext", () => {
    const result = useAuth();
    expect(mockUseAuthContext).toHaveBeenCalledTimes(1);
    expect(result).toBe(fakeAuthContext);
  });

  it("exposes the authenticated user from context", () => {
    const { user } = useAuth();
    expect(user).toEqual(fakeAuthContext.user);
  });

  it("exposes isAuthenticated from context", () => {
    const { isAuthenticated } = useAuth();
    expect(isAuthenticated).toBe(true);
  });

  it("exposes isLoading from context", () => {
    const { isLoading } = useAuth();
    expect(isLoading).toBe(false);
  });

  it("exposes getAccessToken from context", async () => {
    const { getAccessToken } = useAuth();
    const token = await getAccessToken();
    expect(token).toBe("token-abc");
  });

  it("exposes login from context", () => {
    const { login } = useAuth();
    expect(typeof login).toBe("function");
  });

  it("exposes logout from context", () => {
    const { logout } = useAuth();
    expect(typeof logout).toBe("function");
  });

  it("reflects context changes between calls", () => {
    const unauthCtx = {
      ...fakeAuthContext,
      isAuthenticated: false,
      user: null,
    };
    mockUseAuthContext.mockReturnValue(unauthCtx);

    const { isAuthenticated } = useAuth();
    expect(isAuthenticated).toBe(false);
  });
});
