import { expect, test } from 'bun:test';
import {
  canApplyReferralServerUpdate,
  referralDraftState,
  referralSaveBlocked,
} from '../referrals/draftSafety';

test('server update does not erase edits or clear a rejected save before resolution', () => {
  expect(canApplyReferralServerUpdate(false, false)).toBe(true);
  expect(canApplyReferralServerUpdate(true, false)).toBe(false);
  expect(canApplyReferralServerUpdate(false, true)).toBe(false);
  expect(canApplyReferralServerUpdate(true, true)).toBe(false);
  expect(canApplyReferralServerUpdate(false, false)).toBe(true);
});

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

test('save becomes unavailable on conflict and available after resolution', () => {
  const normal = {
    canEdit: true,
    saving: false,
    hasBaseline: true,
    businessChanged: false,
    conflict: false,
    saveConflict: false,
  };
  expect(referralSaveBlocked(normal)).toBe(false);
  expect(referralSaveBlocked({ ...normal, conflict: true })).toBe(true);
  expect(referralSaveBlocked({ ...normal, saveConflict: true })).toBe(true);
  expect(referralSaveBlocked({ ...normal, businessChanged: true })).toBe(true);
  expect(referralSaveBlocked({ ...normal, saving: true })).toBe(true);
  expect(referralSaveBlocked(normal)).toBe(false);
});
