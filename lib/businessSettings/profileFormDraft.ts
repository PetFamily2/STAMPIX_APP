import {
  areBusinessAddressesEqual,
  normalizeAddressFieldText,
  normalizeHouseNumber,
  type SelectedBusinessAddress,
} from '@/lib/businessAddressSelection';
import type {
  BusinessExampleId,
  DiscoverySourceId,
  OwnerAgeRangeId,
  ProfileCompletionField,
  ReasonId,
  UsageAreaId,
} from '@/lib/businessSettings/profileFields';

export const PROFILE_DOCUMENT_FIELDS = [
  'name',
  'shortDescription',
  'businessPhone',
  'serviceTypes',
  'serviceTags',
] as const;

export const ONBOARDING_FORM_FIELDS = [
  'usageAreas',
  'businessExample',
  'discoverySource',
  'reason',
  'ownerAgeRange',
  'birthdayCampaignRelevant',
  'joinAnniversaryCampaignRelevant',
  'weakTimePromosRelevant',
] as const;

export type ProfileDocumentField = (typeof PROFILE_DOCUMENT_FIELDS)[number];
export type OnboardingFormField = (typeof ONBOARDING_FORM_FIELDS)[number];

export type ProfileFormSnapshot = {
  name: string;
  shortDescription: string;
  businessPhone: string;
  serviceTypes: readonly string[];
  serviceTags: readonly string[];
  usageAreas: readonly string[];
  businessExample: string | null;
  birthdayCampaignRelevant: boolean | null;
  joinAnniversaryCampaignRelevant: boolean | null;
  weakTimePromosRelevant: boolean | null;
  discoverySource: string | null;
  reason: string | null;
  ownerAgeRange: string | null;
};

type OnboardingSaveDraft = {
  usageAreas: readonly UsageAreaId[];
  businessExample: BusinessExampleId | null;
  discoverySource: DiscoverySourceId | null;
  reason: ReasonId | null;
  ownerAgeRange: OwnerAgeRangeId | null;
  birthdayCampaignRelevant: boolean | null;
  joinAnniversaryCampaignRelevant: boolean | null;
  weakTimePromosRelevant: boolean | null;
};

