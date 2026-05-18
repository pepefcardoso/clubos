export const SCOUT_SUBSCRIPTION_EXPIRY_JOB_NAMES = {
  EXPIRE_LAPSED_SUBSCRIPTIONS: "expire-lapsed-subscriptions",
} as const;

export type ScoutSubscriptionExpiryJobName =
  (typeof SCOUT_SUBSCRIPTION_EXPIRY_JOB_NAMES)[keyof typeof SCOUT_SUBSCRIPTION_EXPIRY_JOB_NAMES];

/** No data needed — the worker queries all lapsed subscriptions directly. */
export interface ScoutSubscriptionExpiryJobData {
  _placeholder?: never;
}
