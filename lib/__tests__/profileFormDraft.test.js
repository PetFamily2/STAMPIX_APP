import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  buildOnboardingSaveArgs,
  dirtyOnboardingFormFields,
  dirtyProfileDocumentFields,
  fieldsToValidateForSave,
  INCOMPLETE_ADDRESS_MESSAGE,
  isProfileAddressDirty,
  planProfileGroupSave,
  profileSaveFollowUp,
  revertedAddressDraft,
  shouldGuardUnsavedProfileLeave,
} from '../businessSettings/profileFormDraft';

function snapshot(overrides = {}) {
  return {
    name: 'קפה השכונה',
    shortDescription: 'קפה ומאפים',
    businessPhone: '050-123-4567',
    serviceTypes: ['food_drink'],
    serviceTags: ['קפה'],
    usageAreas: ['nearby'],
    businessExample: 'cafe_restaurant',
    birthdayCampaignRelevant: true,
    joinAnniversaryCampaignRelevant: false,
    weakTimePromosRelevant: null,
    discoverySource: 'social',
    reason: 'repeat',
    ownerAgeRange: '25-34',
    ...overrides,
  };
}

describe('inline profile draft changes', () => {
  test('a clean draft has nothing to save', () => {
    const saved = snapshot();
    expect(dirtyProfileDocumentFields(saved, saved)).toEqual([]);
    expect(dirtyOnboardingFormFields(saved, saved)).toEqual([]);
    expect(fieldsToValidateForSave([], [])).toEqual([]);
  });

  test('only the edited document field is dirty, and name stays validated', () => {
    const saved = snapshot();
    const draft = snapshot({ businessPhone: '052-111-2233' });
    const dirty = dirtyProfileDocumentFields(draft, saved);

    expect(dirty).toEqual(['businessPhone']);
    expect(dirtyOnboardingFormFields(draft, saved)).toEqual([]);
    expect(fieldsToValidateForSave(dirty, [])).toEqual([
      'name',
      'businessPhone',
    ]);
    expect(fieldsToValidateForSave(dirty, [])).not.toContain(
      'shortDescription'
    );
  });

  test('an unchanged empty description is not blocked by another field edit', () => {
    const saved = snapshot({ shortDescription: '' });
    const draft = snapshot({
      shortDescription: '',
      serviceTags: ['קפה', 'מאפה'],
    });
    const dirty = dirtyProfileDocumentFields(draft, saved);

    expect(dirty).toEqual(['serviceTags']);
    expect(fieldsToValidateForSave(dirty, [])).not.toContain(
      'shortDescription'
    );
  });

  test('onboarding save sends only the changed choice', () => {
    const saved = snapshot();
    const draft = snapshot({
      usageAreas: ['nearby', 'citywide'],
      birthdayCampaignRelevant: false,
    });
    const dirty = dirtyOnboardingFormFields(draft, saved);

    expect(dirty).toEqual(['usageAreas', 'birthdayCampaignRelevant']);
    expect(buildOnboardingSaveArgs(dirty, draft)).toEqual({
      usageAreas: ['nearby', 'citywide'],
      birthdayCampaignRelevant: false,
    });
    expect(fieldsToValidateForSave([], dirty)).toEqual([
      'usageAreas',
      'birthdayCampaignRelevant',
    ]);
    expect(fieldsToValidateForSave([], dirty)).not.toContain('name');
  });

  test('a cleared required choice is still listed so validation can reject it', () => {
    const saved = snapshot();
    const draft = snapshot({ businessExample: null, discoverySource: null });
    const dirty = dirtyOnboardingFormFields(draft, saved);

    expect(dirty).toEqual(['businessExample', 'discoverySource']);
    expect(buildOnboardingSaveArgs(dirty, draft)).toEqual({});
    expect(fieldsToValidateForSave([], dirty)).toEqual([
      'businessExample',
      'discoverySource',
    ]);
  });
});

const loadedAddress = {
  placeId: 'place-1',
  formattedAddress: 'הרצל 12, תל אביב',
  latitude: 32.08,
  longitude: 34.78,
  city: 'תל אביב',
  street: 'הרצל',
  streetNumber: '12',
};

