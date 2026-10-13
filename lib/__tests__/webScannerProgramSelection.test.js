import { describe, expect, test } from 'bun:test';
import {
  retainRecoverySelection,
  selectedScannerProgram,
} from '../web-scanner/programSelection';

describe('restored Web scanner program', () => {
  test('keeps the scanner mounted when canonical reconciliation clears the pending marker', () => {
    const initial = { scopeKey: '', programId: '' };
    const restored = retainRecoverySelection(
      initial,
      'actor:business',
      'program'
    );
    expect(
      selectedScannerProgram(initial, 'actor:business', 'program', ['program'])
    ).toBe('program');
    expect(
      selectedScannerProgram(restored, 'actor:business', null, ['program'])
    ).toBe('program');
    expect(retainRecoverySelection(restored, 'actor:business', null)).toBe(
      restored
    );
    expect(retainRecoverySelection(restored, 'actor:business', 'program')).toBe(
      restored
    );
  });
  test('account and business switching cannot adopt another scope selection', () => {
    const selection = { scopeKey: 'actor:business', programId: 'program' };
    expect(
      selectedScannerProgram(selection, 'other:business', null, ['program'])
    ).toBeNull();
    expect(
      selectedScannerProgram(selection, 'actor:other', null, ['program'])
    ).toBeNull();
    expect(
      selectedScannerProgram(selection, 'actor:business', null, [])
    ).toBeNull();
  });
  test('an unavailable pending program remains available only for receipt review', () => {
    const selection = { scopeKey: '', programId: '' };
    expect(
      selectedScannerProgram(selection, 'actor:business', 'pending-program', [])
    ).toBe('pending-program');
    const restored = retainRecoverySelection(
      selection,
      'actor:business',
      'pending-program'
    );
    expect(selectedScannerProgram(restored, 'actor:business', null, [])).toBe(
      'pending-program'
    );
    expect(
      selectedScannerProgram(restored, 'other:business', null, [])
    ).toBeNull();
  });
});
