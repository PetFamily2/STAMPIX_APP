import { type Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BusinessSettingsSubpageHeader,
  ProfileFieldForm,
  SettingsPageShell,
  SettingsPrimaryButton,
  SETTINGS_TOKENS,
  validateProfileFields,
} from '@/components/business-settings';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useBusinessSettingsProfile } from '@/hooks/useBusinessSettingsProfile';
import {
  buildCompletionSteps,
  formatCompletionProgressLabel,
} from '@/lib/businessSettings/completion';
import type { ProfileCompletionField } from '@/lib/businessSettings/profileFields';
import { BUSINESS_ROUTES } from '@/lib/navigation/businessRoutes';
import { safeBack } from '@/lib/navigation';

export default function BusinessSettingsProfileCompleteScreen() {
  const router = useRouter();
  const profile = useBusinessSettingsProfile();
  const { activeBusinessId } = useActiveBusiness();
  const initialMissingRef = useRef<ProfileCompletionField[] | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState(profile.snapshot);
  const [fieldError, setFieldError] = useState<string | null>(null);

  if (
    initialMissingRef.current === null &&
    profile.businessSettings !== undefined
  ) {
    initialMissingRef.current = profile.missingFields;
  }

  const steps = useMemo(
    () => buildCompletionSteps(initialMissingRef.current ?? profile.missingFields),
    [profile.missingFields]
  );
  const currentStep = steps[Math.min(stepIndex, Math.max(steps.length - 1, 0))];

  useEffect(() => {
    setDraft(profile.snapshot);
  }, [profile.snapshot]);

  useEffect(() => {
    if (!currentStep?.fields.includes('address')) {
      return;
    }
    if (profile.missingFields.includes('address')) {
      return;
    }
    if (stepIndex + 1 >= steps.length) {
      safeBack(BUSINESS_ROUTES.settings);
      return;
    }
    setStepIndex((current) => current + 1);
  }, [currentStep, profile.missingFields, stepIndex, steps.length]);

  const goBack = () => {
    if (stepIndex > 0) {
      setStepIndex((current) => current - 1);
      setFieldError(null);
      return;
    }
    safeBack(BUSINESS_ROUTES.settings);
  };

  const saveCurrentStep = async () => {
    if (!currentStep) {
      return;
    }
    if (currentStep.fields.includes('address')) {
      router.push(BUSINESS_ROUTES.address as Href);
      return;
    }

    const message = validateProfileFields(currentStep.fields, draft);
    if (message) {
      setFieldError(message);
      return;
    }

    const profileFields = currentStep.fields.filter(
      (
        field
      ): field is
        | 'name'
        | 'shortDescription'
        | 'businessPhone'
        | 'serviceTypes'
        | 'serviceTags' =>
        field === 'name' ||
        field === 'shortDescription' ||
        field === 'businessPhone' ||
        field === 'serviceTypes' ||
        field === 'serviceTags'
    );
    const onboardingFields = currentStep.fields.filter(
      (field) =>
        field !== 'name' &&
        field !== 'shortDescription' &&
        field !== 'businessPhone' &&
        field !== 'serviceTypes' &&
        field !== 'serviceTags' &&
        field !== 'address'
    );

    if (profileFields.length > 0) {
      const result = await profile.saveProfileFields({
        name: draft.name,
        shortDescription: draft.shortDescription,
        businessPhone: draft.businessPhone,
        serviceTypes: draft.serviceTypes,
        serviceTags: draft.serviceTags,
      });
      if (result.conflict) {
        Alert.alert(
          'הנתונים עודכנו',
          'נמצאה גרסה חדשה של פרטי העסק. נטען את הנתונים העדכניים.',
          [
            {
              text: 'אישור',
              onPress: () => profile.applyBusinessSettingsSnapshot(),
            },
          ]
        );
        return;
      }
      if (!result.ok) {
        setFieldError(result.message ?? 'שמירת הנתון נכשלה.');
        return;
      }
    }

    if (onboardingFields.length > 0) {
      const payload: Parameters<typeof profile.saveOnboardingFields>[0] = {};
      if (onboardingFields.includes('discoverySource') && draft.discoverySource) {
        payload.discoverySource = draft.discoverySource;
      }
      if (onboardingFields.includes('reason') && draft.reason) {
        payload.reason = draft.reason;
      }
      if (onboardingFields.includes('usageAreas')) {
        payload.usageAreas = draft.usageAreas;
      }
      if (onboardingFields.includes('ownerAgeRange') && draft.ownerAgeRange) {
        payload.ownerAgeRange = draft.ownerAgeRange;
      }
      if (
        onboardingFields.includes('businessExample') &&
        draft.businessExample
      ) {
        payload.businessExample = draft.businessExample;
      }
      if (
        onboardingFields.includes('birthdayCampaignRelevant') &&
        draft.birthdayCampaignRelevant !== null
      ) {
        payload.birthdayCampaignRelevant = draft.birthdayCampaignRelevant;
      }
      if (
        onboardingFields.includes('joinAnniversaryCampaignRelevant') &&
        draft.joinAnniversaryCampaignRelevant !== null
      ) {
        payload.joinAnniversaryCampaignRelevant =
          draft.joinAnniversaryCampaignRelevant;
      }
      if (
        onboardingFields.includes('weakTimePromosRelevant') &&
        draft.weakTimePromosRelevant !== null
      ) {
        payload.weakTimePromosRelevant = draft.weakTimePromosRelevant;
      }

      const result = await profile.saveOnboardingFields(payload);
      if (!result.ok) {
        setFieldError(result.message ?? 'שמירת הנתון נכשלה.');
        return;
      }
    }

    setFieldError(null);
    if (stepIndex + 1 >= steps.length) {
      safeBack(BUSINESS_ROUTES.settings);
      return;
    }
    setStepIndex((current) => current + 1);
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
        <Text style={{ width: '100%', textAlign: 'right', color: SETTINGS_TOKENS.textSecondary }}>
          לא נמצא עסק פעיל.
        </Text>
      </SafeAreaView>
    );
  }

  if (profile.businessSettings === undefined) {
    return (
      <SettingsPageShell
        header={
          <BusinessSettingsSubpageHeader
            title="השלמת פרטי העסק"
            fallbackHref={BUSINESS_ROUTES.settings}
            onBackPress={goBack}
          />
        }
      >
        <View style={{ alignItems: 'center', paddingVertical: 28 }}>
          <ActivityIndicator color={SETTINGS_TOKENS.accent} />
        </View>
      </SettingsPageShell>
    );
  }

  if (!currentStep || !profile.canEditBusiness) {
    return (
      <SettingsPageShell
        header={
          <BusinessSettingsSubpageHeader
            title="השלמת פרטי העסק"
            fallbackHref={BUSINESS_ROUTES.settings}
          />
        }
      >
        <Text
          style={{
            textAlign: 'right',
            color: SETTINGS_TOKENS.textSecondary,
          }}
        >
          {profile.canEditBusiness
            ? 'כל הפרטים כבר מלאים.'
            : 'השלמת נתונים זמינה לבעלים או למנהל בלבד.'}
        </Text>
      </SettingsPageShell>
    );
  }

  const isAddressStep = currentStep.fields.includes('address');

  return (
    <SettingsPageShell
      keyboardAware={!isAddressStep}
      header={
        <BusinessSettingsSubpageHeader
          title="השלמת פרטי העסק"
          subtitle={`${formatCompletionProgressLabel(currentStep)} · ${currentStep.title}`}
          fallbackHref={BUSINESS_ROUTES.settings}
          onBackPress={goBack}
        />
      }
      footer={
        <SettingsPrimaryButton
          label={
            isAddressStep
              ? 'המשך לכתובת'
              : stepIndex + 1 >= steps.length
                ? 'שמירה וסיום'
                : 'שמירה והמשך'
          }
          loading={profile.isSaving}
          disabled={profile.isSaving}
          onPress={() => {
            void saveCurrentStep();
          }}
        />
      }
    >
      {isAddressStep ? (
        <Text
          style={{
            fontSize: 15,
            lineHeight: 22,
            color: SETTINGS_TOKENS.textSecondary,
            textAlign: 'right',
            writingDirection: 'rtl',
          }}
        >
          נותר להזין את כתובת העסק. לאחר השמירה תחזרו להשלמת הפרטים.
        </Text>
      ) : (
        <ProfileFieldForm
          fields={currentStep.fields}
          values={draft}
          onChange={setDraft}
          error={fieldError}
        />
      )}
    </SettingsPageShell>
  );
}
