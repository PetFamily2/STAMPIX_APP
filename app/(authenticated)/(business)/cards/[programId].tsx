import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import ProgramCustomerCardPreview from '@/components/business/ProgramCustomerCardPreview';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { CARD_THEMES } from '@/constants/cardThemes';
import {
  DEFAULT_STAMP_SHAPE,
  MAX_STAMP_OPTIONS,
  STAMP_SHAPE_OPTIONS,
  type StampShape,
} from '@/constants/stampOptions';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { tw } from '@/lib/rtl';

type ProgramLifecycle = 'draft' | 'active' | 'archived';

type ProgramDetails = {
  loyaltyProgramId: Id<'loyaltyPrograms'>;
  businessId: Id<'businesses'>;
  title: string;
  description: string | null;
  imageUrl: string | null;
  imageStorageId: Id<'_storage'> | null;
  rewardName: string;
  maxStamps: number;
  cardTerms: string | null;
  rewardConditions: string | null;
  stampIcon: string;
  stampShape: string;
  cardThemeId: string;
  lifecycle: ProgramLifecycle;
  status: ProgramLifecycle;
  isRuleLocked: boolean;
  canDelete: boolean;
};

const TEXT = {
  missingData: 'נתוני כרטיסיה חסרים.',
  saveDoneTitle: 'נשמר',
  saveDoneMessage: 'השינויים נשמרו בהצלחה.',
  errorTitle: 'שגיאה',
  saveFailed: 'לא הצלחנו לשמור את הכרטיסיה.',
  publishDoneTitle: 'הכרטיסיה פורסמה',
  publishDoneMessage: 'הכרטיסיה פעילה ללקוחות.',
  archiveDoneTitle: 'הכרטיסיה הועברה לארכיון',
  archiveDoneMessage: 'הכרטיסיה זמינה רק לצבירה ללקוחות קיימים.',
  deleteConfirmTitle: 'מחיקת כרטיסיה',
  deleteConfirmMessage: 'הכרטיסיה תימחק לצמיתות. להמשיך?',
  deleteDoneTitle: 'הכרטיסיה נמחקה',
  deleteDoneMessage: 'הכרטיסיה הוסרה בהצלחה.',
  imagePermissionTitle: 'נדרשת הרשאה',
  imagePermissionMessage: 'צריך הרשאה לגלריה כדי להעלות תמונה.',
  imageUploadFailed: 'העלאת התמונה נכשלה. נסו שוב.',
  uploadImage: 'העלה תמונה',
  uploadingImage: 'מעלה תמונה...',
  sectionTitle: 'שם הכרטיסיה',
  sectionReward: 'הטבה',
  sectionMaxStamps: 'כמות לצבירה',
  sectionMaxStampsHint: 'כמה ביקורים לקבלת פרס?',
  recommended: 'מומלץ',
  sectionCardTerms: 'תנאי הכרטיס',
  sectionRewardTerms: 'תנאי מימוש ההטבה',
  sectionStampShape: 'בחירת צורה לחותמת',
  sectionTheme: 'בחירת רקע',
  iconInput: 'אייקון לחותמת',
  save: 'שמור שינויים',
  publish: 'פרסם כרטיסיה',
  archive: 'העבר לארכיון',
  delete: 'מחק כרטיסיה',
};

function toStampShape(value: string | undefined): StampShape {
  if (
    value === 'circle' ||
    value === 'roundedSquare' ||
    value === 'square' ||
    value === 'hexagon' ||
    value === 'icon'
  ) {
    return value;
  }
  return DEFAULT_STAMP_SHAPE;
}

