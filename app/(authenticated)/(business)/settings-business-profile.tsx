import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { type Ref, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  type ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BusinessSettingsSubpageHeader,
  ProfileFieldForm,
  SettingsGroup,
  SettingsNavRow,
  SettingsPageShell,
  SettingsPrimaryButton,
  SettingsSection,
  SETTINGS_TOKENS,
  validateProfileFields,
} from '@/components/business-settings';
import { useGuidedTargetRef } from '@/components/guidance/GuidedActionAnchor';
import { GuidedActionScreenOverlay } from '@/components/guidance/GuidedActionOverlay';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useBusinessSettingsProfile } from '@/hooks/useBusinessSettingsProfile';
import {
  EVERYDAY_PROFILE_GROUPS,
  isOnboardingAnalyticsField,
  MISSING_VALUE,
  type ProfileCompletionField,
  PROFILE_FIELD_EDITOR_TITLES,
  PROFILE_FIELD_LABELS,
} from '@/lib/businessSettings/profileFields';
import { BUSINESS_ROUTES } from '@/lib/navigation/businessRoutes';
import {
  resolveExactMissingProfileGuideField,
  resolveProfileGuideField,
} from '@/lib/recommendations/guidance';

function ProfileValueRow({
  field,
  value,
  disabled,
  onPress,
  isLast,
  targetRef,
  onTargetLayout,
}: {
  field: ProfileCompletionField;
  value: string;
  disabled: boolean;
  onPress: () => void;
  isLast?: boolean;
  targetRef?: Ref<View>;
  onTargetLayout?: (y: number) => void;
}) {
  return (
    <View
      ref={targetRef}
      collapsable={false}
      onLayout={(event) => onTargetLayout?.(event.nativeEvent.layout.y)}
    >
      <SettingsNavRow
        title={PROFILE_FIELD_LABELS[field]}
        value={value}
        disabled={disabled}
        onPress={onPress}
        isLast={isLast}
        accessibilityHint={`עריכת ${PROFILE_FIELD_LABELS[field]}`}
      />
    </View>
  );
}

