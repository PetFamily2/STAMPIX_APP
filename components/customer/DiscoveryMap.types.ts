export type DiscoveryMapBusiness = {
  businessId: string;
  name: string;
  lat: number;
  lng: number;
  formattedAddress: string;
};

export type DiscoveryMapProps = {
  userLatitude: number;
  userLongitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
  businesses: DiscoveryMapBusiness[];
  onBusinessPress: (businessId: string) => void;
  myLocationLabel: string;
  addressFallback: string;
};
