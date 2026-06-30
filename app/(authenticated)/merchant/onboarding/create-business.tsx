import { useMutation } from 'convex/react';
import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { useGooglePlaceAutocomplete } from '@/hooks/useGooglePlaceAutocomplete';
import { trackActivationEvent } from '@/lib/analytics/activation';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import {
  consumePendingJoin,
  savePendingJoin,
} from '@/lib/deeplink/pendingJoin';
import { fetchPlaceDetails, type PlaceSuggestion } from '@/lib/googlePlaces';
import { safeDismissTo, safePush } from '@/lib/navigation';
import {
  BUSINESS_ONBOARDING_ROUTES,
  getBusinessOnboardingProgressStep,
  getBusinessOnboardingTotalSteps,
  isAdditionalBusinessFlow,
  withBusinessOnboardingFlow,
} from '@/lib/onboarding/businessOnboardingFlow';
import { useBusinessOnboardingDraftPersistence } from '@/lib/onboarding/useBusinessOnboardingDraftPersistence';
import { alignItems, flexDirection, selfStart } from '@/lib/rtl';

const DEFAULT_MANUAL_REGION: Region = {
  latitude: 32.0853,
  longitude: 34.7818,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const TEXT = {
  title: 'מה הכתובת של העסק?',
  subtitle: 'בחרו כתובת אמיתית מרשימת ההצעות ואשרו את המיקום על המפה',
  searchLabel: 'חיפוש כתובת',
  searchPlaceholder: 'התחילו להקליד כתובת מלאה',
  selectedAddressLabel: 'הכתובת שנבחרה',
  mapLabel: 'תצוגת מפה',
  continue: 'אישור כתובת והמשך',
  createBusiness: 'שומרים עסק',
  updateBusiness: 'מעדכנים כתובת',
  loadingSuggestions: 'מחפשים כתובות...',
  loadingPlace: 'טוענים כתובת...',
  resolvingManualAddress: 'מאתרים כתובת לפי הטקסט שהוזן...',
  noSuggestions: 'לא נמצאו כתובות תואמות. נסו להקליד כתובת מדויקת יותר.',
  manualAddressCta: 'איתור כתובת לפי הטקסט שהוזן',
  addressRequired: 'יש לבחור כתובת מתוך רשימת ההצעות לפני ההמשך.',
  manualAddressResolutionError:
    'לא הצלחנו לאתר את הכתובת הזו. נסו להזין כתובת מלאה יותר כולל עיר.',
  manualPinTitle: 'אם הכתובת לא מאותרת, אפשר לנעוץ את המיקום ידנית על המפה',
  manualPinSubtitle: 'הקלידו כתובת, לחצו על המפה במיקום המדויק, ואז אשרו.',
  manualPinCta: 'אשור כתובת ידנית על המפה',
  manualPinRequired: 'כדי להמשיך, הקלידו כתובת ובחרו מיקום על המפה.',
  googleKeyMissing:
    'חיפוש הכתובת לא זמין כרגע. אפשר להזין את הכתובת ידנית ולהמשיך.',
  autocompleteError: 'לא הצלחנו לטעון הצעות כתובת. נסו שוב.',
  placeDetailsError: 'לא הצלחנו לטעון את פרטי הכתובת. נסו לבחור שוב.',
  createError: 'שגיאה ביצירת העסק',
  updateError: 'שגיאה בעדכון כתובת העסק',
  cityFallback: 'ללא עיר',
  streetFallback: 'ללא רחוב',
  mapUnavailableTitle: 'המפה לא זמינה בתצוגה הזו',
  mapUnavailableSubtitle:
    'בתצוגה המקדימה הזו אפשר להמשיך עם כתובת שנבחרה או לאתר כתובת לפי הטקסט שהוזן.',
};

const HAS_GOOGLE_MAPS_API_KEY = Boolean(
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
);
const CAN_RENDER_NATIVE_MAP =
  Platform.OS !== 'android' || HAS_GOOGLE_MAPS_API_KEY;

const CREATE_BUSINESS_COPY = {
  title: 'יצירת העסק',
  subtitle: 'שם העסק והכתובת שבה הלקוחות ימצאו אותך.',
  businessNameLabel: 'שם העסק',
  businessNamePlaceholder: 'לדוגמה: קפה השכונה',
  searchLabel: 'כתובת העסק',
  continue: 'שמירה והמשך לכרטיסייה',
  businessNameRequired: 'יש להזין שם עסק לפני שממשיכים.',
};

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    switch (error.message) {
      case 'GOOGLE_MAPS_API_KEY_MISSING':
        return TEXT.googleKeyMissing;
      case 'PLACES_AUTOCOMPLETE_REQUEST_FAILED':
      case 'PLACES_AUTOCOMPLETE_FAILED':
        return TEXT.autocompleteError;
      case 'PLACE_DETAILS_REQUEST_FAILED':
      case 'PLACE_DETAILS_INCOMPLETE':
      case 'PLACE_ID_REQUIRED':
        return TEXT.placeDetailsError;
      default:
        return fallback;
    }
  }

  return fallback;
}

