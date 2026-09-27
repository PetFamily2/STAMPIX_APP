export type AccountSaveGroup = 'name' | 'phone';

export type AccountFormState = {
  serverFirstName: string;
  serverLastName: string;
  serverPhone: string;
  committedFirstName: string | null;
  committedLastName: string | null;
  committedPhone: string | null;
  firstNameDraft: string | null;
  lastNameDraft: string | null;
  phoneDraft: string | null;
};

export function accountBaselines(state: AccountFormState) {
  return {
    firstName: state.committedFirstName ?? state.serverFirstName,
    lastName: state.committedLastName ?? state.serverLastName,
    phone: state.committedPhone ?? state.serverPhone,
  };
}

export function listDirtyAccountGroups(
  state: AccountFormState
): AccountSaveGroup[] {
  const baseline = accountBaselines(state);
  const firstName = (state.firstNameDraft ?? baseline.firstName).trim();
  const lastName = (state.lastNameDraft ?? baseline.lastName).trim();
  const phone = (state.phoneDraft ?? baseline.phone).trim();
  const nameDirty =
    (state.firstNameDraft !== null && firstName !== baseline.firstName) ||
    (state.lastNameDraft !== null && lastName !== baseline.lastName);
  const phoneDirty = state.phoneDraft !== null && phone !== baseline.phone;
  const groups: AccountSaveGroup[] = [];
  if (nameDirty) {
    groups.push('name');
  }
  if (phoneDirty) {
    groups.push('phone');
  }
  return groups;
}

export function commitAccountSaveGroup(
  state: AccountFormState,
  group: AccountSaveGroup,
  saved: { firstName: string; lastName: string; phone: string }
): AccountFormState {
  if (group === 'name') {
    return {
      ...state,
      committedFirstName: saved.firstName.trim(),
      committedLastName: saved.lastName.trim(),
      firstNameDraft: null,
      lastNameDraft: null,
    };
  }
  return {
    ...state,
    committedPhone: saved.phone.trim(),
    phoneDraft: null,
  };
}

export function accountSaveResultMessage(
  saved: readonly AccountSaveGroup[],
  failed: AccountSaveGroup | null
) {
  if (failed === null) {
    return {
      title: 'נשמר',
      message: 'פרטי החשבון נשמרו בהצלחה.',
    };
  }
  const failedText =
    failed === 'phone' ? 'שמירת הטלפון נכשלה' : 'שמירת השם נכשלה';
  if (saved.length === 0) {
    return {
      title: 'שגיאה',
      message: `${failedText}. נסו שוב.`,
    };
  }
  const savedText = saved
    .map((group) => (group === 'name' ? 'השם נשמר' : 'הטלפון נשמר'))
    .join('. ');
  return {
    title: 'נשמר חלקית',
    message: `${savedText}. ${failedText}. אפשר לנסות שוב.`,
  };
}
