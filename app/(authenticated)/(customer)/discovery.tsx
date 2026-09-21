import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useConvexAuth, useQuery } from 'convex/react';
import { type Href, useRouter } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import BusinessModeCtaCard from '@/components/customer/BusinessModeCtaCard';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { api } from '@/convex/_generated/api';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { formatDistance } from '@/lib/location';
import { getBusinessMonogram } from '@/lib/loyalty/cardPresentation';
import { alignItems, flexDirection, rtlBaseView } from '@/lib/rtl';

const TEXT = {
  title: 'עסקים בסביבה',
  subtitle: 'עסקים קרובים, לפי מרחק',
  searchPlaceholder: 'חיפוש עסק או כתובת',
  mapButton: 'מפה',
  listButton: 'רשימה',
  filterButton: 'סינון',
  radiusTitle: 'רדיוס חיפוש',
  nearbyTitle: 'עסקים בסביבתך',
  savedTitle: 'עסקים שמורים',
  permissionTitle: 'נדרשת גישה למיקום',
  permissionSubtitle: 'אשרו מיקום כדי לראות עסקים במרחק 1 עד 10 ק״מ.',
  permissionButton: 'אישור מיקום',
  openSettings: 'פתח הגדרות',
  loadingLocation: 'טוענים את המיקום שלך',
  loadingNearby: 'מחפשים עסקים קרובים',
  retry: 'נסו שוב',
  emptyTitle: 'לא מצאנו עסקים',
  emptySubtitle: 'הגדילו את הרדיוס או אפסו את הסינון.',
  increaseRadius: 'הגדלת רדיוס',
  resetFilters: 'איפוס סינון',
  addressFallback: 'כתובת לא זמינה',
  filtersClear: 'ניקוי',
  sortTitle: 'מיון',
  sortDistance: 'מרחק',
  sortServiceType: 'סוג עסק',
  unclassified: 'עסק',
  directions: 'ניווט',
  myLocation: 'המיקום שלי',
  mapUnavailableTitle: 'המפה לא זמינה בתצוגה הזו',
  mapUnavailableSubtitle: 'אפשר לראות את העסקים ברשימה.',
};

const CAN_RENDER_NATIVE_MAP = Platform.OS !== 'web';

type BusinessServiceType =
  | 'food_drink'
  | 'beauty'
  | 'health_wellness'
  | 'fitness'
  | 'retail'
  | 'professional_services'
  | 'education'
  | 'hospitality'
  | 'other';

const BUSINESS_SERVICE_TYPE_OPTIONS: Array<{
  id: BusinessServiceType;
  label: string;
}> = [
  { id: 'food_drink', label: 'מזון ומשקאות' },
  { id: 'beauty', label: 'יופי וטיפוח' },
  { id: 'health_wellness', label: 'בריאות ורווחה' },
  { id: 'fitness', label: 'כושר וספורט' },
  { id: 'retail', label: 'קמעונאות' },
  { id: 'professional_services', label: 'שירותים מקצועיים' },
  { id: 'education', label: 'לימודים והדרכה' },
  { id: 'hospitality', label: 'אירוח ופנאי' },
  { id: 'other', label: 'אחר' },
];

const BUSINESS_SERVICE_TYPE_LABELS = Object.fromEntries(
  BUSINESS_SERVICE_TYPE_OPTIONS.map((option) => [option.id, option.label])
) as Record<BusinessServiceType, string>;

const BUSINESS_SERVICE_TYPE_SET = new Set<BusinessServiceType>(
  BUSINESS_SERVICE_TYPE_OPTIONS.map((option) => option.id)
);

type DiscoverySortBy = 'distance' | 'service_type';

type NearbyBusinessQuery = {
  businessId: string;
  name: string;
  distanceKm: number;
  lat: number;
  lng: number;
  formattedAddress: string;
  serviceTypes?: string[];
  serviceTags?: string[];
};

type SavedBusinessQuery = {
  businessId: string;
  businessName: string;
  businessLogoUrl: string | null;
  joinedProgramCount: number;
  redeemableCount: number;
};

function getMapDelta(radiusKm: number) {
  return Math.max(0.025, radiusKm * 0.03);
}

function sanitizeServiceTypes(value: string[] | undefined) {
  const unique: BusinessServiceType[] = [];
  if (!value) {
    return unique;
  }

  for (const item of value) {
    if (!BUSINESS_SERVICE_TYPE_SET.has(item as BusinessServiceType)) {
      continue;
    }
    const normalized = item as BusinessServiceType;
    if (!unique.includes(normalized)) {
      unique.push(normalized);
    }
  }

  return unique;
}

