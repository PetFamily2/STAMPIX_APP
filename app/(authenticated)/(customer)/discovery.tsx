import Slider from '@react-native-community/slider';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useConvexAuth, useQuery } from 'convex/react';
import { useDeferredValue, useState } from 'react';
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
import BusinessModeCtaCard from '@/components/customer/BusinessModeCtaCard';
import { api } from '@/convex/_generated/api';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { formatDistance } from '@/lib/location';

const TEXT = {
  title: '\u05d2\u05d9\u05dc\u05d5\u05d9 \u05e2\u05e1\u05e7\u05d9\u05dd',
  subtitle:
    '\u05de\u05e6\u05d0\u05d5 \u05e2\u05e1\u05e7\u05d9\u05dd \u05e7\u05e8\u05d5\u05d1\u05d9\u05dd \u05dc\u05e4\u05d9 \u05d4\u05de\u05e4\u05d4 \u05d5\u05d4\u05de\u05e8\u05d7\u05e7 \u05de\u05de\u05db\u05dd',
  mapTitle: '\u05de\u05e4\u05ea \u05e2\u05e1\u05e7\u05d9\u05dd',
  radiusTitle: '\u05e8\u05d3\u05d9\u05d5\u05e1 \u05d7\u05d9\u05e4\u05d5\u05e9',
  nearbyTitle:
    '\u05e2\u05e1\u05e7\u05d9\u05dd \u05d1\u05e1\u05d1\u05d9\u05d1\u05ea\u05da',
  permissionTitle:
    '\u05db\u05d3\u05d9 \u05dc\u05d4\u05e6\u05d9\u05d2 \u05e2\u05e1\u05e7\u05d9\u05dd \u05e7\u05e8\u05d5\u05d1\u05d9\u05dd \u05d0\u05e0\u05d7\u05e0\u05d5 \u05e6\u05e8\u05d9\u05db\u05d9\u05dd \u05d2\u05d9\u05e9\u05d4 \u05dc\u05de\u05d9\u05e7\u05d5\u05dd',
  permissionSubtitle:
    '\u05d0\u05e9\u05e8\u05d5 \u05d2\u05d9\u05e9\u05d4 \u05dc\u05de\u05d9\u05e7\u05d5\u05dd \u05db\u05d3\u05d9 \u05dc\u05e8\u05d0\u05d5\u05ea \u05e2\u05e1\u05e7\u05d9\u05dd \u05d1\u05de\u05e8\u05d7\u05e7 \u05e9\u05dc 1 \u05e2\u05d3 10 \u05e7\u05de.',
  permissionButton:
    '\u05d0\u05e9\u05e8 \u05d2\u05d9\u05e9\u05d4 \u05dc\u05de\u05d9\u05e7\u05d5\u05dd',
  openSettings: '\u05e4\u05ea\u05d7 \u05d4\u05d2\u05d3\u05e8\u05d5\u05ea',
  loadingLocation:
    '\u05d8\u05d5\u05e2\u05e0\u05d9\u05dd \u05d0\u05ea \u05d4\u05de\u05d9\u05e7\u05d5\u05dd \u05e9\u05dc\u05da',
  loadingNearby:
    '\u05de\u05d7\u05e4\u05e9\u05d9\u05dd \u05e2\u05e1\u05e7\u05d9\u05dd \u05e7\u05e8\u05d5\u05d1\u05d9\u05dd',
  retry: '\u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1',
  emptyTitle:
    '\u05d0\u05d9\u05df \u05e2\u05e1\u05e7\u05d9\u05dd \u05d1\u05d8\u05d5\u05d5\u05d7 \u05e9\u05d1\u05d7\u05e8\u05ea',
  emptySubtitle:
    '\u05e0\u05e1\u05d5 \u05dc\u05d4\u05d2\u05d3\u05d9\u05dc \u05d0\u05ea \u05d4\u05e8\u05d3\u05d9\u05d5\u05e1 \u05db\u05d3\u05d9 \u05dc\u05e8\u05d0\u05d5\u05ea \u05e2\u05e1\u05e7\u05d9\u05dd \u05e0\u05d5\u05e1\u05e4\u05d9\u05dd',
  myLocation: '\u05d4\u05de\u05d9\u05e7\u05d5\u05dd \u05e9\u05dc\u05d9',
  addressFallback:
    '\u05db\u05ea\u05d5\u05d1\u05ea \u05dc\u05d0 \u05d6\u05de\u05d9\u05e0\u05d4',
};

type NearbyBusiness = {
  businessId: string;
  name: string;
  distanceKm: number;
  lat: number;
  lng: number;
  formattedAddress: string;
};

function getMapDelta(radiusKm: number) {
  return Math.max(0.025, radiusKm * 0.03);
}

function toLocationErrorMessage(error: string | null) {
  switch (error) {
    case 'LOCATION_SERVICES_DISABLED':
      return '\u05e9\u05d9\u05e8\u05d5\u05ea\u05d9 \u05d4\u05de\u05d9\u05e7\u05d5\u05dd \u05d1\u05de\u05db\u05e9\u05d9\u05e8 \u05db\u05d1\u05d5\u05d9\u05dd. \u05d4\u05e4\u05e2\u05d9\u05dc\u05d5 \u05d0\u05d5\u05ea\u05dd \u05d5\u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1.';
    case 'LOCATION_FETCH_FAILED':
      return '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05d8\u05e2\u05d5\u05df \u05d0\u05ea \u05d4\u05de\u05d9\u05e7\u05d5\u05dd \u05e9\u05dc\u05da.';
    case 'LOCATION_PERMISSION_FAILED':
    case 'LOCATION_PERMISSION_CHECK_FAILED':
      return '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05e7\u05d1\u05dc \u05d0\u05ea \u05d4\u05e8\u05e9\u05d0\u05ea \u05d4\u05de\u05d9\u05e7\u05d5\u05dd.';
    default:
      return error;
  }
}

export default function DiscoveryScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { isAuthenticated } = useConvexAuth();
  const [radiusKm, setRadiusKm] = useState(3);
  const deferredRadiusKm = useDeferredValue(radiusKm);
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
        }
      : 'skip'
  );
  const nearbyBusinesses = (nearbyBusinessesQuery ?? []) as NearbyBusiness[];
  const isBusinessesLoading =
    Boolean(coords && isAuthenticated) && nearbyBusinessesQuery === undefined;
  const isLoadingState =
    (isLocationLoading && !coords && !needsPermission) || isBusinessesLoading;
  const mapDelta = getMapDelta(deferredRadiusKm);
  const locationErrorMessage = toLocationErrorMessage(error);

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        contentContainerStyle={[
          styles.contentContainer,
          {
            paddingTop: (insets.top || 0) + 12,
            paddingBottom: tabBarHeight + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <BusinessScreenHeader title={TEXT.title} subtitle={TEXT.subtitle} />
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
                  {nearbyBusinesses.map((business) => (
                    <View key={business.businessId} style={styles.businessCard}>
                      <View style={styles.businessHeader}>
                        <View style={styles.distanceBadge}>
                          <Text style={styles.distanceText}>
                            {formatDistance(business.distanceKm)}
                          </Text>
                        </View>

                        <View style={styles.businessTextWrap}>
                          <Text style={styles.businessName}>
                            {business.name}
                          </Text>
                          <Text style={styles.businessAddress}>
                            {business.formattedAddress || TEXT.addressFallback}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        <BusinessModeCtaCard style={styles.ctaCard} />
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
  distanceText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2F6BFF',
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