function sameList(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

export function dirtyProfileDocumentFields(
  draft: ProfileFormSnapshot,
  saved: ProfileFormSnapshot
): ProfileDocumentField[] {
  return PROFILE_DOCUMENT_FIELDS.filter((field) => {
    if (field === 'serviceTypes' || field === 'serviceTags') {
      return !sameList(draft[field], saved[field]);
    }
    return draft[field] !== saved[field];
  });
}

export function dirtyOnboardingFormFields(
  draft: ProfileFormSnapshot,
  saved: ProfileFormSnapshot
): OnboardingFormField[] {
  return ONBOARDING_FORM_FIELDS.filter((field) => {
    if (field === 'usageAreas') {
      return !sameList(draft.usageAreas, saved.usageAreas);
    }
    return draft[field] !== saved[field];
  });
}

export function fieldsToValidateForSave(
  dirtyDocumentFields: readonly ProfileDocumentField[],
  dirtyOnboardingFields: readonly OnboardingFormField[]
): ProfileCompletionField[] {
  const fields: ProfileCompletionField[] = [
    ...dirtyDocumentFields,
    ...dirtyOnboardingFields,
  ];
  if (dirtyDocumentFields.length > 0 && !fields.includes('name')) {
    fields.unshift('name');
  }
  return fields;
}

export function buildOnboardingSaveArgs(
  fields: readonly OnboardingFormField[],
  draft: OnboardingSaveDraft
) {
  const args: {
    usageAreas?: UsageAreaId[];
    businessExample?: BusinessExampleId;
    discoverySource?: DiscoverySourceId;
    reason?: ReasonId;
    ownerAgeRange?: OwnerAgeRangeId;
    birthdayCampaignRelevant?: boolean;
    joinAnniversaryCampaignRelevant?: boolean;
    weakTimePromosRelevant?: boolean;
  } = {};

  for (const field of fields) {
    if (field === 'usageAreas') {
      args.usageAreas = [...draft.usageAreas];
      continue;
    }
    if (field === 'businessExample' && draft.businessExample) {
      args.businessExample = draft.businessExample;
      continue;
    }
    if (field === 'discoverySource' && draft.discoverySource) {
      args.discoverySource = draft.discoverySource;
      continue;
    }
    if (field === 'reason' && draft.reason) {
      args.reason = draft.reason;
      continue;
    }
    if (field === 'ownerAgeRange' && draft.ownerAgeRange) {
      args.ownerAgeRange = draft.ownerAgeRange;
      continue;
    }
    if (
      field === 'birthdayCampaignRelevant' &&
      draft.birthdayCampaignRelevant !== null
    ) {
      args.birthdayCampaignRelevant = draft.birthdayCampaignRelevant;
      continue;
    }
    if (
      field === 'joinAnniversaryCampaignRelevant' &&
      draft.joinAnniversaryCampaignRelevant !== null
    ) {
      args.joinAnniversaryCampaignRelevant =
        draft.joinAnniversaryCampaignRelevant;
      continue;
    }
    if (
      field === 'weakTimePromosRelevant' &&
      draft.weakTimePromosRelevant !== null
    ) {
      args.weakTimePromosRelevant = draft.weakTimePromosRelevant;
    }
  }

  return args;
}

export const INCOMPLETE_ADDRESS_MESSAGE =
  'יש להשלים עיר, רחוב ומספר בית לפני שמירת הכתובת.';

export type AddressDraftText = {
  cityText: string;
  streetText: string;
  houseNumber: string;
};

export function addressDraftTextFromSelection(
  address: SelectedBusinessAddress | null | undefined
): AddressDraftText {
  return {
    cityText: address?.city ?? '',
    streetText: address?.street ?? '',
    houseNumber: address?.streetNumber ?? '',
  };
}

export function sameAddressDraftText(
  left: AddressDraftText,
  right: AddressDraftText
) {
  return (
    normalizeAddressFieldText(left.cityText) ===
      normalizeAddressFieldText(right.cityText) &&
    normalizeAddressFieldText(left.streetText) ===
      normalizeAddressFieldText(right.streetText) &&
    normalizeHouseNumber(left.houseNumber) ===
      normalizeHouseNumber(right.houseNumber)
  );
}

export function isProfileAddressDirty(
  loaded: SelectedBusinessAddress | null,
  selected: SelectedBusinessAddress | null,
  currentText: AddressDraftText
) {
  return (
    !areBusinessAddressesEqual(loaded, selected) ||
    !sameAddressDraftText(addressDraftTextFromSelection(loaded), currentText)
  );
}

export function revertedAddressDraft(loaded: SelectedBusinessAddress | null): {
  selectedAddress: SelectedBusinessAddress | null;
  addressQuery: string;
  draftText: AddressDraftText;
} {
  return {
    selectedAddress: loaded,
    addressQuery: loaded?.formattedAddress.trim() ?? '',
    draftText: addressDraftTextFromSelection(loaded),
  };
}

export type ProfileGroupSavePlan = {
  saveDocument: boolean;
  saveOnboarding: boolean;
  saveAddress: boolean;
  addressError: string | null;
};

export function planProfileGroupSave(input: {
  hasDocumentChanges: boolean;
  hasOnboardingChanges: boolean;
  addressDirty: boolean;
  addressValid: boolean;
  otherFieldsError: string | null;
}): ProfileGroupSavePlan {
  if (input.otherFieldsError) {
    return {
      saveDocument: false,
      saveOnboarding: false,
      saveAddress: false,
      addressError: null,
    };
  }

  return {
    saveDocument: input.hasDocumentChanges,
    saveOnboarding: input.hasOnboardingChanges,
    saveAddress: input.addressDirty && input.addressValid,
    addressError:
      input.addressDirty && !input.addressValid
        ? INCOMPLETE_ADDRESS_MESSAGE
        : null,
  };
}

export function profileSaveFollowUp(
  plan: ProfileGroupSavePlan,
  savedOtherGroups: boolean
) {
  if (plan.addressError && savedOtherGroups) {
    return {
      fieldError: `שאר הפרטים נשמרו. ${plan.addressError}`,
      saveNotice: null,
    };
  }
  if (plan.addressError) {
    return {
      fieldError: plan.addressError,
      saveNotice: null,
    };
  }
  return {
    fieldError: null,
    saveNotice: 'השינויים נשמרו',
  };
}

export function shouldGuardUnsavedProfileLeave(input: {
  hasActiveBusiness: boolean;
  isHydrated: boolean;
  isSaving: boolean;
  documentDirty: boolean;
  onboardingDirty: boolean;
  addressDirty: boolean;
}) {
  return (
    input.hasActiveBusiness &&
    input.isHydrated &&
    !input.isSaving &&
    (input.documentDirty || input.onboardingDirty || input.addressDirty)
  );
}
