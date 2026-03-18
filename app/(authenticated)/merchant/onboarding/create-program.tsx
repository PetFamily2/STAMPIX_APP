import { useMutation } from 'convex/react';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { CARD_THEMES } from '@/constants/cardThemes';
import {
  MAX_STAMP_OPTIONS,
  STAMP_SHAPE_OPTIONS,
} from '@/constants/stampOptions';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { trackActivationEvent } from '@/lib/analytics/activation';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { safeDismissTo, safePush } from '@/lib/navigation';
import {
  BUSINESS_ONBOARDING_PROGRESS,
  BUSINESS_ONBOARDING_ROUTES,
  BUSINESS_ONBOARDING_TOTAL_STEPS,
} from '@/lib/onboarding/businessOnboardingFlow';

const TEXT = {
  title: 'יוצרים כרטיסיה',
  subtitle: 'שלב קצר ומדויק לפני תצוגה מקדימה',
  continue: 'שמירה והמשך',
  submitting: 'שומרים כרטיסיה',
  missingBusiness: 'נדרש עסק פעיל קודם',
  errorFallback: 'שגיאה ביצירת הכרטיסיה',
  imagePermissionTitle: 'נדרשת הרשאה',
  imagePermissionMessage: 'צריך הרשאה לגלריה כדי להעלות תמונה.',
  imageUploadFailed: 'העלאת התמונה נכשלה. נסו שוב.',
  uploadImage: 'העלה תמונה',
  uploadingImage: 'מעלה תמונה...',
  recommended: 'מומלץ',
};

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export default function CreateProgramScreen() {
  const { businessId, programDraft, setProgramDraft, setProgramId } =
    useOnboarding();
  const { user } = useUser();

  const createProgram = useMutation(api.loyaltyPrograms.createLoyaltyProgram);
  const generateProgramImageUploadUrl = useMutation(
    api.loyaltyPrograms.generateProgramImageUploadUrl
  );

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  useEffect(() => {
    if (!businessId) {
      safePush(BUSINESS_ONBOARDING_ROUTES.createBusiness);
    }
  }, [businessId]);

  const maxStampsNumber = useMemo(
    () => Number(programDraft.maxStamps),
    [programDraft.maxStamps]
  );

  const canSubmit =
    Boolean(programDraft.title.trim()) &&
    Boolean(programDraft.rewardName.trim()) &&
    MAX_STAMP_OPTIONS.includes(
      maxStampsNumber as (typeof MAX_STAMP_OPTIONS)[number]
    ) &&
    (programDraft.stampShape !== 'icon' ||
      Boolean(programDraft.stampIcon.trim())) &&
    !isSubmitting &&
    !isUploadingImage;

  const handlePickAndUploadImage = async () => {
    if (!businessId || isUploadingImage || isSubmitting) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(TEXT.imagePermissionMessage);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    if (!asset.uri) {
      return;
    }

    setError(null);
    setIsUploadingImage(true);
    try {
      const { uploadUrl } = await generateProgramImageUploadUrl({ businessId });
      const fileResponse = await fetch(asset.uri);
      const blob = await fileResponse.blob();

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': asset.mimeType ?? 'image/jpeg' },
        body: blob,
      });
      if (!uploadResponse.ok) {
        throw new Error('UPLOAD_FAILED');
      }
      const payload = (await uploadResponse.json()) as {
        storageId?: Id<'_storage'>;
      };
      if (!payload.storageId) {
        throw new Error('UPLOAD_FAILED');
      }

      setProgramDraft((prev) => ({
        ...prev,
        imageStorageId: payload.storageId ?? null,
        imagePreviewUri: asset.uri,
      }));
    } catch {
      setError(TEXT.imageUploadFailed);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSubmit = async () => {
    if (!businessId) {
      setError(TEXT.missingBusiness);
      return;
    }
    if (!canSubmit) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const { loyaltyProgramId } = await createProgram({
        businessId,
        title: programDraft.title.trim(),
        rewardName: programDraft.rewardName.trim(),
        maxStamps: maxStampsNumber,
        cardTerms: programDraft.cardTerms.trim() || undefined,
        rewardConditions: programDraft.rewardConditions.trim() || undefined,
        imageStorageId: programDraft.imageStorageId ?? undefined,
        stampIcon: programDraft.stampIcon.trim() || 'star',
        stampShape: programDraft.stampShape,
        cardThemeId: programDraft.cardThemeId,
      });

      setProgramId(loyaltyProgramId);
      void trackActivationEvent(ANALYTICS_EVENTS.loyaltyCardCreated, {
        role: 'business',
        userId: user?._id,
      });

      safePush(BUSINESS_ONBOARDING_ROUTES.previewCard);
    } catch (submitError: unknown) {
      setError(toErrorMessage(submitError, TEXT.errorFallback));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() => safeDismissTo(BUSINESS_ONBOARDING_ROUTES.plan)}
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.createProgram}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
          <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
        </View>

        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={styles.formContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.field}>
            <Text style={styles.label}>1. שם הכרטיסיה</Text>
            <TextInput
              value={programDraft.title}
              onChangeText={(text) =>
                setProgramDraft((prev) => ({ ...prev, title: text }))
              }
              placeholder="שם הכרטיסיה"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              accessibilityLabel="שם הכרטיסיה"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>2. הטבה</Text>
            <TextInput
              value={programDraft.rewardName}
              onChangeText={(text) =>
                setProgramDraft((prev) => ({ ...prev, rewardName: text }))
              }
              placeholder="מה הלקוח מקבל"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              accessibilityLabel="הטבה"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>3. כמות לצבירה</Text>
            <Text style={styles.helper}>כמה ביקורים לקבלת פרס?</Text>
            <View style={styles.optionsWrap}>
              {MAX_STAMP_OPTIONS.map((option) => {
                const selected = Number(programDraft.maxStamps) === option;
                return (
                  <TouchableOpacity
                    key={String(option)}
                    onPress={() =>
                      setProgramDraft((prev) => ({
                        ...prev,
                        maxStamps: String(option),
                      }))
                    }
                    style={[
                      styles.optionChip,
                      selected ? styles.optionChipOn : null,
                    ]}
                  >
                    <Text style={styles.optionChipText}>
                      {option}
                      {option === 10 ? ` (${TEXT.recommended})` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>4. תמונה</Text>
            <TouchableOpacity
              onPress={() => {
                void handlePickAndUploadImage();
              }}
              disabled={isUploadingImage || isSubmitting}
              style={styles.inputButton}
            >
              {isUploadingImage ? (
                <ActivityIndicator color="#2563EB" />
              ) : (
                <Text style={styles.inputButtonText}>
                  {programDraft.imagePreviewUri
                    ? 'החלף תמונה'
                    : TEXT.uploadImage}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>5. תנאי הכרטיס</Text>
            <TextInput
              value={programDraft.cardTerms}
              onChangeText={(text) =>
                setProgramDraft((prev) => ({ ...prev, cardTerms: text }))
              }
              placeholder="תנאי הכרטיס"
              placeholderTextColor="#9CA3AF"
              style={[styles.input, styles.multilineInput]}
              multiline={true}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>6. תנאי מימוש ההטבה</Text>
            <TextInput
              value={programDraft.rewardConditions}
              onChangeText={(text) =>
                setProgramDraft((prev) => ({ ...prev, rewardConditions: text }))
              }
              placeholder="תנאי מימוש"
              placeholderTextColor="#9CA3AF"
              style={[styles.input, styles.multilineInput]}
              multiline={true}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>7. בחירת צורה לחותמת</Text>
            <View style={styles.optionsWrap}>
              {STAMP_SHAPE_OPTIONS.map((option) => {
                const selected = programDraft.stampShape === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    onPress={() =>
                      setProgramDraft((prev) => ({
                        ...prev,
                        stampShape: option.id,
                      }))
                    }
                    style={[
                      styles.optionChip,
                      selected ? styles.optionChipOn : null,
                    ]}
                  >
                    <Text style={styles.optionChipText}>{option.label}</Text>
                    <Text style={styles.optionChipSub}>
                      {option.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {programDraft.stampShape === 'icon' ? (
              <TextInput
                value={programDraft.stampIcon}
                onChangeText={(text) =>
                  setProgramDraft((prev) => ({ ...prev, stampIcon: text }))
                }
                placeholder="אייקון לחותמת"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
              />
            ) : null}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>8. בחירת רקע</Text>
            <View style={styles.optionsWrap}>
              {CARD_THEMES.map((theme) => {
                const selected = programDraft.cardThemeId === theme.id;
                return (
                  <TouchableOpacity
                    key={theme.id}
                    onPress={() =>
                      setProgramDraft((prev) => ({
                        ...prev,
                        cardThemeId: theme.id,
                      }))
                    }
                    style={[
                      styles.optionChip,
                      selected ? styles.optionChipOn : null,
                    ]}
                  >
                    <Text style={styles.optionChipText}>{theme.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </ScrollView>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {isSubmitting ? (
          <View style={styles.submittingRow}>
            <ActivityIndicator color="#2563EB" />
            <Text style={styles.submittingText}>{TEXT.submitting}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <ContinueButton
            onPress={() => {
              void handleSubmit();
            }}
            disabled={!canSubmit}
            label={TEXT.continue}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBFAF7',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContainer: {
    marginTop: 18,
    alignItems: 'flex-end',
    gap: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'right',
  },
  formScroll: {
    marginTop: 16,
    flex: 1,
  },
  formContent: {
    gap: 12,
    paddingBottom: 16,
  },
  field: {
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  helper: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0F172A',
    textAlign: 'right',
    writingDirection: 'rtl',
    fontWeight: '600',
  },
  multilineInput: {
    minHeight: 78,
  },
  inputButton: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  inputButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E3A8A',
    textAlign: 'right',
  },
  optionsWrap: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    borderWidth: 1,
    borderColor: '#D6E2F8',
    borderRadius: 999,
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 11,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  optionChipOn: {
    borderColor: '#2563EB',
    backgroundColor: '#EAF1FF',
  },
  optionChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A2B4A',
  },
  optionChipSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
    textAlign: 'right',
  },
  submittingRow: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  submittingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
    textAlign: 'right',
  },
  footer: {
    marginTop: 8,
  },
});
