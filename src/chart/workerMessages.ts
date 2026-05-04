/**
 * Keysound Worker Boundary — Discriminated Union + Type Guard
 *
 * `bms-player`'s `AudioPreloader` callback delivers messages from a Worker as
 * `(type: string, payload: unknown)`. Inside `KeysoundPlayer` we previously
 * narrowed the `payload` with repeated `as { key?: string; ... }` casts in
 * three different branches, which scattered the boundary contract and meant
 * adding a new message kind required updating each cast site.
 *
 * This module centralizes the contract:
 *   - `KeysoundWorkerMessage` is the discriminated union of every message we
 *     accept across the worker boundary.
 *   - `narrowKeysoundWorkerMessage(type, payload)` returns a typed message
 *     when the boundary contract holds, or `null` when it does not (so the
 *     caller can decide to log/ignore unknown shapes).
 *
 * Adding a new message kind = add to the union + add a branch to the guard.
 * No more scattered `as` casts.
 */

/** Worker → main-thread message shapes accepted by `KeysoundPlayer`. */
export type KeysoundWorkerMessage =
  | { type: 'PROGRESS' }
  | { type: 'LOADED'; key: string }
  | { type: 'ERROR'; key: string; fileName: string; message: string };

/**
 * Narrow `(type, payload)` from `AudioPreloader`'s callback into a typed
 * message, or `null` if the payload does not match the expected contract.
 *
 * The PROGRESS branch is intentionally permissive — `bms-player` may emit
 * progress without a payload, so we only require `type === 'PROGRESS'`.
 */
export function narrowKeysoundWorkerMessage(
  type: string,
  payload: unknown,
): KeysoundWorkerMessage | null {
  if (type === 'PROGRESS') {
    return { type: 'PROGRESS' };
  }

  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const p = payload as Record<string, unknown>;

  if (type === 'LOADED' && typeof p.key === 'string') {
    return { type: 'LOADED', key: p.key };
  }

  if (
    type === 'ERROR' &&
    typeof p.key === 'string' &&
    typeof p.fileName === 'string' &&
    typeof p.message === 'string'
  ) {
    return { type: 'ERROR', key: p.key, fileName: p.fileName, message: p.message };
  }

  return null;
}
