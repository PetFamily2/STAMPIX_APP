import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BusinessAddressSelector from '@/components/business/BusinessAddressSelector';
import {
  BusinessSettingsSubpageHeader,
  SETTINGS_TOKENS,
  SettingsCard,
  SettingsPrimaryButton,
  useSettingsContentWidth,
} from '@/components/business-settings';
import { useBusinessWebUnsavedChanges } from '@/components/business-web/BusinessWebRouteContext';
import { useGuidedTargetRef } from '@/components/guidance/GuidedActionAnchor';
import { GuidedActionScreenOverlay } from '@/components/guidance/GuidedActionOverlay';
import { PaintedPressable as Pressable } from '@/components/ui/PaintedPressable';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { Alert } from '@/lib/alert';
import {
  areBusinessAddressesEqual,
  isValidSelectedBusinessAddress,
  type SelectedBusinessAddress,
} from '@/lib/businessAddressSelection';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import {
  canReloadEditConflict,
  getEditConflictError,
} from '@/lib/errors/editConflicts';
import { safeBack } from '@/lib/navigation';
import { BUSINESS_ROUTES } from '@/lib/navigation/businessRoutes';
import { selfEnd } from '@/lib/rtl';

const TEXT = {
  title: 'עריכת כתובת העסק',
  subtitle: 'בחרו עיר ורחוב, הזינו מספר בית ושמרו את הכתובת המדויקת',
  addressLabel: 'כתובת העסק',
  noActiveBusiness: 'לא נמצא עסק פעיל.',
  loadingFailed: 'לא נמצאו נתוני עסק להצגת כתובת.',
  noPermission: 'עריכת כתובת זמינה לבעלים או למנהל בלבד.',
  save: 'שמירת כתובת',
  savedTitle: 'נשמר',
  savedMessage: 'כתובת העסק עודכנה בהצלחה.',
  saveFailed: 'עדכון הכתובת נכשל.',
  loadLatest: 'טען גרסה עדכנית',
  conflictLocked:
    'נמצאה גרסה חדשה של הכתובת. השמירה נעולה עד לטעינת הגרסה העדכנית.',
};

