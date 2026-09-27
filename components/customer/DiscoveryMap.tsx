import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import type { DiscoveryMapProps } from '@/components/customer/DiscoveryMap.types';

export type {
  DiscoveryMapBusiness,
  DiscoveryMapProps,
} from '@/components/customer/DiscoveryMap.types';

export function DiscoveryMap({
  userLatitude,
  userLongitude,
  latitudeDelta,
  longitudeDelta,
  businesses,
  onBusinessPress,
  myLocationLabel,
  addressFallback,
}: DiscoveryMapProps) {
  return (
    <MapView
      style={styles.map}
      region={{
        latitude: userLatitude,
        longitude: userLongitude,
        latitudeDelta,
        longitudeDelta,
      }}
    >
      <Marker
        coordinate={{
          latitude: userLatitude,
          longitude: userLongitude,
        }}
        pinColor="#FF6B57"
        title={myLocationLabel}
      />
      {businesses.map((business) => (
        <Marker
          key={business.businessId}
          coordinate={{
            latitude: business.lat,
            longitude: business.lng,
          }}
          pinColor="#2F6BFF"
          title={business.name}
          description={business.formattedAddress || addressFallback}
          onPress={() => onBusinessPress(business.businessId)}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});
