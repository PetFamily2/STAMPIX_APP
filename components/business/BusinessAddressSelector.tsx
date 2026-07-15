import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import { useGooglePlaceAutocomplete } from '@/hooks/useGooglePlaceAutocomplete';
import {
  applyManualCoordinateCorrection,
  invalidateSelectionAfterQueryEdit,
  isValidSelectedBusinessAddress,
  shouldAcceptAddressDetailsResponse,
  type SelectedBusinessAddress,
} from '@/lib/businessAddressSelection';
import { fetchPlaceDetails, type PlaceSuggestion } from '@/lib/googlePlaces';
import { alignItems, flexDirection, selfStart } from '@/lib/rtl';

const HAS_GOOGLE_MAPS_API_KEY = Boolean(
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
);
const CAN_RENDER_NATIVE_MAP =
  Platform.OS !== 'android' || HAS_GOOGLE_MAPS_API_KEY;

const TEXT = {
  label: 'כתובת העסק',
  placeholder: 'הקלידו שם עסק או כתובת',
  loadingSuggestions: 'מחפשים כתובות ועסקים...',
  loadingPlace: 'טוענים את פרטי המקום...',
  noSuggestions: 'לא נמצאו תוצאות מתאימות. נסו שם או כתובת מדויקים יותר.',
  selectedAddress: 'כתובת שנבחרה',
  mapLabel: 'אישור מיקום על המפה',
  manualCorrection: 'תיקון המיקום על המפה',
  confirmCorrection: 'אישור המיקום',
  cancelCorrection: 'ביטול התיקון',
  correctionMode: 'מצב תיקון פעיל - לחצו על המפה כדי להזיז את הסמן.',
  adjustedPin: 'הסמן עודכן ידנית',
  googleAttribution: 'Powered by Google',
  mapUnavailableTitle: 'המפה לא זמינה בתצוגה הזו',
  mapUnavailableSubtitle:
    'אפשר להמשיך עם הכתובת שנבחרה, כל עוד התקבלו קואורדינטות תקינות מפרטי המקום.',
  cityFallback: 'ללא עיר',
  streetFallback: 'ללא רחוב',
};

type BusinessAddressSelectorProps = {
  query: string;
  selectedAddress: SelectedBusinessAddress | null;
  onQueryChange: (value: string) => void;
  onSelectedAddressChange: (value: SelectedBusinessAddress | null) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  errorText?: string | null;
  onError?: (value: string | null) => void;
};

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    switch (error.message) {
      case 'PLACES_AUTOCOMPLETE_REQUEST_FAILED':
      case 'PLACES_AUTOCOMPLETE_FAILED':
        return 'לא הצלחנו לטעון הצעות כתובת. נסו שוב.';
      case 'PLACE_DETAILS_REQUEST_FAILED':
      case 'PLACE_DETAILS_INCOMPLETE':
      case 'PLACE_ID_REQUIRED':
        return 'לא הצלחנו לטעון את פרטי המקום. בחרו שוב מהרשימה.';
      default:
        return 'בחירת הכתובת נכשלה. נסו שוב.';
    }
  }
  return 'בחירת הכתובת נכשלה. נסו שוב.';
}

function toSelectedAddress(details: Awaited<ReturnType<typeof fetchPlaceDetails>>) {
  return {
    placeId: details.placeId,
    formattedAddress: details.formattedAddress,
    latitude: details.lat,
    longitude: details.lng,
    city: details.city,
    street: details.street,
    streetNumber: details.streetNumber,
  } satisfies SelectedBusinessAddress;
}