export default function BusinessSettingsProfileScreen() {
  const router = useRouter();
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
  const guideTargetYRef = useRef(0);
  const profile = useBusinessSettingsProfile();
  const { activeBusinessId } = useActiveBusiness();

  const [editingField, setEditingField] =
    useState<ProfileCompletionField | null>(null);
  const [draft, setDraft] = useState(profile.snapshot);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const exactGuideField = useMemo(
    () =>
      resolveExactMissingProfileGuideField(
        profileGuideField,
        profile.missingFields
      ),
    [profile.missingFields, profileGuideField]
  );

  useEffect(() => {
    setDraft(profile.snapshot);
  }, [profile.snapshot]);

  const openEditor = (field: ProfileCompletionField) => {
    if (!profile.canEditBusiness) {
      return;
    }
    if (field === 'address') {
      router.push(BUSINESS_ROUTES.address as Href);
      return;
    }
    setFieldError(null);
    setDraft(profile.snapshot);
    setEditingField(field);
  };

  const closeEditor = () => {
    if (profile.isSaving) {
      return;
    }
    setEditingField(null);
    setFieldError(null);
  };

  const saveEditor = async () => {
    if (!editingField) {
      return;
    }
    const message = validateProfileFields([editingField], draft);
    if (message) {
      setFieldError(message);
      return;
    }

    let result: { ok: boolean; conflict: boolean; message: string | null };
    if (
      editingField === 'name' ||
      editingField === 'shortDescription' ||
      editingField === 'businessPhone' ||
      editingField === 'serviceTypes' ||
      editingField === 'serviceTags'
    ) {
      result = await profile.saveProfileFields({
        name: draft.name,
        shortDescription: draft.shortDescription,
        businessPhone: draft.businessPhone,
        serviceTypes: draft.serviceTypes,
        serviceTags: draft.serviceTags,
      });
    } else if (editingField === 'usageAreas') {
      result = await profile.saveOnboardingFields({
        usageAreas: draft.usageAreas,
      });
    } else if (editingField === 'businessExample' && draft.businessExample) {
      result = await profile.saveOnboardingFields({
        businessExample: draft.businessExample,
      });
    } else if (editingField === 'discoverySource' && draft.discoverySource) {
      result = await profile.saveOnboardingFields({
        discoverySource: draft.discoverySource,
      });
    } else if (editingField === 'reason' && draft.reason) {
      result = await profile.saveOnboardingFields({ reason: draft.reason });
    } else if (editingField === 'ownerAgeRange' && draft.ownerAgeRange) {
      result = await profile.saveOnboardingFields({
        ownerAgeRange: draft.ownerAgeRange,
      });
    } else if (
      editingField === 'birthdayCampaignRelevant' &&
      draft.birthdayCampaignRelevant !== null
    ) {
      result = await profile.saveOnboardingFields({
        birthdayCampaignRelevant: draft.birthdayCampaignRelevant,
      });
    } else if (
      editingField === 'joinAnniversaryCampaignRelevant' &&
      draft.joinAnniversaryCampaignRelevant !== null
    ) {
      result = await profile.saveOnboardingFields({
        joinAnniversaryCampaignRelevant: draft.joinAnniversaryCampaignRelevant,
      });
    } else if (
      editingField === 'weakTimePromosRelevant' &&
      draft.weakTimePromosRelevant !== null
    ) {
      result = await profile.saveOnboardingFields({
        weakTimePromosRelevant: draft.weakTimePromosRelevant,
      });
    } else {
      result = { ok: false, conflict: false, message: 'שמירת הנתון נכשלה.' };
    }

    if (result.conflict) {
      Alert.alert(
        'הנתונים עודכנו',
        'נמצאה גרסה חדשה של פרטי העסק. אפשר לטעון את הנתונים העדכניים או להשאיר את הטיוטה המקומית.',
        [
          {
            text: 'טען גרסה עדכנית',
            onPress: () => {
              profile.applyBusinessSettingsSnapshot();
              setEditingField(null);
            },
          },
          { text: 'השאר טיוטה מקומית' },
        ]
      );
      return;
    }
    if (!result.ok) {
      setFieldError(result.message ?? 'שמירת הנתון נכשלה.');
      return;
    }
    setEditingField(null);
    setFieldError(null);
  };

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

  const guidedOnboardingField =
    exactGuideField && isOnboardingAnalyticsField(exactGuideField)
      ? exactGuideField
      : null;

  if (editingField) {
    return (
      <SettingsPageShell
        keyboardAware={true}
        header={
          <BusinessSettingsSubpageHeader
            title={PROFILE_FIELD_EDITOR_TITLES[editingField]}
            fallbackHref={BUSINESS_ROUTES.profile}
            onBackPress={closeEditor}
          />
        }
        footer={
          profile.canEditBusiness ? (
            <SettingsPrimaryButton
              label="שמירה"
              loading={profile.isSaving}
              disabled={profile.isSaving || profile.conflictLocked}
              onPress={() => {
                void saveEditor();
              }}
            />
          ) : null
        }
      >
        <ProfileFieldForm
          fields={[editingField]}
          values={draft}
          onChange={setDraft}
          error={fieldError}
        />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell
      scrollRef={guideScrollRef}
      header={
        <BusinessSettingsSubpageHeader
          title="פרטי העסק"
          fallbackHref={BUSINESS_ROUTES.settings}
        />
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
                guideCardYRef.current + guideTargetYRef.current - 24
              ),
              animated: false,
            });
          }}
        />
      }
    >
      {profile.businessSettings === undefined ? (
        <View style={{ alignItems: 'center', paddingVertical: 28 }}>
          <ActivityIndicator color={SETTINGS_TOKENS.accent} />
        </View>
      ) : profile.businessSettings === null ? (
        <Text
          style={{
            textAlign: 'right',
            color: SETTINGS_TOKENS.textSecondary,
          }}
        >
          לא נמצאו נתוני עסק להצגה.
        </Text>
      ) : (
        <>
          <View
            onLayout={(event) => {
              guideCardYRef.current = event.nativeEvent.layout.y;
            }}
            style={{ gap: 16 }}
          >
            {EVERYDAY_PROFILE_GROUPS.map((group) => (
              <SettingsSection key={group.id} title={group.title}>
                <SettingsGroup>
                  {group.fields.map((field, index) => {
                    const isLast = index === group.fields.length - 1;
                    if (field === 'address') {
                      return (
                        <SettingsNavRow
                          key={field}
                          title={PROFILE_FIELD_LABELS.address}
                          value={
                            profile.displayValueFor('address') || MISSING_VALUE
                          }
                          disabled={!profile.canEditBusiness}
                          onPress={() => openEditor('address')}
                          isLast={isLast}
                          accessibilityHint="עריכת כתובת העסק"
                        />
                      );
                    }
                    return (
                      <ProfileValueRow
                        key={field}
                        field={field}
                        value={profile.displayValueFor(field)}
                        disabled={!profile.canEditBusiness}
                        onPress={() => openEditor(field)}
                        isLast={isLast}
                        targetRef={
                          exactGuideField === field ? guideTargetRef : undefined
                        }
                        onTargetLayout={
                          exactGuideField === field
                            ? (y) => {
                                guideTargetYRef.current = y;
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </SettingsGroup>
              </SettingsSection>
            ))}

            {guidedOnboardingField ? (
              <SettingsSection title="השלמת פרט חסר">
                <SettingsGroup>
                  <ProfileValueRow
                    field={guidedOnboardingField}
                    value={profile.displayValueFor(guidedOnboardingField)}
                    disabled={!profile.canEditBusiness}
                    onPress={() => openEditor(guidedOnboardingField)}
                    isLast={true}
                    targetRef={guideTargetRef}
                    onTargetLayout={(y) => {
                      guideTargetYRef.current = y;
                    }}
                  />
                </SettingsGroup>
              </SettingsSection>
            ) : null}
          </View>

          {!profile.canEditBusiness ? (
            <Text
              style={{
                textAlign: 'right',
                color: SETTINGS_TOKENS.textSecondary,
                fontSize: 12,
              }}
            >
              עריכת נתוני העסק זמינה לבעלים או למנהל בלבד.
            </Text>
          ) : null}
        </>
      )}
    </SettingsPageShell>
  );
}
