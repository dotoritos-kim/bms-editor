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