function sanitizeServiceTags(value: string[] | undefined) {
  const unique: string[] = [];
  if (!value) {
    return unique;
  }

  for (const item of value) {
    const normalized = item.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      continue;
    }
    if (!unique.includes(normalized)) {
      unique.push(normalized);
    }
    if (unique.length >= 8) {
      break;
    }
  }

  return unique;
}

function toLocationErrorMessage(error: string | null) {
  switch (error) {
    case 'LOCATION_SERVICES_DISABLED':
      return 'שירותי המיקום במכשיר כבויים. הפעילו אותם ונסו שוב.';
    case 'LOCATION_FETCH_FAILED':
      return 'לא הצלחנו לטעון את המיקום שלך.';
    case 'LOCATION_PERMISSION_FAILED':
    case 'LOCATION_PERMISSION_CHECK_FAILED':
      return 'לא הצלחנו לקבל את הרשאת המיקום.';
    default:
      return 'לא הצלחנו לטעון את המיקום שלך.';
  }
}

function getPrimaryCategoryLabel(serviceTypes: BusinessServiceType[]) {
  const primary = serviceTypes[0];
  if (!primary) {
    return TEXT.unclassified;
  }
  return BUSINESS_SERVICE_TYPE_LABELS[primary] ?? TEXT.unclassified;
}

function shortenAddress(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return TEXT.addressFallback;
  }
  const [firstPart] = normalized.split(',');
  return firstPart?.trim() || normalized;
}

