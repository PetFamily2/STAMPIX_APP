import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type Ref,
  type RefObject,
} from 'react';
import {
  ActivityIndicator,
  findNodeHandle,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useGoogleAddressResolution } from '@/hooks/useGoogleAddressResolution';
import { useGooglePlaceAutocomplete } from '@/hooks/useGooglePlaceAutocomplete';
import {
  createBusinessAddressSelectionState,
  editBusinessAddressCity,
  editBusinessAddressHouseNumber,
  editBusinessAddressStreet,
  getCitySelectionKey,
  getStreetSelectionKey,
  isAddressResolutionReady,
  isValidHouseNumber,
  normalizeHouseNumber,
  resolveBusinessAddressGuideTarget,
  selectBusinessAddressCity,
  selectBusinessAddressStreet,
  shouldAcceptAddressResolutionResponse,
  type BusinessAddressSelectionState,
  type SelectedBusinessAddress,
} from '@/lib/businessAddressSelection';
import type { PlaceSuggestion } from '@/lib/googlePlaces';
import { alignItems, flexDirection, ltrIslandText } from '@/lib/rtl';

const TEXT = {
  label: 'כתובת העסק',
  city: 'עיר',
  cityPlaceholder: 'הקלידו עיר',
  street: 'רחוב',
  streetPlaceholder: 'הקלידו רחוב',
  houseNumber: 'מספר בית',
  houseNumberPlaceholder: 'לדוגמה: 12, 12א או 12/1',
  loadingSuggestions: 'מחפשים הצעות...',
  resolvingAddress: 'בודקים את הכתובת...',
  noSuggestions: 'לא נמצאו תוצאות מתאימות. נסו ניסוח מדויק יותר.',
  selectedAddress: 'הכתובת שנבחרה',
  existingAddress: 'הכתובת הקיימת',
  chooseCandidate: 'נמצאו כמה כתובות מתאימות. בחרו את הכתובת הנכונה:',
  invalidHouseNumber:
    'מספר הבית חייב לכלול ספרה ועד 16 תווים: אותיות, רווח, מקף או לוכסן.',
  autocompleteFailed: 'לא הצלחנו לטעון הצעות כתובת. נסו שוב.',
  notFound:
    'לא הצלחנו לאתר את הכתובת. בדקו את העיר, הרחוב ומספר הבית.',
  serviceFailure:
    'לא ניתן לבדוק את הכתובת כרגע. נסו שוב בעוד מספר רגעים.',
  googleAttribution: 'Google Maps',
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
  scrollViewRef?: RefObject<ScrollView | null>;
  guideTargetRef?: Ref<View>;
  guideFocusTargetRef?: MutableRefObject<(() => void) | null>;
};

type AddressField = 'city' | 'street' | 'houseNumber';

function toAutocompleteErrorMessage(error: string) {
  if (error === 'PLACES_RATE_LIMITED') {
    return TEXT.autocompleteFailed;
  }
  return TEXT.autocompleteFailed;
}

function toResolutionErrorMessage(error: string) {
  if (error === 'ADDRESS_NOT_FOUND') {
    return TEXT.notFound;
  }
  if (error === 'PLACES_RATE_LIMITED') {
    return TEXT.autocompleteFailed;
  }
  return TEXT.serviceFailure;
}

