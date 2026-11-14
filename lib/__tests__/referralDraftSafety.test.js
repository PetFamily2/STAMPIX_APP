import { expect, test } from 'bun:test';
import { referralDraftState } from '../referrals/draftSafety';

test('preserves local edits and detects concurrent server and business changes', () => {
  const saved = { businessId: 'a', version: 3, value: 'saved' };
  expect(referralDraftState(saved, 'a', 'saved', 4)).toEqual({
    dirty: false,
    businessChanged: false,
    conflict: false,
  });
  expect(referralDraftState(saved, 'a', 'edited', 3)).toEqual({
    dirty: true,
    businessChanged: false,
    conflict: false,
  });
  expect(referralDraftState(saved, 'a', 'edited', 4)).toEqual({
    dirty: true,
    businessChanged: false,
    conflict: true,
  });
  expect(referralDraftState(saved, 'b', 'edited', 0)).toEqual({
    dirty: true,
    businessChanged: true,
    conflict: false,
  });
});
