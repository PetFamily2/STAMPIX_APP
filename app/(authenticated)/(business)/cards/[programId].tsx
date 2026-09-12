import { useMutation, useQuery } from 'convex/react';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import LoyaltyCard from '@/components/loyalty/LoyaltyCard';
import { LoyaltyThemePalette } from '@/components/loyalty/LoyaltyThemePalette';
import { StampIconPicker } from '@/components/loyalty/StampIconPicker';
import { StampShapePicker } from '@/components/loyalty/StampShapePicker';
import { useGuidedTargetRef } from '@/components/guidance/GuidedActionAnchor';
import { GuidedActionScreenOverlay } from '@/components/guidance/GuidedActionOverlay';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import {
  DEFAULT_CARD_THEME_ID,
  resolveCanonicalCardThemeId,
} from '@/constants/cardThemes';
import { DEFAULT_STAMP_ICON_ID } from '@/constants/stampIcons';
import {
  DEFAULT_STAMP_SHAPE,
  MAX_STAMP_OPTIONS,
  type StampShape,
} from '@/constants/stampOptions';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { getEditConflictError } from '@/lib/errors/editConflicts';
import { DEFAULT_LOYALTY_CARD_TERMS } from '@/lib/loyalty/cardTerms';
import {
  isLoyaltyThemeConflict,
  LOYALTY_THEME_CONFLICT_COPY,
  loyaltyWriteErrorToHebrewMessage,
} from '@/lib/loyalty/programErrors';
import { safeBack } from '@/lib/navigation';
import { rtlBaseView, tw } from '@/lib/rtl';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

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
  updatedAt: number;
};

