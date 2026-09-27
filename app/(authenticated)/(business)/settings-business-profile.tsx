import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  type ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BusinessAddressSelector from '@/components/business/BusinessAddressSelector';
import {
  BusinessSettingsSubpageHeader,
  ProfileFieldForm,
  SETTINGS_TOKENS,
  SettingsCard,
  SettingsPageShell,
  SettingsPrimaryButton,
  SettingsSection,
  validateProfileFields,
} from '@/components/business-settings';
import { useGuidedTargetRef } from '@/components/guidance/GuidedActionAnchor';
import { GuidedActionScreenOverlay } from '@/components/guidance/GuidedActionOverlay';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import {
  type BusinessSettingsSnapshot,
  useBusinessSettingsProfile,
} from '@/hooks/useBusinessSettingsProfile';
import {
  isValidSelectedBusinessAddress,
  type SelectedBusinessAddress,
} from '@/lib/businessAddressSelection';
import {
  EVERYDAY_PROFILE_GROUPS,
  type ProfileCompletionField,
} from '@/lib/businessSettings/profileFields';
import {
  type AddressDraftText,
  addressDraftTextFromSelection,
  buildOnboardingSaveArgs,
  dirtyOnboardingFormFields,
  dirtyProfileDocumentFields,
  fieldsToValidateForSave,
  isProfileAddressDirty,
  planProfileGroupSave,
  profileSaveFollowUp,
  revertedAddressDraft,
  sameAddressDraftText,
  shouldGuardUnsavedProfileLeave,
} from '@/lib/businessSettings/profileFormDraft';
import { BUSINESS_ROUTES } from '@/lib/navigation/businessRoutes';
import {
  resolveExactMissingProfileGuideField,
  resolveProfileGuideField,
} from '@/lib/recommendations/guidance';

const CONTEXT_PROFILE_FIELDS: ProfileCompletionField[] = [
  'discoverySource',
  'reason',
  'ownerAgeRange',
];

const PROFILE_FORM_SECTIONS: Array<{
  id: string;
  title: string;
  fields: readonly ProfileCompletionField[];
}> = [
  ...EVERYDAY_PROFILE_GROUPS,
  {
    id: 'context',
    title: 'עוד על העסק',
    fields: CONTEXT_PROFILE_FIELDS,
  },
];

function toSelectedAddress(
  settings:
    | {
        formattedAddress?: string;
        placeId?: string;
        location?: { lat?: number; lng?: number } | null;
        city?: string;
        street?: string;
        streetNumber?: string;
      }
    | null
    | undefined
): SelectedBusinessAddress | null {
  const formattedAddress = settings?.formattedAddress?.trim() ?? '';
  const placeId = settings?.placeId?.trim() ?? '';
  const lat = settings?.location?.lat;
  const lng = settings?.location?.lng;

  if (
    !formattedAddress ||
    !placeId ||
    typeof lat !== 'number' ||
    typeof lng !== 'number'
  ) {
    return null;
  }

  return {
    formattedAddress,
    placeId,
    latitude: lat,
    longitude: lng,
    city: settings?.city ?? '',
    street: settings?.street ?? '',
    streetNumber: settings?.streetNumber ?? '',
  };
}