export default function ProgramDetailsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    programId?: string;
    businessId?: string;
  }>();

  const programId = params.programId as Id<'loyaltyPrograms'> | undefined;
  const businessIdFromParams = params.businessId as
    | Id<'businesses'>
    | undefined;

  const { businesses, activeBusinessId, activeBusiness } = useActiveBusiness();
  const selectedBusinessId = useMemo(() => {
    if (
      businessIdFromParams &&
      businesses.some(
        (business) => business.businessId === businessIdFromParams
      )
    ) {
      return businessIdFromParams;
    }
    return activeBusinessId ?? null;
  }, [activeBusinessId, businessIdFromParams, businesses]);

  const selectedBusiness = useMemo(
    () =>
      businesses.find(
        (business) => business.businessId === selectedBusinessId
      ) ?? (activeBusinessId === selectedBusinessId ? activeBusiness : null),
    [activeBusiness, activeBusinessId, businesses, selectedBusinessId]
  );

  const selectedBusinessCapabilities = selectedBusiness
    ? resolveBusinessCapabilities(
        selectedBusiness.capabilities ?? null,
        selectedBusiness.staffRole
      )
    : null;
  const canManage = selectedBusinessCapabilities?.edit_loyalty_cards === true;

  const details = useQuery(
    api.loyaltyPrograms.getProgramDetailsForManagement,
    selectedBusinessId && programId
      ? { businessId: selectedBusinessId, programId }
      : 'skip'
  ) as ProgramDetails | undefined;

  const updateProgram = useMutation(
    api.loyaltyPrograms.updateProgramForManagement
  );
  const publishProgram = useMutation(api.loyaltyPrograms.publishProgram);
  const archiveProgram = useMutation(api.loyaltyPrograms.archiveProgram);
  const deleteProgram = useMutation(api.loyaltyPrograms.deleteProgram);
  const generateProgramImageUploadUrl = useMutation(
    api.loyaltyPrograms.generateProgramImageUploadUrl
  );

  const [title, setTitle] = useState('');
  const [rewardName, setRewardName] = useState('');
  const [maxStamps, setMaxStamps] = useState('10');
  const [cardTerms, setCardTerms] = useState('');
  const [rewardConditions, setRewardConditions] = useState('');
  const [stampIcon, setStampIcon] = useState('star');
  const [stampShape, setStampShape] = useState<StampShape>(DEFAULT_STAMP_SHAPE);
  const [cardThemeId, setCardThemeId] = useState(CARD_THEMES[0].id);
  const [imageStorageId, setImageStorageId] = useState<Id<'_storage'> | null>(
    null
  );
  const [uploadedImageUri, setUploadedImageUri] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!details) {
      return;
    }
    setTitle(details.title);
    setRewardName(details.rewardName);
    setMaxStamps(String(details.maxStamps));
    setCardTerms(details.cardTerms ?? '');
    setRewardConditions(details.rewardConditions ?? '');
    setStampIcon(details.stampIcon || 'star');
    setStampShape(toStampShape(details.stampShape));
    setCardThemeId(details.cardThemeId);
    setImageStorageId(details.imageStorageId ?? null);
    setUploadedImageUri(null);
  }, [details]);

  if (!programId || !selectedBusinessId) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#E9F0FF]">
        <Text className="text-sm text-[#64748B]">{TEXT.missingData}</Text>
      </SafeAreaView>
    );
  }

  const lifecycle = details?.lifecycle ?? 'draft';
  const isRuleLocked = lifecycle !== 'draft';
  const parsedMaxStamps = Number(maxStamps);
  const canEditGeneralFields = canManage && !isSubmitting && !isUploadingImage;
  const canEditRuleFields =
    canManage && !isSubmitting && !isUploadingImage && !isRuleLocked;
  const canSave =
    canEditGeneralFields &&
    title.trim().length > 0 &&
    rewardName.trim().length > 0 &&
    Number.isFinite(parsedMaxStamps) &&
    parsedMaxStamps > 0 &&
    MAX_STAMP_OPTIONS.includes(
      parsedMaxStamps as (typeof MAX_STAMP_OPTIONS)[number]
    ) &&
    (stampShape !== 'icon' || stampIcon.trim().length > 0);

  const previewImageUrl = uploadedImageUri ?? details?.imageUrl ?? null;

  const handlePickAndUploadImage = async () => {
    if (!canEditGeneralFields || !selectedBusinessId) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(TEXT.imagePermissionTitle, TEXT.imagePermissionMessage);
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

    setIsUploadingImage(true);
    try {
      const { uploadUrl } = await generateProgramImageUploadUrl({
        businessId: selectedBusinessId,
      });
      const fileResponse = await fetch(asset.uri);
      const blob = await fileResponse.blob();
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': asset.mimeType ?? 'image/jpeg',
        },
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

      setImageStorageId(payload.storageId);
      setUploadedImageUri(asset.uri);
    } catch {
      Alert.alert(TEXT.errorTitle, TEXT.imageUploadFailed);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!canSave) {
      return;
    }

    const hasNewUpload = imageStorageId !== (details?.imageStorageId ?? null);
    const nextStorageId = imageStorageId ?? undefined;
    const nextImageUrl =
      hasNewUpload || details?.imageStorageId
        ? undefined
        : (details?.imageUrl ?? undefined);

    setIsSubmitting(true);
    try {
      await updateProgram({
        businessId: selectedBusinessId,
        programId,
        title: title.trim(),
        description: undefined,
        imageUrl: nextImageUrl,
        imageStorageId: nextStorageId,
        rewardName: rewardName.trim(),
        maxStamps: parsedMaxStamps,
        cardTerms: cardTerms.trim() || undefined,
        rewardConditions: rewardConditions.trim() || undefined,
        stampIcon: stampIcon.trim() || 'star',
        stampShape,
        cardThemeId,
      });
      Alert.alert(TEXT.saveDoneTitle, TEXT.saveDoneMessage);
    } catch (error) {
      Alert.alert(
        TEXT.errorTitle,
        error instanceof Error ? error.message : TEXT.saveFailed
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublish = async () => {
    if (!canManage || lifecycle !== 'draft' || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await publishProgram({ businessId: selectedBusinessId, programId });
      Alert.alert(TEXT.publishDoneTitle, TEXT.publishDoneMessage);
    } catch (error) {
      Alert.alert(
        TEXT.errorTitle,
        error instanceof Error ? error.message : TEXT.saveFailed
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!canManage || lifecycle !== 'active' || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await archiveProgram({ businessId: selectedBusinessId, programId });
      Alert.alert(TEXT.archiveDoneTitle, TEXT.archiveDoneMessage);
    } catch (error) {
      Alert.alert(
        TEXT.errorTitle,
        error instanceof Error ? error.message : TEXT.saveFailed
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const runDelete = async () => {
    if (!canManage || !details?.canDelete || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await deleteProgram({ businessId: selectedBusinessId, programId });
      Alert.alert(TEXT.deleteDoneTitle, TEXT.deleteDoneMessage, [
        {
          text: 'אישור',
          onPress: () =>
            router.replace({
              pathname: '/(authenticated)/(business)/cards',
              params: { section: 'loyalty' },
            }),
        },
      ]);
    } catch (error) {
      Alert.alert(
        TEXT.errorTitle,
        error instanceof Error ? error.message : TEXT.saveFailed
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(TEXT.deleteConfirmTitle, TEXT.deleteConfirmMessage, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: () => {
          void runDelete();
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: (insets.bottom || 0) + 28,
        }}
      >
        <View className="bg-[#E9F0FF]">
          <StickyScrollHeader
            topPadding={(insets.top || 0) + 12}
            backgroundColor="#E9F0FF"
          >
            <BusinessScreenHeader
              title="פרטי כרטיסיה"
              titleAccessory={<BackButton onPress={() => router.back()} />}
            />
          </StickyScrollHeader>

          {details === undefined ? (
            <View className="mt-6 items-center justify-center">
              <ActivityIndicator color="#2F6BFF" />
            </View>
          ) : (
            <View className="mt-2 bg-[#E9F0FF] pb-3">
              <ProgramCustomerCardPreview
                businessName={selectedBusiness?.name ?? 'העסק שלך'}
                businessLogoUrl={selectedBusiness?.logoUrl ?? null}
                programImageUrl={previewImageUrl}
                title={title || details.title}
                rewardName={rewardName || details.rewardName}
                maxStamps={parsedMaxStamps || details.maxStamps}
                previewCurrentStamps={Math.min(
                  3,
                  Math.max(1, parsedMaxStamps || details.maxStamps)
                )}
                cardThemeId={cardThemeId}
                stampShape={stampShape}
                stampIcon={stampIcon || details.stampIcon}
                status={lifecycle === 'archived' ? 'archived' : 'default'}
                variant="hero"
              />
            </View>
          )}
        </View>

        {details !== undefined ? (
          <View className="mt-2 gap-3">
            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-4">
              <View className="gap-2">
                <Text
                  className={`text-xs font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  1. {TEXT.sectionTitle}
                </Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  editable={canEditGeneralFields}
                  placeholder="שם הכרטיסיה"
                  placeholderTextColor="#94A3B8"
                  className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                />
              </View>

              <View className="gap-2">
                <Text
                  className={`text-xs font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  2. {TEXT.sectionReward}
                </Text>
                <TextInput
                  value={rewardName}
                  onChangeText={setRewardName}
                  editable={canEditRuleFields}
                  placeholder="שם ההטבה"
                  placeholderTextColor="#94A3B8"
                  className={`rounded-2xl border px-4 py-3 text-right text-sm font-semibold ${
                    canEditRuleFields
                      ? 'border-[#E3E9FF] bg-[#F8FAFF] text-[#0F172A]'
                      : 'border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]'
                  }`}
                />
              </View>

              <View className="gap-2">
                <Text
                  className={`text-xs font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  3. {TEXT.sectionMaxStamps}
                </Text>
                <Text className={`text-xs text-[#94A3B8] ${tw.textStart}`}>
                  {TEXT.sectionMaxStampsHint}
                </Text>
                <View className={`${tw.flexRow} flex-wrap gap-2`}>
                  {MAX_STAMP_OPTIONS.map((option) => {
                    const selected = parsedMaxStamps === option;
                    return (
                      <TouchableOpacity
                        key={String(option)}
                        disabled={!canEditRuleFields}
                        onPress={() => setMaxStamps(String(option))}
                        className={`rounded-full border px-3 py-2 ${
                          selected
                            ? 'border-[#2F6BFF] bg-[#EAF1FF]'
                            : 'border-[#DCE6F7] bg-[#F8FAFF]'
                        }`}
                      >
                        <Text className="text-xs font-bold text-[#1A2B4A]">
                          {option}
                          {option === 10 ? ` (${TEXT.recommended})` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View className="gap-2">
                <Text
                  className={`text-xs font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  4. תמונה
                </Text>
                <TouchableOpacity
                  disabled={!canEditGeneralFields || isUploadingImage}
                  onPress={() => {
                    void handlePickAndUploadImage();
                  }}
                  className={`rounded-2xl border px-4 py-3 ${
                    canEditGeneralFields
                      ? 'border-[#DCE6F7] bg-[#F8FAFF]'
                      : 'border-[#E2E8F0] bg-[#F1F5F9]'
                  }`}
                >
                  {isUploadingImage ? (
                    <ActivityIndicator color="#2F6BFF" />
                  ) : (
                    <Text
                      className={`text-sm font-semibold text-[#1A2B4A] ${tw.textStart}`}
                    >
                      {previewImageUrl ? 'החלף תמונה' : TEXT.uploadImage}
                    </Text>
                  )}
                </TouchableOpacity>
                {isUploadingImage ? (
                  <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                    {TEXT.uploadingImage}
                  </Text>
                ) : null}
              </View>

              <View className="gap-2">
                <Text
                  className={`text-xs font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  5. {TEXT.sectionCardTerms}
                </Text>
                <TextInput
                  value={cardTerms}
                  onChangeText={setCardTerms}
                  editable={canEditRuleFields}
                  placeholder="תנאי הכרטיס"
                  placeholderTextColor="#94A3B8"
                  multiline={true}
                  textAlignVertical="top"
                  className={`min-h-[88px] rounded-2xl border px-4 py-3 text-right text-sm font-semibold ${
                    canEditRuleFields
                      ? 'border-[#E3E9FF] bg-[#F8FAFF] text-[#0F172A]'
                      : 'border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]'
                  }`}
                />
              </View>

              <View className="gap-2">
                <Text
                  className={`text-xs font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  6. {TEXT.sectionRewardTerms}
                </Text>
                <TextInput
                  value={rewardConditions}
                  onChangeText={setRewardConditions}
                  editable={canEditRuleFields}
                  placeholder="תנאי מימוש ההטבה"
                  placeholderTextColor="#94A3B8"
                  multiline={true}
                  textAlignVertical="top"
                  className={`min-h-[88px] rounded-2xl border px-4 py-3 text-right text-sm font-semibold ${
                    canEditRuleFields
                      ? 'border-[#E3E9FF] bg-[#F8FAFF] text-[#0F172A]'
                      : 'border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]'
                  }`}
                />
              </View>

              <View className="gap-2">
                <Text
                  className={`text-xs font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  7. {TEXT.sectionStampShape}
                </Text>
                <View className={`${tw.flexRow} flex-wrap gap-2`}>
                  {STAMP_SHAPE_OPTIONS.map((option) => {
                    const selected = stampShape === option.id;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        disabled={!canEditGeneralFields}
                        onPress={() => setStampShape(option.id)}
                        className={`rounded-xl border px-3 py-2 ${
                          selected
                            ? 'border-[#2F6BFF] bg-[#EAF1FF]'
                            : 'border-[#DCE6F7] bg-[#F8FAFF]'
                        }`}
                      >
                        <Text className="text-xs font-bold text-[#1A2B4A]">
                          {option.label}
                        </Text>
                        <Text className="text-[10px] text-[#64748B]">
                          {option.description}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {stampShape === 'icon' ? (
                  <TextInput
                    value={stampIcon}
                    onChangeText={setStampIcon}
                    editable={canEditGeneralFields}
                    placeholder={TEXT.iconInput}
                    placeholderTextColor="#94A3B8"
                    className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                  />
                ) : null}
              </View>

              <View className="gap-2">
                <Text
                  className={`text-xs font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  8. {TEXT.sectionTheme}
                </Text>
                <View className={`${tw.flexRow} flex-wrap gap-2`}>
                  {CARD_THEMES.map((theme) => {
                    const selected = cardThemeId === theme.id;
                    return (
                      <TouchableOpacity
                        key={theme.id}
                        disabled={!canEditGeneralFields}
                        onPress={() => setCardThemeId(theme.id)}
                        className={`rounded-xl border px-3 py-2 ${
                          selected
                            ? 'border-[#2F6BFF] bg-[#EAF1FF]'
                            : 'border-[#DCE6F7] bg-[#F8FAFF]'
                        }`}
                      >
                        <Text className="text-xs font-bold text-[#1A2B4A]">
                          {theme.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            <View className="gap-3">
              <TouchableOpacity
                disabled={!canSave}
                onPress={() => {
                  void handleSave();
                }}
                className={`rounded-2xl px-4 py-3 ${
                  canSave ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
                }`}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-center text-sm font-bold text-white">
                    {TEXT.save}
                  </Text>
                )}
              </TouchableOpacity>

              {lifecycle === 'draft' ? (
                <TouchableOpacity
                  disabled={!canManage || isSubmitting}
                  onPress={() => {
                    void handlePublish();
                  }}
                  className={`rounded-2xl px-4 py-3 ${
                    canManage && !isSubmitting ? 'bg-[#16A34A]' : 'bg-[#CBD5E1]'
                  }`}
                >
                  <Text className="text-center text-sm font-bold text-white">
                    {TEXT.publish}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {lifecycle === 'active' ? (
                <TouchableOpacity
                  disabled={!canManage || isSubmitting}
                  onPress={() => {
                    void handleArchive();
                  }}
                  className={`rounded-2xl px-4 py-3 ${
                    canManage && !isSubmitting ? 'bg-[#F59E0B]' : 'bg-[#CBD5E1]'
                  }`}
                >
                  <Text className="text-center text-sm font-bold text-white">
                    {TEXT.archive}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {details.canDelete ? (
                <TouchableOpacity
                  disabled={!canManage || isSubmitting}
                  onPress={handleDelete}
                  className={`rounded-2xl px-4 py-3 ${
                    canManage && !isSubmitting ? 'bg-[#DC2626]' : 'bg-[#CBD5E1]'
                  }`}
                >
                  <Text className="text-center text-sm font-bold text-white">
                    {TEXT.delete}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