function normalizeManualAddressText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function parseManualAddressText(value: string) {
  const normalizedValue = normalizeManualAddressText(value);
  if (!normalizedValue) {
    return {
      formattedAddress: '',
      city: '',
      street: '',
      streetNumber: '',
    };
  }

  const commaSeparatedParts = normalizedValue
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (commaSeparatedParts.length >= 2) {
    const streetLine = commaSeparatedParts[0] ?? '';
    const city = commaSeparatedParts.slice(1).join(', ').trim();
    const streetNumberMatch = streetLine.match(
      /(\d+[A-Za-z\u0590-\u05FF\-/]*)\s*$/
    );
    const streetNumber = streetNumberMatch?.[1]?.trim() ?? '';
    const street = streetNumber
      ? streetLine.slice(0, streetLine.length - streetNumber.length).trim()
      : streetLine;

    return {
      formattedAddress: normalizedValue,
      city,
      street,
      streetNumber,
    };
  }

  const streetWithNumberAndCityMatch = normalizedValue.match(
    /^(.+?)\s+(\d+[A-Za-z\u0590-\u05FF\-/]*)\s+(.+)$/
  );

  if (streetWithNumberAndCityMatch) {
    const [, street = '', streetNumber = '', city = ''] =
      streetWithNumberAndCityMatch;
    return {
      formattedAddress: normalizedValue,
      city: city.trim(),
      street: street.trim(),
      streetNumber: streetNumber.trim(),
    };
  }

  const streetWithNumberMatch = normalizedValue.match(
    /^(.+?)\s+(\d+[A-Za-z\u0590-\u05FF\-/]*)$/
  );

  if (streetWithNumberMatch) {
    const [, street = '', streetNumber = ''] = streetWithNumberMatch;
    return {
      formattedAddress: normalizedValue,
      city: '',
      street: street.trim(),
      streetNumber: streetNumber.trim(),
    };
  }

  return {
    formattedAddress: normalizedValue,
    city: '',
    street: normalizedValue,
    streetNumber: '',
  };
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

export default function CreateBusinessScreen() {
  const {
    businessDraft,
    setBusinessDraft,
    businessId,
    setBusinessId,
    businessOnboardingDraft,
    setBusinessOnboardingDraft,
  } = useOnboarding();
  const { user } = useUser();
  const createBusiness = useMutation(api.business.createBusiness);
  const updateBusinessAddress = useMutation(api.business.updateBusinessAddress);
  const { saveStep } = useBusinessOnboardingDraftPersistence();
  const didSyncStepRef = useRef(false);
  const { businessName, flow, bref } = useLocalSearchParams<{
    businessName?: string;
    flow?: string;
    bref?: string;
  }>();
  const businessReferralCodeFromParams = useMemo(() => {
    const raw = typeof bref === 'string' ? bref.trim() : '';
    return raw.length > 0 ? raw : '';
  }, [bref]);
  const isAdditionalFlow = isAdditionalBusinessFlow(flow);
  const [businessReferralCode, setBusinessReferralCode] = useState(
    businessReferralCodeFromParams
  );

  const [addressQuery, setAddressQuery] = useState(
    businessOnboardingDraft.formattedAddress
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSelectingPlace, setIsSelectingPlace] = useState(false);
  const [isResolvingManualAddress, setIsResolvingManualAddress] =
    useState(false);
  const [manualMapRegion, setManualMapRegion] = useState(DEFAULT_MANUAL_REGION);
  const [manualMarker, setManualMarker] = useState<{
    latitude: number;
    longitude: number;
  } | null>(
    typeof businessOnboardingDraft.locationLat === 'number' &&
      typeof businessOnboardingDraft.locationLng === 'number'
      ? {
          latitude: businessOnboardingDraft.locationLat,
          longitude: businessOnboardingDraft.locationLng,
        }
      : null
  );

  const selectedAddress = businessOnboardingDraft.formattedAddress.trim();
  const searchQueryForAutocomplete =
    selectedAddress && addressQuery.trim() === selectedAddress
      ? ''
      : addressQuery;
  const {
    suggestions,
    isLoading: isSuggestionsLoading,
    error: autocompleteError,
    sessionToken,
    clearSuggestions,
    resetSessionToken,
  } = useGooglePlaceAutocomplete(searchQueryForAutocomplete);

  useEffect(() => {
    if (didSyncStepRef.current) {
      return;
    }
    didSyncStepRef.current = true;
    void saveStep({ step: 'createBusiness', flow }).catch(() => {});
  }, [flow, saveStep]);

  useEffect(() => {
    if (businessReferralCodeFromParams) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const pending = await consumePendingJoin();
      if (cancelled || !pending?.bref) {
        return;
      }
      setBusinessReferralCode(pending.bref);
      await savePendingJoin({
        bref: pending.bref,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [businessReferralCodeFromParams]);

  useEffect(() => {
    const fromDraft = businessOnboardingDraft.businessName.trim();
    const fromParams =
      typeof businessName === 'string' ? businessName.trim() : '';
    const normalizedBusinessName = fromDraft || fromParams;

    if (!normalizedBusinessName || businessDraft.name.trim().length > 0) {
      return;
    }

    setBusinessDraft((prev) => ({
      ...prev,
      name: normalizedBusinessName,
    }));

    if (!fromDraft) {
      setBusinessOnboardingDraft((prev) => ({
        ...prev,
        businessName: normalizedBusinessName,
      }));
    }
  }, [
    businessDraft.name,
    businessName,
    businessOnboardingDraft.businessName,
    setBusinessDraft,
    setBusinessOnboardingDraft,
  ]);

  const normalizedBusinessName = useMemo(
    () => businessDraft.name.trim(),
    [businessDraft.name]
  );

  const handleBusinessNameChange = (value: string) => {
    setError(null);
    setBusinessDraft((prev) => ({
      ...prev,
      name: value,
    }));
    setBusinessOnboardingDraft((prev) => ({
      ...prev,
      businessName: value,
    }));
  };

  const generatedExternalId = useMemo(() => {
    if (!normalizedBusinessName) {
      return '';
    }

    const slug = normalizedBusinessName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (slug.length > 0) {
      return slug;
    }

    return `business-${Date.now().toString(36)}`;
  }, [normalizedBusinessName]);

  const resolvedExternalId = useMemo(() => {
    const existingExternalId = businessDraft.externalId.trim();

    if (existingExternalId) {
      return existingExternalId;
    }

    return generatedExternalId;
  }, [businessDraft.externalId, generatedExternalId]);

  const latitude = businessOnboardingDraft.locationLat;
  const longitude = businessOnboardingDraft.locationLng;
  const hasValidatedAddress =
    businessOnboardingDraft.placeId.trim().length > 0 &&
    typeof latitude === 'number' &&
    typeof longitude === 'number';
  const canSubmit =
    Boolean(
      normalizedBusinessName && resolvedExternalId && hasValidatedAddress
    ) &&
    !isSubmitting &&
    !isSelectingPlace &&
    !isResolvingManualAddress;

  const clearSelectedAddress = () => {
    setBusinessOnboardingDraft((prev) => ({
      ...prev,
      formattedAddress: '',
      placeId: '',
      locationLat: null,
      locationLng: null,
      city: '',
      street: '',
      streetNumber: '',
    }));
    setManualMarker(null);
  };

  const handleAddressChange = (value: string) => {
    setAddressQuery(value);
    setError(null);

    if (
      businessOnboardingDraft.placeId.trim().length > 0 &&
      value.trim() !== selectedAddress
    ) {
      clearSelectedAddress();
    }
  };

  const handleSelectSuggestion = async (suggestion: PlaceSuggestion) => {
    try {
      setError(null);
      setIsSelectingPlace(true);

      const details = await fetchPlaceDetails(suggestion.placeId, sessionToken);

      setBusinessOnboardingDraft((prev) => ({
        ...prev,
        formattedAddress: details.formattedAddress,
        placeId: details.placeId,
        locationLat: details.lat,
        locationLng: details.lng,
        city: details.city,
        street: details.street,
        streetNumber: details.streetNumber,
      }));
      setAddressQuery(details.formattedAddress);
      clearSuggestions();
      resetSessionToken();
    } catch (selectionError) {
      setError(toErrorMessage(selectionError, TEXT.placeDetailsError));
    } finally {
      setIsSelectingPlace(false);
    }
  };

  const handleResolveManualAddress = async () => {
    const normalizedQuery = addressQuery.trim();
    if (normalizedQuery.length < 4) {
      setError(TEXT.manualAddressResolutionError);
      return;
    }

    try {
      setError(null);
      setIsResolvingManualAddress(true);

      const results = await Location.geocodeAsync(normalizedQuery);
      const firstResult = results[0];
      const parsedAddress = parseManualAddressText(normalizedQuery);

      if (
        !firstResult ||
        typeof firstResult.latitude !== 'number' ||
        typeof firstResult.longitude !== 'number'
      ) {
        throw new Error('MANUAL_ADDRESS_GEOCODE_FAILED');
      }

      const reverseResults = await Location.reverseGeocodeAsync({
        latitude: firstResult.latitude,
        longitude: firstResult.longitude,
      });
      const reverseResult = reverseResults[0];
      const city =
        reverseResult?.city?.trim() ||
        reverseResult?.subregion?.trim() ||
        reverseResult?.region?.trim() ||
        parsedAddress.city;
      const street = reverseResult?.street?.trim() || parsedAddress.street;
      const streetNumber =
        reverseResult?.streetNumber?.trim() || parsedAddress.streetNumber;
      const formattedAddress =
        parsedAddress.formattedAddress || normalizedQuery;

      setBusinessOnboardingDraft((prev) => ({
        ...prev,
        formattedAddress,
        placeId: `manual:${normalizedQuery.toLowerCase()}:${firstResult.latitude.toFixed(6)}:${firstResult.longitude.toFixed(6)}`,
        locationLat: firstResult.latitude,
        locationLng: firstResult.longitude,
        city,
        street,
        streetNumber,
      }));
      setAddressQuery(formattedAddress);
      clearSuggestions();
      resetSessionToken();
    } catch {
      setError(TEXT.manualAddressResolutionError);
    } finally {
      setIsResolvingManualAddress(false);
    }
  };

  const handleManualMapPress = (latitude: number, longitude: number) => {
    setError(null);
    setManualMarker({ latitude, longitude });
  };

  const handleConfirmManualPin = async () => {
    const normalizedQuery = addressQuery.trim();
    if (!normalizedQuery || !manualMarker) {
      setError(TEXT.manualPinRequired);
      return;
    }

    setError(null);

    const parsedAddress = parseManualAddressText(normalizedQuery);
    let city = '';
    let street = '';
    let streetNumber = '';
    try {
      const reverseResults = await Location.reverseGeocodeAsync({
        latitude: manualMarker.latitude,
        longitude: manualMarker.longitude,
      });
      const reverseResult = reverseResults[0];
      city =
        reverseResult?.city?.trim() ||
        reverseResult?.subregion?.trim() ||
        reverseResult?.region?.trim() ||
        parsedAddress.city;
      street = reverseResult?.street?.trim() || parsedAddress.street;
      streetNumber =
        reverseResult?.streetNumber?.trim() || parsedAddress.streetNumber;
    } catch {
      city = parsedAddress.city;
      street = parsedAddress.street;
      streetNumber = parsedAddress.streetNumber;
    }

    setBusinessOnboardingDraft((prev) => ({
      ...prev,
      formattedAddress: parsedAddress.formattedAddress || normalizedQuery,
      placeId: `manual:${normalizedQuery.toLowerCase()}:${manualMarker.latitude.toFixed(6)}:${manualMarker.longitude.toFixed(6)}`,
      locationLat: manualMarker.latitude,
      locationLng: manualMarker.longitude,
      city,
      street,
      streetNumber,
    }));
  };

  useEffect(() => {
    if (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      !Number.isNaN(latitude) &&
      !Number.isNaN(longitude)
    ) {
      setManualMapRegion((prev) => ({
        ...prev,
        latitude,
        longitude,
      }));
      setManualMarker({ latitude, longitude });
    }
  }, [latitude, longitude]);

  const handleSubmit = async () => {
    if (
      !canSubmit ||
      typeof latitude !== 'number' ||
      typeof longitude !== 'number'
    ) {
      setError(
        normalizedBusinessName
          ? TEXT.addressRequired
          : CREATE_BUSINESS_COPY.businessNameRequired
      );
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const addressPayload = {
      formattedAddress: businessOnboardingDraft.formattedAddress.trim(),
      placeId: businessOnboardingDraft.placeId.trim(),
      lat: latitude,
      lng: longitude,
      city: businessOnboardingDraft.city.trim(),
      street: businessOnboardingDraft.street.trim(),
      streetNumber: businessOnboardingDraft.streetNumber.trim(),
    };

    try {
      if (!businessDraft.externalId.trim()) {
        setBusinessDraft((prev) => ({
          ...prev,
          externalId: resolvedExternalId,
        }));
      }

      if (businessId) {
        await updateBusinessAddress({
          businessId,
          ...addressPayload,
        });
        try {
          await saveStep({ step: 'createBusiness', flow });
        } catch {
          // Keep onboarding moving even if draft persistence fails.
        }
        safePush(
          withBusinessOnboardingFlow(
            BUSINESS_ONBOARDING_ROUTES.createProgram,
            flow
          )
        );
        return;
      }

      const result = await createBusiness({
        name: normalizedBusinessName,
        externalId: resolvedExternalId,
        logoUrl: businessDraft.logoUrl,
        colors: businessDraft.colors,
        businessReferralCode: businessReferralCode || undefined,
        ...addressPayload,
      });

      setBusinessId(result.businessId);
      try {
        await saveStep({ step: 'createBusiness', flow });
      } catch {
        // Keep onboarding moving even if draft persistence fails.
      }
      void trackActivationEvent(ANALYTICS_EVENTS.businessCreated, {
        role: 'business',
        userId: user?._id,
      });
      safePush(
        withBusinessOnboardingFlow(BUSINESS_ONBOARDING_ROUTES.createProgram, flow)
      );
    } catch (submitError) {
      setError(
        toErrorMessage(
          submitError,
          businessId ? TEXT.updateError : TEXT.createError
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const showNoSuggestions =
    searchQueryForAutocomplete.trim().length >= 2 &&
    !isSuggestionsLoading &&
    suggestions.length === 0 &&
    !autocompleteError;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() =>
              safeDismissTo(
                withBusinessOnboardingFlow(
                  isAdditionalFlow
                    ? '/(authenticated)/(business)/settings'
                    : BUSINESS_ONBOARDING_ROUTES.role,
                  flow
                )
              )
            }
          />
          <OnboardingProgress
            total={getBusinessOnboardingTotalSteps(flow)}
            current={getBusinessOnboardingProgressStep('createBusiness', flow)}
          />
        </View>

        <ScrollView
          stickyHeaderIndices={[0]}
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          <StickyScrollHeader
            topPadding={0}
            backgroundColor="#FBFAF7"
            style={styles.titleContainer}
          >
            <Text style={styles.title}>{CREATE_BUSINESS_COPY.title}</Text>
            <Text style={styles.subtitle}>{CREATE_BUSINESS_COPY.subtitle}</Text>
          </StickyScrollHeader>

          <View style={styles.searchSection}>
            <Text style={styles.label}>
              {CREATE_BUSINESS_COPY.businessNameLabel}
            </Text>
            <TextInput
              value={businessDraft.name}
              onChangeText={handleBusinessNameChange}
              placeholder={CREATE_BUSINESS_COPY.businessNamePlaceholder}
              placeholderTextColor="#9EA7B8"
              style={styles.input}
              autoCapitalize="words"
              textAlign="right"
              accessibilityLabel={CREATE_BUSINESS_COPY.businessNameLabel}
            />
          </View>

          <View style={styles.searchSection}>
            <Text style={styles.label}>{CREATE_BUSINESS_COPY.searchLabel}</Text>
            <TextInput
              value={addressQuery}
              onChangeText={handleAddressChange}
              placeholder={TEXT.searchPlaceholder}
              placeholderTextColor="#9EA7B8"
              style={styles.input}
              autoCapitalize="words"
              autoCorrect={false}
              textAlign="right"
              accessibilityLabel={CREATE_BUSINESS_COPY.searchLabel}
            />

            {isSuggestionsLoading ||
            isSelectingPlace ||
            isResolvingManualAddress ? (
              <View style={styles.inlineStatusRow}>
                <ActivityIndicator color="#2563EB" />
                <Text style={styles.inlineStatusText}>
                  {isResolvingManualAddress
                    ? TEXT.resolvingManualAddress
                    : isSelectingPlace
                      ? TEXT.loadingPlace
                      : TEXT.loadingSuggestions}
                </Text>
              </View>
            ) : null}

            {autocompleteError ? (
              <Text style={styles.helperErrorText}>
                {toErrorMessage(
                  new Error(autocompleteError),
                  TEXT.autocompleteError
                )}
              </Text>
            ) : null}

            {showNoSuggestions ? (
              <Text style={styles.helperText}>{TEXT.noSuggestions}</Text>
            ) : null}

            {addressQuery.trim().length >= 4 && !hasValidatedAddress ? (
              <Pressable
                onPress={() => {
                  void handleResolveManualAddress();
                }}
                style={({ pressed }) => [
                  styles.manualResolveButton,
                  pressed ? styles.pressed : null,
                ]}
                disabled={isResolvingManualAddress || isSelectingPlace}
              >
                <Text style={styles.manualResolveButtonText}>
                  {TEXT.manualAddressCta}
                </Text>
              </Pressable>
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
              </View>
            ) : null}
          </View>

          {hasValidatedAddress &&
          typeof latitude === 'number' &&
          typeof longitude === 'number' ? (
            <View style={styles.previewSection}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewValue}>
                  {businessOnboardingDraft.formattedAddress}
                </Text>
                <Text style={styles.previewLabel}>
                  {TEXT.selectedAddressLabel}
                </Text>
              </View>

              <View style={styles.previewMetaRow}>
                <Text style={styles.previewMetaText}>
                  {businessOnboardingDraft.city || TEXT.cityFallback}
                </Text>
                <Text style={styles.previewMetaText}>
                  {businessOnboardingDraft.street || TEXT.streetFallback}
                </Text>
                <Text style={styles.previewMetaText}>
                  {businessOnboardingDraft.streetNumber || '-'}
                </Text>
              </View>

              <View style={styles.mapBlock}>
                <Text style={styles.label}>{TEXT.mapLabel}</Text>
                <View style={styles.mapShell}>
                  {CAN_RENDER_NATIVE_MAP ? (
                    <MapView
                      style={styles.map}
                      pointerEvents="none"
                      region={{
                        latitude,
                        longitude,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                      }}
                    >
                      <Marker coordinate={{ latitude, longitude }} />
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
            </View>
          ) : (
            <View style={styles.emptyPreviewCard}>
              {CAN_RENDER_NATIVE_MAP ? (
                <>
                  <Text style={styles.emptyPreviewTitle}>
                    {TEXT.manualPinTitle}
                  </Text>
                  <Text style={styles.emptyPreviewText}>
                    {TEXT.manualPinSubtitle}
                  </Text>
                </>
              ) : null}
              <View style={styles.mapBlock}>
                <Text style={styles.label}>{TEXT.mapLabel}</Text>
                <View style={styles.mapShell}>
                  {CAN_RENDER_NATIVE_MAP ? (
                    <MapView
                      style={styles.map}
                      region={manualMapRegion}
                      onRegionChangeComplete={(region) => {
                        setManualMapRegion(region);
                      }}
                      onPress={(event) => {
                        const { latitude, longitude } =
                          event.nativeEvent.coordinate;
                        handleManualMapPress(latitude, longitude);
                      }}
                    >
                      {manualMarker ? (
                        <Marker coordinate={manualMarker} />
                      ) : null}
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
              {CAN_RENDER_NATIVE_MAP ? (
                <>
                  <Pressable
                    onPress={() => {
                      void handleConfirmManualPin();
                    }}
                    style={({ pressed }) => [
                      styles.manualResolveButton,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text style={styles.manualResolveButtonText}>
                      {TEXT.manualPinCta}
                    </Text>
                  </Pressable>
                  <Text style={styles.emptyPreviewText}>
                    {TEXT.manualPinRequired}
                  </Text>
                </>
              ) : null}
            </View>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <ContinueButton
            onPress={() => {
              void handleSubmit();
            }}
            disabled={!canSubmit}
            label={
              isSubmitting
                ? businessId
                  ? TEXT.updateBusiness
                  : TEXT.createBusiness
                : CREATE_BUSINESS_COPY.continue
            }
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
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  body: {
    marginTop: 12,
    flex: 1,
  },
  bodyContent: {
    gap: 18,
    paddingBottom: 16,
  },
  titleContainer: {
    alignItems: alignItems.start,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  searchSection: {
    gap: 10,
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
    fontWeight: '600',
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
  },
  suggestionSecondary: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'right',
  },
  manualResolveButton: {
    alignSelf: selfStart,
    borderRadius: 999,
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  manualResolveButtonText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
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
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  mapFallbackSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 18,
  },
  emptyPreviewCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 12,
  },
  emptyPreviewTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  emptyPreviewText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  footer: {
    marginTop: 16,
  },
  pressed: {
    opacity: 0.88,
  },
});
