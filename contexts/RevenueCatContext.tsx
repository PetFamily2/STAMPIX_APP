// ============================================================================
// קונטקסט REVENUECAT
// ============================================================================
// ספק RevenueCat בטוח שעובד ב:
// - Expo Go (ללא רכישות מקוריות)
// - פיתוח ללא מפתחות (מצב תצוגה מקדימה)
// - מצב רכישות מדומות (mock)
// - ייצור עם מפתחות אמיתיים

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
import {
  APP_ENV,
  MOCK_PAYMENTS,
  PAYMENT_SYSTEM_ENABLED,
  PRODUCTION_BILLING_FLAGS_AND_MAPPINGS_VALID,
} from '@/config/appConfig';
import type { SubscriptionPlan } from '@/lib/domain/subscriptions';
import {
  BILLING_UNAVAILABLE_TITLE_HE,
  evaluateRevenueCatBillingGuard,
  SERVER_AUTHORITATIVE_BILLING_ENABLED,
} from '@/lib/subscription/billingGuards';
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

type PurchasePackageOptions = {
  appUserId?: string;
  syncUserSubscription?: boolean;
  applePromotionalOffer?: {
    productIdentifier: string;
    offerIdentifier: string;
  };
};

type RestorePurchasesOptions = {
  appUserId?: string;
  syncUserSubscription?: boolean;
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
  purchasePackage: (
    packageId: string,
    options?: PurchasePackageOptions
  ) => Promise<boolean>;
  restorePurchases: (options?: RestorePurchasesOptions) => Promise<boolean>;
  refreshPurchaserInfo: () => Promise<void>;
  getManagementUrl: (appUserId?: string) => Promise<string | null>;
};

// ============================================================================
// חבילות ברירת מחדל לתצוגה מקדימה
// ============================================================================

