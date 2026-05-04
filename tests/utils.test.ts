import { describe, it, expect } from 'vitest';
import { cn, getErrorMessage } from '../src/utils';

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

describe('getErrorMessage', () => {
  it('returns Error.message when given an Error instance', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns subclassed Error.message', () => {
    class MyErr extends Error {}
    expect(getErrorMessage(new MyErr('nope'))).toBe('nope');
  });

  it('returns the string itself when given a string', () => {
    expect(getErrorMessage('plain string')).toBe('plain string');
  });

  it('returns the default fallback for non-Error/non-string values', () => {
    expect(getErrorMessage({ weird: true })).toBe('Unknown error');
    expect(getErrorMessage(null)).toBe('Unknown error');
    expect(getErrorMessage(undefined)).toBe('Unknown error');
    expect(getErrorMessage(42)).toBe('Unknown error');
  });

  it('uses the custom fallback when provided', () => {
    expect(getErrorMessage(null, 'Failed to load')).toBe('Failed to load');
    expect(getErrorMessage({}, 'Network error')).toBe('Network error');
  });

  it('prefers Error.message over the fallback', () => {
    expect(getErrorMessage(new Error('real'), 'fallback')).toBe('real');
  });
});
