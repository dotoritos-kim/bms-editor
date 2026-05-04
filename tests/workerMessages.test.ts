import { describe, it, expect } from 'vitest';
import { narrowKeysoundWorkerMessage } from '../src/chart/workerMessages';

describe('narrowKeysoundWorkerMessage', () => {
  it('accepts PROGRESS without payload', () => {
    expect(narrowKeysoundWorkerMessage('PROGRESS', undefined)).toEqual({ type: 'PROGRESS' });
    expect(narrowKeysoundWorkerMessage('PROGRESS', null)).toEqual({ type: 'PROGRESS' });
    expect(narrowKeysoundWorkerMessage('PROGRESS', { ignored: true })).toEqual({ type: 'PROGRESS' });
  });

  it('accepts LOADED with key', () => {
    expect(narrowKeysoundWorkerMessage('LOADED', { key: 'A1' })).toEqual({
      type: 'LOADED',
      key: 'A1',
    });
  });

  it('rejects LOADED without key', () => {
    expect(narrowKeysoundWorkerMessage('LOADED', {})).toBeNull();
    expect(narrowKeysoundWorkerMessage('LOADED', null)).toBeNull();
    expect(narrowKeysoundWorkerMessage('LOADED', { key: 42 })).toBeNull();
  });

  it('accepts ERROR with full payload', () => {
    expect(
      narrowKeysoundWorkerMessage('ERROR', {
        key: 'B2',
        fileName: 'b2.wav',
        message: '404 Not Found',
      }),
    ).toEqual({
      type: 'ERROR',
      key: 'B2',
      fileName: 'b2.wav',
      message: '404 Not Found',
    });
  });

  it('rejects ERROR with missing fields', () => {
    expect(narrowKeysoundWorkerMessage('ERROR', { key: 'B2' })).toBeNull();
    expect(narrowKeysoundWorkerMessage('ERROR', { key: 'B2', fileName: 'b2.wav' })).toBeNull();
    expect(narrowKeysoundWorkerMessage('ERROR', { key: 'B2', message: 'oops' })).toBeNull();
  });

  it('rejects unknown message types', () => {
    expect(narrowKeysoundWorkerMessage('UNKNOWN', { key: 'X' })).toBeNull();
    expect(narrowKeysoundWorkerMessage('', null)).toBeNull();
  });

  it('rejects non-object payload for non-PROGRESS types', () => {
    expect(narrowKeysoundWorkerMessage('LOADED', 'string')).toBeNull();
    expect(narrowKeysoundWorkerMessage('LOADED', 42)).toBeNull();
    expect(narrowKeysoundWorkerMessage('ERROR', undefined)).toBeNull();
  });
});
