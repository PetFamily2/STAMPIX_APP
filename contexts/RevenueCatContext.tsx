// ============================================================================
// קונטקסט REVENUECAT
// ============================================================================
// ספק RevenueCat בטוח שעובד ב:
// - Expo Go (ללא רכישות מקוריות)
// - פיתוח ללא מפתחות (מצב תצוגה מקדימה)
// - מצב רכישות מדומות (mock)
// - ייצור עם מפתחות אמיתיים

import { useMutation } from 'convex/react';
import Constants from 'expo-constants';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { MOCK_PAYMENTS, PAYMENT_SYSTEM_ENABLED } from '@/config/appConfig';
import { api } from '@/convex/_generated/api';
import {
  getPrimaryProductIdFromSubscriber,
  planFromRevenueCatSubscriber,
  type SubscriptionPlan,
} from '@/lib/domain/subscriptions';
import {
  getCurrentPlatformRevenueCatApiKey,
  isRevenueCatConfigured,
} from '@/utils/revenueCatConfig';

// ============================================================================
// טיפוסים
// ============================================================================

// מבנה מידע על חבילת מנוי
export type PackageInfo = {
  identifier: string;
  priceString: string;
  price: number;
  currencyCode: string;
  title: string;
  description: string;
  packageType: 'monthly' | 'annual' | 'lifetime' | 'unknown';
};

// מבנה הקונטקסט
type RevenueCatContextType = {
  // מצב
  isLoading: boolean;
  isPremium: boolean;
  isConfigured: boolean;
  isExpoGo: boolean;
  subscriptionPlan: SubscriptionPlan;

  // חבילות זמינות
  packages: PackageInfo[];

  // פעולות
  purchasePackage: (packageId: string) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  refreshPurchaserInfo: () => Promise<void>;
};

// ============================================================================
// חבילות ברירת מחדל לתצוגה מקדימה
// ============================================================================

// חבילות ברירת מחדל לתצוגה מקדימה (כשאין מפתחות או ב-Expo Go)
const PREVIEW_PACKAGES: PackageInfo[] = [
  {
    identifier: '$rc_monthly',
    priceString: '₪9.99/חודש',
    price: 9.99,
    currencyCode: 'ILS',
    title: 'מנוי חודשי',
    description: 'גישה מלאה לכל התכונות',
    packageType: 'monthly',
  },
  {
    identifier: '$rc_annual',
    priceString: '₪69.99/שנה',
    price: 69.99,
    currencyCode: 'ILS',
    title: 'מנוי שנתי',
    description: 'חסכון של 40% לעומת מנוי חודשי',
    packageType: 'annual',
  },
];

// ============================================================================
// פונקציות עזר
// ============================================================================

/**
 * בדיקה האם רצים ב-Expo Go
 */
function isRunningInExpoGo(): boolean {
  try {
    return Constants.executionEnvironment === 'storeClient';
  } catch {
    return false;
  }
}

// ============================================================================
// קונטקסט
// ============================================================================

const RevenueCatContext = createContext<RevenueCatContextType | undefined>(
  undefined
);

// ============================================================================
// ספק (Provider)
// ============================================================================