function limitHouseNumberInput(value: string) {
  if (value.trim().length <= 16) {
    return value;
  }
  return value.trim().slice(0, 16);
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

function GoogleAttribution() {
  return (
    <Text numberOfLines={1} style={styles.googleAttribution}>
      {TEXT.googleAttribution}
    </Text>
  );
}

function AutocompleteResults({
  suggestions,
  onSelect,
}: {
  suggestions: PlaceSuggestion[];
  onSelect: (suggestion: PlaceSuggestion) => void;
}) {
  return (
    <View style={styles.suggestionsCard}>
      <ScrollView
        style={styles.suggestionsScroll}
        contentContainerStyle={styles.suggestionsContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator={suggestions.length >= 5}
      >
        {suggestions.slice(0, 5).map((suggestion) => (
          <SuggestionRow
            key={suggestion.placeId}
            suggestion={suggestion}
            onPress={() => onSelect(suggestion)}
          />
        ))}
      </ScrollView>
      <GoogleAttribution />
    </View>
  );
}

export default function BusinessAddressSelector({
  query,
  selectedAddress,
  onQueryChange,
  onSelectedAddressChange,
  disabled,
  label = TEXT.label,
  placeholder = TEXT.cityPlaceholder,
  errorText,
  onError,
  scrollViewRef,
  guideTargetRef,
  guideFocusTargetRef,
}: BusinessAddressSelectorProps) {
  const [state, setState] = useState<BusinessAddressSelectionState>(() =>
    createBusinessAddressSelectionState(selectedAddress)
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const cityInputRef = useRef<TextInput>(null);
  const streetInputRef = useRef<TextInput>(null);
  const houseNumberInputRef = useRef<TextInput>(null);
  const activeFieldRef = useRef<AddressField | null>(null);
  const mountedRef = useRef(false);
  const resolutionGenerationRef = useRef(0);
  const resolveAddress = useGoogleAddressResolution();
  const citySearchQuery = state.citySelection ? '' : state.cityText;
  const streetSearchQuery = state.streetSelection ? '' : state.streetText;
  const cityAutocomplete = useGooglePlaceAutocomplete(citySearchQuery, {
    mode: 'city',
  });
  const streetAutocomplete = useGooglePlaceAutocomplete(streetSearchQuery, {
    mode: 'street',
    selectedCity: state.citySelection
      ? { displayName: state.citySelection.displayName }
      : null,
  });

  const requestFieldVisibility = (field: AddressField) => {
    const input =
      field === 'city'
        ? cityInputRef.current
        : field === 'street'
          ? streetInputRef.current
          : houseNumberInputRef.current;
    const nodeHandle = findNodeHandle(input);
    if (nodeHandle === null) {
      return;
    }
    const resultCount =
      field === 'city'
        ? cityAutocomplete.suggestions.length
        : field === 'street'
          ? streetAutocomplete.suggestions.length
          : 0;
    const additionalOffset =
      resultCount > 0 ? Math.min(resultCount, 5) * 64 + 56 : 56;
    scrollViewRef?.current?.scrollResponderScrollNativeHandleToKeyboard(
      nodeHandle,
      additionalOffset,
      true
    );
  };

  useEffect(() => {
    const activeField = activeFieldRef.current;
    const hasActiveResults =
      (activeField === 'city' && cityAutocomplete.suggestions.length > 0) ||
      (activeField === 'street' && streetAutocomplete.suggestions.length > 0);
    if (!activeField || !hasActiveResults) {
      return;
    }
    const timeoutId = setTimeout(() => {
      requestFieldVisibility(activeField);
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [
    cityAutocomplete.suggestions.length,
    streetAutocomplete.suggestions.length,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      resolutionGenerationRef.current += 1;
    };
  }, []);

  const invalidateCanonicalAddress = () => {
    resolutionGenerationRef.current += 1;
    onSelectedAddressChange(null);
    onQueryChange('');
    onError?.(null);
  };

  const acceptResolvedAddress = (address: SelectedBusinessAddress) => {
    setState((current) => ({
      ...current,
      cityText: address.city,
      streetText: address.street,
      houseNumber: address.streetNumber,
      resolvedAddress: address,
      candidates: [],
      status: 'resolved',
      error: null,
    }));
    onSelectedAddressChange(address);
    onQueryChange(address.formattedAddress);
    onError?.(null);
  };

  const beginResolution = async () => {
    const snapshot = stateRef.current;
    if (
      !isAddressResolutionReady(snapshot) ||
      snapshot.status === 'resolving' ||
      disabled
    ) {
      return;
    }

    const requestGeneration = resolutionGenerationRef.current + 1;
    resolutionGenerationRef.current = requestGeneration;
    const cityKey = getCitySelectionKey(snapshot.citySelection);
    const streetKey = getStreetSelectionKey(snapshot.streetSelection);
    const streetNumber = normalizeHouseNumber(snapshot.houseNumber);
    setState((current) => ({
      ...current,
      status: 'resolving',
      error: null,
      candidates: [],
    }));
    onError?.(null);

    try {
      const result = await resolveAddress({
        city: snapshot.citySelection!.displayName,
        street: snapshot.streetSelection!.displayName,
        streetNumber,
      });
      const current = stateRef.current;
      if (
        !shouldAcceptAddressResolutionResponse({
          requestGeneration,
          currentGeneration: resolutionGenerationRef.current,
          cityKey,
          currentCityKey: getCitySelectionKey(current.citySelection),
          streetKey,
          currentStreetKey: getStreetSelectionKey(current.streetSelection),
          streetNumber,
          currentStreetNumber: current.houseNumber,
          isMounted: mountedRef.current,
        })
      ) {
        return;
      }

      if (result.status === 'resolved') {
        acceptResolvedAddress(result.address);
        return;
      }
      if (result.status === 'ambiguous') {
        setState((latest) => ({
          ...latest,
          candidates: result.candidates.slice(0, 3),
          resolvedAddress: null,
          status: 'ambiguous',
          error: null,
        }));
        return;
      }

      setState((latest) => ({
        ...latest,
        resolvedAddress: null,
        candidates: [],
        status: 'error',
        error: 'ADDRESS_NOT_FOUND',
      }));
      onError?.(TEXT.notFound);
    } catch (resolutionError) {
      const current = stateRef.current;
      if (
        !shouldAcceptAddressResolutionResponse({
          requestGeneration,
          currentGeneration: resolutionGenerationRef.current,
          cityKey,
          currentCityKey: getCitySelectionKey(current.citySelection),
          streetKey,
          currentStreetKey: getStreetSelectionKey(current.streetSelection),
          streetNumber,
          currentStreetNumber: current.houseNumber,
          isMounted: mountedRef.current,
        })
      ) {
        return;
      }
      const code =
        resolutionError instanceof Error
          ? resolutionError.message
          : 'PLACES_SERVICE_UNAVAILABLE';
      const message = toResolutionErrorMessage(code);
      setState((latest) => ({
        ...latest,
        resolvedAddress: null,
        candidates: [],
        status: 'error',
        error: code,
      }));
      onError?.(message);
    }
  };

  useEffect(() => {
    if (state.status !== 'idle' || !isAddressResolutionReady(state) || disabled) {
      return;
    }
    const timeoutId = setTimeout(() => {
      void beginResolution();
    }, 650);
    return () => clearTimeout(timeoutId);
  }, [
    disabled,
    state.citySelection,
    state.houseNumber,
    state.status,
    state.streetSelection,
  ]);

  const handleCityChange = (value: string) => {
    invalidateCanonicalAddress();
    streetAutocomplete.clearSuggestions();
    setState((current) => editBusinessAddressCity(current, value));
  };

  const handleSelectCity = (suggestion: PlaceSuggestion) => {
    invalidateCanonicalAddress();
    cityAutocomplete.clearSuggestions();
    streetAutocomplete.clearSuggestions();
    setState((current) =>
      selectBusinessAddressCity(current, {
        displayName: suggestion.primaryText,
        placeId: suggestion.placeId,
      })
    );
    setTimeout(() => streetInputRef.current?.focus(), 0);
  };

  const handleStreetChange = (value: string) => {
    invalidateCanonicalAddress();
    setState((current) => editBusinessAddressStreet(current, value));
  };

  const handleSelectStreet = (suggestion: PlaceSuggestion) => {
    invalidateCanonicalAddress();
    streetAutocomplete.clearSuggestions();
    setState((current) =>
      selectBusinessAddressStreet(current, {
        displayName: suggestion.primaryText,
        placeId: suggestion.placeId,
      })
    );
    setTimeout(() => houseNumberInputRef.current?.focus(), 0);
  };

  const handleHouseNumberChange = (value: string) => {
    invalidateCanonicalAddress();
    setState((current) =>
      editBusinessAddressHouseNumber(current, limitHouseNumberInput(value))
    );
  };

  const showCityNoSuggestions =
    citySearchQuery.trim().length >= 2 &&
    !cityAutocomplete.isLoading &&
    cityAutocomplete.suggestions.length === 0 &&
    !cityAutocomplete.error;
  const showStreetNoSuggestions =
    streetSearchQuery.trim().length >= 2 &&
    !streetAutocomplete.isLoading &&
    streetAutocomplete.suggestions.length === 0 &&
    !streetAutocomplete.error;
  const showInvalidHouseNumber =
    state.houseNumber.trim().length > 0 &&
    !isValidHouseNumber(state.houseNumber);
  const legacyAddress =
    !state.resolvedAddress &&
    query.trim() &&
    !state.cityText.trim() &&
    !state.streetText.trim() &&
    !state.houseNumber.trim()
      ? query.trim()
      : '';
  const guideTarget = resolveBusinessAddressGuideTarget(state);
  if (guideFocusTargetRef) {
    guideFocusTargetRef.current =
      guideTarget === 'city'
        ? () => cityInputRef.current?.focus()
        : guideTarget === 'street'
          ? () => streetInputRef.current?.focus()
          : guideTarget === 'houseNumber'
            ? () => houseNumberInputRef.current?.focus()
            : null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.groupLabel}>{label}</Text>

      {legacyAddress ? (
        <View style={styles.readOnlyCard}>
          <Text style={styles.previewLabel}>{TEXT.existingAddress}</Text>
          <Text style={styles.previewValue}>{legacyAddress}</Text>
        </View>
      ) : null}

      <View
        ref={
          guideTarget === 'city'
            ? guideTargetRef
            : undefined
        }
        collapsable={false}
        style={styles.field}
      >
        <Text style={styles.label}>{TEXT.city}</Text>
        <TextInput
          ref={cityInputRef}
          value={state.cityText}
          onChangeText={handleCityChange}
          onFocus={() => {
            activeFieldRef.current = 'city';
            requestFieldVisibility('city');
          }}
          editable={!disabled}
          placeholder={placeholder}
          placeholderTextColor="#9EA7B8"
          style={[styles.input, disabled ? styles.inputDisabled : null]}
          autoCapitalize="words"
          autoCorrect={false}
          textAlign="right"
          accessibilityLabel={TEXT.city}
        />
      </View>

      {cityAutocomplete.isLoading ? (
        <View style={styles.inlineStatusRow}>
          <ActivityIndicator color="#2563EB" />
          <Text style={styles.inlineStatusText}>{TEXT.loadingSuggestions}</Text>
        </View>
      ) : null}
      {cityAutocomplete.error ? (
        <Text style={styles.helperErrorText}>
          {toAutocompleteErrorMessage(cityAutocomplete.error)}
        </Text>
      ) : null}
      {showCityNoSuggestions ? (
        <Text style={styles.helperText}>{TEXT.noSuggestions}</Text>
      ) : null}
      {cityAutocomplete.suggestions.length > 0 ? (
        <AutocompleteResults
          suggestions={cityAutocomplete.suggestions}
          onSelect={handleSelectCity}
        />
      ) : null}

      <View
        ref={
          guideTarget === 'street'
            ? guideTargetRef
            : undefined
        }
        collapsable={false}
        style={styles.field}
      >
        <Text style={styles.label}>{TEXT.street}</Text>
        <TextInput
          ref={streetInputRef}
          value={state.streetText}
          onChangeText={handleStreetChange}
          onFocus={() => {
            activeFieldRef.current = 'street';
            requestFieldVisibility('street');
          }}
          editable={!disabled && Boolean(state.citySelection)}
          placeholder={TEXT.streetPlaceholder}
          placeholderTextColor="#9EA7B8"
          style={[
            styles.input,
            disabled || !state.citySelection ? styles.inputDisabled : null,
          ]}
          autoCapitalize="words"
          autoCorrect={false}
          textAlign="right"
          accessibilityLabel={TEXT.street}
        />
      </View>

      {streetAutocomplete.isLoading ? (
        <View style={styles.inlineStatusRow}>
          <ActivityIndicator color="#2563EB" />
          <Text style={styles.inlineStatusText}>{TEXT.loadingSuggestions}</Text>
        </View>
      ) : null}
      {streetAutocomplete.error ? (
        <Text style={styles.helperErrorText}>
          {toAutocompleteErrorMessage(streetAutocomplete.error)}
        </Text>
      ) : null}
      {showStreetNoSuggestions ? (
        <Text style={styles.helperText}>{TEXT.noSuggestions}</Text>
      ) : null}
      {streetAutocomplete.suggestions.length > 0 ? (
        <AutocompleteResults
          suggestions={streetAutocomplete.suggestions}
          onSelect={handleSelectStreet}
        />
      ) : null}

      <View
        ref={
          guideTarget === 'houseNumber'
            ? guideTargetRef
            : undefined
        }
        collapsable={false}
        style={styles.field}
      >
        <Text style={styles.label}>{TEXT.houseNumber}</Text>
        <TextInput
          ref={houseNumberInputRef}
          value={state.houseNumber}
          onChangeText={handleHouseNumberChange}
          onFocus={() => {
            activeFieldRef.current = 'houseNumber';
            requestFieldVisibility('houseNumber');
          }}
          onSubmitEditing={() => {
            void beginResolution();
          }}
          editable={!disabled && Boolean(state.streetSelection)}
          placeholder={TEXT.houseNumberPlaceholder}
          placeholderTextColor="#9EA7B8"
          style={[
            styles.input,
            disabled || !state.streetSelection ? styles.inputDisabled : null,
          ]}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
          returnKeyType="done"
          textAlign="right"
          accessibilityLabel={TEXT.houseNumber}
        />
      </View>

      {showInvalidHouseNumber ? (
        <Text style={styles.helperErrorText}>{TEXT.invalidHouseNumber}</Text>
      ) : null}

      {state.status === 'resolving' ? (
        <View style={styles.inlineStatusRow}>
          <ActivityIndicator color="#2563EB" />
          <Text style={styles.inlineStatusText}>{TEXT.resolvingAddress}</Text>
        </View>
      ) : null}

      {state.status === 'ambiguous' && state.candidates.length > 0 ? (
        <View
          ref={guideTarget === 'confirm' ? guideTargetRef : undefined}
          collapsable={false}
          style={styles.candidateSection}
        >
          <Text style={styles.helperText}>{TEXT.chooseCandidate}</Text>
          <View style={styles.suggestionsCard}>
            {state.candidates.slice(0, 3).map((candidate) => (
              <Pressable
                key={candidate.placeId}
                onPress={() => acceptResolvedAddress(candidate)}
                style={({ pressed }) => [
                  styles.suggestionRow,
                  pressed ? styles.pressed : null,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.suggestionPrimary}>
                  {candidate.formattedAddress}
                </Text>
              </Pressable>
            ))}
            <GoogleAttribution />
          </View>
        </View>
      ) : null}

      {errorText || (state.status === 'error' && state.error) ? (
        <Text style={styles.helperErrorText}>
          {errorText ?? toResolutionErrorMessage(state.error ?? '')}
        </Text>
      ) : null}

      {state.status === 'resolved' && state.resolvedAddress ? (
        <View style={styles.readOnlyCard}>
          <Text style={styles.previewLabel}>{TEXT.selectedAddress}</Text>
          <Text style={styles.previewValue}>
            {state.resolvedAddress.formattedAddress}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  groupLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
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
  inputDisabled: {
    backgroundColor: '#F3F4F6',
    color: '#9CA3AF',
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
  },
  suggestionsScroll: {
    maxHeight: 320,
  },
  suggestionsContent: {
    flexGrow: 0,
  },
  suggestionRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
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
    ...ltrIslandText,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '400',
    color: '#5E5E5E',
  },
  candidateSection: {
    gap: 8,
  },
  readOnlyCard: {
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE5F5',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  pressed: {
    opacity: 0.88,
  },
});