const TEXT = {
  archiveConfirmTitle: 'להעביר את הכרטיסיה לארכיון?',
  archiveConfirmMessage:
    'הכרטיסייה תועבר לארכיון. לקוחות לא יוכלו עוד לצבור חותמות או לממש הטבות דרכה. אפשר להפעיל אותה מחדש מאוחר יותר אם יש מקום במסלול והצבע פנוי.',
  unavailableTitle: 'הכרטיסיה אינה זמינה',
  unavailableMessage:
    'ייתכן שהכרטיסיה נמחקה, הושבתה או שאינה שייכת לעסק הפעיל.',
  backToPrograms: 'חזרה לכרטיסיות',
  missingData: 'נתוני כרטיסיה חסרים.',
  saveDoneTitle: 'נשמר',
  saveDoneMessage: 'השינויים נשמרו בהצלחה.',
  errorTitle: 'שגיאה',
  saveFailed: 'לא הצלחנו לשמור את הכרטיסיה.',
  publishDoneTitle: 'הכרטיסיה פורסמה',
  publishDoneMessage: 'הכרטיסיה פעילה ללקוחות.',
  archiveDoneTitle: 'הכרטיסיה הועברה לארכיון',
  archiveDoneMessage: 'הכרטיסיה אינה זמינה עוד לצבירה או למימוש.',
  deleteConfirmTitle: 'מחיקת כרטיסיה',
  deleteConfirmMessage: 'הכרטיסיה תימחק לצמיתות. להמשיך?',
  deleteDoneTitle: 'הכרטיסיה נמחקה',
  deleteDoneMessage: 'הכרטיסיה הוסרה בהצלחה.',
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
  reactivate: 'הפעל מחדש',
  reactivateConfirmTitle: 'להפעיל מחדש את הכרטיסייה?',
  reactivateConfirmMessage:
    'הכרטיסייה תחזור לפעילות עם אותם נתונים ואותו צבע. ההפעלה תתבצע רק אם יש מקום במסלול והצבע עדיין פנוי.',
  reactivateDoneTitle: 'הכרטיסייה פעילה מחדש',
  reactivateDoneMessage: 'הכרטיסייה חזרה לפעילות עם אותם נתונים.',
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
  const guideTargetRef = useGuidedTargetRef();
  const guideScrollRef = useRef<ScrollView | null>(null);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
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
  ) as ProgramDetails | null | undefined;
  const themeReservations = (useQuery(
    api.loyaltyPrograms.listThemeReservationsByBusiness,
    selectedBusinessId ? { businessId: selectedBusinessId } : 'skip'
  ) ?? []) as Array<{
    programId: Id<'loyaltyPrograms'>;
    themeId: string;
  }>;

  const updateProgram = useMutation(
    api.loyaltyPrograms.updateProgramForManagement
  );
  const publishProgram = useMutation(api.loyaltyPrograms.publishProgram);
  const archiveProgram = useMutation(api.loyaltyPrograms.archiveProgram);
  const unarchiveProgram = useMutation(api.loyaltyPrograms.unarchiveProgram);
  const deleteProgram = useMutation(api.loyaltyPrograms.deleteProgram);
  const generateProgramImageUploadUrl = useMutation(
    api.loyaltyPrograms.generateProgramImageUploadUrl
  );

  const [title, setTitle] = useState('');
  const [rewardName, setRewardName] = useState('');
  const [maxStamps, setMaxStamps] = useState('10');
  const [cardTerms, setCardTerms] = useState('');
  const [rewardConditions, setRewardConditions] = useState('');
  const [stampIcon, setStampIcon] = useState(DEFAULT_STAMP_ICON_ID);
  const [stampShape, setStampShape] = useState<StampShape>(DEFAULT_STAMP_SHAPE);
  const [cardThemeId, setCardThemeId] = useState(DEFAULT_CARD_THEME_ID);
  const [imageStorageId, setImageStorageId] = useState<Id<'_storage'> | null>(
    null
  );
  const [uploadedImageUri, setUploadedImageUri] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<number | null>(null);
  const [conflictLocked, setConflictLocked] = useState(false);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const formSignature = JSON.stringify({
    title: title.trim(),
    rewardName: rewardName.trim(),
    maxStamps,
    cardTerms: cardTerms.trim(),
    rewardConditions: rewardConditions.trim(),
    stampIcon,
    stampShape,
    cardThemeId,
    imageStorageId: imageStorageId ? String(imageStorageId) : null,
  });
  const isDirty = savedSignature !== null && formSignature !== savedSignature;
  const usedThemeIds = themeReservations
    .filter((reservation) => String(reservation.programId) !== String(programId))
    .map((reservation) => reservation.themeId);

  usePreventRemove(isDirty && !isSubmitting, ({ data }) => {
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
  });

  const applyProgramSnapshot = (snapshot: ProgramDetails | undefined) => {
    if (!snapshot) {
      return;
    }
    setTitle(snapshot.title);
    setRewardName(snapshot.rewardName);
    setMaxStamps(String(snapshot.maxStamps));
    setCardTerms(snapshot.cardTerms ?? '');
    setRewardConditions(snapshot.rewardConditions ?? '');
    setStampIcon(snapshot.stampIcon || DEFAULT_STAMP_ICON_ID);
    setStampShape(toStampShape(snapshot.stampShape));
    setCardThemeId(resolveCanonicalCardThemeId(snapshot.cardThemeId));
    setImageStorageId(snapshot.imageStorageId ?? null);
    setUploadedImageUri(null);
    setBaseUpdatedAt(snapshot.updatedAt);
    setConflictLocked(false);
    setSavedSignature(
      JSON.stringify({
        title: snapshot.title.trim(),
        rewardName: snapshot.rewardName.trim(),
        maxStamps: String(snapshot.maxStamps),
        cardTerms: (snapshot.cardTerms ?? '').trim(),
        rewardConditions: (snapshot.rewardConditions ?? '').trim(),
        stampIcon: snapshot.stampIcon || DEFAULT_STAMP_ICON_ID,
        stampShape: toStampShape(snapshot.stampShape),
        cardThemeId: resolveCanonicalCardThemeId(snapshot.cardThemeId),
        imageStorageId: snapshot.imageStorageId
          ? String(snapshot.imageStorageId)
          : null,
      })
    );
  };

  useEffect(() => {
    const screenKey = `${selectedBusinessId ?? 'none'}:${programId ?? 'none'}`;
    setBaseUpdatedAt(null);
    setConflictLocked(false);
    setSavedSignature(null);
    if (screenKey === 'none:none') {
      setUploadedImageUri(null);
    }
  }, [programId, selectedBusinessId]);

  useEffect(() => {
    if (!details || baseUpdatedAt !== null) {
      return;
    }
    setTitle(details.title);
    setRewardName(details.rewardName);
    setMaxStamps(String(details.maxStamps));
    setCardTerms(details.cardTerms ?? '');
    setRewardConditions(details.rewardConditions ?? '');
    setStampIcon(details.stampIcon || DEFAULT_STAMP_ICON_ID);
    setStampShape(toStampShape(details.stampShape));
    setCardThemeId(resolveCanonicalCardThemeId(details.cardThemeId));
    setImageStorageId(details.imageStorageId ?? null);
    setUploadedImageUri(null);
    setBaseUpdatedAt(details.updatedAt);
    setConflictLocked(false);
    setSavedSignature(
      JSON.stringify({
        title: details.title.trim(),
        rewardName: details.rewardName.trim(),
        maxStamps: String(details.maxStamps),
        cardTerms: (details.cardTerms ?? '').trim(),
        rewardConditions: (details.rewardConditions ?? '').trim(),
        stampIcon: details.stampIcon || DEFAULT_STAMP_ICON_ID,
        stampShape: toStampShape(details.stampShape),
        cardThemeId: resolveCanonicalCardThemeId(details.cardThemeId),
        imageStorageId: details.imageStorageId
          ? String(details.imageStorageId)
          : null,
      })
    );
  }, [baseUpdatedAt, details]);

  if (!programId || !selectedBusinessId) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#E9F0FF]">
        <Text className="w-full px-6 text-right text-sm text-[#64748B]">
          {TEXT.missingData}
        </Text>
      </SafeAreaView>
    );
  }

  if (details === null) {
    return (
      <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-full gap-3" style={{ maxWidth: 576 }}>
            <Text className="w-full text-right text-xl font-black text-[#1A2B4A]">
              {TEXT.unavailableTitle}
            </Text>
            <Text className="w-full text-right text-sm font-semibold leading-6 text-[#64748B]">
              {TEXT.unavailableMessage}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() =>
                safeBack('/(authenticated)/(business)/programs')
              }
              className="mt-2 w-full rounded-2xl bg-[#2F6BFF] px-4 py-3"
            >
              <Text className="text-center text-sm font-bold text-white">
                {TEXT.backToPrograms}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const lifecycle = details?.lifecycle ?? 'draft';
  const isArchived = lifecycle === 'archived';
  const isRuleLocked = lifecycle !== 'draft';
  const parsedMaxStamps = Number(maxStamps);
  const canEditGeneralFields =
    canManage && !isSubmitting && !isUploadingImage && !isArchived;
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
    (stampShape !== 'icon' || stampIcon.trim().length > 0) &&
    !conflictLocked &&
    isDirty;

  const previewImageUrl = uploadedImageUri ?? details?.imageUrl ?? null;

  const handlePickAndUploadImage = async () => {
    if (!canEditGeneralFields || !selectedBusinessId) {
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
      const result = await updateProgram({
        businessId: selectedBusinessId,
        programId,
        expectedUpdatedAt: baseUpdatedAt ?? undefined,
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
      if (typeof result?.updatedAt === 'number') {
        setBaseUpdatedAt(result.updatedAt);
      }
      setConflictLocked(false);
      setSavedSignature(formSignature);
      Alert.alert(TEXT.saveDoneTitle, TEXT.saveDoneMessage);
    } catch (error) {
      const conflict = getEditConflictError(error);
      if (conflict) {
        Alert.alert(
          'הנתונים השתנו',
          'נמצאה גרסה חדשה של הכרטיסיה. אפשר לטעון אותה או להשאיר את הטיוטה המקומית.',
          [
            {
              text: 'טען גרסה עדכנית',
              onPress: () => {
                applyProgramSnapshot(details);
              },
            },
            {
              text: 'השאר טיוטה מקומית',
              onPress: () => {
                setConflictLocked(true);
              },
            },
          ]
        );
        return;
      }
      if (isLoyaltyThemeConflict(error)) {
        Alert.alert(
          LOYALTY_THEME_CONFLICT_COPY.edit.title,
          LOYALTY_THEME_CONFLICT_COPY.edit.message
        );
        return;
      }
      Alert.alert(
        TEXT.errorTitle,
        loyaltyWriteErrorToHebrewMessage(error)
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCardsUpgrade = (
    requiredPlan: 'starter' | 'pro' | 'premium' | null = 'pro',
    reason:
      | 'feature_locked'
      | 'limit_reached'
      | 'subscription_inactive' = 'limit_reached'
  ) => {
    openSubscriptionComparison(router, {
      featureKey: 'maxCards',
      requiredPlan,
      reason,
    });
  };

  const handlePublish = async () => {
    if (!canManage || lifecycle !== 'draft' || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await publishProgram({
        businessId: selectedBusinessId,
        programId,
        expectedUpdatedAt: baseUpdatedAt ?? undefined,
      });
      if (typeof result?.updatedAt === 'number') {
        setBaseUpdatedAt(result.updatedAt);
      }
      setConflictLocked(false);
      Alert.alert(TEXT.publishDoneTitle, TEXT.publishDoneMessage);
    } catch (error) {
      const conflict = getEditConflictError(error);
      if (conflict) {
        Alert.alert(
          'הנתונים השתנו',
          'נמצאה גרסה חדשה של הכרטיסיה. טענו אותה לפני פרסום.',
          [
            {
              text: 'טען גרסה עדכנית',
              onPress: () => {
                applyProgramSnapshot(details);
              },
            },
            {
              text: 'השאר טיוטה מקומית',
              onPress: () => {
                setConflictLocked(true);
              },
            },
          ]
        );
        return;
      }
      const entitlementError = getEntitlementError(error);
      if (entitlementError) {
        Alert.alert(
          'מגבלת מסלול',
          entitlementErrorToHebrewMessage(entitlementError)
        );
        openCardsUpgrade(
          entitlementError.requiredPlan ?? 'pro',
          entitlementError.code === 'SUBSCRIPTION_INACTIVE'
            ? 'subscription_inactive'
            : entitlementError.code === 'PLAN_LIMIT_REACHED'
              ? 'limit_reached'
              : 'feature_locked'
        );
        return;
      }
      Alert.alert(
        TEXT.errorTitle,
        loyaltyWriteErrorToHebrewMessage(error)
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const runArchive = async () => {
    if (!canManage || lifecycle !== 'active' || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await archiveProgram({
        businessId: selectedBusinessId,
        programId,
        expectedUpdatedAt: baseUpdatedAt ?? undefined,
      });
      if (typeof result?.updatedAt === 'number') {
        setBaseUpdatedAt(result.updatedAt);
      }
      setConflictLocked(false);
      Alert.alert(TEXT.archiveDoneTitle, TEXT.archiveDoneMessage);
    } catch (error) {
      const conflict = getEditConflictError(error);
      if (conflict) {
        Alert.alert(
          'הנתונים השתנו',
          'נמצאה גרסה חדשה של הכרטיסיה. טענו אותה לפני העברה לארכיון.',
          [
            {
              text: 'טען גרסה עדכנית',
              onPress: () => {
                applyProgramSnapshot(details);
              },
            },
            {
              text: 'השאר טיוטה מקומית',
              onPress: () => {
                setConflictLocked(true);
              },
            },
          ]
        );
        return;
      }
      Alert.alert(
        TEXT.errorTitle,
        loyaltyWriteErrorToHebrewMessage(error)
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = () => {
    if (!canManage || lifecycle !== 'active' || isSubmitting) {
      return;
    }

    Alert.alert(TEXT.archiveConfirmTitle, TEXT.archiveConfirmMessage, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'העבר לארכיון',
        style: 'destructive',
        onPress: () => {
          void runArchive();
        },
      },
    ]);
  };

  const runReactivate = async () => {
    if (!canManage || lifecycle !== 'archived' || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await unarchiveProgram({
        businessId: selectedBusinessId,
        programId,
        expectedUpdatedAt: baseUpdatedAt ?? undefined,
      });
      if (typeof result?.updatedAt === 'number') {
        setBaseUpdatedAt(result.updatedAt);
      }
      setConflictLocked(false);
      Alert.alert(TEXT.reactivateDoneTitle, TEXT.reactivateDoneMessage);
    } catch (error) {
      const conflict = getEditConflictError(error);
      if (conflict) {
        Alert.alert(
          'הנתונים השתנו',
          'נמצאה גרסה חדשה של הכרטיסיה. טענו אותה לפני הפעלה מחדש.',
          [
            {
              text: 'טען גרסה עדכנית',
              onPress: () => {
                applyProgramSnapshot(details);
              },
            },
            {
              text: 'השאר טיוטה מקומית',
              onPress: () => {
                setConflictLocked(true);
              },
            },
          ]
        );
        return;
      }
      if (isLoyaltyThemeConflict(error)) {
        Alert.alert(
          LOYALTY_THEME_CONFLICT_COPY.reactivate.title,
          LOYALTY_THEME_CONFLICT_COPY.reactivate.message
        );
        return;
      }
      const entitlementError = getEntitlementError(error);
      if (entitlementError) {
        Alert.alert(
          'מגבלת מסלול',
          entitlementErrorToHebrewMessage(entitlementError)
        );
        openCardsUpgrade(
          entitlementError.requiredPlan ?? 'pro',
          entitlementError.code === 'SUBSCRIPTION_INACTIVE'
            ? 'subscription_inactive'
            : entitlementError.code === 'PLAN_LIMIT_REACHED'
              ? 'limit_reached'
              : 'feature_locked'
        );
        return;
      }
      Alert.alert(
        TEXT.errorTitle,
        loyaltyWriteErrorToHebrewMessage(error)
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReactivate = () => {
    if (!canManage || lifecycle !== 'archived' || isSubmitting) {
      return;
    }

    Alert.alert(TEXT.reactivateConfirmTitle, TEXT.reactivateConfirmMessage, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: TEXT.reactivate,
        onPress: () => {
          void runReactivate();
        },
      },
    ]);
  };

  const runDelete = async () => {
    if (!canManage || !details?.canDelete || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await deleteProgram({
        businessId: selectedBusinessId,
        programId,
        expectedUpdatedAt: baseUpdatedAt ?? undefined,
      });
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
      const conflict = getEditConflictError(error);
      if (conflict) {
        Alert.alert(
          'הנתונים השתנו',
          'נמצאה גרסה חדשה של הכרטיסיה. טענו אותה לפני מחיקה.',
          [
            {
              text: 'טען גרסה עדכנית',
              onPress: () => {
                applyProgramSnapshot(details);
              },
            },
            {
              text: 'השאר טיוטה מקומית',
              onPress: () => {
                setConflictLocked(true);
              },
            },
          ]
        );
        return;
      }
      Alert.alert(
        TEXT.errorTitle,
        loyaltyWriteErrorToHebrewMessage(error)
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
        ref={guideScrollRef}
        stickyHeaderIndices={[0]}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: (insets.bottom || 0) + 28,
          width: '100%',
          maxWidth: 960,
          alignSelf: 'center',
        }}
      >
        <View className="bg-[#E9F0FF]">
          <StickyScrollHeader
            topPadding={(insets.top || 0) + 12}
            backgroundColor="#E9F0FF"
          >
            <BusinessScreenHeader
              title="עריכת כרטיסייה"
              titleAccessory={
                <BackButton
                  onPress={() =>
                    safeBack('/(authenticated)/(business)/programs')
                  }
                />
              }
            />
          </StickyScrollHeader>

          {details === undefined ? (
            <View className="mt-6 items-center justify-center">
              <ActivityIndicator color="#2F6BFF" />
            </View>
          ) : (
            <View className="mt-2 bg-[#E9F0FF] pb-3">
              <LoyaltyCard
                variant={isPreviewExpanded ? 'preview' : 'management'}
                businessName={selectedBusiness?.name ?? 'העסק שלך'}
                businessLogoUrl={selectedBusiness?.logoUrl ?? null}
                programImageUrl={previewImageUrl}
                programTitle={title || details.title}
                rewardName={rewardName || details.rewardName}
                maxStamps={parsedMaxStamps || details.maxStamps}
                progress={{
                  kind: 'sample',
                  currentStamps: Math.min(
                    3,
                    Math.max(1, parsedMaxStamps || details.maxStamps)
                  ),
                }}
                lifecycle={lifecycle}
                cardThemeId={cardThemeId}
                stampShape={stampShape}
                stampIcon={stampIcon || details.stampIcon}
              />
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setIsPreviewExpanded((current) => !current)}
                className="mt-2 min-h-[44px] items-center justify-center rounded-xl border border-[#B8C8E8] bg-white px-3"
              >
                <Text className="text-sm font-bold text-[#1D4ED8]">
                  {isPreviewExpanded
                    ? 'סגור תצוגת לקוח'
                    : 'תצוגת לקוח'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {details !== undefined ? (
          <View className="mt-2 gap-3">
            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-4">
              <Text className={`text-lg font-black text-[#0F172A] ${tw.textStart}`}>
                תוכן הכרטיסייה
              </Text>
              <View className="gap-2">
                <Text
                  className={`text-xs font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  {TEXT.sectionTitle}
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
                  {TEXT.sectionReward}
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
                  {TEXT.sectionMaxStamps}
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
                <Text className={`mb-2 text-lg font-black text-[#0F172A] ${tw.textStart}`}>
                  עיצוב
                </Text>
                <Text
                  className={`text-xs font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  תמונה
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
                  {TEXT.sectionStampShape}
                </Text>
                <StampShapePicker
                  value={stampShape}
                  stampIcon={stampIcon}
                  onChange={setStampShape}
                  disabled={!canEditGeneralFields}
                />
                <Text
                  className={`mt-2 text-xs font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  {TEXT.iconInput}
                </Text>
                <StampIconPicker
                  value={stampIcon}
                  onChange={setStampIcon}
                  disabled={!canEditGeneralFields}
                />
              </View>

              <View className="gap-2">
                <Text
                  className={`text-xs font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  {TEXT.sectionTheme}
                </Text>
                <LoyaltyThemePalette
                  value={cardThemeId}
                  onChange={setCardThemeId}
                  disabledThemeIds={usedThemeIds}
                  disabled={!canEditGeneralFields}
                />
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ expanded: isAdvancedOpen }}
                onPress={() => setIsAdvancedOpen((current) => !current)}
                className={`min-h-[52px] ${tw.flexRow} items-center justify-between rounded-2xl border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3`}
                style={rtlBaseView}
              >
                <View>
                  <Text className={`text-base font-black text-[#0F172A] ${tw.textStart}`}>
                    הגדרות מתקדמות
                  </Text>
                  <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                    {cardTerms || rewardConditions ? 'הוגדרו תנאים' : 'לא הוגדר'}
                  </Text>
                </View>
                <Text className="text-lg font-black text-[#1D4ED8]">
                  {isAdvancedOpen ? '−' : '+'}
                </Text>
              </TouchableOpacity>

              {isAdvancedOpen ? (
                <View className="gap-4">
                  <View className="gap-2">
                    <Text className={`text-xs font-semibold text-[#64748B] ${tw.textStart}`}>
                      {TEXT.sectionCardTerms}
                    </Text>
                    <TextInput
                      accessibilityLabel={TEXT.sectionCardTerms}
                      value={cardTerms}
                      onChangeText={setCardTerms}
                      editable={canEditRuleFields}
                      placeholder={DEFAULT_LOYALTY_CARD_TERMS}
                      placeholderTextColor="#94A3B8"
                      multiline={true}
                      textAlignVertical="top"
                      className={`min-h-[88px] rounded-2xl border px-4 py-3 text-right text-sm font-semibold ${
                        canEditRuleFields
                          ? 'border-[#CBD5E1] bg-white text-[#0F172A]'
                          : 'border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]'
                      }`}
                    />
                  </View>
                  <View className="gap-2">
                    <Text className={`text-xs font-semibold text-[#64748B] ${tw.textStart}`}>
                      {TEXT.sectionRewardTerms}
                    </Text>
                    <TextInput
                      accessibilityLabel={TEXT.sectionRewardTerms}
                      value={rewardConditions}
                      onChangeText={setRewardConditions}
                      editable={canEditRuleFields}
                      placeholder="תנאי מימוש ההטבה"
                      placeholderTextColor="#94A3B8"
                      multiline={true}
                      textAlignVertical="top"
                      className={`min-h-[88px] rounded-2xl border px-4 py-3 text-right text-sm font-semibold ${
                        canEditRuleFields
                          ? 'border-[#CBD5E1] bg-white text-[#0F172A]'
                          : 'border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]'
                      }`}
                    />
                  </View>
                </View>
              ) : null}
            </View>

            <View className="gap-3">
              {conflictLocked ? (
                <View className="rounded-2xl border border-[#FCD34D] bg-[#FFFBEB] px-4 py-3">
                  <Text className="text-right text-xs text-[#92400E]">
                    נמצאה גרסה חדשה של הכרטיס. השמירה נעולה עד לטעינת הגרסה
                    העדכנית.
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      applyProgramSnapshot(details);
                    }}
                    className={`mt-2 ${tw.selfStart} rounded-full bg-[#F59E0B] px-3 py-1.5`}
                  >
                    <Text className="text-xs font-bold text-white">
                      טען גרסה עדכנית
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <Text
                accessibilityLiveRegion="polite"
                className={`text-xs font-bold ${tw.textStart} ${
                  isDirty ? 'text-[#B45309]' : 'text-[#15803C]'
                }`}
              >
                {isDirty
                  ? 'יש שינויים שלא נשמרו'
                  : 'כל השינויים נשמרו'}
              </Text>

              {!isArchived ? (
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
              ) : null}

              {lifecycle === 'draft' ? (
                <View ref={guideTargetRef} collapsable={false}>
                  <TouchableOpacity
                    disabled={!canManage || isSubmitting || conflictLocked}
                    onPress={() => {
                      void handlePublish();
                    }}
                    className={`rounded-2xl border px-4 py-3 ${
                      canManage && !isSubmitting && !conflictLocked
                        ? 'border-[#2563EB] bg-white'
                        : 'border-[#CBD5E1] bg-[#F1F5F9]'
                    }`}
                  >
                    <Text className="text-center text-sm font-bold text-[#1D4ED8]">
                      {TEXT.publish}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {lifecycle === 'active' ? (
                <View className="mt-3 gap-2 border-t border-[#DCE6F7] pt-4">
                  <Text className={`text-sm font-black text-[#334155] ${tw.textStart}`}>
                    אפשרויות נוספות
                  </Text>
                  <TouchableOpacity
                    disabled={!canManage || isSubmitting || conflictLocked}
                    onPress={handleArchive}
                    className="min-h-[48px] items-center justify-center rounded-2xl border border-[#FCA5A5] bg-white px-4 py-3"
                  >
                    <Text className="text-center text-sm font-bold text-[#B91C1C]">
                      {TEXT.archive}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {lifecycle === 'archived' ? (
                <View className="mt-3 gap-2 border-t border-[#DCE6F7] pt-4">
                  <Text className={`text-sm font-black text-[#334155] ${tw.textStart}`}>
                    כרטיסייה בארכיון
                  </Text>
                  <TouchableOpacity
                    disabled={!canManage || isSubmitting || conflictLocked}
                    onPress={handleReactivate}
                    className={`min-h-[48px] items-center justify-center rounded-2xl px-4 py-3 ${
                      canManage && !isSubmitting && !conflictLocked
                        ? 'bg-[#2F6BFF]'
                        : 'bg-[#CBD5E1]'
                    }`}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text className="text-center text-sm font-bold text-white">
                        {TEXT.reactivate}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}

              {details.canDelete ? (
                <TouchableOpacity
                  disabled={!canManage || isSubmitting || conflictLocked}
                  onPress={handleDelete}
                  className={`rounded-2xl px-4 py-3 ${
                    canManage && !isSubmitting && !conflictLocked
                      ? 'bg-[#DC2626]'
                      : 'bg-[#CBD5E1]'
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
      <GuidedActionScreenOverlay
        activeBusinessId={activeBusinessId}
        routeKey="program-detail"
        routeEntityId={programId}
        routeEntityKind="program"
        targetRef={guideTargetRef}
        scrollTargetIntoView={() =>
          guideScrollRef.current?.scrollToEnd({ animated: false })
        }
      />
    </SafeAreaView>
  );
}