function openBusinessDirections(lat: number, lng: number, name: string) {
  const query = encodeURIComponent(name.trim() || 'destination');
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${lat},${lng}&q=${query}`
      : Platform.OS === 'android'
        ? `geo:${lat},${lng}?q=${lat},${lng}(${query})`
        : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  void Linking.openURL(url);
}

export default function DiscoveryScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [radiusKm, setRadiusKm] = useState(3);
  const [serviceTypeFilters, setServiceTypeFilters] = useState<
    BusinessServiceType[]
  >([]);
  const [sortBy, setSortBy] = useState<DiscoverySortBy>('distance');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const deferredRadiusKm = useDeferredValue(radiusKm);
  const deferredServiceTypeFilters = useDeferredValue(serviceTypeFilters);
  const deferredSortBy = useDeferredValue(sortBy);

  const {
    coords,
    isLoading: isLocationLoading,
    needsPermission,
    showSettingsAction,
    error,
    requestPermission,
    refreshLocation,
  } = useCurrentLocation();

  const nearbyBusinessesQuery = useQuery(
    api.business.getBusinessesNearby,
    coords && isAuthenticated
      ? {
          userLat: coords.latitude,
          userLng: coords.longitude,
          radiusKm: deferredRadiusKm,
          serviceTypeFilters:
            deferredServiceTypeFilters.length > 0
              ? deferredServiceTypeFilters
              : undefined,
          sortBy: deferredSortBy,
        }
      : 'skip'
  );
  const savedBusinessesQuery = useQuery(
    api.memberships.byCustomerBusinesses,
    isAuthenticated ? {} : 'skip'
  );

  const nearbyBusinesses = useMemo(
    () =>
      ((nearbyBusinessesQuery ?? []) as NearbyBusinessQuery[]).map(
        (business) => ({
          businessId: business.businessId,
          name: business.name,
          distanceKm: business.distanceKm,
          lat: business.lat,
          lng: business.lng,
          formattedAddress: business.formattedAddress,
          serviceTypes: sanitizeServiceTypes(business.serviceTypes),
          serviceTags: sanitizeServiceTags(business.serviceTags),
        })
      ),
    [nearbyBusinessesQuery]
  );
  const savedBusinesses = useMemo(
    () => (savedBusinessesQuery ?? []) as SavedBusinessQuery[],
    [savedBusinessesQuery]
  );
  const savedBusinessById = useMemo(() => {
    const map = new Map<string, SavedBusinessQuery>();
    for (const business of savedBusinesses) {
      map.set(String(business.businessId), business);
    }
    return map;
  }, [savedBusinesses]);

  const visibleBusinesses = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) {
      return nearbyBusinesses;
    }
    return nearbyBusinesses.filter((business) => {
      const name = business.name.toLocaleLowerCase();
      const address = business.formattedAddress.toLocaleLowerCase();
      return name.includes(query) || address.includes(query);
    });
  }, [nearbyBusinesses, searchQuery]);

  const isBusinessesLoading =
    Boolean(coords && isAuthenticated) && nearbyBusinessesQuery === undefined;
  const isSavedBusinessesLoading =
    isAuthenticated && savedBusinessesQuery === undefined;
  const isLoadingState =
    (isLocationLoading && !coords && !needsPermission) || isBusinessesLoading;
  const mapDelta = getMapDelta(deferredRadiusKm);
  const locationErrorMessage = toLocationErrorMessage(error);
  const hasActiveFilters =
    serviceTypeFilters.length > 0 ||
    searchQuery.trim().length > 0 ||
    sortBy !== 'distance' ||
    radiusKm !== 3;

  const toggleServiceTypeFilter = (serviceType: BusinessServiceType) => {
    setServiceTypeFilters((current) => {
      if (current.includes(serviceType)) {
        return current.filter((item) => item !== serviceType);
      }
      return [...current, serviceType];
    });
  };

  const resetFilters = () => {
    setSearchQuery('');
    setServiceTypeFilters([]);
    setSortBy('distance');
    setRadiusKm(3);
    setShowAdvancedFilters(false);
  };

  const increaseRadius = () => {
    setRadiusKm((current) => Math.min(10, current + 2));
    setShowAdvancedFilters(true);
  };

  const openBusinessPage = (businessId: string) => {
    router.push({
      pathname: '/(authenticated)/(customer)/business/[businessId]',
      params: { businessId: String(businessId) },
    } as Href);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.contentContainer,
          {
            paddingBottom: tabBarHeight + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <View style={styles.headerRow}>
            <BusinessScreenHeader title={TEXT.title} subtitle={TEXT.subtitle} />
          </View>
        </StickyScrollHeader>

        {needsPermission ? (
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>{TEXT.permissionTitle}</Text>
            <Text style={styles.cardSubtitle}>{TEXT.permissionSubtitle}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={TEXT.permissionButton}
              onPress={() => {
                void requestPermission();
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {TEXT.permissionButton}
              </Text>
            </Pressable>
            {showSettingsAction ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={TEXT.openSettings}
                onPress={() => {
                  void Linking.openSettings();
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.secondaryButtonText}>
                  {TEXT.openSettings}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {!needsPermission && !coords && isLoadingState ? (
          <View style={styles.infoCard}>
            <ActivityIndicator color="#2F6BFF" />
            <Text style={styles.statusText}>{TEXT.loadingLocation}</Text>
          </View>
        ) : null}

        {!needsPermission &&
        !coords &&
        !isLoadingState &&
        locationErrorMessage ? (
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>{locationErrorMessage}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={TEXT.retry}
              onPress={() => {
                void refreshLocation();
              }}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.secondaryButtonText}>{TEXT.retry}</Text>
            </Pressable>
          </View>
        ) : null}

        {coords ? (
          <>
            <View style={styles.controlsCard}>
              <View style={styles.searchShell}>
                <Ionicons name="search-outline" size={18} color="#64748B" />
                <TextInput
                  accessibilityLabel={TEXT.searchPlaceholder}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={TEXT.searchPlaceholder}
                  placeholderTextColor="#94A3B8"
                  style={styles.searchInput}
                  textAlign="right"
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
              </View>

              <ScrollView
                horizontal={true}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                {BUSINESS_SERVICE_TYPE_OPTIONS.map((option) => {
                  const isSelected = serviceTypeFilters.includes(option.id);
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      accessibilityLabel={option.label}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => toggleServiceTypeFilter(option.id)}
                      style={({ pressed }) => [
                        styles.filterChip,
                        isSelected ? styles.filterChipActive : null,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          isSelected ? styles.filterChipTextActive : null,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.toolsRow}>
                <Pressable
                  onPress={() => setShowAdvancedFilters((current) => !current)}
                  style={({ pressed }) => [
                    styles.toolButton,
                    showAdvancedFilters ? styles.toolButtonActive : null,
                    pressed ? styles.pressed : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={TEXT.filterButton}
                >
                  <Ionicons
                    name="options-outline"
                    size={16}
                    color={showAdvancedFilters ? '#1D4ED8' : '#334155'}
                  />
                  <Text
                    style={[
                      styles.toolButtonText,
                      showAdvancedFilters ? styles.toolButtonTextActive : null,
                    ]}
                  >
                    {`${radiusKm} ק״מ`}
                  </Text>
                </Pressable>

                {serviceTypeFilters.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={TEXT.filtersClear}
                    onPress={() => setServiceTypeFilters([])}
                    style={({ pressed }) => [
                      styles.toolButton,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text style={styles.toolButtonText}>
                      {TEXT.filtersClear}
                    </Text>
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={() => setIsMapOpen((current) => !current)}
                  style={({ pressed }) => [
                    styles.mapButton,
                    pressed ? styles.pressed : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isMapOpen ? TEXT.listButton : TEXT.mapButton
                  }
                >
                  <Ionicons
                    name={isMapOpen ? 'list-outline' : 'map-outline'}
                    size={16}
                    color="#FFFFFF"
                  />
                  <Text style={styles.mapButtonText}>
                    {isMapOpen ? TEXT.listButton : TEXT.mapButton}
                  </Text>
                </Pressable>
              </View>

              {showAdvancedFilters ? (
                <View style={styles.advancedFilters}>
                  <View style={styles.panelHeader}>
                    <Text style={styles.radiusValue}>{radiusKm} km</Text>
                    <Text style={styles.panelTitle}>{TEXT.radiusTitle}</Text>
                  </View>
                  <Slider
                    accessibilityLabel={TEXT.radiusTitle}
                    accessibilityValue={{
                      min: 1,
                      max: 10,
                      now: radiusKm,
                      text: `${radiusKm} קילומטר`,
                    }}
                    value={radiusKm}
                    onValueChange={(value) => {
                      setRadiusKm(Math.round(value));
                    }}
                    minimumValue={1}
                    maximumValue={10}
                    step={1}
                    minimumTrackTintColor="#2F6BFF"
                    maximumTrackTintColor="#C7D6FF"
                    thumbTintColor="#2F6BFF"
                  />
                  <Text style={styles.sortTitle}>{TEXT.sortTitle}</Text>
                  <View style={styles.sortButtonsRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={TEXT.sortDistance}
                      accessibilityState={{ selected: sortBy === 'distance' }}
                      onPress={() => setSortBy('distance')}
                      style={({ pressed }) => [
                        styles.sortButton,
                        sortBy === 'distance' ? styles.sortButtonActive : null,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sortButtonText,
                          sortBy === 'distance'
                            ? styles.sortButtonTextActive
                            : null,
                        ]}
                      >
                        {TEXT.sortDistance}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={TEXT.sortServiceType}
                      accessibilityState={{
                        selected: sortBy === 'service_type',
                      }}
                      onPress={() => setSortBy('service_type')}
                      style={({ pressed }) => [
                        styles.sortButton,
                        sortBy === 'service_type'
                          ? styles.sortButtonActive
                          : null,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sortButtonText,
                          sortBy === 'service_type'
                            ? styles.sortButtonTextActive
                            : null,
                        ]}
                      >
                        {TEXT.sortServiceType}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>

            {isMapOpen ? (
              <View style={styles.mapCard}>
                <View style={styles.mapShell}>
                  {CAN_RENDER_NATIVE_MAP ? (
                    <MapView
                      style={styles.map}
                      region={{
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                        latitudeDelta: mapDelta,
                        longitudeDelta: mapDelta,
                      }}
                    >
                      <Marker
                        coordinate={{
                          latitude: coords.latitude,
                          longitude: coords.longitude,
                        }}
                        pinColor="#FF6B57"
                        title={TEXT.myLocation}
                      />
                      {visibleBusinesses.map((business) => (
                        <Marker
                          key={business.businessId}
                          coordinate={{
                            latitude: business.lat,
                            longitude: business.lng,
                          }}
                          pinColor="#2F6BFF"
                          title={business.name}
                          description={
                            business.formattedAddress || TEXT.addressFallback
                          }
                          onPress={() => openBusinessPage(business.businessId)}
                        />
                      ))}
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
            ) : (
              <View style={styles.listCard}>
                <View style={styles.panelHeader}>
                  <Text style={styles.radiusValue}>
                    {visibleBusinesses.length}
                  </Text>
                  <Text style={styles.panelTitle}>{TEXT.nearbyTitle}</Text>
                </View>

                {isBusinessesLoading ? (
                  <View style={styles.loadingState}>
                    <ActivityIndicator color="#2F6BFF" />
                    <Text style={styles.statusText}>{TEXT.loadingNearby}</Text>
                  </View>
                ) : null}

                {!isBusinessesLoading && visibleBusinesses.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.cardTitle}>{TEXT.emptyTitle}</Text>
                    <Text style={styles.cardSubtitle}>
                      {TEXT.emptySubtitle}
                    </Text>
                    <View style={styles.emptyActions}>
                      <Pressable
                        onPress={increaseRadius}
                        style={({ pressed }) => [
                          styles.primaryButton,
                          pressed ? styles.pressed : null,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={TEXT.increaseRadius}
                      >
                        <Text style={styles.primaryButtonText}>
                          {TEXT.increaseRadius}
                        </Text>
                      </Pressable>
                      {hasActiveFilters ? (
                        <Pressable
                          onPress={resetFilters}
                          style={({ pressed }) => [
                            styles.secondaryButton,
                            pressed ? styles.pressed : null,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={TEXT.resetFilters}
                        >
                          <Text style={styles.secondaryButtonText}>
                            {TEXT.resetFilters}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                {!isBusinessesLoading && visibleBusinesses.length > 0 ? (
                  <View style={styles.resultsList}>
                    {visibleBusinesses.map((business) => {
                      const saved = savedBusinessById.get(
                        String(business.businessId)
                      );
                      const logoUrl = saved?.businessLogoUrl ?? null;
                      const categoryLabel = getPrimaryCategoryLabel(
                        business.serviceTypes
                      );

                      return (
                        <Pressable
                          key={business.businessId}
                          onPress={() => openBusinessPage(business.businessId)}
                          style={({ pressed }) => [
                            styles.businessCard,
                            pressed ? styles.pressed : null,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={business.name}
                        >
                          <View style={styles.businessRow}>
                            <View style={styles.logoShell}>
                              {logoUrl ? (
                                <Image
                                  source={{ uri: logoUrl }}
                                  style={styles.logoImage}
                                  resizeMode="cover"
                                  accessible={false}
                                />
                              ) : (
                                <Text style={styles.logoMonogram}>
                                  {getBusinessMonogram(business.name)}
                                </Text>
                              )}
                            </View>

                            <View style={styles.businessCopy}>
                              <Text
                                style={styles.businessName}
                                numberOfLines={1}
                              >
                                {business.name}
                              </Text>
                              <Text
                                style={styles.businessMeta}
                                numberOfLines={1}
                              >
                                {categoryLabel}
                              </Text>
                              <Text
                                style={styles.businessAddress}
                                numberOfLines={1}
                              >
                                {shortenAddress(business.formattedAddress)}
                              </Text>
                            </View>

                            <View style={styles.businessActions}>
                              <Text style={styles.distanceText}>
                                {formatDistance(business.distanceKm)}
                              </Text>
                              <Pressable
                                onPress={() =>
                                  openBusinessDirections(
                                    business.lat,
                                    business.lng,
                                    business.name
                                  )
                                }
                                style={({ pressed }) => [
                                  styles.directionsButton,
                                  pressed ? styles.pressed : null,
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel={`${TEXT.directions} ${business.name}`}
                                hitSlop={8}
                              >
                                <Ionicons
                                  name="navigate-outline"
                                  size={14}
                                  color="#1D4ED8"
                                />
                                <Text style={styles.directionsText}>
                                  {TEXT.directions}
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            )}

            {!isSavedBusinessesLoading && savedBusinesses.length > 0 ? (
              <View style={styles.listCard}>
                <Text style={styles.panelTitle}>{TEXT.savedTitle}</Text>
                <View style={styles.resultsList}>
                  {savedBusinesses.map((business) => (
                    <Pressable
                      key={String(business.businessId)}
                      accessibilityRole="button"
                      accessibilityLabel={business.businessName}
                      onPress={() =>
                        router.push(
                          `/(authenticated)/(customer)/business/${String(
                            business.businessId
                          )}` as Href
                        )
                      }
                      style={({ pressed }) => [
                        styles.businessCard,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <View style={styles.businessRow}>
                        <View style={styles.logoShell}>
                          {business.businessLogoUrl ? (
                            <Image
                              source={{ uri: business.businessLogoUrl }}
                              style={styles.logoImage}
                              resizeMode="cover"
                              accessible={false}
                            />
                          ) : (
                            <Text style={styles.logoMonogram}>
                              {getBusinessMonogram(business.businessName)}
                            </Text>
                          )}
                        </View>
                        <View style={styles.businessCopy}>
                          <Text style={styles.businessName} numberOfLines={1}>
                            {business.businessName}
                          </Text>
                          <Text style={styles.businessMeta} numberOfLines={1}>
                            {`כרטיסיות: ${business.joinedProgramCount}`}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        ) : null}

        <BusinessModeCtaCard
          style={styles.ctaCard}
          forcePromotionalBanner={true}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E9F0FF',
  },
  contentContainer: {
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  headerRow: {
    alignItems: 'stretch',
    marginBottom: 4,
  },
  controlsCard: {
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D8E4FF',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 12,
  },
  searchShell: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D7DEEA',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
    ...rtlBaseView,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#12203A',
    writingDirection: 'rtl',
    paddingVertical: 8,
  },
  chipsRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  toolsRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    ...rtlBaseView,
  },
  toolButton: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D7DEEA',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 6,
    ...rtlBaseView,
  },
  toolButtonActive: {
    borderColor: '#2F6BFF',
    backgroundColor: '#EEF3FF',
  },
  toolButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  toolButtonTextActive: {
    color: '#1D4ED8',
  },
  mapButton: {
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 14,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 6,
    ...rtlBaseView,
  },
  mapButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  advancedFilters: {
    gap: 8,
  },
  listCard: {
    marginTop: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D8E4FF',
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  mapCard: {
    marginTop: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D8E4FF',
    backgroundColor: '#FFFFFF',
    padding: 12,
  },
  panelHeader: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  panelTitle: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#0B1220',
    textAlign: 'right',
  },
  radiusValue: {
    minWidth: 58,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#DCE7FF',
    fontSize: 12,
    fontWeight: '800',
    color: '#2F6BFF',
    textAlign: 'center',
    overflow: 'hidden',
  },
  filterChip: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DCE6F7',
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    borderColor: '#2F6BFF',
    backgroundColor: '#EAF1FF',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  filterChipTextActive: {
    color: '#1D4ED8',
  },
  sortTitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
    textAlign: 'right',
  },
  sortButtonsRow: {
    alignSelf: 'stretch',
    flexDirection: flexDirection.row,
    gap: 8,
  },
  sortButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DCE6F7',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    alignItems: 'center',
  },
  sortButtonActive: {
    borderColor: '#2F6BFF',
    backgroundColor: '#EAF1FF',
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  sortButtonTextActive: {
    color: '#1D4ED8',
  },
  mapShell: {
    height: 360,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  mapFallbackSubtitle: {
    width: '100%',
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
  },
  resultsList: {
    marginTop: 10,
  },
  businessCard: {
    borderBottomWidth: 1,
    borderBottomColor: '#E6EAF2',
    paddingVertical: 12,
  },
  businessRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 12,
    ...rtlBaseView,
  },
  logoShell: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6EAF2',
    backgroundColor: '#EEF3FF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoMonogram: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  businessCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: alignItems.start,
    gap: 2,
  },
  businessName: {
    width: '100%',
    fontSize: 15,
    fontWeight: '800',
    color: '#0B1220',
    textAlign: 'right',
  },
  businessMeta: {
    width: '100%',
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  businessAddress: {
    width: '100%',
    fontSize: 12,
    fontWeight: '500',
    color: '#5B6475',
    textAlign: 'right',
  },
  businessActions: {
    alignItems: alignItems.start,
    gap: 6,
    flexShrink: 0,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2F6BFF',
    textAlign: 'right',
  },
  directionsButton: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C9D8FF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 4,
    ...rtlBaseView,
  },
  directionsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  infoCard: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D8E4FF',
    backgroundColor: '#FFFFFF',
    padding: 20,
    alignItems: alignItems.start,
    gap: 10,
  },
  loadingState: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  emptyState: {
    marginTop: 14,
    borderRadius: 18,
    backgroundColor: '#F8FAFF',
    padding: 16,
    alignItems: alignItems.start,
    gap: 8,
  },
  emptyActions: {
    width: '100%',
    marginTop: 4,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0B1220',
    textAlign: 'right',
    lineHeight: 22,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#5B6475',
    textAlign: 'right',
    lineHeight: 19,
  },
  statusText: {
    width: '100%',
    fontSize: 13,
    fontWeight: '600',
    color: '#2F6BFF',
    textAlign: 'right',
  },
  primaryButton: {
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  secondaryButton: {
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2F6BFF',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2F6BFF',
    textAlign: 'center',
  },
  ctaCard: {
    marginTop: 14,
  },
  pressed: {
    opacity: 0.88,
  },
});
