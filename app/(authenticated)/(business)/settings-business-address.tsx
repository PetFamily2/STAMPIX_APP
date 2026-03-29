import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useGooglePlaceAutocomplete } from '@/hooks/useGooglePlaceAutocomplete';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { getEditConflictError } from '@/lib/errors/editConflicts';
import { fetchPlaceDetails, type PlaceSuggestion } from '@/lib/googlePlaces';
import { tw } from '@/lib/rtl';

type SelectedAddress = {
  formattedAddress: string;
  placeId: string;
  lat: number;
  lng: number;
  city: string;
  street: string;
  streetNumber: string;
};

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    switch (error.message) {
      case 'GOOGLE_MAPS_API_KEY_MISSING':
        return 'חסר EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ולכן לא ניתן לטעון כתובות.';
      case 'PLACES_AUTOCOMPLETE_REQUEST_FAILED':
      case 'PLACES_AUTOCOMPLETE_FAILED':
        return 'לא הצלחנו לטעון הצעות כתובת. נסו שוב.';
      case 'PLACE_DETAILS_REQUEST_FAILED':
      case 'PLACE_DETAILS_INCOMPLETE':
      case 'PLACE_ID_REQUIRED':
        return 'לא הצלחנו לטעון את פרטי הכתובת. נסו לבחור שוב.';
      default:
        return error.message;
    }
  }
  return fallback;
}

