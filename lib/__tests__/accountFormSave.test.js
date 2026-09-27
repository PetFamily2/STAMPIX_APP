import { describe, expect, test } from 'bun:test';

import {
  accountBaselines,
  accountSaveResultMessage,
  commitAccountSaveGroup,
  listDirtyAccountGroups,
} from '../businessSettings/accountFormSave';

function accountState(overrides = {}) {
  return {
    serverFirstName: 'דנה',
    serverLastName: 'כהן',
    serverPhone: '050-111-2233',
    committedFirstName: null,
    committedLastName: null,
    committedPhone: null,
    firstNameDraft: null,
    lastNameDraft: null,
    phoneDraft: null,
    ...overrides,
  };
}

describe('account partial save', () => {
  test('keeps a saved name and retries only the failed phone group', () => {
    let state = accountState({
      firstNameDraft: 'נועה',
      phoneDraft: '052-999-8877',
    });

    expect(listDirtyAccountGroups(state)).toEqual(['name', 'phone']);

    state = commitAccountSaveGroup(state, 'name', {
      firstName: 'נועה',
      lastName: 'כהן',
      phone: '052-999-8877',
    });

    expect(accountBaselines(state).firstName).toBe('נועה');
    expect(accountBaselines(state).lastName).toBe('כהן');
    expect(state.firstNameDraft).toBeNull();
    expect(state.phoneDraft).toBe('052-999-8877');
    expect(listDirtyAccountGroups(state)).toEqual(['phone']);
    expect(accountSaveResultMessage(['name'], 'phone')).toEqual({
      title: 'נשמר חלקית',
      message: 'השם נשמר. שמירת הטלפון נכשלה. אפשר לנסות שוב.',
    });
  });

  test('uses the same partial-save result if phone is saved before name fails', () => {
    let state = accountState({
      firstNameDraft: 'נועה',
      phoneDraft: '052-999-8877',
    });

    state = commitAccountSaveGroup(state, 'phone', {
      firstName: 'נועה',
      lastName: 'כהן',
      phone: '052-999-8877',
    });

    expect(listDirtyAccountGroups(state)).toEqual(['name']);
    expect(accountBaselines(state).phone).toBe('052-999-8877');
    expect(accountSaveResultMessage(['phone'], 'name')).toEqual({
      title: 'נשמר חלקית',
      message: 'הטלפון נשמר. שמירת השם נכשלה. אפשר לנסות שוב.',
    });
  });
});
