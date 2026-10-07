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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import BusinessModeCtaCard from '@/components/customer/BusinessModeCtaCard';
import { DiscoveryMap } from '@/components/customer/DiscoveryMap';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import {
  PaintedPressable,
  PaintedPressable as Pressable,
} from '@/components/ui/PaintedPressable';
import { api } from '@/convex/_generated/api';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { formatDistance } from '@/lib/location';
import { getBusinessMonogram } from '@/lib/loyalty/cardPresentation';
import { customerBusinessRoute } from '@/lib/navigation/customerRoutes';
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
  const u…17035 tokens truncated…ind (Tailwind CSS ל-React Native).
  
  הפקודות הבאות מייבאות את רכיבי הבסיס של Tailwind:
  - base: איפוסים בסיסיים (פחות רלוונטי ב-Native אבל נדרש)
  - components: רכיבים ומחלקות מותאמות אישית
  - utilities: מחלקות העזר (Utility Classes) שבהן נשתמש ברוב הזמן
*/

@tailwind base;
@tailwind components;
@tailwind utilities;

/*
 * Web typography contract:
 * The public StampAix sales site uses Heebo for Hebrew and Latin.
 * Expo Web uses the same family so auth and Business Web feel like one product.
 * This is web-only; native iOS/Android typography is unchanged.
 */
html,
body,
#root {
  font-family: 'Heebo', Arial, sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

input,
button,
textarea,
select {
  font-family: 'Heebo', Arial, sans-serif;
}

/* Keyboard focus treatment isolated to the Business Web shell. */
#business-web-shell [role='button']:focus-visible,
#business-web-shell [role='menuitem']:focus-visible {
  outline: 3px solid rgba(18, 48, 168, 0.28);
  outline-offset: 2px;
}

#business-web-shell [role='button']:not([aria-disabled='true']),
#business-web-shell [role='menuitem']:not([aria-disabled='true']) {
  transition:
    filter 140ms ease,
    opacity 140ms ease;
}

#business-web-shell [role='button']:not([aria-disabled='true']):hover,
#business-web-shell [role='menuitem']:not([aria-disabled='true']):hover {
  filter: brightness(0.97);
}