export default function BusinessSettingsProfileScreen() {
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    fieldId?: string | string[];
  }>();
  const requestedFieldId = Array.isArray(params.fieldId)
    ? params.fieldId[0]
    : params.fieldId;
  const profileGuideField = resolveProfileGuideField(requestedFieldId);
  const guideTargetRef = useGuidedTargetRef();
  const guideScrollRef = useRef<ScrollView | null>(null);
  const guideCardYRef = useRef(0);
  const guideSectionYRef = useRef(0);
  const guideFieldYRef = useRef(0);
  const profile = useBusinessSettingsProfile();
  const { activeBusinessId } = useActiveBusiness();
  const [draft, setDraft] = useState<BusinessSettingsSnapshot>(
    profile.snapshot
  );
  const [hydratedBusinessId, setHydratedBusinessId] = useState<string | null>(
    null
  );
  const [addressQuery, setAddressQuery] = useState('');
  const [selectedAddress, setSelectedAddress] =
    useState<SelectedBusinessAddress | null>(null);
  const [loadedAddress, setLoadedAddress] =
    useState<SelectedBusinessAddress | null>(null);
  const [addressRevision, setAddressRevision] = useState(0);
  const [addressDraftText, setAddressDraftText] = useState<AddressDraftText>(
    addressDraftTextFromSelection(null)
  );
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isSavingForm, setIsSavingForm] = useState(false);

  const exactGuideField = useMemo(
    () =>
      resolveExactMissingProfileGuideField(
        profileGuideField,
        profile.missingFields
      ),
    [profile.missingFields, profileGuideField]
  );

  useEffect(() => {
    if (!activeBusinessId || !profile.businessSettings) {
      return;
    }
    if (
      String(profile.businessSettings.businessId) !== String(activeBusinessId)
    ) {
      return;
    }
    if (profile.baseUpdatedAt === null) {
      return;
    }
    const businessKey = String(activeBusinessId);
    if (hydratedBusinessId === businessKey) {
      return;
    }
    const nextAddress = toSelectedAddress(profile.businessSettings);
    setDraft(profile.snapshot);
    setAddressQuery(profile.businessSettings.formattedAddress?.trim() ?? '');
    setSelectedAddress(nextAddress);
    setLoadedAddress(nextAddress);
    setAddressDraftText(addressDraftTextFromSelection(nextAddress));
    setFieldError(null);
    setSaveNotice(null);
    setHydratedBusinessId(businessKey);
  }, [
    activeBusinessId,
    hydratedBusinessId,
    profile.baseUpdatedAt,
    profile.businessSettings,
    profile.snapshot,
  ]);

  const isHydrated =
    activeBusinessId !== null &&
    hydratedBusinessId === String(activeBusinessId);
  const dirtyDocumentFields = dirtyProfileDocumentFields(
    draft,
    profile.snapshot
  );
  const dirtyOnboardingFields = dirtyOnboardingFormFields(
    draft,
    profile.snapshot
  );
  const addressDirty = isProfileAddressDirty(
    loadedAddress,
    selectedAddress,
    addressDraftText
  );
  const isDirty = shouldGuardUnsavedProfileLeave({
    hasActiveBusiness: Boolean(activeBusinessId),
    isHydrated,
    isSaving: false,
    documentDirty: dirtyDocumentFields.length > 0,
    onboardingDirty: dirtyOnboardingFields.length > 0,
    addressDirty,
  });

  const loadLatest = () => {
    const next = profile.applyBusinessSettingsSnapshot();
    const settings = profile.businessSettings;
    if (next) {
      setDraft(next);
    }
    const nextAddress = toSelectedAddress(settings);
    const reverted = revertedAddressDraft(nextAddress);
    setAddressQuery(reverted.addressQuery);
    setSelectedAddress(reverted.selectedAddress);
    setLoadedAddress(reverted.selectedAddress);
    setAddressDraftText(reverted.draftText);
    setAddressRevision((current) => current + 1);
    setFieldError(null);
    setSaveNotice(null);
  };

  const showConflict = () => {
    Alert.alert(
      'הנתונים עודכנו',
      'נמצאה גרסה חדשה של פרטי העסק. אפשר לטעון את הנתונים העדכניים או להשאיר את הטיוטה המקומית.',
      [
        { text: 'טען גרסה עדכנית', onPress: loadLatest },
        { text: 'השאר טיוטה מקומית' },
      ]
    );
  };

  const handleAddressDraftChange = useCallback((next: AddressDraftText) => {
    setAddressDraftText((current) =>
      sameAddressDraftText(current, next) ? current : next
    );
  }, []);

  const revertAddress = () => {
    const reverted = revertedAddressDraft(loadedAddress);
    setAddressQuery(reverted.addressQuery);
    setSelectedAddress(reverted.selectedAddress);
    setAddressDraftText(reverted.draftText);
    setAddressRevision((current) => current + 1);
    setFieldError(null);
    setSaveNotice(null);
  };

  const updateDraft = (next: BusinessSettingsSnapshot) => {
    setDraft(next);
    setFieldError(null);
    setSaveNotice(null);
  };

  const handleSave = async () => {
    if (
      !profile.canEditBusiness ||
      profile.isSaving ||
      isSavingForm ||
      profile.conflictLocked
    ) {
      return;
    }
    if (
      dirtyDocumentFields.length === 0 &&
      dirtyOnboardingFields.length === 0 &&
      !addressDirty
    ) {
      return;
    }

    const otherFieldsError = validateProfileFields(
      fieldsToValidateForSave(dirtyDocumentFields, dirtyOnboardingFields),
      draft
    );
    const savePlan = planProfileGroupSave({
      hasDocumentChanges: dirtyDocumentFields.length > 0,
      hasOnboardingChanges: dirtyOnboardingFields.length > 0,
      addressDirty,
      addressValid: isValidSelectedBusinessAddress(selectedAddress),
      otherFieldsError,
    });
    if (otherFieldsError) {
      setFieldError(otherFieldsError);
      setSaveNotice(null);
      return;
    }
    if (
      !savePlan.saveDocument &&
      !savePlan.saveOnboarding &&
      !savePlan.saveAddress
    ) {
      const followUp = profileSaveFollowUp(savePlan, false);
      setFieldError(followUp.fieldError);
      setSaveNotice(followUp.saveNotice);
      return;
    }

    setFieldError(null);
    setSaveNotice(null);
    setIsSavingForm(true);

    try {
      let savedOtherGroups = false;
      if (savePlan.saveDocument) {
        const result = await profile.saveProfileFields({
          name: draft.name,
          shortDescription: draft.shortDescription,
          businessPhone: draft.businessPhone,
          serviceTypes: draft.serviceTypes,
          serviceTags: draft.serviceTags,
        });
        if (result.conflict) {
          showConflict();
          return;
        }
        if (!result.ok) {
          setFieldError(result.message ?? 'שמירת הנתון נכשלה.');
          return;
        }
        savedOtherGroups = true;
      }

      if (
        savePlan.saveAddress &&
        selectedAddress &&
        isValidSelectedBusinessAddress(selectedAddress)
      ) {
        const result = await profile.saveBusinessAddress(selectedAddress);
        if (result.conflict) {
          showConflict();
          return;
        }
        if (!result.ok) {
          setFieldError(result.message ?? 'עדכון הכתובת נכשל.');
          return;
        }
        setLoadedAddress(selectedAddress);
        setAddressDraftText(addressDraftTextFromSelection(selectedAddress));
      }

      if (savePlan.saveOnboarding) {
        const result = await profile.saveOnboardingFields(
          buildOnboardingSaveArgs(dirtyOnboardingFields, draft)
        );
        if (!result.ok) {
          setFieldError(result.message ?? 'שמירת הנתון נכשלה.');
          return;
        }
        savedOtherGroups = true;
      }

      const followUp = profileSaveFollowUp(savePlan, savedOtherGroups);
      setFieldError(followUp.fieldError);
      setSaveNotice(followUp.saveNotice);
    } finally {
      setIsSavingForm(false);
    }
  };

  usePreventRemove(
    shouldGuardUnsavedProfileLeave({
      hasActiveBusiness: Boolean(activeBusinessId),
      isHydrated,
      isSaving: isSavingForm,
      documentDirty: dirtyDocumentFields.length > 0,
      onboardingDirty: dirtyOnboardingFields.length > 0,
      addressDirty,
    }),
    ({ data }) => {
      Alert.alert(
        'יש שינויים שלא נשמרו',
        'אפשר להמשיך לערוך או לצאת ללא שמירה.',
        [
          { text: 'המשך עריכה', style: 'cancel' },
          {
            text: 'יציאה ללא שמירה',
            style: 'destructive',
            onPress: () => navigation.dispatch(data.action),
          },
        ]
      );
    }
  );

  if (!activeBusinessId) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: SETTINGS_TOKENS.pageBackground,
          paddingHorizontal: 24,
        }}
      >
        <Text
          style={{
            width: '100%',
            textAlign: 'right',
            color: SETTINGS_TOKENS.textSecondary,
          }}
        >
          לא נמצא עסק פעיל.
        </Text>
      </SafeAreaView>
    );
  }

  const formReady =
    profile.businessSettings != null &&
    hydratedBusinessId === String(activeBusinessId);
  const canEditFields =
    profile.canEditBusiness && !profile.isSaving && !isSavingForm;

  return (
    <SettingsPageShell
      keyboardAware={true}
      scrollRef={guideScrollRef}
      header={
        <BusinessSettingsSubpageHeader
          title="פרטי העסק"
          fallbackHref={BUSINESS_ROUTES.settings}
        />
      }
      footer={
        formReady && profile.canEditBusiness ? (
          <View style={styles.footerStack}>
            {fieldError ? (
              <Text style={styles.error} accessibilityRole="alert">
                {fieldError}
              </Text>
            ) : saveNotice ? (
              <Text style={styles.notice}>{saveNotice}</Text>
            ) : null}
            <SettingsPrimaryButton
              label="שמירה"
              loading={isSavingForm}
              disabled={!isDirty || isSavingForm || profile.conflictLocked}
              onPress={() => {
                void handleSave();
              }}
            />
          </View>
        ) : null
      }
      overlay={
        <GuidedActionScreenOverlay
          activeBusinessId={activeBusinessId}
          routeKey="business-profile"
          targetRefs={{
            'profile-complete': guideTargetRef,
          }}
          scrollTargetIntoView={() => {
            guideScrollRef.current?.scrollTo({
              y: Math.max(
                0,
                guideCardYRef.current +
                  guideSectionYRef.current +
                  guideFieldYRef.current -
                  24
              ),
              animated: false,
            });
          }}
        />
      }
    >
      {profile.businessSettings === undefined ||
      (profile.businessSettings !== null && !formReady) ? (
        <View style={styles.loading}>
          <ActivityIndicator color={SETTINGS_TOKENS.accent} />
        </View>
      ) : profile.businessSettings === null ? (
        <Text style={styles.empty}>לא נמצאו נתוני עסק להצגה.</Text>
      ) : (
        <View
          onLayout={(event) => {
            guideCardYRef.current = event.nativeEvent.layout.y;
          }}
          style={styles.sections}
        >
          {PROFILE_FORM_SECTIONS.map((group) => {
            const editorFields = group.fields.filter(
              (field) => field !== 'address'
            );
            const sectionGuides =
              exactGuideField !== null &&
              group.fields.includes(exactGuideField);
            return (
              <View
                key={group.id}
                onLayout={(event) => {
                  if (sectionGuides) {
                    guideSectionYRef.current = event.nativeEvent.layout.y;
                  }
                }}
              >
                <SettingsSection title={group.title}>
                  <SettingsCard>
                    {editorFields.length > 0 ? (
                      <ProfileFieldForm
                        fields={editorFields}
                        values={draft}
                        onChange={updateDraft}
                        editable={canEditFields}
                        anchoredField={sectionGuides ? exactGuideField : null}
                        anchorRef={sectionGuides ? guideTargetRef : undefined}
                        onAnchorLayout={
                          sectionGuides
                            ? (y) => {
                                guideFieldYRef.current = y;
                              }
                            : undefined
                        }
                      />
                    ) : null}
                    {group.fields.includes('address') ? (
                      <>
                        <BusinessAddressSelector
                          key={`${activeBusinessId}:${addressRevision}`}
                          query={addressQuery}
                          selectedAddress={selectedAddress}
                          onQueryChange={(value) => {
                            setAddressQuery(value);
                            setFieldError(null);
                            setSaveNotice(null);
                          }}
                          onSelectedAddressChange={(value) => {
                            setSelectedAddress(value);
                            setFieldError(null);
                            setSaveNotice(null);
                          }}
                          onDraftChange={handleAddressDraftChange}
                          disabled={!canEditFields}
                          scrollViewRef={guideScrollRef}
                        />
                        {addressDirty && canEditFields ? (
                          <Pressable
                            onPress={revertAddress}
                            accessibilityRole="button"
                            accessibilityLabel="שחזור הכתובת השמורה"
                            style={styles.warningActionHit}
                          >
                            <Text style={styles.warningAction}>
                              שחזור הכתובת השמורה
                            </Text>
                          </Pressable>
                        ) : null}
                      </>
                    ) : null}
                  </SettingsCard>
                </SettingsSection>
              </View>
            );
          })}

          {profile.conflictLocked ? (
            <View style={styles.warningCard}>
              <Text style={styles.warningText}>
                נמצאה גרסה חדשה של פרטי העסק. השמירה נעולה עד לטעינת הגרסה
                העדכנית.
              </Text>
              <Pressable
                onPress={loadLatest}
                accessibilityRole="button"
                accessibilityLabel="טען גרסה עדכנית"
                style={styles.warningActionHit}
              >
                <Text style={styles.warningAction}>טען גרסה עדכנית</Text>
              </Pressable>
            </View>
          ) : null}

          {!profile.canEditBusiness ? (
            <Text style={styles.permission}>
              עריכת נתוני העסק זמינה לבעלים או למנהל בלבד
            </Text>
          ) : null}
        </View>
      )}
    </SettingsPageShell>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: 16,
  },
  loading: {
    alignItems: 'center' as const,
    paddingVertical: 28,
  },
  empty: {
    width: '100%' as const,
    textAlign: 'right' as const,
    writingDirection: 'rtl' as const,
    color: SETTINGS_TOKENS.textSecondary,
  },
  footerStack: {
    width: '100%' as const,
    gap: 8,
    alignItems: 'stretch' as const,
  },
  error: {
    width: '100%' as const,
    fontSize: 13,
    lineHeight: 18,
    color: SETTINGS_TOKENS.destructive,
    textAlign: 'right' as const,
    writingDirection: 'rtl' as const,
  },
  notice: {
    width: '100%' as const,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600' as const,
    color: SETTINGS_TOKENS.accentText,
    textAlign: 'right' as const,
    writingDirection: 'rtl' as const,
  },
  permission: {
    textAlign: 'right' as const,
    writingDirection: 'rtl' as const,
    color: SETTINGS_TOKENS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  warningCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: SETTINGS_TOKENS.warningBorder,
    backgroundColor: SETTINGS_TOKENS.warningBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  warningText: {
    width: '100%' as const,
    textAlign: 'right' as const,
    writingDirection: 'rtl' as const,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600' as const,
    color: SETTINGS_TOKENS.warningTitle,
  },
  warningActionHit: {
    minHeight: 44,
    justifyContent: 'center',
  },
  warningAction: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: SETTINGS_TOKENS.accentText,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