// חבילות ברירת מחדל לתצוגה מקדימה (כשאין מפתחות או ב-Expo Go)
const PREVIEW_PACKAGES: PackageInfo[] = [];

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
  const [packages, setPackages] = useState<PackageInfo[]>(PREVIEW_PACKAGES);
  const [isInitialized, setIsInitialized] = useState(false);
  const didInitializationRun = useRef(false);

  const isExpoGo = isRunningInExpoGo();
  const isConfigured = isRevenueCatConfigured();
  const isBillingConfigurationValid =
    PRODUCTION_BILLING_FLAGS_AND_MAPPINGS_VALID && isConfigured;
  const [, setLastIdentifiedUserId] = useState<string | null>(null);

  // ============================================================================
  // אתחול
  // ============================================================================

  useEffect(() => {
    if (didInitializationRun.current) {
      return;
    }

    didInitializationRun.current = true;

    async function initialize() {
      if (!PAYMENT_SYSTEM_ENABLED || !isBillingConfigurationValid) {
        setPackages(PREVIEW_PACKAGES);
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

      if (!isBillingConfigurationValid) {
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

        Purchases.setLogLevel(
          APP_ENV === 'dev'
            ? Purchases.LOG_LEVEL.VERBOSE
            : Purchases.LOG_LEVEL.ERROR
        );
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

        await Purchases.getCustomerInfo();
        setIsInitialized(true);
      } catch (_error) {
        setPackages(PREVIEW_PACKAGES);
        setIsInitialized(true);
      } finally {
        setIsLoading(false);
      }
    }

    initialize();
  }, [isBillingConfigurationValid, isExpoGo]);

  // ============================================================================
  // רכישת חבילה
  // ============================================================================

  const purchasePackage = useCallback(
    async (
      packageId: string,
      options?: PurchasePackageOptions
    ): Promise<boolean> => {
      const overrideAppUserId = options?.appUserId?.trim();
      const billingGuard = evaluateRevenueCatBillingGuard({
        paymentSystemEnabled: PAYMENT_SYSTEM_ENABLED,
        serverAuthoritativeBillingEnabled: SERVER_AUTHORITATIVE_BILLING_ENABLED,
        isRevenueCatConfigured: isBillingConfigurationValid,
        isExpoGo,
        packageId,
        businessAppUserId: overrideAppUserId,
      });

      if (!billingGuard.canStart) {
        Alert.alert(BILLING_UNAVAILABLE_TITLE_HE, billingGuard.message);
        return false;
      }

      // מצב רכישות מדומות
      if (MOCK_PAYMENTS) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        Alert.alert(
          BILLING_UNAVAILABLE_TITLE_HE,
          'השדרוג לא זמין כרגע באפליקציה הזו. אפשר להמשיך להשתמש במסלול הנוכחי.'
        );
        return false;
      }

      // Expo Go - לא ניתן לבצע רכישות
      if (isExpoGo) {
        Alert.alert(
          BILLING_UNAVAILABLE_TITLE_HE,
          'השדרוג לא זמין כרגע באפליקציה הזו. אפשר להמשיך להשתמש במסלול הנוכחי.'
        );
        return false;
      }

      // אין מפתחות מוגדרים
      if (!isBillingConfigurationValid) {
        Alert.alert(
          BILLING_UNAVAILABLE_TITLE_HE,
          'השדרוג לא זמין כרגע. נסו שוב מאוחר יותר או פנו לתמיכה.'
        );
        return false;
      }

      try {
        const Purchases = (await import('react-native-purchases')).default;
        if (overrideAppUserId) {
          await Purchases.logIn(overrideAppUserId);
          setLastIdentifiedUserId(overrideAppUserId);
        }
        const offerings = await Purchases.getOfferings();
        const packageToPurchase = offerings.current?.availablePackages.find(
          (pkg) => pkg.identifier === packageId
        );

        if (!packageToPurchase) {
          throw new Error(`חבילה ${packageId} לא נמצאה`);
        }

        const appleOffer = options?.applePromotionalOffer;
        if (appleOffer?.offerIdentifier) {
          const discounts =
            (
              packageToPurchase.product as {
                discounts?: Array<{ identifier?: string }>;
              }
            ).discounts ?? [];
          const discount = discounts.find(
            (item) => item.identifier === appleOffer.offerIdentifier
          );
          if (!discount) {
            return false;
          }
          const purchasesWithOffers = Purchases as typeof Purchases & {
            getPromotionalOffer?: (
              product: unknown,
              storeDiscount: unknown
            ) => Promise<unknown>;
          };
          if (typeof purchasesWithOffers.getPromotionalOffer !== 'function') {
            return false;
          }
          const promotionalOffer = await purchasesWithOffers.getPromotionalOffer(
            packageToPurchase.product,
            discount
          );
          if (!promotionalOffer) {
            return false;
          }
          await Purchases.purchasePackage(
            packageToPurchase,
            promotionalOffer as never
          );
          return true;
        }

        await Purchases.purchasePackage(packageToPurchase);
        return true;
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

        Alert.alert('שגיאה', 'הרכישה נכשלה אנא נסה שוב');
        return false;
      }
    },
    [isBillingConfigurationValid, isExpoGo]
  );

  // ============================================================================
  // שחזור רכישות
  // ============================================================================

  const restorePurchases = useCallback(
    async (options?: RestorePurchasesOptions): Promise<boolean> => {
      const overrideAppUserId = options?.appUserId?.trim();
      const billingGuard = evaluateRevenueCatBillingGuard({
        paymentSystemEnabled: PAYMENT_SYSTEM_ENABLED,
        serverAuthoritativeBillingEnabled: SERVER_AUTHORITATIVE_BILLING_ENABLED,
        isRevenueCatConfigured: isBillingConfigurationValid,
        isExpoGo,
        packageId: 'restore',
        businessAppUserId: overrideAppUserId,
      });

      if (!billingGuard.canStart) {
        Alert.alert(BILLING_UNAVAILABLE_TITLE_HE, billingGuard.message);
        return false;
      }

      // מצב רכישות מדומות
      if (MOCK_PAYMENTS) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        Alert.alert('שחזור', 'לא נמצאו רכישות קודמות לשחזור כרגע.');
        return false;
      }

      // Expo Go
      if (isExpoGo) {
        Alert.alert('שחזור', 'שחזור רכישות לא זמין כרגע באפליקציה הזו.');
        return false;
      }

      // אין מפתחות
      if (!isBillingConfigurationValid) {
        Alert.alert('שחזור', 'שחזור רכישות לא זמין כרגע. נסו שוב מאוחר יותר.');
        return false;
      }

      try {
        const Purchases = (await import('react-native-purchases')).default;
        if (overrideAppUserId) {
          await Purchases.logIn(overrideAppUserId);
          setLastIdentifiedUserId(overrideAppUserId);
        }
        await Purchases.restorePurchases();
        return true;
      } catch (_error) {
        Alert.alert('שגיאה', 'שחזור הרכישות נכשל אנא נסה שוב');
        return false;
      }
    },
    [isBillingConfigurationValid, isExpoGo]
  );

  // ============================================================================
  // רענון מידע רוכש
  // ============================================================================

  const getManagementUrl = useCallback(
    async (appUserId?: string) => {
      if (!isBillingConfigurationValid || isExpoGo) {
        return null;
      }
      try {
        const Purchases = (await import('react-native-purchases')).default;
        const identity = appUserId?.trim();
        if (identity) {
          await Purchases.logIn(identity);
        }
        const info = await Purchases.getCustomerInfo();
        return info.managementURL ?? null;
      } catch {
        return null;
      }
    },
    [isBillingConfigurationValid, isExpoGo]
  );

  const refreshPurchaserInfo = useCallback(async () => {
    if (!isBillingConfigurationValid || isExpoGo || !isInitialized) {
      return;
    }

    try {
      const Purchases = (await import('react-native-purchases')).default;
      await Purchases.getCustomerInfo();
    } catch (_error) {
      // שגיאה בשקט - לא צריך להציג למשתמש
    }
  }, [isBillingConfigurationValid, isExpoGo, isInitialized]);

  // ============================================================================
  // רינדור
  // ============================================================================

  const subscriptionPlan: SubscriptionPlan = 'starter';
  const isPremium = false;

  return (
    <RevenueCatContext.Provider
      value={{
        isLoading,
        isPremium,
        isConfigured: isBillingConfigurationValid,
        isExpoGo,
        packages,
        subscriptionPlan,
        purchasePackage,
        restorePurchases,
        refreshPurchaserInfo,
        getManagementUrl,
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