describe('profile address save recovery', () => {
  test('incomplete address does not block another valid dirty field', () => {
    const plan = planProfileGroupSave({
      hasDocumentChanges: true,
      hasOnboardingChanges: false,
      addressDirty: true,
      addressValid: false,
      otherFieldsError: null,
    });

    expect(plan.saveDocument).toBe(true);
    expect(plan.saveAddress).toBe(false);
    expect(plan.addressError).toBe(INCOMPLETE_ADDRESS_MESSAGE);
    expect(profileSaveFollowUp(plan, true)).toEqual({
      fieldError: `שאר הפרטים נשמרו. ${INCOMPLETE_ADDRESS_MESSAGE}`,
      saveNotice: null,
    });
  });

  test('an invalid address is not submitted', () => {
    const plan = planProfileGroupSave({
      hasDocumentChanges: false,
      hasOnboardingChanges: true,
      addressDirty: true,
      addressValid: false,
      otherFieldsError: null,
    });

    expect(plan.saveAddress).toBe(false);
    expect(plan.saveOnboarding).toBe(true);
  });

  test('address draft stays dirty after the other fields are saved', () => {
    const typed = {
      cityText: 'חיפה',
      streetText: '',
      houseNumber: '',
    };

    expect(isProfileAddressDirty(loadedAddress, null, typed)).toBe(true);
    const plan = planProfileGroupSave({
      hasDocumentChanges: true,
      hasOnboardingChanges: false,
      addressDirty: true,
      addressValid: false,
      otherFieldsError: null,
    });
    expect(plan.saveDocument).toBe(true);
    expect(plan.saveAddress).toBe(false);
    expect(isProfileAddressDirty(loadedAddress, null, typed)).toBe(true);
  });

  test('raw typed address marks the form dirty before a place is resolved', () => {
    expect(
      isProfileAddressDirty(null, null, {
        cityText: 'חיפה',
        streetText: 'הנמל',
        houseNumber: '',
      })
    ).toBe(true);
    expect(
      isProfileAddressDirty(null, null, {
        cityText: '',
        streetText: '',
        houseNumber: '',
      })
    ).toBe(false);
  });

  test('leaving with a raw address draft asks to keep the unsaved change', () => {
    const addressDirty = isProfileAddressDirty(null, null, {
      cityText: 'חיפה',
      streetText: '',
      houseNumber: '',
    });

    expect(
      shouldGuardUnsavedProfileLeave({
        hasActiveBusiness: true,
        isHydrated: true,
        isSaving: false,
        documentDirty: false,
        onboardingDirty: false,
        addressDirty,
      })
    ).toBe(true);
    expect(
      shouldGuardUnsavedProfileLeave({
        hasActiveBusiness: true,
        isHydrated: true,
        isSaving: true,
        documentDirty: false,
        onboardingDirty: false,
        addressDirty,
      })
    ).toBe(false);
  });

  test('reverting address restores only the loaded address draft', () => {
    const reverted = revertedAddressDraft(loadedAddress);
    const screen = readFileSync(
      'app/(authenticated)/(business)/settings-business-profile.tsx',
      'utf8'
    );
    const revertStart = screen.indexOf('const revertAddress = () => {');
    const revertEnd = screen.indexOf('const updateDraft = ');
    const revertBody = screen.slice(revertStart, revertEnd);

    expect(reverted.selectedAddress).toEqual(loadedAddress);
    expect(reverted.addressQuery).toBe(loadedAddress.formattedAddress);
    expect(
      isProfileAddressDirty(
        loadedAddress,
        reverted.selectedAddress,
        reverted.draftText
      )
    ).toBe(false);
    expect(revertBody).toContain('revertedAddressDraft(loadedAddress)');
    expect(revertBody).not.toContain('setDraft');
    expect(revertBody).not.toContain('saveProfileFields');
    expect(revertBody).not.toContain('saveOnboardingFields');
  });
});
