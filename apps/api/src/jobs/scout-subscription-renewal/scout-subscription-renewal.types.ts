export const SCOUT_SUBSCRIPTION_RENEWAL_JOB_NAMES = {
  RENEW_SCOUT_SUBSCRIPTION: "renew-scout-subscription",
} as const;

export type ScoutSubscriptionRenewalJobName =
  (typeof SCOUT_SUBSCRIPTION_RENEWAL_JOB_NAMES)[keyof typeof SCOUT_SUBSCRIPTION_RENEWAL_JOB_NAMES];

/** IDs only — no PII. [SEC-JOB] */
export interface ScoutSubscriptionRenewalJobData {
  scoutId: string;
  billingCycle: string;
}
