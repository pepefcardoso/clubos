/**
 * ACWR data is refreshed by the acwr-refresh job every 4 hours.
 * Show a staleness warning if the data is older than this threshold.
 * Ref: design-docs.md § "Nota sobre séries temporais"
 */
export const ACWR_STALE_THRESHOLD_MS = 5 * 60 * 60 * 1000;