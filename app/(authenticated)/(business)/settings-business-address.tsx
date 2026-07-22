import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import BusinessAddressSelector from '@/components/business/BusinessAddressSelector';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import {
  areBusinessAddressesEqual,
  isValidSelectedBusinessAddress,
  type SelectedBusinessAddress,
} from '@/lib/businessAddressSelection';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { getEditConflictError } from '@/lib/errors/editConflicts';
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
  conflictTitle: 'הנתונים עודכנו',
  conflictMessage:
    'נמצאה גרסה חדשה של כתובת העסק. אפשר לטעון את הנתונים העדכניים או להשאיר את הטיוטה המקומית.',
  loadLatest: 'טען גרסה עדכנית',
  keepDraft: 'השאר טיוטה מקומית',
  conflictLocked:
    'נמצאה גרסה חדשה של הכתובת. השמירה נעולה עד לטעינת הגרסה העדכנית.',
};

function toSelectedAddress(settings: {
  formattedAddress?: string;
  placeId?: string;
  location?: { lat?: number; lng?: number } | null;
  city?: string;
  street?: string;
  streetNumber?: string;
} | null): SelectedBusinessAddress | null {
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
  const insets = useSafeAreaInsets();
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
  const [conflictLocked, setConflictLocked] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);

  const applyBusinessAddressSnapshot = (settings: typeof businessSettings) => {
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
    setConflictLocked(false);
  };

  useEffect(() => {
    setBaseUpdatedAt(null);
    setConflictLocked(false);
    setSelectedAddress(null);
    setLoadedAddress(null);
    setAddressQuery('');
  }, [activeBusinessId]);

  useEffect(() => {
    if (!businessSettings || baseUpdatedAt !== null) {
      return;
    }
    applyBusinessAddressSnapshot(businessSettings);
  }, [baseUpdatedAt, businessSettings]);

  const isDirty = !areBusinessAddressesEqual(loadedAddress, selectedAddress);
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
          onPress: () =>
            router.replace(
              '/(authenticated)/(business)/settings-business-profile'
            ),
        },
      ]);
    } catch (saveError) {
      const conflict = getEditConflictError(saveError);
      if (conflict) {
        Alert.alert(TEXT.conflictTitle, TEXT.conflictMessage, [
          {
            text: TEXT.loadLatest,
            onPress: () => {
              applyBusinessAddressSnapshot(businessSettings);
              setError(null);
            },
          },
          {
            text: TEXT.keepDraft,
            onPress: () => {
              setConflictLocked(true);
            },
          },
        ]);
        return;
      }
      setError(TEXT.saveFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!activeBusinessId) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.emptyText}>{TEXT.noActiveBusiness}</Text>
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
          contentContainerStyle={[
            styles.content,
            { paddingTop: (insets.top || 0) + 12 },
          ]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <StickyScrollHeader
            topPadding={0}
            backgroundColor="#E9F0FF"
          >
            <BusinessScreenHeader
              title={TEXT.title}
              subtitle={TEXT.subtitle}
              titleAccessory={<BackButton onPress={() => router.back()} />}
            />
          </StickyScrollHeader>

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

              <View style={styles.card}>
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
                />
              </View>

              {conflictLocked ? (
                <View style={styles.warningCard}>
                  <Text style={styles.warningText}>{TEXT.conflictLocked}</Text>
                  <Pressable
                    onPress={() => {
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

              <Pressable
                onPress={() => {
                  void handleSave();
                }}
                disabled={!canSave}
                style={[styles.saveButton, !canSave ? styles.saveButtonOff : null]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>{TEXT.save}</Text>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E9F0FF',
  },
  keyboard: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E9F0FF',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    backgroundColor: '#FFFFFF',
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
  saveButton: {
    borderRadius: 16,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  saveButtonOff: {
    backgroundColor: '#CBD5E1',
  },
  saveButtonText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
