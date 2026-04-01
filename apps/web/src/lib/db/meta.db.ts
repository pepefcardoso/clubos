import { db } from "./index";

/**
 * Writes a value to the meta store under the given key.
 * This store is accessible to the Service Worker (via raw IDB) for Background Sync.
 *
 * Rules:
 *   - No PII (no CPF, phone, email, tokens) — values are stored unencrypted.
 *   - Use well-known key constants (e.g. 'activeClubId') to avoid typos.
 */
export async function setActiveMeta(
  key: string,
  value: unknown,
): Promise<void> {
  await db.meta.put({ key, value });
}

/**
 * Reads a typed value from the meta store.
 * Returns undefined if the key does not exist.
 *
 * @example
 * const clubId = await getActiveMeta<string>('activeClubId');
 */
export async function getActiveMeta<T>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}