export function RevenueCatProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [subscriptionPlan, setSubscriptionPlan] =
    useState<SubscriptionPlan>('free');
  const [packages, setPackages] = useState<PackageInfo[]>(PREVIEW_PACKAGES);
  const [isInitialized, setIsInitialized] = useState(false);
  const didInitializationRun = useRef(false);

  const isExpoGo = isRunningInExpoGo();
  const isConfigured = isRevenueCatConfigured();
  const user = null as any;
  const updateSubscriptionPlan = useMutation(api.users.updateSubscriptionPlan);
  const [lastIdentifiedUserId, setLastIdentifiedUserId] = useState<
    string | null
  >(null);

  const syncSubscriptionPlan = useCallback(
    async (plan: SubscriptionPlan, productId?: string) => {
      if (!PAYMENT_SYSTEM_ENABLED || !user) {
        return;
      }

      try {
        await updateSubscriptionPlan({
          plan,
          productId,
        });
      } catch (_error) {
        // ignore failures
      }
    },
    [PAYMENT_SYSTEM_ENABLED, updateSubscriptionPlan, user]
  );

  const handleCustomerInfo = useCallback(
    async (customerInfo: any): Promise<SubscriptionPlan> => {
      if (!customerInfo) {
        setSubscriptionPlan('free');
        return 'free';
      }

      const plan = planFromRevenueCatSubscriber(customerInfo);
      setSubscriptionPlan(plan);
      await syncSubscriptionPlan(
        plan,
        getPrimaryProductIdFromSubscriber(customerInfo)
      );
      return plan;
    },
    [syncSubscriptionPlan]
  );

  // ============================================================================
  // אתחול
  // ============================================================================

  useEffect(() => {
    if (didInitializationRun.current) {
      return;
    }

    didInitializationRun.current = true;

    async function initialize() {
      if (!PAYMENT_SYSTEM_ENABLED) {
        setSubscriptionPlan('pro');
        setIsLoading(false);
        setIsInitialized(true);
        return;
      }

      if (isExpoGo) {
        setPackages(PREVIEW_PACKAGES);
        setIsLoading(false);
        setIsInitialized(true);
        return;
      }

      if (!isConfigured) {
        setPackages(PREVIEW_PACKAGES);
        setIsLoading(false);
        setIsInitialized(true);
        return;
      }

      try {
        const apiKey = getCurrentPlatformRevenueCatApiKey();
        if (!apiKey) {
          throw new Error('אין מפתח API לפלטפורמה הנוכחית');
        }

        const Purchases = (await import('react-native-purchases')).default;

        Purchases.setLogLevel(Purchases.LOG_LEVEL.VERBOSE);
        await Purchases.configure({ apiKey });

        const offerings = await Purchases.getOfferings();
        if (offerings.current?.availablePackages) {
          const loadedPackages: PackageInfo[] =
            offerings.current.availablePackages.map((pkg) => ({
              identifier: pkg.identifier,
              priceString: pkg.product.priceString,
              price: pkg.product.price,
              currencyCode: pkg.product.currencyCode,
              title: pkg.product.title,
              description: pkg.product.description,
              packageType: mapPackageType(pkg.packageType),
            }));
          setPackages(loadedPackages);
        }

        const customerInfo = await Purchases.getCustomerInfo();
        await handleCustomerInfo(customerInfo);
        setIsInitialized(true);
      } catch (_error) {
        setPackages(PREVIEW_PACKAGES);
        setIsInitialized(true);
      } finally {
        setIsLoading(false);
      }
    }

    initialize();
  }, [handleCustomerInfo, isConfigured, isExpoGo]);

  useEffect(() => {
    if (!isInitialized || isExpoGo || !isConfigured) {
      return;
    }

    let cancelled = false;

    async function ensureIdentifier() {
      try {
        const targetId = user?.externalId ?? user?._id;
        const Purchases = (await import('react-native-purchases')).default;

        if (!targetId) {
          if (lastIdentifiedUserId) {
            await Purchases.logOut();
            if (!cancelled) {
              setLastIdentifiedUserId(null);
            }
          }
          return;
        }

        if (lastIdentifiedUserId === targetId) {
          return;
        }

        await Purchases.logIn(targetId);
        if (!cancelled) {
          setLastIdentifiedUserId(targetId);
        }
      } catch {
        /* ignore */
      }
    }

    void ensureIdentifier();

    return () => {
      cancelled = true;
    };
  }, [isConfigured, isExpoGo, isInitialized, lastIdentifiedUserId, user]);

  // ============================================================================
  // רכישת חבילה
  // ============================================================================

  const purchasePackage = useCallback(
    async (packageId: string): Promise<boolean> => {
      // מצב רכישות מדומות
      if (MOCK_PAYMENTS) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        setSubscriptionPlan('pro');
        Alert.alert('הצלחה', 'הרכישה הושלמה בהצלחה (מצב בדיקה)');
        return true;
      }

      // Expo Go - לא ניתן לבצע רכישות
      if (isExpoGo) {
        Alert.alert(
          'מצב פיתוח',
          'רכישות לא זמינות ב-Expo Go.\n\nכדי לבדוק רכישות אמיתיות, בנה גרסת פיתוח (development build).'
        );
        return false;
      }

      // אין מפתחות מוגדרים
      if (!isConfigured) {
        Alert.alert(
          'לא מוגדר',
          'מפתחות RevenueCat לא מוגדרים.\n\nהגדר את המפתחות ב-.env כדי לאפשר רכישות.'
        );
        return false;
      }

      try {
        const Purchases = (await import('react-native-purchases')).default;
        const offerings = await Purchases.getOfferings();
        const packageToPurchase = offerings.current?.availablePackages.find(
          (pkg) => pkg.identifier === packageId
        );

        if (!packageToPurchase) {
          throw new Error(`חבילה ${packageId} לא נמצאה`);
        }

        const { customerInfo } =
          await Purchases.purchasePackage(packageToPurchase);
        const plan = await handleCustomerInfo(customerInfo);
        return plan !== 'free';
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'שגיאה לא ידועה';

        // בדיקה אם המשתמש ביטל
        if (
          errorMessage.includes('cancelled') ||
          errorMessage.includes('canceled')
        ) {
          return false;
        }

        Alert.alert('שגיאה', 'הרכישה נכשלה. אנא נסה שוב.');
        return false;
      }
    },
    [isExpoGo, isConfigured, handleCustomerInfo]
  );

  // ============================================================================
  // שחזור רכישות
  // ============================================================================

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    // מצב רכישות מדומות
    if (MOCK_PAYMENTS) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      Alert.alert('שחזור', 'לא נמצאו רכישות קודמות (מצב בדיקה)');
      return false;
    }

    // Expo Go
    if (isExpoGo) {
      Alert.alert('מצב פיתוח', 'שחזור רכישות לא זמין ב-Expo Go.');
      return false;
    }

    // אין מפתחות
    if (!isConfigured) {
      Alert.alert('לא מוגדר', 'מפתחות RevenueCat לא מוגדרים.');
      return false;
    }

    try {
      const Purchases = (await import('react-native-purchases')).default;
      const customerInfo = await Purchases.restorePurchases();
      const plan = await handleCustomerInfo(customerInfo);
      const isPaid = plan !== 'free';

      if (isPaid) {
        Alert.alert('הצלחה', 'הרכישות שוחזרו בהצלחה!');
      } else {
        Alert.alert('שחזור', 'לא נמצאו רכישות קודמות.');
      }

      return isPaid;
    } catch (_error) {
      Alert.alert('שגיאה', 'שחזור הרכישות נכשל. אנא נסה שוב.');
      return false;
    }
  }, [isExpoGo, isConfigured, handleCustomerInfo]);

  // ============================================================================
  // רענון מידע רוכש
  // ============================================================================

  const refreshPurchaserInfo = useCallback(async () => {
    if (!isConfigured || isExpoGo || !isInitialized) {
      return;
    }

    try {
      const Purchases = (await import('react-native-purchases')).default;
      const customerInfo = await Purchases.getCustomerInfo();
      await handleCustomerInfo(customerInfo);
    } catch (_error) {
      // שגיאה בשקט - לא צריך להציג למשתמש
    }
  }, [isConfigured, isExpoGo, isInitialized, handleCustomerInfo]);

  // ============================================================================
  // רינדור
  // ============================================================================

  const isPremium = subscriptionPlan !== 'free';

  return (
    <RevenueCatContext.Provider
      value={{
        isLoading,
        isPremium,
        isConfigured,
        isExpoGo,
        packages,
        subscriptionPlan,
        purchasePackage,
        restorePurchases,
        refreshPurchaserInfo,
      }}
    >
      {children}
    </RevenueCatContext.Provider>
  );
}

// ============================================================================
// הוק (Hook)
// ============================================================================

export function useRevenueCat() {
  const context = useContext(RevenueCatContext);
  if (context === undefined) {
    throw new Error('useRevenueCat חייב להיות בשימוש בתוך RevenueCatProvider');
  }
  return context;
}

// ============================================================================
// פונקציות עזר
// ============================================================================

function mapPackageType(
  type: string
): 'monthly' | 'annual' | 'lifetime' | 'unknown' {
  switch (type) {
    case 'MONTHLY':
      return 'monthly';
    case 'ANNUAL':
      return 'annual';
    case 'LIFETIME':
      return 'lifetime';
    default:
      return 'unknown';
  }
}
