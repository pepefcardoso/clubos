import { test as base } from "@playwright/test";
import { mockRefreshSuccess, mockRefreshFailure, mockLogout } from "./mock-api";
import { ADMIN_TOKEN, TREASURER_TOKEN, PHYSIO_TOKEN } from "./fake-token";

type AuthFixtures = {
  /** Mocks refresh → 200 (ADMIN) and logout → 204 before each test. */
  authenticatedAsAdmin: void;
  /** Mocks refresh → 200 (TREASURER) and logout → 204 before each test. */
  authenticatedAsTreasurer: void;
  /** Mocks refresh → 200 (PHYSIO) and logout → 204 before each test. */
  authenticatedAsPhysio: void;
  /** Mocks refresh → 401, resulting in an unauthenticated AuthProvider state. */
  unauthenticated: void;
};

export const test = base.extend<AuthFixtures>({
  authenticatedAsAdmin: async ({ page }, use) => {
    await mockRefreshSuccess(page, ADMIN_TOKEN);
    await mockLogout(page);
    await use();
  },

  authenticatedAsTreasurer: async ({ page }, use) => {
    await mockRefreshSuccess(page, TREASURER_TOKEN);
    await mockLogout(page);
    await use();
  },

  authenticatedAsPhysio: async ({ page }, use) => {
    await mockRefreshSuccess(page, PHYSIO_TOKEN);
    await mockLogout(page);
    await use();
  },

  unauthenticated: async ({ page }, use) => {
    await mockRefreshFailure(page);
    await use();
  },
});

export { expect } from "@playwright/test";