function toSelectedAddress(
  settings: {
    formattedAddress?: string;
    placeId?: string;
    location?: { lat?: number; lng?: number } | null;
    city?: string;
    street?: string;
    streetNumber?: string;
  } | null
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

export default function BusinessSettingsAddressScreen() {
  const contentWidth = useSettingsContentWidth();
  const navigation = useNavigation();
  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const activeBusinessCapabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canEditBusiness =
    activeBusinessCapabilities?.edit_business_profile === true;

  const businessSettings = useQuery(
    api.business.getBusinessSettings,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const updateBusinessAddress = useMutation(api.business.updateBusinessAddress);

  const [addressQuery, setAddressQuery] = useState('');
  const [selectedAddress, setSelectedAddress] =
    useState<SelectedBusinessAddress | null>(null);
  const [loadedAddress, setLoadedAddress] =
    useState<SelectedBusinessAddress | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<number | null>(null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const conflictLocked = conflictVersion !== null;
  const canLoadLatest = canReloadEditConflict(
    conflictVersion,
    businessSettings?.updatedAt
  );
  const scrollViewRef = useRef<ScrollView | null>(null);
  const guideTargetRef = useGuidedTargetRef();
  const guideFocusTargetRef = useRef<(() => void) | null>(null);

  const applyBusinessAddressSnapshot = useCallback(
    (settings: typeof businessSettings) => {
      if (!settings) {
        return;
      }
      const nextSelected = toSelectedAddress(settings);
      setAddressQuery(settings.formattedAddress?.trim() ?? '');
      setSelectedAddress(nextSelected);
      setLoadedAddress(nextSelected);
      setBaseUpdatedAt(
        typeof settings.updatedAt === 'number' ? settings.updatedAt : null
      );
      setConflictVersion(null);
    },
    []
  );

  useEffect(() => {
    if (activeBusinessId == null) {
      setBaseUpdatedAt(null);
      setConflictVersion(null);
      setSelectedAddress(null);
      setLoadedAddress(null);
      setAddressQuery('');
      return;
    }
    setBaseUpdatedAt(null);
    setConflictVersion(null);
    setSelectedAddress(null);
    setLoadedAddress(null);
    setAddressQuery('');
  }, [activeBusinessId]);

  useEffect(() => {
    if (!businessSettings || baseUpdatedAt !== null) {
      return;
    }
    applyBusinessAddressSnapshot(businessSettings);
  }, [applyBusinessAddressSnapshot, baseUpdatedAt, businessSettings]);

  const isDirty = !areBusinessAddressesEqual(loadedAddress, selectedAddress);
  useBusinessWebUnsavedChanges(Platform.OS === 'web' && isDirty);
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
  const canSave =
    canEditBusiness &&
    activeBusinessId !== null &&
    isValidSelectedBusinessAddress(selectedAddress) &&
    isDirty &&
    !isSubmitting &&
    !conflictLocked;

  const handleSave = async () => {
    if (!activeBusinessId || !selectedAddress || !canSave) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await updateBusinessAddress({
        businessId: activeBusinessId,
        expectedUpdatedAt: baseUpdatedAt ?? undefined,
        formattedAddress: selectedAddress.formattedAddress,
        placeId: selectedAddress.placeId,
        lat: selectedAddress.latitude,
        lng: selectedAddress.longitude,
        city: selectedAddress.city,
        street: selectedAddress.street,
        streetNumber: selectedAddress.streetNumber,
      });
      if (typeof result?.updatedAt === 'number') {
        setBaseUpdatedAt(result.updatedAt);
      }
      setLoadedAddress(selectedAddress);
      Alert.alert(TEXT.savedTitle, TEXT.savedMessage, [
        {
          text: 'אישור',
          onPress: () => safeBack(BUSINESS_ROUTES.profile),
        },
      ]);
    } catch (saveError) {
      const conflict = getEditConflictError(saveError);
      if (conflict) {
        setConflictVersion(conflict.serverUpdatedAt);
        return;
      }
      setError(TEXT.saveFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!activeBusinessId) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <BusinessSettingsSubpageHeader
          title={TEXT.title}
          fallbackHref={BUSINESS_ROUTES.profile}
        />
        <Text style={[styles.emptyText, styles.emptyPad]}>
          {TEXT.noActiveBusiness}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollViewRef}
          stickyHeaderIndices={[0]}
          contentContainerStyle={[styles.content, { width: contentWidth }]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled={true}
        >
          <BusinessSettingsSubpageHeader
            title={TEXT.title}
            subtitle={TEXT.subtitle}
            fallbackHref={BUSINESS_ROUTES.profile}
          />

          {businessSettings === undefined ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color="#2F6BFF" />
            </View>
          ) : businessSettings === null ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>{TEXT.loadingFailed}</Text>
            </View>
          ) : (
            <>
              {!canEditBusiness ? (
                <View style={styles.card}>
                  <Text style={styles.helperText}>{TEXT.noPermission}</Text>
                </View>
              ) : null}

              <SettingsCard>
                <BusinessAddressSelector
                  key={`${activeBusinessId}:${baseUpdatedAt ?? 'loading'}`}
                  query={addressQuery}
                  selectedAddress={selectedAddress}
                  onQueryChange={(value) => {
                    setAddressQuery(value);
                    setError(null);
                  }}
                  onSelectedAddressChange={(value) => {
                    setSelectedAddress(value);
                    setError(null);
                  }}
                  disabled={!canEditBusiness}
                  label={TEXT.addressLabel}
                  errorText={error}
                  onError={setError}
                  scrollViewRef={scrollViewRef}
                  guideTargetRef={guideTargetRef}
                  guideFocusTargetRef={guideFocusTargetRef}
                />
              </SettingsCard>

              {conflictLocked ? (
                <View style={styles.warningCard}>
                  <Text style={styles.warningText}>{TEXT.conflictLocked}</Text>
                  <Pressable
                    disabled={!canLoadLatest}
                    accessibilityState={{ disabled: !canLoadLatest }}
                    onPress={() => {
                      if (!canLoadLatest) {
                        return;
                      }
                      applyBusinessAddressSnapshot(businessSettings);
                      setError(null);
                    }}
                    style={styles.warningButton}
                  >
                    <Text style={styles.warningButtonText}>
                      {TEXT.loadLatest}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <SettingsPrimaryButton
                label={TEXT.save}
                onPress={() => void handleSave()}
                disabled={!canSave}
                loading={isSubmitting}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <GuidedActionScreenOverlay
        activeBusinessId={activeBusinessId}
        routeKey="business-address"
        targetRef={guideTargetRef}
        focusTargetRef={guideFocusTargetRef}
        scrollTargetIntoView={() =>
          scrollViewRef.current?.scrollTo({ y: 120, animated: false })
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FB',
  },
  keyboard: {
    flex: 1,
  },
  content: {
    paddingBottom: 30,
    gap: 12,
    alignSelf: 'center',
  },
  emptyPad: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  card: {
    borderRadius: SETTINGS_TOKENS.radiusLg,
    borderWidth: 1,
    borderColor: SETTINGS_TOKENS.border,
    backgroundColor: SETTINGS_TOKENS.surface,
    padding: 16,
  },
  loadingCard: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  emptyText: {
    width: '100%',
    textAlign: 'right',
    writingDirection: 'rtl',
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  helperText: {
    textAlign: 'right',
    writingDirection: 'rtl',
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  warningCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  warningText: {
    textAlign: 'right',
    writingDirection: 'rtl',
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  warningButton: {
    alignSelf: selfEnd,
    borderRadius: 999,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  warningButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
