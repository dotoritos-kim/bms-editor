/**
 * Utility: cn() - className merge helper
 *
 * Simplified version that concatenates class names, filtering falsy values.
 * For full Tailwind merge support, consumers should provide their own `cn` via
 * clsx + tailwind-merge, but this lightweight version works for the library's
 * internal usage.
 */
export function cn(...inputs: (string | undefined | null | false | 0)[]): string {
  return inputs.filter(Boolean).join(' ');
}

/**
 * Extracts a human-readable message from an unknown thrown value.
 *
 * Uses ES2022 `unknown` catch semantics. Handles `Error` instances, plain
 * strings, and arbitrary values. Use this in catch blocks to keep error
 * messaging consistent across the editor library.
 *
 * @example
 * try { ... } catch (e) {
 *   logger.error(getErrorMessage(e, 'Failed to load chart'));
 * }
 */
export function getErrorMessage(e: unknown, fallback = 'Unknown error'): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return fallback;
}
