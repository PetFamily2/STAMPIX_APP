import Slider from '@react-native-community/slider';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useConvexAuth, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import ProgramCustomerCardPreview from '@/components/business/ProgramCustomerCardPreview';
import BusinessModeCtaCard from '@/components/customer/BusinessModeCtaCard';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { normalizeStampShape } from '@/constants/stampOptions';
import { api } from '@/convex/_generated/api';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { formatDistance } from '@/lib/location';

const TEXT = {
  title: 'גילוי עסקים',
  subtitle: 'מצאו עסקים קרובים לפי המפה והמרחק מכם',
  mapTitle: 'מפת עסקים',
  radiusTitle: 'רדיוס חיפוש',
  nearbyTitle: 'עסקים בסביבתך',
  permissionTitle: 'כדי להציג עסקים קרובים אנחנו צריכים גישה למיקום',
  permissionSubtitle: 'אשרו גישה למיקום כדי לראות עסקים במרחק של 1 עד 10 קמ.',
  permissionButton: 'אשר גישה למיקום',
  openSettings: 'פתח הגדרות',
  loadingLocation: 'טוענים את המיקום שלך',
  loadingNearby: 'מחפשים עסקים קרובים',
  retry: 'נסו שוב',
  emptyTitle: 'אין עסקים בטווח שבחרת',
  emptySubtitle: 'נסו להגדיל את הרדיוס כדי לראות עסקים נוספים',
  myLocation: 'המיקום שלי',
  addressFallback: 'כתובת לא זמינה',
  filtersTitle: 'סוגי שירותים',
  filtersClear: 'נקה סינון',
  sortTitle: 'מיון',
  sortDistance: 'מרחק',
  sortServiceType: 'סוג עסק',
  unclassified: 'לא סווג',
};

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
  previewProgramTitle: string | null;
  previewRewardName: string | null;
  previewProgramImageUrl: string | null;
  previewCardThemeId: string | null;
  previewMaxStamps: number | null;
  previewCurrentStamps: number | null;
  previewStampShape: string | null;
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
      return error;
  }
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
  const savedBusinessIds = useMemo(
    () =>
      new Set(savedBusinesses.map((business) => String(business.businessId))),
    [savedBusinesses]
  );

  const isBusinessesLoading =
    Boolean(coords && isAuthenticated) && nearbyBusinessesQuery === undefined;
  const isSavedBusinessesLoading =
    isAuthenticated && savedBusinessesQuery === undefined;
  const isLoadingState =
    (isLocationLoading && !coords && !needsPermission) || isBusinessesLoading;
  const mapDelta = getMapDelta(deferredRadiusKm);
  const locationErrorMessage = toLocationErrorMessage(error);

  const toggleServiceTypeFilter = (serviceType: BusinessServiceType) => {
    setServiceTypeFilters((current) => {
      if (current.includes(serviceType)) {
        return current.filter((item) => item !== serviceType);
      }
      return [...current, serviceType];
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
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

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.radiusValue}>{savedBusinesses.length}</Text>
            <Text style={styles.panelTitle}>עסקים שמורים</Text>
          </View>

          {isSavedBusinessesLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color="#2F6BFF" />
              <Text style={styles.statusText}>טוענים עסקים שמורים</Text>
            </View>
          ) : null}

          {!isSavedBusinessesLoading && savedBusinesses.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.cardSubtitle}>עדיין לא שמרת עסקים</Text>
            </View>
          ) : null}

          {!isSavedBusinessesLoading && savedBusinesses.length > 0 ? (
            <View style={styles.resultsList}>
              {savedBusinesses.map((business) => (
                <Pressable
                  key={String(business.businessId)}
                  onPress={() =>
                    router.push({
                      pathname:
                        '/(authenticated)/(customer)/business/[businessId]',
                      params: { businessId: String(business.businessId) },
                    } as any)
                  }
                  style={({ pressed }) => [
                    styles.businessCard,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <ProgramCustomerCardPreview
                    businessName={business.businessName}
                    businessLogoUrl={business.businessLogoUrl}
                    programImageUrl={business.previewProgramImageUrl}
                    title={
                      business.previewProgramTitle ?? business.businessName
                    }
                    rewardName={
                      business.previewRewardName ??
                      `כרטיסיות: ${business.joinedProgramCount}`
                    }
                    maxStamps={Math.max(
                      1,
                      Number(business.previewMaxStamps ?? 1)
                    )}
                    previewCurrentStamps={Number(
                      business.previewCurrentStamps ?? 0
                    )}
                    cardThemeId={business.previewCardThemeId}
                    stampShape={normalizeStampShape(business.previewStampShape)}
                    status={
                      business.redeemableCount > 0 ? 'redeemable' : 'default'
                    }
                    variant="compact"
                    showAllStamps={true}
                  />

                  <View style={styles.savedBusinessMetaRow}>
                    <View style={styles.savedMetaBadge}>
                      <Text style={styles.savedMetaBadgeText}>
                        כרטיסיות: {business.joinedProgramCount}
                      </Text>
                    </View>
                    <View style={styles.savedMetaBadge}>
                      <Text style={styles.savedMetaBadgeText}>
                        מוכנות למימוש: {business.redeemableCount}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {needsPermission ? (
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>{TEXT.permissionTitle}</Text>
            <Text style={styles.cardSubtitle}>{TEXT.permissionSubtitle}</Text>
            <Pressable
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
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.radiusValue}>{deferredRadiusKm} km</Text>
                <Text style={styles.panelTitle}>{TEXT.radiusTitle}</Text>
              </View>

              <Slider
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
            </View>

            <View style={styles.panel}>
              <View style={styles.filterHeaderRow}>
                <Text style={styles.panelTitle}>{TEXT.filtersTitle}</Text>
                {serviceTypeFilters.length > 0 ? (
                  <Pressable
                    onPress={() => setServiceTypeFilters([])}
                    style={({ pressed }) => [
                      styles.clearButton,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text style={styles.clearButtonText}>
                      {TEXT.filtersClear}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.filterChipsWrap}>
                {BUSINESS_SERVICE_TYPE_OPTIONS.map((option) => {
                  const isSelected = serviceTypeFilters.includes(option.id);
                  return (
                    <Pressable
                      key={option.id}
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
              </View>

              <View style={styles.sortSection}>
                <Text style={styles.sortTitle}>{TEXT.sortTitle}</Text>
                <View style={styles.sortButtonsRow}>
                  <Pressable
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
            </View>

            <View style={styles.mapCard}>
              <View style={styles.panelHeader}>
                <Text style={styles.locationBadge}>{TEXT.myLocation}</Text>
                <Text style={styles.panelTitle}>{TEXT.mapTitle}</Text>
              </View>

              <View style={styles.mapShell}>
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

                  {nearbyBusinesses.map((business) => (
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
                    />
                  ))}
                </MapView>
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.radiusValue}>
                  {nearbyBusinesses.length}
                </Text>
                <Text style={styles.panelTitle}>{TEXT.nearbyTitle}</Text>
              </View>

              {isBusinessesLoading ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator color="#2F6BFF" />
                  <Text style={styles.statusText}>{TEXT.loadingNearby}</Text>
                </View>
              ) : null}

              {!isBusinessesLoading && nearbyBusinesses.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.cardTitle}>{TEXT.emptyTitle}</Text>
                  <Text style={styles.cardSubtitle}>{TEXT.emptySubtitle}</Text>
                </View>
              ) : null}

              {!isBusinessesLoading && nearbyBusinesses.length > 0 ? (
                <View style={styles.resultsList}>
                  {nearbyBusinesses.map((business) => {
                    const typeChips =
                      business.serviceTypes.length > 0
                        ? business.serviceTypes.map(
                            (serviceType) =>
                              BUSINESS_SERVICE_TYPE_LABELS[serviceType] ??
                              TEXT.unclassified
                          )
                        : [TEXT.unclassified];

                    const isSaved = savedBusinessIds.has(
                      String(business.businessId)
                    );

                    return (
                      <Pressable
                        key={business.businessId}
                        onPress={() =>
                          router.push({
                            pathname:
                              '/(authenticated)/(customer)/business/[businessId]',
                            params: { businessId: String(business.businessId) },
                          } as any)
                        }
                        style={({ pressed }) => [
                          styles.businessCard,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <View style={styles.businessHeader}>
                          <View style={styles.badgesStack}>
                            <View style={styles.distanceBadge}>
                              <Text style={styles.distanceText}>
                                {formatDistance(business.distanceKm)}
                              </Text>
                            </View>
                            {isSaved ? (
                              <View style={styles.savedBadge}>
                                <Text style={styles.savedBadgeText}>שמור</Text>
                              </View>
                            ) : null}
                          </View>

                          <View style={styles.businessTextWrap}>
                            <Text style={styles.businessName}>
                              {business.name}
                            </Text>
                            <Text style={styles.businessAddress}>
                              {business.formattedAddress ||
                                TEXT.addressFallback}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.metaChipsWrap}>
                          {typeChips.map((chipLabel) => (
                            <View
                              key={`${business.businessId}-${chipLabel}`}
                              style={[styles.metaChip, styles.metaChipType]}
                            >
                              <Text style={styles.metaChipTypeText}>
                                {chipLabel}
                              </Text>
                            </View>
                          ))}
                          {business.serviceTags.map((tag) => (
                            <View
                              key={`${business.businessId}-${tag}`}
                              style={[styles.metaChip, styles.metaChipTag]}
                            >
                              <Text style={styles.metaChipTagText}>{tag}</Text>
                            </View>
                          ))}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
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
  },
  headerRow: {
    alignItems: 'stretch',
    marginBottom: 4,
  },
  panel: {
    marginTop: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#D8E4FF',
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  mapCard: {
    marginTop: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#D8E4FF',
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  panelHeader: {
    flexDirection: 'row-reverse',
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
  locationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FFE8E2',
    fontSize: 12,
    fontWeight: '800',
    color: '#D94A33',
  },
  filterHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  clearButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C9D8FF',
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2F6BFF',
  },
  filterChipsWrap: {
    marginTop: 12,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DCE6F7',
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  sortSection: {
    marginTop: 14,
    alignItems: 'flex-end',
    gap: 8,
  },
  sortTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
    textAlign: 'right',
  },
  sortButtonsRow: {
    alignSelf: 'stretch',
    flexDirection: 'row-reverse',
    gap: 8,
  },
  sortButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE6F7',
    backgroundColor: '#F8FAFF',
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
    marginTop: 14,
    height: 260,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  map: {
    flex: 1,
  },
  resultsList: {
    marginTop: 14,
    gap: 10,
  },
  businessCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5ECFF',
    backgroundColor: '#F8FAFF',
    padding: 14,
  },
  businessHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  businessTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  businessName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0B1220',
    textAlign: 'right',
  },
  businessAddress: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    color: '#5B6475',
    textAlign: 'right',
    lineHeight: 18,
  },
  distanceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#D4EDFF',
  },
  badgesStack: {
    alignItems: 'flex-start',
    gap: 6,
  },
  savedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#EAFBF1',
    borderWidth: 1,
    borderColor: '#9EDDB9',
  },
  savedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0D7A3E',
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2F6BFF',
  },
  savedMetaBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EAF1FF',
    borderWidth: 1,
    borderColor: '#C8D8FF',
  },
  savedMetaBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
    textAlign: 'center',
  },
  savedBusinessMetaRow: {
    marginTop: 10,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaChipsWrap: {
    marginTop: 10,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaChipType: {
    backgroundColor: '#EAF1FF',
    borderWidth: 1,
    borderColor: '#C8D8FF',
  },
  metaChipTag: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  metaChipTypeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  metaChipTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
  },
  infoCard: {
    marginTop: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#D8E4FF',
    backgroundColor: '#FFFFFF',
    padding: 20,
    alignItems: 'flex-end',
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
    alignItems: 'flex-end',
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
    fontSize: 13,
    fontWeight: '600',
    color: '#2F6BFF',
    textAlign: 'center',
  },
  primaryButton: {
    alignSelf: 'stretch',
    borderRadius: 999,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  secondaryButton: {
    alignSelf: 'stretch',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2F6BFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
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