function SuggestionRow({
  suggestion,
  onPress,
}: {
  suggestion: PlaceSuggestion;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1 })}
      className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFF] px-3 py-3"
    >
      <Text className="text-right text-sm font-bold text-[#0F172A]">
        {suggestion.primaryText}
      </Text>
      {suggestion.secondaryText ? (
        <Text className="mt-1 text-right text-xs text-[#64748B]">
          {suggestion.secondaryText}
        </Text>
      ) : null}
    </Pressable>
  );
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
    useState<SelectedAddress | null>(null);
  const [isSelectingAddress, setIsSelectingAddress] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<number | null>(null);
  const [conflictLocked, setConflictLocked] = useState(false);

  const applyBusinessAddressSnapshot = (settings: typeof businessSettings) => {
    if (!settings) {
      return;
    }
    const formatted = settings.formattedAddress?.trim() ?? '';
    setAddressQuery(formatted);
    const location = settings.location;
    const hasCoordinates =
      location &&
      typeof location.lat === 'number' &&
      typeof location.lng === 'number';

    if (formatted && settings.placeId && hasCoordinates && location) {
      setSelectedAddress({
        formattedAddress: formatted,
        placeId: settings.placeId,
        lat: location.lat,
        lng: location.lng,
        city: settings.city ?? '',
        street: settings.street ?? '',
        streetNumber: settings.streetNumber ?? '',
      });
    } else {
      setSelectedAddress(null);
    }
    setBaseUpdatedAt(
      typeof settings.updatedAt === 'number' ? settings.updatedAt : null
    );
    setConflictLocked(false);
  };

  useEffect(() => {
    const businessKey = activeBusinessId ?? null;
    setBaseUpdatedAt(null);
    setConflictLocked(false);
    if (businessKey === null) {
      setSelectedAddress(null);
    }
  }, [activeBusinessId]);

  useEffect(() => {
    if (!businessSettings || baseUpdatedAt !== null) {
      return;
    }
    const formatted = businessSettings.formattedAddress?.trim() ?? '';
    setAddressQuery(formatted);
    const location = businessSettings.location;
    const hasCoordinates =
      location &&
      typeof location.lat === 'number' &&
      typeof location.lng === 'number';

    if (formatted && businessSettings.placeId && hasCoordinates && location) {
      setSelectedAddress({
        formattedAddress: formatted,
        placeId: businessSettings.placeId,
        lat: location.lat,
        lng: location.lng,
        city: businessSettings.city ?? '',
        street: businessSettings.street ?? '',
        streetNumber: businessSettings.streetNumber ?? '',
      });
    } else {
      setSelectedAddress(null);
    }
    setBaseUpdatedAt(
      typeof businessSettings.updatedAt === 'number'
        ? businessSettings.updatedAt
        : null
    );
    setConflictLocked(false);
  }, [baseUpdatedAt, businessSettings]);

  const searchQuery = useMemo(() => {
    const normalizedQuery = addressQuery.trim();
    if (
      selectedAddress &&
      normalizedQuery &&
      normalizedQuery === selectedAddress.formattedAddress
    ) {
      return '';
    }
    return normalizedQuery;
  }, [addressQuery, selectedAddress]);

  const {
    suggestions,
    isLoading: isSuggestionsLoading,
    error: autocompleteError,
    sessionToken,
    clearSuggestions,
    resetSessionToken,
  } = useGooglePlaceAutocomplete(searchQuery);

  const hasSelectedAddress = selectedAddress !== null;
  const canSave =
    canEditBusiness &&
    hasSelectedAddress &&
    !isSelectingAddress &&
    !isSubmitting &&
    !conflictLocked;

  const handleAddressChange = (value: string) => {
    setAddressQuery(value);
    setError(null);
    if (
      selectedAddress &&
      value.trim().length > 0 &&
      value.trim() !== selectedAddress.formattedAddress
    ) {
      setSelectedAddress(null);
    }
  };

  const handleSelectSuggestion = async (suggestion: PlaceSuggestion) => {
    setIsSelectingAddress(true);
    setError(null);
    try {
      const details = await fetchPlaceDetails(suggestion.placeId, sessionToken);
      setSelectedAddress({
        formattedAddress: details.formattedAddress,
        placeId: details.placeId,
        lat: details.lat,
        lng: details.lng,
        city: details.city,
        street: details.street,
        streetNumber: details.streetNumber,
      });
      setAddressQuery(details.formattedAddress);
      clearSuggestions();
      resetSessionToken();
    } catch (selectionError) {
      setError(toErrorMessage(selectionError, 'בחירת הכתובת נכשלה.'));
    } finally {
      setIsSelectingAddress(false);
    }
  };

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
        lat: selectedAddress.lat,
        lng: selectedAddress.lng,
        city: selectedAddress.city,
        street: selectedAddress.street,
        streetNumber: selectedAddress.streetNumber,
      });
      if (typeof result?.updatedAt === 'number') {
        setBaseUpdatedAt(result.updatedAt);
      }
      Alert.alert('נשמר', 'כתובת העסק עודכנה בהצלחה.');
      router.back();
    } catch (saveError) {
      const conflict = getEditConflictError(saveError);
      if (conflict) {
        Alert.alert(
          'הנתונים עודכנו',
          'נמצאה גרסה חדשה של כתובת העסק. אפשר לטעון את הנתונים העדכניים או להשאיר את הטיוטה המקומית.',
          [
            {
              text: 'Reload latest',
              onPress: () => {
                applyBusinessAddressSnapshot(businessSettings);
                setError(null);
              },
            },
            {
              text: 'Keep my draft',
              onPress: () => {
                setConflictLocked(true);
              },
            },
          ]
        );
        return;
      }
      setError(toErrorMessage(saveError, 'עדכון הכתובת נכשל.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!activeBusinessId) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#E9F0FF] px-6">
        <Text className="text-center text-sm text-[#64748B]">
          לא נמצא עסק פעיל.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 30,
          gap: 12,
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title="עריכת כתובת העסק"
            subtitle="בחרו כתובת מרשימת ההצעות ושמרו"
            titleAccessory={<BackButton onPress={() => router.back()} />}
          />
        </StickyScrollHeader>

        {businessSettings === undefined ? (
          <View className="items-center rounded-3xl border border-[#E3E9FF] bg-white p-5">
            <ActivityIndicator color="#2F6BFF" />
          </View>
        ) : businessSettings === null ? (
          <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5">
            <Text className="text-right text-sm text-[#64748B]">
              לא נמצאו נתוני עסק להצגת כתובת.
            </Text>
          </View>
        ) : (
          <>
            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-4">
              <Text
                className={`text-xs font-bold text-[#5B6475] ${tw.textStart}`}
              >
                כתובת העסק
              </Text>
              <TextInput
                value={addressQuery}
                onChangeText={handleAddressChange}
                editable={canEditBusiness}
                placeholder="התחילו להקליד כתובת"
                placeholderTextColor="#94A3B8"
                className="mt-2 rounded-2xl border border-[#DCE6F7] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
              />
              {!canEditBusiness ? (
                <Text className="mt-2 text-right text-xs text-[#64748B]">
                  עריכת כתובת זמינה לבעלים או למנהל בלבד.
                </Text>
              ) : null}
            </View>

            {isSuggestionsLoading ? (
              <View className="items-center rounded-2xl border border-[#E3E9FF] bg-white px-4 py-3">
                <ActivityIndicator color="#2F6BFF" />
              </View>
            ) : null}

            {autocompleteError ? (
              <View className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3">
                <Text className="text-right text-xs text-[#991B1B]">
                  {toErrorMessage(autocompleteError, 'טעינת כתובות נכשלה.')}
                </Text>
              </View>
            ) : null}

            {suggestions.length > 0 ? (
              <View className="rounded-3xl border border-[#E3E9FF] bg-white p-3">
                <Text className="text-right text-xs font-bold text-[#64748B]">
                  הצעות כתובת
                </Text>
                <View className="mt-2 gap-2">
                  {suggestions.map((suggestion) => (
                    <SuggestionRow
                      key={suggestion.placeId}
                      suggestion={suggestion}
                      onPress={() => {
                        void handleSelectSuggestion(suggestion);
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {selectedAddress ? (
              <View className="rounded-3xl border border-[#CFE0FF] bg-[#F3F7FF] p-4">
                <Text className="text-right text-xs font-bold text-[#1D4ED8]">
                  כתובת שנבחרה
                </Text>
                <Text className="mt-1 text-right text-sm font-bold text-[#0F172A]">
                  {selectedAddress.formattedAddress}
                </Text>
                <Text className="mt-1 text-right text-xs text-[#64748B]">
                  {selectedAddress.city || '-'} ·{' '}
                  {selectedAddress.street || '-'} ·{' '}
                  {selectedAddress.streetNumber || '-'}
                </Text>
              </View>
            ) : null}

            {error ? (
              <View className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3">
                <Text className="text-right text-xs text-[#991B1B]">
                  {error}
                </Text>
              </View>
            ) : null}

            {conflictLocked ? (
              <View className="rounded-2xl border border-[#FCD34D] bg-[#FFFBEB] px-4 py-3">
                <Text className="text-right text-xs text-[#92400E]">
                  נמצאה גרסה חדשה של הכתובת. השמירה נעולה עד לטעינת הגרסה
                  העדכנית.
                </Text>
                <Pressable
                  onPress={() => {
                    applyBusinessAddressSnapshot(businessSettings);
                    setError(null);
                  }}
                  className="mt-2 self-end rounded-full bg-[#F59E0B] px-3 py-1.5"
                >
                  <Text className="text-xs font-bold text-white">
                    Reload latest
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <Pressable
              onPress={() => {
                void handleSave();
              }}
              disabled={!canSave}
              className={`rounded-2xl px-4 py-3 ${canSave ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'}`}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-center text-sm font-bold text-white">
                  שמירת כתובת
                </Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