function getSelectedAddressKey(value: SelectedBusinessAddress | null) {
  if (!value) {
    return '';
  }
  return [
    value.placeId,
    value.formattedAddress,
    value.latitude,
    value.longitude,
  ].join('|');
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
      style={({ pressed }) => [
        styles.suggestionRow,
        pressed ? styles.pressed : null,
      ]}
      accessibilityRole="button"
    >
      <View style={styles.suggestionTextWrap}>
        <Text style={styles.suggestionPrimary}>{suggestion.primaryText}</Text>
        {suggestion.secondaryText ? (
          <Text style={styles.suggestionSecondary}>
            {suggestion.secondaryText}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function BusinessAddressSelector({
  query,
  selectedAddress,
  onQueryChange,
  onSelectedAddressChange,
  disabled,
  label = TEXT.label,
  placeholder = TEXT.placeholder,
  errorText,
  onError,
}: BusinessAddressSelectorProps) {
  const [isSelectingPlace, setIsSelectingPlace] = useState(false);
  const [isCorrectionMode, setIsCorrectionMode] = useState(false);
  const [correctionDraft, setCorrectionDraft] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const mountedRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const activeDetailsRequestRef = useRef<number | null>(null);
  const latestQueryRef = useRef(query);
  const selectedAddressKeyRef = useRef(getSelectedAddressKey(selectedAddress));
  const searchQuery = useMemo(() => {
    const normalizedQuery = query.trim();
    if (
      selectedAddress &&
      normalizedQuery === selectedAddress.formattedAddress.trim()
    ) {
      return '';
    }
    return normalizedQuery;
  }, [query, selectedAddress]);
  const {
    suggestions,
    isLoading: isSuggestionsLoading,
    error: autocompleteError,
    sessionToken,
    clearSuggestions,
    resetSessionToken,
  } = useGooglePlaceAutocomplete(searchQuery);

  const invalidatePendingDetailsRequest = () => {
    if (activeDetailsRequestRef.current !== null) {
      requestSequenceRef.current += 1;
      activeDetailsRequestRef.current = null;
      setIsSelectingPlace(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
      activeDetailsRequestRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (latestQueryRef.current === query) {
      return;
    }
    latestQueryRef.current = query;
    invalidatePendingDetailsRequest();
  }, [query]);

  useEffect(() => {
    const nextSelectedAddressKey = getSelectedAddressKey(selectedAddress);
    if (selectedAddressKeyRef.current === nextSelectedAddressKey) {
      return;
    }
    selectedAddressKeyRef.current = nextSelectedAddressKey;
    invalidatePendingDetailsRequest();
  }, [selectedAddress]);

  useEffect(() => {
    if (!selectedAddress) {
      setIsCorrectionMode(false);
      setCorrectionDraft(null);
    }
  }, [selectedAddress]);

  const handleQueryChange = (value: string) => {
    latestQueryRef.current = value;
    invalidatePendingDetailsRequest();
    onQueryChange(value);
    onError?.(null);
    const nextSelected = invalidateSelectionAfterQueryEdit(
      value,
      selectedAddress
    );
    if (nextSelected !== selectedAddress) {
      onSelectedAddressChange(nextSelected);
      clearSuggestions();
    }
  };

  const handleSelectSuggestion = async (suggestion: PlaceSuggestion) => {
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    activeDetailsRequestRef.current = requestSequence;
    const querySnapshot = latestQueryRef.current;
    setIsSelectingPlace(true);
    onError?.(null);
    try {
      const details = await fetchPlaceDetails(suggestion.placeId, sessionToken);
      const shouldAccept = shouldAcceptAddressDetailsResponse({
        requestSequence,
        currentSequence: requestSequenceRef.current,
        querySnapshot,
        currentQuery: latestQueryRef.current,
        isMounted: mountedRef.current,
      });
      if (!shouldAccept) {
        return;
      }
      const nextSelected = toSelectedAddress(details);
      activeDetailsRequestRef.current = null;
      onSelectedAddressChange(nextSelected);
      onQueryChange(nextSelected.formattedAddress);
      clearSuggestions();
      resetSessionToken();
    } catch (selectionError) {
      const shouldAccept = shouldAcceptAddressDetailsResponse({
        requestSequence,
        currentSequence: requestSequenceRef.current,
        querySnapshot,
        currentQuery: latestQueryRef.current,
        isMounted: mountedRef.current,
      });
      if (!shouldAccept) {
        return;
      }
      activeDetailsRequestRef.current = null;
      onSelectedAddressChange(null);
      onError?.(toErrorMessage(selectionError));
    } finally {
      if (
        mountedRef.current &&
        activeDetailsRequestRef.current === requestSequence
      ) {
        activeDetailsRequestRef.current = null;
        setIsSelectingPlace(false);
      } else if (
        mountedRef.current &&
        activeDetailsRequestRef.current === null
      ) {
        setIsSelectingPlace(false);
      }
    }
  };

  const coordinates =
    correctionDraft ??
    (selectedAddress
      ? {
          latitude: selectedAddress.latitude,
          longitude: selectedAddress.longitude,
        }
      : null);
  const selectedRegion: Region | null = coordinates
    ? {
        ...coordinates,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : null;
  const hasValidSelection = isValidSelectedBusinessAddress(selectedAddress);
  const showNoSuggestions =
    searchQuery.length >= 2 &&
    !isSuggestionsLoading &&
    suggestions.length === 0 &&
    !autocompleteError;

  const startCorrection = () => {
    if (!selectedAddress) {
      return;
    }
    setCorrectionDraft({
      latitude: selectedAddress.latitude,
      longitude: selectedAddress.longitude,
    });
    setIsCorrectionMode(true);
  };

  const cancelCorrection = () => {
    setCorrectionDraft(null);
    setIsCorrectionMode(false);
  };

  const confirmCorrection = () => {
    if (!selectedAddress || !correctionDraft) {
      return;
    }
    onSelectedAddressChange(
      applyManualCoordinateCorrection(selectedAddress, correctionDraft)
    );
    setIsCorrectionMode(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          value={query}
          onChangeText={handleQueryChange}
          editable={!disabled}
          placeholder={placeholder}
          placeholderTextColor="#9EA7B8"
          style={styles.input}
          autoCapitalize="words"
          autoCorrect={false}
          textAlign="right"
          accessibilityLabel={label}
        />
      </View>

      {isSuggestionsLoading || isSelectingPlace ? (
        <View style={styles.inlineStatusRow}>
          <ActivityIndicator color="#2563EB" />
          <Text style={styles.inlineStatusText}>
            {isSelectingPlace ? TEXT.loadingPlace : TEXT.loadingSuggestions}
          </Text>
        </View>
      ) : null}

      {autocompleteError ? (
        <Text style={styles.helperErrorText}>
          {toErrorMessage(new Error(autocompleteError))}
        </Text>
      ) : null}

      {errorText ? <Text style={styles.helperErrorText}>{errorText}</Text> : null}

      {showNoSuggestions ? (
        <Text style={styles.helperText}>{TEXT.noSuggestions}</Text>
      ) : null}

      {suggestions.length > 0 ? (
        <View style={styles.suggestionsCard}>
          {suggestions.map((suggestion) => (
            <SuggestionRow
              key={suggestion.placeId}
              suggestion={suggestion}
              onPress={() => {
                void handleSelectSuggestion(suggestion);
              }}
            />
          ))}
          <Text style={styles.googleAttribution}>{TEXT.googleAttribution}</Text>
        </View>
      ) : null}

      {hasValidSelection && selectedAddress && selectedRegion ? (
        <View style={styles.previewSection}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewLabel}>{TEXT.selectedAddress}</Text>
            <Text style={styles.previewValue}>
              {selectedAddress.formattedAddress}
            </Text>
          </View>

          <View style={styles.previewMetaRow}>
            <Text style={styles.previewMetaText}>
              {selectedAddress.city || TEXT.cityFallback}
            </Text>
            <Text style={styles.previewMetaText}>
              {selectedAddress.street || TEXT.streetFallback}
            </Text>
            <Text style={styles.previewMetaNumber}>
              {selectedAddress.streetNumber || '-'}
            </Text>
          </View>

          {selectedAddress.manuallyAdjusted ? (
            <Text style={styles.helperText}>{TEXT.adjustedPin}</Text>
          ) : null}

          <View style={styles.mapBlock}>
            <Text style={styles.label}>{TEXT.mapLabel}</Text>
            <View style={styles.mapShell}>
              {CAN_RENDER_NATIVE_MAP ? (
                <MapView
                  style={styles.map}
                  pointerEvents={isCorrectionMode ? 'auto' : 'none'}
                  region={selectedRegion}
                  onPress={(event) => {
                    if (!isCorrectionMode) {
                      return;
                    }
                    setCorrectionDraft(event.nativeEvent.coordinate);
                  }}
                >
                  {coordinates ? <Marker coordinate={coordinates} /> : null}
                </MapView>
              ) : (
                <View style={styles.mapFallback}>
                  <Text style={styles.mapFallbackTitle}>
                    {TEXT.mapUnavailableTitle}
                  </Text>
                  <Text style={styles.mapFallbackSubtitle}>
                    {TEXT.mapUnavailableSubtitle}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {isCorrectionMode ? (
            <View style={styles.correctionPanel}>
              <Text style={styles.helperText}>{TEXT.correctionMode}</Text>
              <View style={styles.correctionActions}>
                <Pressable
                  onPress={cancelCorrection}
                  style={[styles.secondaryButton, styles.actionButton]}
                >
                  <Text style={styles.secondaryButtonText}>
                    {TEXT.cancelCorrection}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={confirmCorrection}
                  style={[styles.primaryButton, styles.actionButton]}
                >
                  <Text style={styles.primaryButtonText}>
                    {TEXT.confirmCorrection}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : CAN_RENDER_NATIVE_MAP ? (
            <Pressable
              onPress={startCorrection}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {TEXT.manualCorrection}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  inlineStatusRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
  },
  inlineStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  helperText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  helperErrorText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  suggestionsCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  suggestionTextWrap: {
    alignItems: alignItems.start,
  },
  suggestionPrimary: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  suggestionSecondary: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  googleAttribution: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'left',
  },
  previewSection: {
    gap: 12,
  },
  previewHeader: {
    gap: 6,
    alignItems: alignItems.start,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  previewValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  previewMetaRow: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 8,
  },
  previewMetaText: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#E8EEF9',
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  previewMetaNumber: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#E8EEF9',
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  mapBlock: {
    gap: 8,
  },
  mapShell: {
    height: 220,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  map: {
    flex: 1,
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 18,
    gap: 8,
  },
  mapFallbackTitle: {
    width: '100%',
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  mapFallbackSubtitle: {
    width: '100%',
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
  },
  correctionPanel: {
    gap: 10,
  },
  correctionActions: {
    flexDirection: flexDirection.row,
    gap: 8,
  },
  actionButton: {
    flex: 1,
  },
  primaryButton: {
    borderRadius: 999,
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  secondaryButton: {
    alignSelf: selfStart,
    borderRadius: 999,
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pressed: {
    opacity: 0.88,
  },
});
