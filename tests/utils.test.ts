import { describe, it, expect } from 'vitest';
import { cn } from '../src/utils';

describe('cn (class name merge utility)', () => {
  it('should join multiple class strings', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('should filter out falsy values', () => {
    expect(cn('a', false, 'b', null, 'c', undefined, 0)).toBe('a b c');
  });

  it('should return empty string for no arguments', () => {
    expect(cn()).toBe('');
  });

  it('should return empty string for all falsy arguments', () => {
    expect(cn(false, null, undefined, 0)).toBe('');
  });

  it('should handle a single class name', () => {
    expect(cn('only')).toBe('only');
  });

  it('should not trim or deduplicate class names', () => {
    expect(cn('a', 'a')).toBe('a a');
  });

  it('should handle class strings with spaces inside', () => {
    // cn does not split, it just concatenates
    expect(cn('a b', 'c')).toBe('a b c');
  });
});
